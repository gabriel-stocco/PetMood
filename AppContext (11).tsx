import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as api from '../services/api';
import { GOOGLE_PLATFORM } from '../services/googleAuth';
import { App as CapApp } from '@capacitor/app';
import { IS_NATIVE } from '../services/platform';
import {
  PERMISSION_EVENT,
  initNativeNotifications,
  syncNativeReminders,
} from '../services/nativeNotifications';
import {
  REMINDER_OFFSETS,
  formatReminderNotification,
  formatTimeHHMM,
  getAcceptedChannels,
  getAlarmRingKey,
  getEffectiveEventDateTimeMs,
  getEventAnimalNames,
  getEventOccurrenceSuppressionKeys,
  getOrphanSnoozeEventIds,
  getReminderKey,
  registerNotificationServiceWorker,
  showBrowserNotification,
  startAlarmChime,
  stopAlarmChime,
} from '../services/eventNotifications';
import type { ActivePhotoViewer } from '../components/PhotoViewerModal';
import type {
  Animal,
  AuthenticatedTab,
  CreateAccountPayload,
  CreateAnimalPayload,
  CreateEventPayload,
  CreateVaccinePayload,
  DicaCompleta,
  DicaResumo,
  DispatchedNotificationRecord,
  Evento,
  GetAllResponse,
  NotificationChannel,
  Propaganda,
  ReminderWindowKey,
  UpdateAccountPayload,
  UpdateAnimalPayload,
  UpdateEventPayload,
  UpdateVaccinePayload,
  Usuario,
  Vacina,
} from '../types';

const DISPATCHED_KEYS_STORAGE = 'petmood_dispatched_reminders';
const SNOOZED_ALARMS_STORAGE = 'petmood_snoozed_alarms';
const RECENT_WINDOW_MS = 120_000;
const MAX_TIMEOUT_HORIZON_MS = 6 * 60 * 60 * 1000;

export interface ActiveNotificationBanner {
  id: string;
  title: string;
  message: string;
  channels: NotificationChannel[];
  janelaLabel: string;
}

export interface ActiveRingingAlarm {
  ev: Evento;
  animaisNomes: string;
  horario: string;
}

interface AppContextValue {
  isInitializing: boolean;
  isLoading: boolean;
  isAuthenticated: boolean;
  accessToken: string | null;
  usuario: Usuario | null;
  animais: Animal[];
  eventos: Evento[];
  dicas: DicaResumo[];
  propagandas: Propaganda[];
  activeTab: AuthenticatedTab;
  vaccineFilterAnimalId: string | null;
  activeBanner: ActiveNotificationBanner | null;
  activeRingingAlarm: ActiveRingingAlarm | null;
  activePhotoViewer: ActivePhotoViewer | null;
  openPhotoViewer: (src: string, title?: string) => void;
  closePhotoViewer: () => void;
  dismissBanner: () => void;
  dismissRingingAlarm: () => void;
  snoozeRingingAlarm: (minutes?: number) => void;
  setActiveTab: (tab: AuthenticatedTab) => void;
  navigateToVaccinesForAnimal: (animalId: string) => void;
  clearVaccineAnimalFilter: () => void;
  signIn: (email: string, senha: string) => Promise<void>;
  signUp: (payload: CreateAccountPayload) => Promise<void>;
  signInWithGoogle: (code: string) => Promise<void>;
  signOut: () => Promise<void>;
  fetchTipDetails: (id_dicas: string) => Promise<DicaCompleta>;
  syncAccount: () => Promise<Usuario>;
  addAnimal: (payload: Omit<CreateAnimalPayload, 'id_usuario'>) => Promise<Animal>;
  editAnimal: (payload: Omit<UpdateAnimalPayload, 'id_usuario'>) => Promise<Animal>;
  removeAnimal: (id_animal: string) => Promise<void>;
  addEvent: (payload: Omit<CreateEventPayload, 'id_usuario'>) => Promise<Evento>;
  editEvent: (payload: Omit<UpdateEventPayload, 'id_usuario'>) => Promise<Evento>;
  removeEvent: (id_evento: string) => Promise<void>;
  addVaccine: (payload: Omit<CreateVaccinePayload, 'id_usuario'>) => Promise<Vacina>;
  editVaccine: (
    payload: Omit<UpdateVaccinePayload, 'id_usuario'>
  ) => Promise<Vacina>;
  removeVaccine: (id_vacina: string, id_animal: string) => Promise<void>;
  editAccount: (payload: Omit<UpdateAccountPayload, 'id_usuario'>) => Promise<Usuario>;
  removeAccount: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

function loadStoredDispatchedKeys(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(DISPATCHED_KEYS_STORAGE);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((x) => typeof x === 'string')) : new Set();
  } catch {
    return new Set();
  }
}

function saveStoredDispatchedKeys(keys: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(DISPATCHED_KEYS_STORAGE, JSON.stringify(Array.from(keys)));
  } catch {
    // Ignore storage quota errors
  }
}

function loadStoredSnoozedAlarms(): Map<string, number> {
  const result = new Map<string, number>();
  if (typeof window === 'undefined') return result;
  try {
    const raw = window.localStorage.getItem(SNOOZED_ALARMS_STORAGE);
    if (!raw) return result;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const nowMs = Date.now();
    if (parsed && typeof parsed === 'object') {
      Object.entries(parsed).forEach(([id, val]) => {
        const ts = Number(val);
        if (id && Number.isFinite(ts) && ts > nowMs) {
          result.set(id, ts);
        }
      });
    }
  } catch {
    // Ignore storage parse errors
  }
  return result;
}

function saveStoredSnoozedAlarms(map: Map<string, number>): void {
  if (typeof window === 'undefined') return;
  try {
    const nowMs = Date.now();
    const obj: Record<string, number> = {};
    map.forEach((ts, id) => {
      if (ts > nowMs) obj[id] = ts;
    });
    window.localStorage.setItem(SNOOZED_ALARMS_STORAGE, JSON.stringify(obj));
  } catch {
    // Ignore storage quota errors
  }
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isInitializing, setIsInitializing] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [animais, setAnimais] = useState<Animal[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [dicas, setDicas] = useState<DicaResumo[]>([]);
  const [propagandas, setPropagandas] = useState<Propaganda[]>([]);
  const [activeTab, setActiveTabState] = useState<AuthenticatedTab>('Home');
  const [vaccineFilterAnimalId, setVaccineFilterAnimalId] = useState<string | null>(null);

  const [activeBanner, setActiveBanner] = useState<ActiveNotificationBanner | null>(null);
  const [activeRingingAlarm, setActiveRingingAlarm] = useState<ActiveRingingAlarm | null>(null);
  const [activePhotoViewer, setActivePhotoViewer] = useState<ActivePhotoViewer | null>(null);

  const dispatchedKeysRef = useRef<Set<string>>(loadStoredDispatchedKeys());
  const inFlightKeysRef = useRef<Set<string>>(new Set());
  const bannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snoozeTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const snoozedUntilByEventRef = useRef<Map<string, number>>(loadStoredSnoozedAlarms());
  const activeRingingAlarmRef = useRef<ActiveRingingAlarm | null>(null);
  const eventosRef = useRef<Evento[]>(eventos);
  eventosRef.current = eventos;

  const updateActiveRingingAlarm = useCallback((next: ActiveRingingAlarm | null) => {
    activeRingingAlarmRef.current = next;
    setActiveRingingAlarm(next);
  }, []);

  const openPhotoViewer = useCallback((src: string, title?: string) => {
    if (!src) return;
    setActivePhotoViewer({ src, title });
  }, []);

  const closePhotoViewer = useCallback(() => {
    setActivePhotoViewer(null);
  }, []);

  const dismissBanner = useCallback(() => {
    if (bannerTimeoutRef.current) {
      clearTimeout(bannerTimeoutRef.current);
      bannerTimeoutRef.current = null;
    }
    setActiveBanner(null);
  }, []);

  const showBanner = useCallback(
    (banner: ActiveNotificationBanner) => {
      if (bannerTimeoutRef.current) {
        clearTimeout(bannerTimeoutRef.current);
      }
      setActiveBanner(banner);
      bannerTimeoutRef.current = setTimeout(() => {
        setActiveBanner(null);
        bannerTimeoutRef.current = null;
      }, 9000);
    },
    []
  );

  const markKeysDispatched = useCallback((keys: string[]) => {
    const toAdd = keys.filter((key) => Boolean(key) && !dispatchedKeysRef.current.has(key));
    if (toAdd.length === 0) return;
    const next = new Set(dispatchedKeysRef.current);
    toAdd.forEach((key) => next.add(key));
    dispatchedKeysRef.current = next;
    saveStoredDispatchedKeys(next);
  }, []);

  const markKeyDispatched = useCallback(
    (key: string) => {
      markKeysDispatched([key]);
    },
    [markKeysDispatched]
  );

  const isEventSnoozeSuppressed = useCallback((id_evento: string, nowMs = Date.now()) => {
    const snoozeUntil = snoozedUntilByEventRef.current.get(id_evento);
    if (!snoozeUntil) return false;
    if (nowMs >= snoozeUntil - 1500) {
      if (nowMs > snoozeUntil + 30_000) {
        snoozedUntilByEventRef.current.delete(id_evento);
        saveStoredSnoozedAlarms(snoozedUntilByEventRef.current);
      }
      return false;
    }
    return true;
  }, []);

  const clearSnoozeForEvent = useCallback(
    (id_evento: string) => {
      const existingTimeout = snoozeTimeoutsRef.current.get(id_evento);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        snoozeTimeoutsRef.current.delete(id_evento);
      }
      if (snoozedUntilByEventRef.current.delete(id_evento)) {
        saveStoredSnoozedAlarms(snoozedUntilByEventRef.current);
      }
      if (activeRingingAlarmRef.current?.ev.id_evento === id_evento) {
        stopAlarmChime();
        updateActiveRingingAlarm(null);
      }
    },
    [updateActiveRingingAlarm]
  );

  const suppressCurrentAlarmOccurrence = useCallback(
    (ev: Evento, nowMs = Date.now(), snoozeUntilMs?: number) => {
      const liveEv = eventosRef.current.find((item) => item.id_evento === ev.id_evento) || ev;
      const keys = getEventOccurrenceSuppressionKeys(
        liveEv,
        nowMs,
        RECENT_WINDOW_MS,
        snoozeUntilMs
      );
      markKeysDispatched(keys);
      if (snoozeUntilMs) {
        snoozedUntilByEventRef.current.set(ev.id_evento, snoozeUntilMs);
        saveStoredSnoozedAlarms(snoozedUntilByEventRef.current);
      }
    },
    [markKeysDispatched]
  );

  const dismissRingingAlarm = useCallback(() => {
    stopAlarmChime();
    const current = activeRingingAlarmRef.current;
    updateActiveRingingAlarm(null);
    if (current) {
      suppressCurrentAlarmOccurrence(current.ev, Date.now());
      clearSnoozeForEvent(current.ev.id_evento);
    }
  }, [clearSnoozeForEvent, suppressCurrentAlarmOccurrence, updateActiveRingingAlarm]);

  const snoozeRingingAlarm = useCallback(
    (minutes = 5) => {
      stopAlarmChime();
      const current = activeRingingAlarmRef.current;
      updateActiveRingingAlarm(null);
      if (!current) return;

      const safeMinutes = Math.max(1, minutes);
      const nowMs = Date.now();
      const snoozeUntilMs = nowMs + safeMinutes * 60 * 1000;
      const snoozeId = `alarm-snooze-${current.ev.id_evento}-${snoozeUntilMs}`;
      const snoozeHorario = formatTimeHHMM(snoozeUntilMs);

      const existingTimeout = snoozeTimeoutsRef.current.get(current.ev.id_evento);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        snoozeTimeoutsRef.current.delete(current.ev.id_evento);
      }

      suppressCurrentAlarmOccurrence(current.ev, nowMs, snoozeUntilMs);

      const snapshot = current;
      const timeoutId = setTimeout(() => {
        snoozeTimeoutsRef.current.delete(snapshot.ev.id_evento);
        const stillActive = eventosRef.current.find(
          (item) =>
            item.id_evento === snapshot.ev.id_evento &&
            item.tipo_evento === 'Alarme' &&
            item.alarme_ligado
        );
        if (!stillActive) {
          if (snoozedUntilByEventRef.current.delete(snapshot.ev.id_evento)) {
            saveStoredSnoozedAlarms(snoozedUntilByEventRef.current);
          }
          return;
        }
        if (dispatchedKeysRef.current.has(snoozeId)) return;
        markKeysDispatched([snoozeId]);

        const currentTarget = snoozedUntilByEventRef.current.get(snapshot.ev.id_evento);
        if (currentTarget && currentTarget <= snoozeUntilMs + 1500) {
          snoozedUntilByEventRef.current.delete(snapshot.ev.id_evento);
          saveStoredSnoozedAlarms(snoozedUntilByEventRef.current);
        }

        startAlarmChime();
        showBrowserNotification(
          '⏰ Alarme PetMood (Soneca)',
          `${stillActive.titulo} (${snapshot.animaisNomes}) • ${snoozeHorario}`,
          snoozeId,
          { isAlarm: true, notScheduled: true }
        );
        updateActiveRingingAlarm({
          ev: stillActive,
          animaisNomes: snapshot.animaisNomes,
          horario: snoozeHorario,
        });
      }, safeMinutes * 60 * 1000);

      snoozeTimeoutsRef.current.set(snapshot.ev.id_evento, timeoutId);
    },
    [markKeysDispatched, suppressCurrentAlarmOccurrence, updateActiveRingingAlarm]
  );

  const resetSessionState = useCallback(() => {
    setAccessToken(null);
    setUsuario(null);
    setAnimais([]);
    setEventos([]);
    setDicas([]);
    setPropagandas([]);
    dismissBanner();
    stopAlarmChime();
    updateActiveRingingAlarm(null);
    snoozeTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    snoozeTimeoutsRef.current.clear();
    snoozedUntilByEventRef.current.clear();
    saveStoredSnoozedAlarms(snoozedUntilByEventRef.current);
    setActiveTabState('Home');
    setVaccineFilterAnimalId(null);
  }, [dismissBanner, updateActiveRingingAlarm]);

  const applyGetAllPayload = useCallback((payload: GetAllResponse) => {
    const [userData, animaisObj, eventosObj, dicasObj, propagandaObj] = payload;
    setUsuario(userData);
    setAnimais(Array.isArray(animaisObj?.animais) ? animaisObj.animais : []);
    setEventos(Array.isArray(eventosObj?.evento) ? eventosObj.evento : []);
    setDicas(Array.isArray(dicasObj?.dicas) ? dicasObj.dicas : []);
    setPropagandas(
      Array.isArray(propagandaObj?.propaganda) ? propagandaObj.propaganda.slice(0, 5) : []
    );
  }, []);

  const loadSessionData = useCallback(
    async (userId: string, token: string) => {
      const data = await api.getAll(userId);
      setAccessToken(token);
      applyGetAllPayload(data);
    },
    [applyGetAllPayload]
  );

  useEffect(() => {
    api.setUnauthorizedHandler(() => {
      resetSessionState();
    });
    return () => api.setUnauthorizedHandler(null);
  }, [resetSessionState]);

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      try {
        const [storedToken, storedUserId] = await Promise.all([
          api.getStoredAccessToken(),
          api.getStoredUserId(),
        ]);
        if (storedToken && storedUserId) {
          const data = await api.getAll(storedUserId);
          if (active) {
            setAccessToken(storedToken);
            applyGetAllPayload(data);
          }
        }
      } catch {
        await api.clearSessionTokens();
        if (active) resetSessionState();
      } finally {
        if (active) setIsInitializing(false);
      }
    }
    void registerNotificationServiceWorker();
    bootstrap();
    return () => {
      active = false;
    };
  }, [applyGetAllPayload, resetSessionState]);

  // Android app: OS-scheduled reminders, notification taps, resume and the back button.
  const [nativeSyncTick, setNativeSyncTick] = useState(0);
  const activeTabRef = useRef<AuthenticatedTab>('Home');
  activeTabRef.current = activeTab;

  useEffect(() => {
    if (!IS_NATIVE) return;
    const bump = () => setNativeSyncTick((n) => n + 1);
    void initNativeNotifications(() => setActiveTabState('Eventos')).then(bump);
    window.addEventListener(PERMISSION_EVENT, bump);
    const resume = CapApp.addListener('resume', bump);
    const back = CapApp.addListener('backButton', () => {
      if (activeTabRef.current !== 'Home') {
        setActiveTabState('Home');
      } else {
        void CapApp.minimizeApp();
      }
    });
    return () => {
      window.removeEventListener(PERMISSION_EVENT, bump);
      void resume.then((h) => h.remove());
      void back.then((h) => h.remove());
    };
  }, []);

  useEffect(() => {
    if (!IS_NATIVE) return;
    const loggedIn = Boolean(accessToken && usuario);
    void syncNativeReminders(loggedIn ? eventos : [], animais, loggedIn ? usuario : null);
  }, [accessToken, animais, eventos, usuario, nativeSyncTick]);

  const dispatchReminderInternal = useCallback(
    async (
      ev: Evento,
      janela: ReminderWindowKey,
      shortLabel: string,
      dedupeKey?: string
    ): Promise<DispatchedNotificationRecord[]> => {
      if (!usuario) return [];
      const channels = getAcceptedChannels(ev, usuario);
      if (channels.length === 0) return [];

      if (dedupeKey) {
        if (
          dispatchedKeysRef.current.has(dedupeKey) ||
          inFlightKeysRef.current.has(dedupeKey)
        ) {
          return [];
        }
        inFlightKeysRef.current.add(dedupeKey);
      }

      const animaisNomes = getEventAnimalNames(ev, animais);
      const { title, body } = formatReminderNotification(ev, shortLabel, animaisNomes);
      const handledByAlarmRing =
        janela === '0m' && ev.tipo_evento === 'Alarme' && ev.alarme_ligado;

      if (channels.includes('app') && !handledByAlarmRing) {
        showBrowserNotification(
          title,
          body,
          dedupeKey || `${ev.id_evento}-${janela}-${Date.now()}`
        );
      }

      showBanner({
        id: `${ev.id_evento}-${janela}-${Date.now()}`,
        title,
        message: body,
        channels,
        janelaLabel: shortLabel,
      });

      try {
        const res = await api.dispatchEventNotifications({
          id_usuario: usuario.id_usuario,
          id_evento: ev.id_evento,
          titulo: ev.titulo,
          animais_nomes: animaisNomes,
          data: ev.data,
          horario: ev.horario,
          local: ev.local,
          janela,
          canais: channels,
        });

        if (dedupeKey) {
          markKeyDispatched(dedupeKey);
        }

        return res.disparos || [];
      } catch {
        return [];
      } finally {
        if (dedupeKey) {
          inFlightKeysRef.current.delete(dedupeKey);
        }
      }
    },
    [animais, markKeyDispatched, showBanner, usuario]
  );

  const triggerAlarmRingInternal = useCallback(
    (ev: Evento, dedupeKey?: string) => {
      if (isEventSnoozeSuppressed(ev.id_evento)) return;
      if (dedupeKey && dispatchedKeysRef.current.has(dedupeKey)) return;

      const nowMs = Date.now();
      const keysToMark: string[] = [];
      if (dedupeKey) keysToMark.push(dedupeKey);
      keysToMark.push(...getEventOccurrenceSuppressionKeys(ev, nowMs, RECENT_WINDOW_MS));
      markKeysDispatched(keysToMark);

      const animaisNomes = getEventAnimalNames(ev, animais);
      startAlarmChime();
      showBrowserNotification(
        '⏰ Alarme PetMood',
        `${ev.titulo} (${animaisNomes})${ev.horario ? ` • ${ev.horario}` : ''}`,
        dedupeKey || `alarm-ring-${ev.id_evento}-${nowMs}`,
        { isAlarm: true }
      );
      updateActiveRingingAlarm({
        ev,
        animaisNomes,
        horario: ev.horario || '09:00',
      });
    },
    [animais, isEventSnoozeSuppressed, markKeysDispatched, updateActiveRingingAlarm]
  );

  useEffect(() => {
    if (!accessToken || !usuario) return;

    const trackedIds = new Set<string>([
      ...snoozeTimeoutsRef.current.keys(),
      ...snoozedUntilByEventRef.current.keys(),
    ]);
    if (activeRingingAlarmRef.current) {
      trackedIds.add(activeRingingAlarmRef.current.ev.id_evento);
    }

    const orphans = getOrphanSnoozeEventIds(eventos, trackedIds);
    orphans.forEach((orphanId) => {
      clearSnoozeForEvent(orphanId);
    });
  }, [accessToken, clearSnoozeForEvent, eventos, usuario]);

  useEffect(() => {
    if (!accessToken || !usuario || eventos.length === 0) return;

    const evaluateDueReminders = () => {
      const nowMs = Date.now();
      for (const ev of eventos) {
        const channels = getAcceptedChannels(ev, usuario);
        const isActiveAlarm = ev.tipo_evento === 'Alarme' && ev.alarme_ligado;
        if (channels.length === 0 && !isActiveAlarm) continue;

        const eventMs = getEffectiveEventDateTimeMs(ev, nowMs, RECENT_WINDOW_MS);
        if (!eventMs) continue;

        const snoozed = isEventSnoozeSuppressed(ev.id_evento, nowMs);

        if (channels.length > 0) {
          for (const offset of REMINDER_OFFSETS) {
            if (offset.key === '0m' && snoozed) continue;

            const triggerAtMs = eventMs - offset.ms;
            const diffMs = nowMs - triggerAtMs;
            const key = getReminderKey(ev.id_evento, offset.key, eventMs);

            if (
              diffMs >= 0 &&
              diffMs <= RECENT_WINDOW_MS &&
              !dispatchedKeysRef.current.has(key) &&
              !inFlightKeysRef.current.has(key)
            ) {
              void dispatchReminderInternal(ev, offset.key, offset.shortLabel, key);
            }
          }
        }

        if (isActiveAlarm && !snoozed) {
          const diffMs = nowMs - eventMs;
          const ringKey = getAlarmRingKey(ev.id_evento, eventMs);
          if (
            diffMs >= 0 &&
            diffMs <= RECENT_WINDOW_MS &&
            !dispatchedKeysRef.current.has(ringKey)
          ) {
            triggerAlarmRingInternal(ev, ringKey);
          }
        }
      }
    };

    evaluateDueReminders();

    const timers: ReturnType<typeof setTimeout>[] = [];
    const nowMs = Date.now();
    for (const ev of eventos) {
      const channels = getAcceptedChannels(ev, usuario);
      const isActiveAlarm = ev.tipo_evento === 'Alarme' && ev.alarme_ligado;
      if (channels.length === 0 && !isActiveAlarm) continue;

      const eventMs = getEffectiveEventDateTimeMs(ev, nowMs, RECENT_WINDOW_MS);
      if (!eventMs) continue;

      if (channels.length > 0) {
        for (const offset of REMINDER_OFFSETS) {
          const triggerAtMs = eventMs - offset.ms;
          const delayMs = triggerAtMs - nowMs;
          const key = getReminderKey(ev.id_evento, offset.key, eventMs);

          if (
            delayMs > 0 &&
            delayMs <= MAX_TIMEOUT_HORIZON_MS &&
            !dispatchedKeysRef.current.has(key)
          ) {
            const timerId = setTimeout(() => {
              if (offset.key === '0m' && isEventSnoozeSuppressed(ev.id_evento)) return;
              void dispatchReminderInternal(ev, offset.key, offset.shortLabel, key);
            }, delayMs + 50);
            timers.push(timerId);
          }
        }
      }

      if (isActiveAlarm) {
        const delayMs = eventMs - nowMs;
        const ringKey = getAlarmRingKey(ev.id_evento, eventMs);
        if (
          delayMs > 0 &&
          delayMs <= MAX_TIMEOUT_HORIZON_MS &&
          !dispatchedKeysRef.current.has(ringKey)
        ) {
          const timerId = setTimeout(() => {
            if (isEventSnoozeSuppressed(ev.id_evento)) return;
            triggerAlarmRingInternal(ev, ringKey);
          }, delayMs + 50);
          timers.push(timerId);
        }
      }
    }

    const intervalId = setInterval(evaluateDueReminders, 10_000);

    return () => {
      clearInterval(intervalId);
      timers.forEach((id) => clearTimeout(id));
    };
  }, [
    accessToken,
    dispatchReminderInternal,
    eventos,
    isEventSnoozeSuppressed,
    triggerAlarmRingInternal,
    usuario,
  ]);

  const setActiveTab = useCallback((tab: AuthenticatedTab) => {
    if (tab !== 'Vacinas') {
      setVaccineFilterAnimalId(null);
    }
    setActiveTabState(tab);
  }, []);

  const navigateToVaccinesForAnimal = useCallback((animalId: string) => {
    setVaccineFilterAnimalId(animalId);
    setActiveTabState('Vacinas');
  }, []);

  const clearVaccineAnimalFilter = useCallback(() => {
    setVaccineFilterAnimalId(null);
  }, []);

  const signIn = useCallback(
    async (email: string, senha: string) => {
      setIsLoading(true);
      try {
        const auth = await api.login({ email, senha });
        await api.saveSessionTokens(auth.accessToken, auth.id_usuario);
        await loadSessionData(auth.id_usuario, auth.accessToken);
        setActiveTabState('Home');
      } finally {
        setIsLoading(false);
      }
    },
    [loadSessionData]
  );

  const signUp = useCallback(
    async (payload: CreateAccountPayload) => {
      setIsLoading(true);
      try {
        const auth = await api.createAccount(payload);
        await api.saveSessionTokens(auth.accessToken, auth.id_usuario);
        await loadSessionData(auth.id_usuario, auth.accessToken);
        setActiveTabState('Home');
      } finally {
        setIsLoading(false);
      }
    },
    [loadSessionData]
  );

  const signInWithGoogle = useCallback(
    async (code: string) => {
      setIsLoading(true);
      try {
        const auth = await api.googleLogin({ code, platform: GOOGLE_PLATFORM });
        await api.saveSessionTokens(auth.accessToken, auth.id_usuario);
        await loadSessionData(auth.id_usuario, auth.accessToken);
        setActiveTabState('Home');
      } finally {
        setIsLoading(false);
      }
    },
    [loadSessionData]
  );

  const signOut = useCallback(async () => {
    await api.clearSessionTokens();
    resetSessionState();
  }, [resetSessionState]);

  const fetchTipDetails = useCallback(async (id_dicas: string) => {
    return api.getTip(id_dicas);
  }, []);

  const userId = usuario?.id_usuario;
  const userEmail = usuario?.email;

  const syncAccount = useCallback(async () => {
    if (!userId || !userEmail) throw new Error('Usuário não autenticado.');
    const freshAccount = await api.getAccount({
      id_usuario: userId,
      email: userEmail,
    });
    setUsuario((prev) => ({ ...(prev || ({} as Usuario)), ...freshAccount }));
    return freshAccount;
  }, [userEmail, userId]);

  const addAnimal = useCallback(
    async (payload: Omit<CreateAnimalPayload, 'id_usuario'>) => {
      if (!usuario) throw new Error('Usuário não autenticado.');
      const created = await api.createAnimal({ ...payload, id_usuario: usuario.id_usuario });
      const normalized: Animal = {
        ...created,
        vacinas: Array.isArray(created.vacinas) ? created.vacinas : [],
      };
      setAnimais((prev) => [...prev, normalized]);
      return normalized;
    },
    [usuario]
  );

  const editAnimal = useCallback(
    async (payload: Omit<UpdateAnimalPayload, 'id_usuario'>) => {
      if (!usuario) throw new Error('Usuário não autenticado.');
      const updated = await api.updateAnimal({ ...payload, id_usuario: usuario.id_usuario });
      setAnimais((prev) =>
        prev.map((a) =>
          a.id_animal === updated.id_animal
            ? { ...a, ...updated, vacinas: a.vacinas || [] }
            : a
        )
      );
      setEventos((prev) =>
        prev.map((ev) => ({
          ...ev,
          animal: ev.animal.map((ref) =>
            ref.id_animal === updated.id_animal ? { ...ref, nome: updated.nome } : ref
          ),
        }))
      );
      return updated;
    },
    [usuario]
  );

  const removeAnimal = useCallback(
    async (id_animal: string) => {
      if (!usuario) throw new Error('Usuário não autenticado.');
      const target = animais.find((a) => a.id_animal === id_animal);
      await api.deleteAnimal({
        id_animal,
        id_usuario: usuario.id_usuario,
        nome: target?.nome || '',
      });
      setAnimais((prev) => prev.filter((a) => a.id_animal !== id_animal));
    },
    [animais, usuario]
  );

  const addEvent = useCallback(
    async (payload: Omit<CreateEventPayload, 'id_usuario'>) => {
      if (!usuario) throw new Error('Usuário não autenticado.');
      const created = await api.createEvent({ ...payload, id_usuario: usuario.id_usuario });
      setEventos((prev) => [...prev, created]);
      return created;
    },
    [usuario]
  );

  const editEvent = useCallback(
    async (payload: Omit<UpdateEventPayload, 'id_usuario'>) => {
      if (!usuario) throw new Error('Usuário não autenticado.');
      const updated = await api.updateEvent({ ...payload, id_usuario: usuario.id_usuario });
      clearSnoozeForEvent(updated.id_evento);
      setEventos((prev) => prev.map((ev) => (ev.id_evento === updated.id_evento ? updated : ev)));
      return updated;
    },
    [clearSnoozeForEvent, usuario]
  );

  const removeEvent = useCallback(
    async (id_evento: string) => {
      if (!usuario) throw new Error('Usuário não autenticado.');
      const target = eventos.find((ev) => ev.id_evento === id_evento);
      await api.deleteEvent({
        id_evento,
        id_usuario: usuario.id_usuario,
        titulo: target?.titulo || '',
      });
      clearSnoozeForEvent(id_evento);
      setEventos((prev) => prev.filter((ev) => ev.id_evento !== id_evento));
    },
    [clearSnoozeForEvent, eventos, usuario]
  );

  const addVaccine = useCallback(
    async (payload: Omit<CreateVaccinePayload, 'id_usuario'>) => {
      if (!usuario) throw new Error('Usuário não autenticado.');
      const created = await api.createVaccine({ ...payload, id_usuario: usuario.id_usuario });
      setAnimais((prev) =>
        prev.map((a) =>
          a.id_animal === created.id_animal ? { ...a, vacinas: [...(a.vacinas || []), created] } : a
        )
      );
      return created;
    },
    [usuario]
  );

  const editVaccine = useCallback(
    async (payload: Omit<UpdateVaccinePayload, 'id_usuario'>) => {
      if (!usuario) throw new Error('Usuário não autenticado.');
      const updated = await api.updateVaccine({ ...payload, id_usuario: usuario.id_usuario });
      setAnimais((prev) =>
        prev.map((a) => {
          const filtered = (a.vacinas || []).filter((v) => v.id_vacina !== updated.id_vacina);
          if (a.id_animal === updated.id_animal) return { ...a, vacinas: [...filtered, updated] };
          return { ...a, vacinas: filtered };
        })
      );
      return updated;
    },
    [usuario]
  );

  const removeVaccine = useCallback(
    async (id_vacina: string, id_animal: string) => {
      if (!usuario) throw new Error('Usuário não autenticado.');
      const animal = animais.find((a) => a.id_animal === id_animal);
      const vac = animal?.vacinas.find((v) => v.id_vacina === id_vacina);
      await api.deleteVaccine({
        id_vacina,
        id_animal,
        id_usuario: usuario.id_usuario,
        nome_vacina: vac?.nome_vacina || '',
      });
      setAnimais((prev) =>
        prev.map((a) =>
          a.id_animal === id_animal
            ? { ...a, vacinas: (a.vacinas || []).filter((v) => v.id_vacina !== id_vacina) }
            : a
        )
      );
    },
    [animais, usuario]
  );

  const editAccount = useCallback(
    async (payload: Omit<UpdateAccountPayload, 'id_usuario'>) => {
      if (!usuario) throw new Error('Usuário não autenticado.');
      const updated = await api.updateAccount({ ...payload, id_usuario: usuario.id_usuario });
      setUsuario((prev) => ({ ...(prev || ({} as Usuario)), ...updated }));
      return updated;
    },
    [usuario]
  );

  const removeAccount = useCallback(async () => {
    if (!usuario) throw new Error('Usuário não autenticado.');
    await api.deleteAccount({
      id_usuario: usuario.id_usuario,
      nome: usuario.nome,
      email: usuario.email,
    });
    await api.clearSessionTokens();
    resetSessionState();
  }, [resetSessionState, usuario]);

  const value = useMemo<AppContextValue>(
    () => ({
      isInitializing,
      isLoading,
      isAuthenticated: Boolean(accessToken && usuario),
      accessToken,
      usuario,
      animais,
      eventos,
      dicas,
      propagandas,
      activeTab,
      vaccineFilterAnimalId,
      activeBanner,
      activeRingingAlarm,
      activePhotoViewer,
      openPhotoViewer,
      closePhotoViewer,
      dismissBanner,
      dismissRingingAlarm,
      snoozeRingingAlarm,
      setActiveTab,
      navigateToVaccinesForAnimal,
      clearVaccineAnimalFilter,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
      fetchTipDetails,
      syncAccount,
      addAnimal,
      editAnimal,
      removeAnimal,
      addEvent,
      editEvent,
      removeEvent,
      addVaccine,
      editVaccine,
      removeVaccine,
      editAccount,
      removeAccount,
    }),
    [
      isInitializing,
      isLoading,
      accessToken,
      usuario,
      animais,
      eventos,
      dicas,
      propagandas,
      activeTab,
      vaccineFilterAnimalId,
      activeBanner,
      activeRingingAlarm,
      activePhotoViewer,
      openPhotoViewer,
      closePhotoViewer,
      dismissBanner,
      dismissRingingAlarm,
      snoozeRingingAlarm,
      setActiveTab,
      navigateToVaccinesForAnimal,
      clearVaccineAnimalFilter,
      signIn,
      signUp,
      signInWithGoogle,
      signOut,
      fetchTipDetails,
      syncAccount,
      addAnimal,
      editAnimal,
      removeAnimal,
      addEvent,
      editEvent,
      removeEvent,
      addVaccine,
      editVaccine,
      removeVaccine,
      editAccount,
      removeAccount,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp deve ser utilizado dentro de um AppProvider.');
  return ctx;
}

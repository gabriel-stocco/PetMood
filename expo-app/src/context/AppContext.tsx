import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AppState } from 'react-native';
import * as api from '../services/api';
import {
  AlarmNotificationPayload,
  REMINDER_OFFSETS,
  cancelAllExpoSnoozeAlarms,
  cancelExpoEventSnoozeAndCurrentAlarm,
  formatReminderNotification,
  formatTimeHHMM,
  getAcceptedChannels,
  getActiveExpoSnoozeTargets,
  getAlarmRingKey,
  getEffectiveEventDateTimeMs,
  getEventAnimalNames,
  getEventOccurrenceSuppressionKeys,
  getInitialExpoAlarmResponse,
  getOrphanSnoozeEventIds,
  getReminderKey,
  presentExpoImmediateNotification,
  scheduleExpoSnoozeAlarm,
  startNativeAlarmSound,
  stopNativeAlarmSound,
  subscribeExpoNotificationListeners,
  syncExpoLocalNotifications,
} from '../services/eventNotifications';
import { ActivePhotoViewer } from '../components/PhotoViewerModal';
import {
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
  signInWithGoogle: (idToken: string) => Promise<void>;
  signOut: () => Promise<void>;
  fetchTipDetails: (id_dicas: string) => Promise<DicaCompleta>;
  syncAccount: () => Promise<Usuario>;
  addAnimal: (
    payload: Omit<CreateAnimalPayload, 'id_usuario'>
  ) => Promise<Animal>;
  editAnimal: (
    payload: Omit<UpdateAnimalPayload, 'id_usuario'>
  ) => Promise<Animal>;
  removeAnimal: (id_animal: string) => Promise<void>;
  addEvent: (
    payload: Omit<CreateEventPayload, 'id_usuario'>
  ) => Promise<Evento>;
  editEvent: (
    payload: Omit<UpdateEventPayload, 'id_usuario'>
  ) => Promise<Evento>;
  removeEvent: (id_evento: string) => Promise<void>;
  addVaccine: (
    payload: Omit<CreateVaccinePayload, 'id_usuario'>
  ) => Promise<Vacina>;
  editVaccine: (
    payload: Omit<UpdateVaccinePayload, 'id_usuario'>
  ) => Promise<Vacina>;
  removeVaccine: (id_vacina: string, id_animal: string) => Promise<void>;
  editAccount: (
    payload: Omit<UpdateAccountPayload, 'id_usuario'>
  ) => Promise<Usuario>;
  removeAccount: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isInitializing, setIsInitializing] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [animais, setAnimais] = useState<Animal[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [dicas, setDicas] = useState<DicaResumo[]>([]);
  const [propagandas, setPropagandas] = useState<Propaganda[]>([]);
  const [activeTab, setActiveTabState] = useState<AuthenticatedTab>('Home');
  const [vaccineFilterAnimalId, setVaccineFilterAnimalId] = useState<
    string | null
  >(null);

  const [activeBanner, setActiveBanner] =
    useState<ActiveNotificationBanner | null>(null);
  const [activeRingingAlarm, setActiveRingingAlarm] =
    useState<ActiveRingingAlarm | null>(null);
  const [activePhotoViewer, setActivePhotoViewer] =
    useState<ActivePhotoViewer | null>(null);

  const dispatchedKeysRef = useRef<Set<string>>(new Set());
  const dismissedRingKeysRef = useRef<Set<string>>(new Set());
  const inFlightKeysRef = useRef<Set<string>>(new Set());
  const bannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snoozeTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );
  const snoozedUntilByEventRef = useRef<Map<string, number>>(new Map());
  const activeRingingAlarmRef = useRef<ActiveRingingAlarm | null>(null);
  const eventosRef = useRef<Evento[]>(eventos);
  eventosRef.current = eventos;

  const updateActiveRingingAlarm = useCallback(
    (next: ActiveRingingAlarm | null) => {
      activeRingingAlarmRef.current = next;
      setActiveRingingAlarm(next);
    },
    []
  );

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

  const showBanner = useCallback((banner: ActiveNotificationBanner) => {
    if (bannerTimeoutRef.current) {
      clearTimeout(bannerTimeoutRef.current);
    }
    setActiveBanner(banner);
    bannerTimeoutRef.current = setTimeout(() => {
      setActiveBanner(null);
      bannerTimeoutRef.current = null;
    }, 9000);
  }, []);

  const markKeysDispatched = useCallback((keys: string[]) => {
    const toAdd = keys.filter(
      (key) => Boolean(key) && !dispatchedKeysRef.current.has(key)
    );
    if (toAdd.length === 0) return;
    const next = new Set(dispatchedKeysRef.current);
    toAdd.forEach((key) => next.add(key));
    dispatchedKeysRef.current = next;
  }, []);

  const markKeyDispatched = useCallback(
    (key: string) => {
      markKeysDispatched([key]);
    },
    [markKeysDispatched]
  );

  const isEventSnoozeSuppressed = useCallback(
    (id_evento: string, nowMs = Date.now()) => {
      const snoozeUntil = snoozedUntilByEventRef.current.get(id_evento);
      if (!snoozeUntil) return false;
      if (nowMs >= snoozeUntil - 1500) {
        if (nowMs > snoozeUntil + 30_000) {
          snoozedUntilByEventRef.current.delete(id_evento);
        }
        return false;
      }
      return true;
    },
    []
  );

  const clearSnoozeForEvent = useCallback(
    (id_evento: string, cancelNative = false) => {
      const existingTimeout = snoozeTimeoutsRef.current.get(id_evento);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        snoozeTimeoutsRef.current.delete(id_evento);
      }
      snoozedUntilByEventRef.current.delete(id_evento);
      if (activeRingingAlarmRef.current?.ev.id_evento === id_evento) {
        stopNativeAlarmSound();
        updateActiveRingingAlarm(null);
      }
      if (cancelNative) {
        void cancelExpoEventSnoozeAndCurrentAlarm(
          id_evento,
          [],
          undefined,
          true
        );
      }
    },
    [updateActiveRingingAlarm]
  );

  const suppressCurrentAlarmOccurrence = useCallback(
    (
      ev: Evento,
      nowMs = Date.now(),
      snoozeUntilMs?: number,
      extraRingKey?: string
    ): string[] => {
      const liveEv =
        eventosRef.current.find((item) => item.id_evento === ev.id_evento) ||
        ev;
      const keys = getEventOccurrenceSuppressionKeys(
        liveEv,
        nowMs,
        RECENT_WINDOW_MS,
        snoozeUntilMs
      );
      if (extraRingKey && !keys.includes(extraRingKey)) {
        keys.push(extraRingKey);
      }
      markKeysDispatched(keys);
      keys.forEach((k) => dismissedRingKeysRef.current.add(k));
      if (snoozeUntilMs) {
        snoozedUntilByEventRef.current.set(ev.id_evento, snoozeUntilMs);
      }
      return keys;
    },
    [markKeysDispatched]
  );

  const dismissRingingAlarm = useCallback(() => {
    stopNativeAlarmSound();
    const current = activeRingingAlarmRef.current;
    updateActiveRingingAlarm(null);
    if (current) {
      const suppressedKeys = suppressCurrentAlarmOccurrence(
        current.ev,
        Date.now()
      );
      clearSnoozeForEvent(current.ev.id_evento, false);
      void cancelExpoEventSnoozeAndCurrentAlarm(
        current.ev.id_evento,
        suppressedKeys
      );
    }
  }, [
    clearSnoozeForEvent,
    suppressCurrentAlarmOccurrence,
    updateActiveRingingAlarm,
  ]);

  const scheduleSnoozeForEvent = useCallback(
    (
      ev: Evento,
      animaisNomes: string,
      minutes = 5,
      extraRingKey?: string
    ) => {
      const safeMinutes = Math.max(1, minutes);
      const nowMs = Date.now();
      const snoozeUntilMs = nowMs + safeMinutes * 60 * 1000;
      const snoozeId = `alarm-snooze-${ev.id_evento}-${snoozeUntilMs}`;
      const snoozeHorario = formatTimeHHMM(snoozeUntilMs);

      stopNativeAlarmSound();
      updateActiveRingingAlarm(null);

      const existingTimeout = snoozeTimeoutsRef.current.get(ev.id_evento);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        snoozeTimeoutsRef.current.delete(ev.id_evento);
      }

      const suppressedKeys = suppressCurrentAlarmOccurrence(
        ev,
        nowMs,
        snoozeUntilMs,
        extraRingKey
      );

      void scheduleExpoSnoozeAlarm(ev, animaisNomes, safeMinutes, {
        snoozeId,
        triggerAtMs: snoozeUntilMs,
        cancelIdentifiers: suppressedKeys,
      });

      const timeoutId = setTimeout(() => {
        snoozeTimeoutsRef.current.delete(ev.id_evento);
        const stillActive = eventosRef.current.find(
          (item) =>
            item.id_evento === ev.id_evento &&
            item.tipo_evento === 'Alarme' &&
            item.alarme_ligado
        );
        if (!stillActive) {
          snoozedUntilByEventRef.current.delete(ev.id_evento);
          void cancelExpoEventSnoozeAndCurrentAlarm(
            ev.id_evento,
            [],
            undefined,
            true
          );
          return;
        }
        if (dispatchedKeysRef.current.has(snoozeId)) return;
        markKeysDispatched([snoozeId]);

        const currentTarget = snoozedUntilByEventRef.current.get(ev.id_evento);
        if (currentTarget && currentTarget <= snoozeUntilMs + 1500) {
          snoozedUntilByEventRef.current.delete(ev.id_evento);
        }

        void startNativeAlarmSound();
        void presentExpoImmediateNotification(
          '⏰ Alarme PetMood (Soneca)',
          `${stillActive.titulo} (${animaisNomes}) • ${snoozeHorario}`,
          {
            identifier: snoozeId,
            isAlarm: true,
            data: {
              id_evento: stillActive.id_evento,
              titulo: stillActive.titulo,
              horario: snoozeHorario,
              animaisNomes,
              frequencia: stillActive.frequencia || '',
              data: stillActive.data,
              isAlarm: true,
              snoozeId,
              snoozeTargetMs: snoozeUntilMs,
              source: 'foreground',
            },
          }
        );
        updateActiveRingingAlarm({
          ev: stillActive,
          animaisNomes,
          horario: snoozeHorario,
        });
      }, safeMinutes * 60 * 1000);

      snoozeTimeoutsRef.current.set(ev.id_evento, timeoutId);
    },
    [
      markKeysDispatched,
      suppressCurrentAlarmOccurrence,
      updateActiveRingingAlarm,
    ]
  );

  const snoozeRingingAlarm = useCallback(
    (minutes = 5) => {
      const current = activeRingingAlarmRef.current;
      if (!current) {
        stopNativeAlarmSound();
        return;
      }
      scheduleSnoozeForEvent(current.ev, current.animaisNomes, minutes);
    },
    [scheduleSnoozeForEvent]
  );

  const resetSessionState = useCallback(() => {
    setAccessToken(null);
    setUsuario(null);
    setAnimais([]);
    setEventos([]);
    setDicas([]);
    setPropagandas([]);
    dismissBanner();
    stopNativeAlarmSound();
    updateActiveRingingAlarm(null);
    snoozeTimeoutsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    snoozeTimeoutsRef.current.clear();
    snoozedUntilByEventRef.current.clear();
    dismissedRingKeysRef.current.clear();
    void cancelAllExpoSnoozeAlarms();
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
      Array.isArray(propagandaObj?.propaganda)
        ? propagandaObj.propaganda.slice(0, 5)
        : []
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

    return () => {
      api.setUnauthorizedHandler(null);
    };
  }, [resetSessionState]);

  useEffect(() => {
    let isMounted = true;

    async function bootstrapSession() {
      try {
        const [storedToken, storedUserId] = await Promise.all([
          api.getStoredAccessToken(),
          api.getStoredUserId(),
        ]);

        if (storedToken && storedUserId) {
          const data = await api.getAll(storedUserId);
          if (isMounted) {
            setAccessToken(storedToken);
            applyGetAllPayload(data);
          }
        }
      } catch {
        await api.clearSessionTokens();
        if (isMounted) {
          resetSessionState();
        }
      } finally {
        if (isMounted) {
          setIsInitializing(false);
        }
      }
    }

    bootstrapSession();

    return () => {
      isMounted = false;
    };
  }, [applyGetAllPayload, resetSessionState]);

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
      const { title, body } = formatReminderNotification(
        ev,
        shortLabel,
        animaisNomes
      );
      const handledByAlarmRing =
        janela === '0m' && ev.tipo_evento === 'Alarme' && ev.alarme_ligado;

      if (channels.includes('app') && !handledByAlarmRing) {
        void presentExpoImmediateNotification(title, body, {
          identifier: dedupeKey || `${ev.id_evento}-${janela}-${Date.now()}`,
        });
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
    (
      ev: Evento,
      dedupeKey?: string,
      skipImmediateNotif = false
    ) => {
      if (isEventSnoozeSuppressed(ev.id_evento)) return;
      if (dedupeKey) {
        if (dispatchedKeysRef.current.has(dedupeKey)) return;
      }

      const nowMs = Date.now();
      const keysToMark: string[] = [];
      if (dedupeKey) keysToMark.push(dedupeKey);
      keysToMark.push(
        ...getEventOccurrenceSuppressionKeys(ev, nowMs, RECENT_WINDOW_MS)
      );
      markKeysDispatched(keysToMark);

      const animaisNomes = getEventAnimalNames(ev, animais);
      void startNativeAlarmSound();
      if (!skipImmediateNotif) {
        const ringIdentifier =
          dedupeKey || `alarm-ring-${ev.id_evento}-${nowMs}`;
        void presentExpoImmediateNotification(
          '⏰ Alarme PetMood',
          `${ev.titulo} (${animaisNomes})${ev.horario ? ` • ${ev.horario}` : ''}`,
          {
            identifier: ringIdentifier,
            isAlarm: true,
            data: {
              id_evento: ev.id_evento,
              titulo: ev.titulo,
              horario: ev.horario || '09:00',
              animaisNomes,
              frequencia: ev.frequencia || '',
              data: ev.data,
              isAlarm: true,
              ringKey: dedupeKey,
              source: 'foreground',
            },
          }
        );
      }
      updateActiveRingingAlarm({
        ev,
        animaisNomes,
        horario: ev.horario || '09:00',
      });
    },
    [
      animais,
      isEventSnoozeSuppressed,
      markKeysDispatched,
      updateActiveRingingAlarm,
    ]
  );

  const openAlarmFromNotificationPayload = useCallback(
    (
      payload: AlarmNotificationPayload,
      actionId = '',
      isForegroundReceive = false
    ) => {
      const matched = eventosRef.current.find(
        (e) => e.id_evento === payload.id_evento
      );
      const fallbackEvent: Evento = matched || {
        id_evento: payload.id_evento || `notif-${Date.now()}`,
        id_usuario: usuario?.id_usuario || '',
        tipo_evento: 'Alarme',
        animal: [],
        titulo: payload.titulo || 'Alarme PetMood',
        data: payload.data || '',
        horario: payload.horario || '09:00',
        local: '',
        anotacao: '',
        veterinario: '',
        alarme_ligado: true,
        frequencia: (payload.frequencia as Evento['frequencia']) || 'Uma vez',
        notificacao_app: true,
        notificacao_whatsapp: false,
      };
      const animaisNomes = matched
        ? getEventAnimalNames(matched, animais)
        : payload.animaisNomes || 'Pet';

      if (actionId === 'dismiss') {
        const suppressedKeys = suppressCurrentAlarmOccurrence(
          fallbackEvent,
          Date.now(),
          undefined,
          payload.ringKey
        );
        if (payload.snoozeId) {
          markKeysDispatched([payload.snoozeId]);
          dismissedRingKeysRef.current.add(payload.snoozeId);
        }
        clearSnoozeForEvent(fallbackEvent.id_evento, false);
        void cancelExpoEventSnoozeAndCurrentAlarm(
          fallbackEvent.id_evento,
          suppressedKeys
        );
        stopNativeAlarmSound();
        updateActiveRingingAlarm(null);
        return;
      }

      if (actionId === 'snooze') {
        if (payload.snoozeId) {
          markKeysDispatched([payload.snoozeId]);
          dismissedRingKeysRef.current.add(payload.snoozeId);
        }
        scheduleSnoozeForEvent(fallbackEvent, animaisNomes, 5, payload.ringKey);
        return;
      }

      // Evita loop quando o próprio app em primeiro plano exibe a notificação imediata
      if (isForegroundReceive && payload.source === 'foreground') {
        return;
      }

      // Se a sessão já está carregada e o alarme foi excluído ou desligado, cancela e não dispara
      if (
        usuario?.id_usuario &&
        (!matched ||
          matched.tipo_evento !== 'Alarme' ||
          !matched.alarme_ligado)
      ) {
        clearSnoozeForEvent(fallbackEvent.id_evento, true);
        return;
      }

      if (payload.snoozeId) {
        if (
          dismissedRingKeysRef.current.has(payload.snoozeId) ||
          (isForegroundReceive &&
            dispatchedKeysRef.current.has(payload.snoozeId))
        ) {
          return;
        }
        markKeysDispatched([payload.snoozeId]);
        const currentTarget = snoozedUntilByEventRef.current.get(
          fallbackEvent.id_evento
        );
        if (
          currentTarget &&
          currentTarget <= (payload.snoozeTargetMs || Date.now()) + 1500
        ) {
          snoozedUntilByEventRef.current.delete(fallbackEvent.id_evento);
        }
        void startNativeAlarmSound();
        updateActiveRingingAlarm({
          ev: fallbackEvent,
          animaisNomes,
          horario: payload.horario || formatTimeHHMM(Date.now()),
        });
        return;
      }

      // Alarme regular: nunca dispara o horário atual se o evento estiver em soneca
      if (isEventSnoozeSuppressed(fallbackEvent.id_evento)) {
        return;
      }

      const nowMs = Date.now();
      const occKeys = getEventOccurrenceSuppressionKeys(
        fallbackEvent,
        nowMs,
        RECENT_WINDOW_MS
      );
      const effectiveRingKey =
        payload.ringKey || occKeys.find((k) => k.startsWith('alarm-ring|'));

      if (
        effectiveRingKey &&
        (dismissedRingKeysRef.current.has(effectiveRingKey) ||
          (isForegroundReceive &&
            dispatchedKeysRef.current.has(effectiveRingKey)))
      ) {
        return;
      }

      markKeysDispatched(
        effectiveRingKey ? [effectiveRingKey, ...occKeys] : occKeys
      );

      void startNativeAlarmSound();
      updateActiveRingingAlarm({
        ev: fallbackEvent,
        animaisNomes,
        horario: fallbackEvent.horario || payload.horario || '09:00',
      });
    },
    [
      animais,
      clearSnoozeForEvent,
      isEventSnoozeSuppressed,
      markKeysDispatched,
      scheduleSnoozeForEvent,
      suppressCurrentAlarmOccurrence,
      updateActiveRingingAlarm,
      usuario?.id_usuario,
    ]
  );

  const lastHandledNotifKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeExpoNotificationListeners({
      onAlarmReceived: (payload) => {
        openAlarmFromNotificationPayload(payload, '', true);
      },
      onAlarmAction: (payload, actionId) => {
        openAlarmFromNotificationPayload(payload, actionId, false);
      },
    });

    void getInitialExpoAlarmResponse().then((initial) => {
      if (!initial) return;
      const key = `${initial.payload.id_evento}|${
        initial.payload.snoozeId ||
        initial.payload.ringKey ||
        initial.payload.horario
      }|${initial.actionId}`;
      if (lastHandledNotifKeyRef.current === key) return;
      lastHandledNotifKeyRef.current = key;
      openAlarmFromNotificationPayload(initial.payload, initial.actionId, false);
    });

    return () => {
      unsubscribe();
    };
  }, [openAlarmFromNotificationPayload]);

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
      clearSnoozeForEvent(orphanId, true);
    });
  }, [accessToken, clearSnoozeForEvent, eventos, usuario]);

  useEffect(() => {
    if (!accessToken || !usuario) return;

    let isEffectActive = true;

    const hydrateSnoozesAndEvaluate = async (shouldSyncNative = false) => {
      const activeSnoozes = await getActiveExpoSnoozeTargets();
      if (!isEffectActive) return;

      const nowMs = Date.now();
      activeSnoozes.forEach((targetMs, eventId) => {
        const current = snoozedUntilByEventRef.current.get(eventId) || 0;
        if (targetMs > nowMs && targetMs > current) {
          snoozedUntilByEventRef.current.set(eventId, targetMs);
        }
      });

      if (shouldSyncNative) {
        void syncExpoLocalNotifications(
          eventos,
          usuario,
          animais,
          dispatchedKeysRef.current,
          snoozedUntilByEventRef.current
        );
      }

      evaluateDueReminders();
    };

    const evaluateDueReminders = () => {
      if (eventos.length === 0) return;
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

    void hydrateSnoozesAndEvaluate(true);

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
              if (offset.key === '0m' && isEventSnoozeSuppressed(ev.id_evento)) {
                return;
              }
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
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void hydrateSnoozesAndEvaluate(false);
      }
    });

    return () => {
      isEffectActive = false;
      clearInterval(intervalId);
      appStateSub.remove();
      timers.forEach((id) => clearTimeout(id));
    };
  }, [
    accessToken,
    animais,
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
    async (idToken: string) => {
      setIsLoading(true);
      try {
        const auth = await api.googleLogin({ id_token: idToken });
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
    if (!userId || !userEmail) {
      throw new Error('Usuário não autenticado.');
    }
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
      const created = await api.createAnimal({
        ...payload,
        id_usuario: usuario.id_usuario,
      });
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
      const updated = await api.updateAnimal({
        ...payload,
        id_usuario: usuario.id_usuario,
      });
      setAnimais((prev) =>
        prev.map((animal) =>
          animal.id_animal === updated.id_animal
            ? { ...animal, ...updated, vacinas: animal.vacinas || [] }
            : animal
        )
      );
      setEventos((prev) =>
        prev.map((ev) => ({
          ...ev,
          animal: ev.animal.map((ref) =>
            ref.id_animal === updated.id_animal
              ? { ...ref, nome: updated.nome }
              : ref
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
      const created = await api.createEvent({
        ...payload,
        id_usuario: usuario.id_usuario,
      });
      setEventos((prev) => [...prev, created]);
      return created;
    },
    [usuario]
  );

  const editEvent = useCallback(
    async (payload: Omit<UpdateEventPayload, 'id_usuario'>) => {
      if (!usuario) throw new Error('Usuário não autenticado.');
      const updated = await api.updateEvent({
        ...payload,
        id_usuario: usuario.id_usuario,
      });
      clearSnoozeForEvent(updated.id_evento, true);
      setEventos((prev) =>
        prev.map((ev) => (ev.id_evento === updated.id_evento ? updated : ev))
      );
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
      clearSnoozeForEvent(id_evento, false);
      await cancelExpoEventSnoozeAndCurrentAlarm(
        id_evento,
        [],
        undefined,
        true
      );
      setEventos((prev) => prev.filter((ev) => ev.id_evento !== id_evento));
    },
    [clearSnoozeForEvent, eventos, usuario]
  );

  const addVaccine = useCallback(
    async (payload: Omit<CreateVaccinePayload, 'id_usuario'>) => {
      if (!usuario) throw new Error('Usuário não autenticado.');
      const created = await api.createVaccine({
        ...payload,
        id_usuario: usuario.id_usuario,
      });
      setAnimais((prev) =>
        prev.map((animal) =>
          animal.id_animal === created.id_animal
            ? { ...animal, vacinas: [...(animal.vacinas || []), created] }
            : animal
        )
      );
      return created;
    },
    [usuario]
  );

  const editVaccine = useCallback(
    async (payload: Omit<UpdateVaccinePayload, 'id_usuario'>) => {
      if (!usuario) throw new Error('Usuário não autenticado.');
      const updated = await api.updateVaccine({
        ...payload,
        id_usuario: usuario.id_usuario,
      });

      setAnimais((prev) =>
        prev.map((animal) => {
          const filtered = (animal.vacinas || []).filter(
            (v) => v.id_vacina !== updated.id_vacina
          );
          if (animal.id_animal === updated.id_animal) {
            return { ...animal, vacinas: [...filtered, updated] };
          }
          return { ...animal, vacinas: filtered };
        })
      );
      return updated;
    },
    [usuario]
  );

  const removeVaccine = useCallback(
    async (id_vacina: string, id_animal: string) => {
      if (!usuario) throw new Error('Usuário não autenticado.');
      const targetAnimal = animais.find((a) => a.id_animal === id_animal);
      const targetVaccine = targetAnimal?.vacinas.find(
        (v) => v.id_vacina === id_vacina
      );
      await api.deleteVaccine({
        id_vacina,
        id_animal,
        id_usuario: usuario.id_usuario,
        nome_vacina: targetVaccine?.nome_vacina || '',
      });
      setAnimais((prev) =>
        prev.map((animal) =>
          animal.id_animal === id_animal
            ? {
                ...animal,
                vacinas: (animal.vacinas || []).filter(
                  (v) => v.id_vacina !== id_vacina
                ),
              }
            : animal
        )
      );
    },
    [animais, usuario]
  );

  const editAccount = useCallback(
    async (payload: Omit<UpdateAccountPayload, 'id_usuario'>) => {
      if (!usuario) throw new Error('Usuário não autenticado.');
      const updated = await api.updateAccount({
        ...payload,
        id_usuario: usuario.id_usuario,
      });
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
  if (!ctx) {
    throw new Error('useApp deve ser utilizado dentro de um AppProvider.');
  }
  return ctx;
}

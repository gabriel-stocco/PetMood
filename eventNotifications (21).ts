import type {
  Animal,
  Evento,
  NotificationChannel,
  ReminderWindowKey,
  Usuario,
} from '../types';
import { isValidCellPhone } from '../utils/phone';
import { formatDateDisplay, toISODate } from '../utils/date';
import { IS_NATIVE } from './platform';
import {
  getNativePermission,
  requestNativePermission,
  showNativeNow,
} from './nativeNotifications';

export const REMINDER_OFFSETS: {
  key: ReminderWindowKey;
  label: string;
  shortLabel: string;
  ms: number;
}[] = [
  {
    key: '2d',
    label: '2 dias antes',
    shortLabel: 'Faltam 2 dias',
    ms: 2 * 24 * 60 * 60 * 1000,
  },
  {
    key: '1d',
    label: '1 dia antes',
    shortLabel: 'Falta 1 dia',
    ms: 1 * 24 * 60 * 60 * 1000,
  },
  {
    key: '1h',
    label: '1 hora antes',
    shortLabel: 'Falta 1 hora',
    ms: 1 * 60 * 60 * 1000,
  },
  {
    key: '0m',
    label: 'Na hora do evento',
    shortLabel: 'É agora!',
    ms: 0,
  },
];

export function formatDateBR(isoDate?: string): string {
  return formatDateDisplay(isoDate, '');
}

export function parseEventDateTimeMs(data?: string, horario?: string): number | null {
  const iso = toISODate(data);
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  let hour = 9;
  let minute = 0;
  if (horario && /^\d{2}:\d{2}$/.test(horario.trim())) {
    const [hh, mm] = horario.trim().split(':').map(Number);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      hour = hh;
      minute = mm;
    }
  }
  const dt = new Date(y, m - 1, d, hour, minute, 0, 0);
  const ms = dt.getTime();
  return Number.isNaN(ms) ? null : ms;
}

export function getEffectiveEventDateTimeMs(
  ev: Evento,
  nowMs: number,
  recentGraceMs = 120_000
): number | null {
  const baseMs = parseEventDateTimeMs(ev.data, ev.horario);
  if (!baseMs) return null;

  if (
    ev.tipo_evento !== 'Alarme' ||
    !ev.alarme_ligado ||
    !ev.frequencia ||
    ev.frequencia === 'Uma vez'
  ) {
    return baseMs;
  }

  const cursor = new Date(baseMs);
  let iterations = 0;
  while (cursor.getTime() < nowMs - recentGraceMs && iterations < 4000) {
    if (ev.frequencia === 'Diária') {
      cursor.setDate(cursor.getDate() + 1);
    } else if (ev.frequencia === 'Semanal') {
      cursor.setDate(cursor.getDate() + 7);
    } else if (ev.frequencia === 'Mensal') {
      cursor.setMonth(cursor.getMonth() + 1);
    } else {
      break;
    }
    iterations += 1;
  }
  return cursor.getTime();
}

export function getReminderKey(
  id_evento: string,
  janela: ReminderWindowKey,
  eventMs: number
): string {
  return `${id_evento}|${janela}|${eventMs}`;
}

export function getAlarmRingKey(id_evento: string, eventMs: number): string {
  return `alarm-ring|${id_evento}|${eventMs}`;
}

export function formatTimeHHMM(ms: number): string {
  const dt = new Date(ms);
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function getEventOccurrenceSuppressionKeys(
  ev: Evento,
  nowMs: number,
  recentGraceMs = 120_000,
  untilMs?: number
): string[] {
  const keys = new Set<string>();
  const upperBoundMs = Math.max(nowMs + 60_000, untilMs ?? nowMs + 60_000);
  const lowerBoundMs = nowMs - recentGraceMs;

  const candidates: number[] = [];
  const effectiveMs = getEffectiveEventDateTimeMs(ev, nowMs, recentGraceMs);
  if (effectiveMs) candidates.push(effectiveMs);

  const baseMs = parseEventDateTimeMs(ev.data, ev.horario);
  if (baseMs && !candidates.includes(baseMs)) candidates.push(baseMs);

  if (
    effectiveMs &&
    ev.tipo_evento === 'Alarme' &&
    ev.alarme_ligado &&
    ev.frequencia &&
    ev.frequencia !== 'Uma vez'
  ) {
    const cursor = new Date(effectiveMs);
    for (let i = 0; i < 3; i++) {
      if (ev.frequencia === 'Diária') {
        cursor.setDate(cursor.getDate() + 1);
      } else if (ev.frequencia === 'Semanal') {
        cursor.setDate(cursor.getDate() + 7);
      } else if (ev.frequencia === 'Mensal') {
        cursor.setMonth(cursor.getMonth() + 1);
      } else {
        break;
      }
      const nextMs = cursor.getTime();
      if (nextMs <= upperBoundMs) {
        candidates.push(nextMs);
      } else {
        break;
      }
    }
  }

  for (const occMs of candidates) {
    if (occMs >= lowerBoundMs && occMs <= upperBoundMs) {
      keys.add(getAlarmRingKey(ev.id_evento, occMs));
      keys.add(getReminderKey(ev.id_evento, '0m', occMs));
    }
  }

  return Array.from(keys);
}

export function getOrphanSnoozeEventIds(
  eventos: Evento[],
  snoozedEventIds: Iterable<string>
): string[] {
  const activeAlarmIds = new Set(
    eventos
      .filter((ev) => ev.tipo_evento === 'Alarme' && ev.alarme_ligado)
      .map((ev) => ev.id_evento)
  );
  const orphans: string[] = [];
  for (const eventId of snoozedEventIds) {
    if (!eventId || !activeAlarmIds.has(eventId)) {
      orphans.push(eventId);
    }
  }
  return orphans;
}

export function getEventAnimalNames(ev: Evento, animais: Animal[]): string {
  if (!ev.animal || ev.animal.length === 0) return 'Pet';
  return ev.animal
    .map((ref) => animais.find((a) => a.id_animal === ref.id_animal)?.nome || ref.nome || 'Pet')
    .join(', ');
}

export function getAcceptedChannels(ev: Evento, usuario: Usuario | null): NotificationChannel[] {
  if (!usuario) return [];
  if (ev.tipo_evento === 'Alarme' && !ev.alarme_ligado) return [];

  const channels: NotificationChannel[] = [];
  if (usuario.notificacao_app && ev.notificacao_app) {
    channels.push('app');
  }
  if (usuario.notificacao_whatsapp && ev.notificacao_whatsapp && isValidCellPhone(usuario.celular)) {
    channels.push('whatsapp');
  }
  return channels;
}

export function getDisabledSelectedChannels(
  ev: Evento,
  usuario: Usuario | null
): NotificationChannel[] {
  if (!usuario) return [];

  const channels: NotificationChannel[] = [];
  if (ev.notificacao_app && !usuario.notificacao_app) {
    channels.push('app');
  }
  if (
    ev.notificacao_whatsapp &&
    (!usuario.notificacao_whatsapp || !isValidCellPhone(usuario.celular))
  ) {
    channels.push('whatsapp');
  }
  return channels;
}

export function formatReminderNotification(
  ev: Evento,
  shortLabel: string,
  animaisNomes: string
): { title: string; body: string } {
  const datePart = formatDateBR(ev.data);
  const timePart = ev.horario ? ` às ${ev.horario}` : '';
  const localPart = ev.tipo_evento !== 'Alarme' && ev.local ? ` • ${ev.local}` : '';
  return {
    title: `PetMood • ${shortLabel}`,
    body: `${ev.titulo} (${animaisNomes}) em ${datePart}${timePart}${localPart}`,
  };
}

export type BrowserNotificationPermissionState = NotificationPermission | 'unsupported';

let swRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function registerNotificationServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (
    typeof window === 'undefined' ||
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator)
  ) {
    return Promise.resolve(null);
  }
  if (!swRegistrationPromise) {
    swRegistrationPromise = navigator.serviceWorker
      .register('/sw.js')
      .catch(() => null);
  }
  return swRegistrationPromise;
}

export function getBrowserNotificationPermission(): BrowserNotificationPermissionState {
  if (IS_NATIVE) return getNativePermission();
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return window.Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<BrowserNotificationPermissionState> {
  if (IS_NATIVE) return requestNativePermission();
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  void registerNotificationServiceWorker();
  try {
    return await window.Notification.requestPermission();
  } catch {
    return window.Notification.permission;
  }
}

export type DeviceOS = 'android' | 'ios' | 'other';

export function getAlarmSoundProfileLabel(os: DeviceOS = 'android'): string {
  if (os === 'ios') return 'Som padrão iOS';
  return 'Som padrão Android';
}

export function showBrowserNotification(
  title: string,
  body: string,
  tag: string,
  options?: { isAlarm?: boolean; notScheduled?: boolean }
): boolean {
  if (IS_NATIVE) {
    // Reminders and alarms are pre-scheduled with the OS (nativeNotifications.ts), so showing
    // them here would duplicate them. Only one-off notifications (snoozes) are shown now.
    if (options?.notScheduled) void showNativeNow(title, body, Boolean(options.isAlarm));
    return getNativePermission() === 'granted';
  }
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (window.Notification.permission !== 'granted') {
    return false;
  }

  const notifOptions: NotificationOptions & {
    vibrate?: number[];
    renotify?: boolean;
  } = {
    body,
    tag,
    silent: false,
    renotify: Boolean(options?.isAlarm),
    requireInteraction: Boolean(options?.isAlarm),
    vibrate: options?.isAlarm ? [400, 180, 400, 180, 400] : [200, 100, 200],
  };

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    void registerNotificationServiceWorker().then(async (reg) => {
      try {
        const activeReg = reg || (await navigator.serviceWorker.getRegistration());
        if (activeReg && typeof activeReg.showNotification === 'function') {
          await activeReg.showNotification(title, notifOptions);
          return;
        }
      } catch {
        // Fallback below
      }
      try {
        new window.Notification(title, { body, tag, silent: false });
      } catch {
        // Ignore browsers blocking direct constructor
      }
    });
    return true;
  }

  try {
    new window.Notification(title, { body, tag, silent: false });
    return true;
  } catch {
    return false;
  }
}

let alarmIntervalId: ReturnType<typeof setInterval> | null = null;
let alarmAudioCtx: AudioContext | null = null;
let audioUnlockRegistered = false;

export function unlockWebAlarmAudio(): void {
  if (typeof window === 'undefined' || audioUnlockRegistered) return;
  audioUnlockRegistered = true;

  const unlock = () => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      if (!alarmAudioCtx) {
        alarmAudioCtx = new AudioCtx();
      }
      if (alarmAudioCtx.state === 'suspended') {
        void alarmAudioCtx.resume().catch(() => {});
      }
    } catch {
      // Ignore browser audio restrictions
    }
  };

  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
}

interface ToneStep {
  freq: number;
  offsetSec: number;
  durationSec: number;
  type: OscillatorType;
  peakGain: number;
}

function getAlarmToneSteps(os: DeviceOS = 'android'): ToneStep[] {
  if (os === 'ios') {
    // Motivo melódico cristalino estilo Radar/Marimba padrão iOS
    return [
      { freq: 1046.5, offsetSec: 0, durationSec: 0.11, type: 'sine', peakGain: 0.32 },
      { freq: 1318.51, offsetSec: 0.11, durationSec: 0.11, type: 'sine', peakGain: 0.32 },
      { freq: 1567.98, offsetSec: 0.22, durationSec: 0.11, type: 'sine', peakGain: 0.34 },
      { freq: 2093.0, offsetSec: 0.33, durationSec: 0.16, type: 'sine', peakGain: 0.36 },
      { freq: 1567.98, offsetSec: 0.50, durationSec: 0.12, type: 'sine', peakGain: 0.3 },
      { freq: 1318.51, offsetSec: 0.63, durationSec: 0.22, type: 'sine', peakGain: 0.32 },
    ];
  }
  // Cadência rítmica digital característica de alarme padrão Android (padrão também no modelo Web)
  return [
    { freq: 987.77, offsetSec: 0, durationSec: 0.13, type: 'triangle', peakGain: 0.34 },
    { freq: 1318.51, offsetSec: 0.16, durationSec: 0.13, type: 'triangle', peakGain: 0.34 },
    { freq: 987.77, offsetSec: 0.34, durationSec: 0.13, type: 'triangle', peakGain: 0.34 },
    { freq: 1318.51, offsetSec: 0.50, durationSec: 0.24, type: 'triangle', peakGain: 0.38 },
  ];
}

function scheduleChimeNotes(ctx: AudioContext, os: DeviceOS) {
  const now = ctx.currentTime + 0.01;
  const steps = getAlarmToneSteps(os);
  steps.forEach((step) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = step.type;
    osc.frequency.setValueAtTime(step.freq, now + step.offsetSec);
    gain.gain.setValueAtTime(0.001, now + step.offsetSec);
    gain.gain.exponentialRampToValueAtTime(step.peakGain, now + step.offsetSec + 0.02);
    gain.gain.exponentialRampToValueAtTime(
      0.001,
      now + step.offsetSec + step.durationSec
    );
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + step.offsetSec);
    osc.stop(now + step.offsetSec + step.durationSec + 0.02);
  });
}

function playSingleChime(os: DeviceOS) {
  if (typeof window === 'undefined') return;
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate([320, 140, 320]);
    } catch {
      // Ignore vibration restrictions
    }
  }
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!alarmAudioCtx) {
      alarmAudioCtx = new AudioCtx();
    }
    const ctx = alarmAudioCtx;
    if (ctx.state === 'suspended') {
      void ctx
        .resume()
        .then(() => scheduleChimeNotes(ctx, os))
        .catch(() => {});
      return;
    }

    scheduleChimeNotes(ctx, os);
  } catch {
    // Ignore browser autoplay restrictions
  }
}

export function startAlarmChime(osOverride: DeviceOS = 'android'): void {
  stopAlarmChime();
  playSingleChime(osOverride);
  alarmIntervalId = setInterval(() => playSingleChime(osOverride), 1800);
}

export function stopAlarmChime(): void {
  if (alarmIntervalId) {
    clearInterval(alarmIntervalId);
    alarmIntervalId = null;
  }
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(0);
    } catch {
      // Ignore
    }
  }
}

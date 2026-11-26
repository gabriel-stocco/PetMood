import { Platform, Vibration } from 'react-native';
import {
  Animal,
  Evento,
  NotificationChannel,
  ReminderWindowKey,
  Usuario,
} from '../types';
import { formatDateDisplay, toISODate } from '../utils/date';
import { isValidCellPhone } from '../utils/phone';

const EVENTS_CHANNEL_ID = 'petmood-eventos-v3';
const ALARMS_CHANNEL_ID = 'petmood-alarmes-v3';
const ALARMS_EXPO_GO_CHANNEL_ID = 'petmood-alarmes-expogo-v3';
const ALARMS_FOREGROUND_CHANNEL_ID = 'petmood-alarmes-banner-v3';
const ALARM_CATEGORY_ID = 'petmood-alarm-actions';
const ALARM_NOTIFICATION_SOUND = 'alarm.wav';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const ALARM_SOUND_ASSET = require('../../assets/sounds/alarm.wav');

export interface AlarmNotificationPayload {
  id_evento: string;
  titulo: string;
  horario: string;
  animaisNomes: string;
  frequencia?: string;
  data?: string;
  isAlarm: boolean;
  ringKey?: string;
  snoozeId?: string;
  snoozeTargetMs?: number;
  source?: 'scheduled' | 'foreground';
}

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

export function formatDateBR(dateStr?: string): string {
  return formatDateDisplay(dateStr);
}

export function parseEventDateTimeMs(
  data?: string,
  horario?: string
): number | null {
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
    .map(
      (ref) =>
        animais.find((a) => a.id_animal === ref.id_animal)?.nome ||
        ref.nome ||
        'Pet'
    )
    .join(', ');
}

export function getAcceptedChannels(
  ev: Evento,
  usuario: Usuario | null
): NotificationChannel[] {
  if (!usuario) return [];
  if (ev.tipo_evento === 'Alarme' && !ev.alarme_ligado) return [];

  const channels: NotificationChannel[] = [];
  if (usuario.notificacao_app && ev.notificacao_app) {
    channels.push('app');
  }
  if (
    usuario.notificacao_whatsapp &&
    ev.notificacao_whatsapp &&
    isValidCellPhone(usuario.celular)
  ) {
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
  const localPart =
    ev.tipo_evento !== 'Alarme' && ev.local ? ` • ${ev.local}` : '';
  return {
    title: `PetMood • ${shortLabel}`,
    body: `${ev.titulo} (${animaisNomes}) em ${datePart}${timePart}${localPart}`,
  };
}

function getUpcomingEventOccurrencesMs(ev: Evento, nowMs: number): number[] {
  const firstMs = getEffectiveEventDateTimeMs(ev, nowMs, 0);
  if (!firstMs) return [];

  if (
    ev.tipo_evento !== 'Alarme' ||
    !ev.alarme_ligado ||
    !ev.frequencia ||
    ev.frequencia === 'Uma vez'
  ) {
    return [firstMs];
  }

  const maxOccurrences =
    ev.frequencia === 'Diária'
      ? 7
      : ev.frequencia === 'Semanal'
      ? 4
      : ev.frequencia === 'Mensal'
      ? 3
      : 1;

  const occurrences: number[] = [firstMs];
  const cursor = new Date(firstMs);
  for (let i = 1; i < maxOccurrences; i++) {
    if (ev.frequencia === 'Diária') {
      cursor.setDate(cursor.getDate() + 1);
    } else if (ev.frequencia === 'Semanal') {
      cursor.setDate(cursor.getDate() + 7);
    } else if (ev.frequencia === 'Mensal') {
      cursor.setMonth(cursor.getMonth() + 1);
    } else {
      break;
    }
    occurrences.push(cursor.getTime());
  }
  return occurrences;
}

let notificationHandlerConfigured = false;
let channelsConfigured = false;

function getExpoNotificationsModule(): any | null {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-notifications');
  } catch {
    return null;
  }
}

function getExpoAudioModule(): any | null {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-audio');
  } catch {
    return null;
  }
}

function isRunningInExpoGo(): boolean {
  if (Platform.OS === 'web') return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-constants');
    const Constants = mod?.default ?? mod;
    return (
      Constants?.executionEnvironment === 'storeClient' ||
      Constants?.appOwnership === 'expo'
    );
  } catch {
    return false;
  }
}

function getAlarmChannelId(): string {
  return isRunningInExpoGo() ? ALARMS_EXPO_GO_CHANNEL_ID : ALARMS_CHANNEL_ID;
}

function getAlarmNotificationSound(): string {
  return isRunningInExpoGo() ? 'default' : ALARM_NOTIFICATION_SOUND;
}

async function createAndroidChannelSafe(
  Notifications: any,
  channelId: string,
  primaryConfig: Record<string, unknown>,
  fallbackConfig: Record<string, unknown>
): Promise<void> {
  try {
    await Notifications.setNotificationChannelAsync(channelId, primaryConfig);
  } catch {
    try {
      await Notifications.setNotificationChannelAsync(
        channelId,
        fallbackConfig
      );
    } catch {
      // Ignora apenas em ambientes sem suporte a canais nativos
    }
  }
}

export async function ensureExpoNotificationPermissions(): Promise<boolean> {
  const Notifications = getExpoNotificationsModule();
  if (!Notifications) return false;

  if (!notificationHandlerConfigured) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    notificationHandlerConfigured = true;
  }

  if (!channelsConfigured) {
    try {
      if (Notifications.setNotificationCategoryAsync) {
        await Notifications.setNotificationCategoryAsync(ALARM_CATEGORY_ID, [
          {
            identifier: 'snooze',
            buttonTitle: 'Soneca (+5 min)',
            options: { opensAppToForeground: false },
          },
          {
            identifier: 'dismiss',
            buttonTitle: 'Desligar',
            options: { opensAppToForeground: false, isDestructive: true },
          },
        ]);
      }
    } catch {
      // Continua configurando os canais de notificação
    }

    if (Platform.OS === 'android' && Notifications.setNotificationChannelAsync) {
      await createAndroidChannelSafe(
        Notifications,
        EVENTS_CHANNEL_ID,
        {
          name: 'Lembretes de Eventos',
          description:
            'Avisos na barra de notificações sobre compromissos dos pets',
          importance: Notifications.AndroidImportance?.HIGH ?? 4,
          sound: 'default',
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#D96B08',
          enableVibrate: true,
          showBadge: true,
          lockscreenVisibility:
            Notifications.AndroidNotificationVisibility?.PUBLIC ?? 1,
        },
        {
          name: 'Lembretes de Eventos',
          importance: Notifications.AndroidImportance?.HIGH ?? 4,
          sound: 'default',
          enableVibrate: true,
        }
      );

      const alarmChannelId = getAlarmChannelId();
      const alarmSound = getAlarmNotificationSound();
      const alarmUsage =
        Notifications.AndroidAudioUsage?.ALARM ??
        Notifications.AndroidAudioAttributesUsage?.ALARM;
      const sonificationType =
        Notifications.AndroidAudioContentType?.SONIFICATION ??
        Notifications.AndroidAudioAttributesContentType?.SONIFICATION;

      await createAndroidChannelSafe(
        Notifications,
        alarmChannelId,
        {
          name: 'Alarmes PetMood',
          description:
            'Alarmes sonoros com prioridade máxima mesmo fora do aplicativo',
          importance: Notifications.AndroidImportance?.MAX ?? 5,
          sound: alarmSound,
          vibrationPattern: [0, 500, 250, 500, 250, 500],
          lightColor: '#D96B08',
          enableVibrate: true,
          showBadge: true,
          lockscreenVisibility:
            Notifications.AndroidNotificationVisibility?.PUBLIC ?? 1,
          ...(alarmUsage !== undefined && sonificationType !== undefined
            ? {
                audioAttributes: {
                  usage: alarmUsage,
                  contentType: sonificationType,
                },
              }
            : {}),
        },
        {
          name: 'Alarmes PetMood',
          importance: Notifications.AndroidImportance?.MAX ?? 5,
          sound: alarmSound,
          vibrationPattern: [0, 500, 250, 500, 250, 500],
          enableVibrate: true,
        }
      );

      await createAndroidChannelSafe(
        Notifications,
        ALARMS_FOREGROUND_CHANNEL_ID,
        {
          name: 'Alertas Visuais de Alarme',
          description:
            'Exibe controles rápidos enquanto o alarme toca com o app aberto',
          importance: Notifications.AndroidImportance?.HIGH ?? 4,
          sound: null,
          enableVibrate: false,
          showBadge: false,
        },
        {
          name: 'Alertas Visuais de Alarme',
          importance: Notifications.AndroidImportance?.HIGH ?? 4,
          sound: null,
        }
      );
    }

    channelsConfigured = true;
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.status === 'granted') return true;
  const requested = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
      allowCriticalAlerts: true,
    },
  });
  return requested.status === 'granted';
}

function buildAlarmContentData(
  ev: Evento,
  animaisNomes: string,
  janela: ReminderWindowKey,
  isAlarm: boolean,
  extra?: {
    horario?: string;
    ringKey?: string;
    snoozeId?: string;
    snoozeTargetMs?: number;
    source?: 'scheduled' | 'foreground';
  }
): AlarmNotificationPayload & { janela: ReminderWindowKey } {
  return {
    id_evento: ev.id_evento,
    titulo: ev.titulo,
    horario: extra?.horario || ev.horario || '09:00',
    animaisNomes,
    frequencia: ev.frequencia || '',
    data: ev.data,
    janela,
    isAlarm,
    ...(extra?.ringKey ? { ringKey: extra.ringKey } : {}),
    ...(extra?.snoozeId ? { snoozeId: extra.snoozeId } : {}),
    ...(extra?.snoozeTargetMs ? { snoozeTargetMs: extra.snoozeTargetMs } : {}),
    ...(extra?.source ? { source: extra.source } : {}),
  };
}

function extractTimestampFromIdentifier(identifier: string): number | null {
  const parts = identifier.split('|');
  if (parts.length < 3) return null;
  const ts = Number(parts[parts.length - 1]);
  return Number.isFinite(ts) ? ts : null;
}

function extractSnoozeEventId(
  identifier: string,
  data?: Record<string, unknown>
): string {
  if (data?.id_evento) return String(data.id_evento);
  if (!identifier.startsWith('alarm-snooze-')) return '';
  const body = identifier.slice('alarm-snooze-'.length);
  const lastDash = body.lastIndexOf('-');
  return lastDash > 0 ? body.slice(0, lastDash) : '';
}

const snoozeGenerationByEvent = new Map<string, number>();

function bumpSnoozeGeneration(id_evento: string): number {
  const next = (snoozeGenerationByEvent.get(id_evento) || 0) + 1;
  snoozeGenerationByEvent.set(id_evento, next);
  return next;
}

function getSnoozeGeneration(id_evento: string): number {
  return snoozeGenerationByEvent.get(id_evento) || 0;
}

export async function getActiveExpoSnoozeTargets(): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const Notifications = getExpoNotificationsModule();
  if (!Notifications?.getAllScheduledNotificationsAsync) return result;

  try {
    const nowMs = Date.now();
    const scheduled: Array<{
      identifier: string;
      content?: { data?: Record<string, unknown> };
    }> = (await Notifications.getAllScheduledNotificationsAsync()) || [];

    for (const item of scheduled) {
      if (!item.identifier.startsWith('alarm-snooze-')) continue;
      const data = item.content?.data;
      const eventId = extractSnoozeEventId(item.identifier, data);
      const targetMs = Number(data?.snoozeTargetMs || 0);
      if (eventId && Number.isFinite(targetMs) && targetMs > nowMs) {
        const prev = result.get(eventId) || 0;
        if (targetMs > prev) {
          result.set(eventId, targetMs);
        }
      }
    }
  } catch {
    // Fallback silencioso
  }

  return result;
}

export async function cancelAllExpoSnoozeAlarms(): Promise<void> {
  const Notifications = getExpoNotificationsModule();
  if (!Notifications) return;

  try {
    snoozeGenerationByEvent.forEach((gen, id) => {
      snoozeGenerationByEvent.set(id, gen + 1);
    });

    const scheduled: Array<{ identifier: string }> =
      (await Notifications.getAllScheduledNotificationsAsync?.()) || [];
    for (const item of scheduled) {
      if (item.identifier.startsWith('alarm-snooze-')) {
        await Notifications.cancelScheduledNotificationAsync?.(item.identifier);
      }
    }
  } catch {
    // Fallback silencioso
  }
}

export async function cancelExpoEventSnoozeAndCurrentAlarm(
  id_evento: string,
  cancelIdentifiers: string[] = [],
  suppressUntilMs?: number,
  cancelAllForEvent = false
): Promise<void> {
  if (cancelAllForEvent) {
    bumpSnoozeGeneration(id_evento);
  }

  const Notifications = getExpoNotificationsModule();
  if (!Notifications) return;

  try {
    const cancelSet = new Set(cancelIdentifiers.filter(Boolean));
    const scheduled: Array<{
      identifier: string;
      content?: { data?: Record<string, unknown> };
    }> = (await Notifications.getAllScheduledNotificationsAsync?.()) || [];

    for (const item of scheduled) {
      const dataId = item.content?.data?.id_evento
        ? String(item.content.data.id_evento)
        : '';
      const snoozeEventId = extractSnoozeEventId(
        item.identifier,
        item.content?.data
      );
      const isExistingSnooze =
        item.identifier.startsWith(`alarm-snooze-${id_evento}-`) ||
        (item.identifier.startsWith('alarm-snooze-') &&
          snoozeEventId === id_evento);
      const isExplicitlyListed = cancelSet.has(item.identifier);
      const belongsToEvent =
        dataId === id_evento ||
        snoozeEventId === id_evento ||
        item.identifier.startsWith(`alarm-ring|${id_evento}|`) ||
        item.identifier.startsWith(`${id_evento}|`);

      let isWithinSnoozeWindow = false;
      if (
        suppressUntilMs &&
        (item.identifier.startsWith(`alarm-ring|${id_evento}|`) ||
          item.identifier.startsWith(`${id_evento}|0m|`))
      ) {
        const occMs = extractTimestampFromIdentifier(item.identifier);
        if (occMs !== null && occMs <= suppressUntilMs) {
          isWithinSnoozeWindow = true;
        }
      }

      if (
        (cancelAllForEvent && belongsToEvent) ||
        isExistingSnooze ||
        isExplicitlyListed ||
        isWithinSnoozeWindow
      ) {
        await Notifications.cancelScheduledNotificationAsync?.(item.identifier);
      }
    }

    if (
      Notifications.getPresentedNotificationsAsync &&
      Notifications.dismissNotificationAsync
    ) {
      const presented: Array<{
        request?: {
          identifier?: string;
          content?: { data?: Record<string, unknown> };
        };
      }> = (await Notifications.getPresentedNotificationsAsync()) || [];
      for (const notif of presented) {
        const notifId = notif?.request?.identifier;
        const notifData = notif?.request?.content?.data;
        if (
          notifId &&
          notifData?.id_evento === id_evento &&
          (cancelAllForEvent || notifData?.isAlarm)
        ) {
          await Notifications.dismissNotificationAsync(notifId);
        }
      }
    }
  } catch {
    // Fallback silencioso
  }
}

export async function syncExpoLocalNotifications(
  eventos: Evento[],
  usuario: Usuario | null,
  animais: Animal[],
  suppressedKeys?: Set<string>,
  snoozedUntilByEvent?: Map<string, number>
): Promise<void> {
  const Notifications = getExpoNotificationsModule();
  if (!Notifications) return;

  try {
    const activeAlarmIds = new Set(
      eventos
        .filter((ev) => ev.tipo_evento === 'Alarme' && ev.alarme_ligado)
        .map((ev) => ev.id_evento)
    );

    // Cancela agendamentos antigos e também remove qualquer soneca cujo alarme foi excluído ou desligado
    const scheduled: Array<{
      identifier: string;
      content?: { data?: Record<string, unknown> };
    }> = (await Notifications.getAllScheduledNotificationsAsync?.()) || [];
    for (const item of scheduled) {
      if (item.identifier.startsWith('alarm-snooze-')) {
        const snoozeEventId = extractSnoozeEventId(
          item.identifier,
          item.content?.data
        );
        if (!usuario || !snoozeEventId || !activeAlarmIds.has(snoozeEventId)) {
          await Notifications.cancelScheduledNotificationAsync(item.identifier);
        }
      } else {
        await Notifications.cancelScheduledNotificationAsync(item.identifier);
      }
    }

    if (!usuario) return;

    const hasAnyAppOrAlarm =
      Boolean(usuario.notificacao_app) ||
      eventos.some((ev) => ev.tipo_evento === 'Alarme' && ev.alarme_ligado);
    if (!hasAnyAppOrAlarm) return;

    const granted = await ensureExpoNotificationPermissions();
    if (!granted) return;

    const nowMs = Date.now();
    for (const ev of eventos) {
      const channels = getAcceptedChannels(ev, usuario);
      const isActiveAlarm = ev.tipo_evento === 'Alarme' && ev.alarme_ligado;
      if (!channels.includes('app') && !isActiveAlarm) continue;

      const occurrences = getUpcomingEventOccurrencesMs(ev, nowMs);
      if (occurrences.length === 0) continue;

      const animaisNomes = getEventAnimalNames(ev, animais);
      const snoozeUntilMs = snoozedUntilByEvent?.get(ev.id_evento);

      for (const occMs of occurrences) {
        const ringKey = getAlarmRingKey(ev.id_evento, occMs);
        const reminder0mKey = getReminderKey(ev.id_evento, '0m', occMs);
        const isCurrentOccurrenceSnoozed = Boolean(
          snoozeUntilMs && occMs <= snoozeUntilMs
        );

        if (channels.includes('app')) {
          for (const offset of REMINDER_OFFSETS) {
            const triggerAtMs = occMs - offset.ms;
            if (triggerAtMs <= nowMs + 3000) continue;

            const isAlarmRing = isActiveAlarm && offset.key === '0m';
            const identifier = isAlarmRing
              ? ringKey
              : getReminderKey(ev.id_evento, offset.key, occMs);

            if (suppressedKeys?.has(identifier)) continue;
            if (
              offset.key === '0m' &&
              (isCurrentOccurrenceSnoozed ||
                suppressedKeys?.has(ringKey) ||
                suppressedKeys?.has(reminder0mKey))
            ) {
              continue;
            }

            const { title, body } = formatReminderNotification(
              ev,
              offset.shortLabel,
              animaisNomes
            );

            const alarmSound = getAlarmNotificationSound();
            const alarmChannelId = getAlarmChannelId();

            await Notifications.scheduleNotificationAsync({
              identifier,
              content: {
                title: isAlarmRing ? '⏰ Alarme PetMood' : title,
                body,
                sound: isAlarmRing ? alarmSound : 'default',
                priority: isAlarmRing ? 'max' : 'high',
                color: '#D96B08',
                vibrate: isAlarmRing
                  ? [0, 500, 250, 500, 250, 500]
                  : [0, 250, 250, 250],
                ...(isAlarmRing ? { categoryIdentifier: ALARM_CATEGORY_ID } : {}),
                ...(Platform.OS === 'ios'
                  ? {
                      interruptionLevel: isAlarmRing ? 'timeSensitive' : 'active',
                    }
                  : {}),
                data: buildAlarmContentData(
                  ev,
                  animaisNomes,
                  offset.key,
                  isAlarmRing,
                  {
                    ringKey: isAlarmRing ? ringKey : undefined,
                    source: 'scheduled',
                  }
                ),
              },
              trigger: {
                type: Notifications.SchedulableTriggerInputTypes?.DATE ?? 'date',
                date: new Date(triggerAtMs),
                ...(Platform.OS === 'android'
                  ? {
                      channelId: isAlarmRing
                        ? alarmChannelId
                        : EVENTS_CHANNEL_ID,
                      delivery: isAlarmRing ? 'alarmClock' : 'bestEffort',
                    }
                  : {}),
              },
            });
          }
        } else if (isActiveAlarm && occMs > nowMs + 3000) {
          if (
            isCurrentOccurrenceSnoozed ||
            suppressedKeys?.has(ringKey) ||
            suppressedKeys?.has(reminder0mKey)
          ) {
            continue;
          }

          const { body } = formatReminderNotification(ev, 'É agora!', animaisNomes);
          const alarmSound = getAlarmNotificationSound();
          const alarmChannelId = getAlarmChannelId();

          await Notifications.scheduleNotificationAsync({
            identifier: ringKey,
            content: {
              title: '⏰ Alarme PetMood',
              body,
              sound: alarmSound,
              priority: 'max',
              color: '#D96B08',
              vibrate: [0, 500, 250, 500, 250, 500],
              categoryIdentifier: ALARM_CATEGORY_ID,
              ...(Platform.OS === 'ios'
                ? { interruptionLevel: 'timeSensitive' }
                : {}),
              data: buildAlarmContentData(ev, animaisNomes, '0m', true, {
                ringKey,
                source: 'scheduled',
              }),
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes?.DATE ?? 'date',
              date: new Date(occMs),
              ...(Platform.OS === 'android'
                ? {
                    channelId: alarmChannelId,
                    delivery: 'alarmClock',
                  }
                : {}),
            },
          });
        }
      }
    }
  } catch {
    // Ignora falhas de agendamento local em ambientes sem suporte nativo
  }
}

export async function scheduleExpoSnoozeAlarm(
  ev: Evento,
  animaisNomes: string,
  minutes = 5,
  options?: {
    snoozeId?: string;
    triggerAtMs?: number;
    cancelIdentifiers?: string[];
  }
): Promise<{ snoozeId: string; triggerAtMs: number } | null> {
  const Notifications = getExpoNotificationsModule();
  if (!Notifications) return null;

  const generation = bumpSnoozeGeneration(ev.id_evento);

  try {
    const granted = await ensureExpoNotificationPermissions();
    if (!granted || getSnoozeGeneration(ev.id_evento) !== generation) {
      return null;
    }

    const triggerAtMs =
      options?.triggerAtMs ?? Date.now() + Math.max(1, minutes) * 60 * 1000;
    const snoozeId =
      options?.snoozeId ?? `alarm-snooze-${ev.id_evento}-${triggerAtMs}`;
    const snoozeHorario = formatTimeHHMM(triggerAtMs);

    await cancelExpoEventSnoozeAndCurrentAlarm(
      ev.id_evento,
      options?.cancelIdentifiers || [],
      triggerAtMs,
      false
    );

    if (getSnoozeGeneration(ev.id_evento) !== generation) {
      return null;
    }

    const alarmSound = getAlarmNotificationSound();
    const alarmChannelId = getAlarmChannelId();

    await Notifications.scheduleNotificationAsync({
      identifier: snoozeId,
      content: {
        title: '⏰ Alarme PetMood (Soneca)',
        body: `${ev.titulo} (${animaisNomes}) • ${snoozeHorario}`,
        sound: alarmSound,
        priority: 'max',
        color: '#D96B08',
        vibrate: [0, 500, 250, 500, 250, 500],
        categoryIdentifier: ALARM_CATEGORY_ID,
        ...(Platform.OS === 'ios' ? { interruptionLevel: 'timeSensitive' } : {}),
        data: buildAlarmContentData(ev, animaisNomes, '0m', true, {
          horario: snoozeHorario,
          snoozeId,
          snoozeTargetMs: triggerAtMs,
          source: 'scheduled',
        }),
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes?.DATE ?? 'date',
        date: new Date(triggerAtMs),
        ...(Platform.OS === 'android'
          ? {
              channelId: alarmChannelId,
              delivery: 'alarmClock',
            }
          : {}),
      },
    });

    if (getSnoozeGeneration(ev.id_evento) !== generation) {
      await Notifications.cancelScheduledNotificationAsync?.(snoozeId);
      return null;
    }

    return { snoozeId, triggerAtMs };
  } catch {
    return null;
  }
}

export async function presentExpoImmediateNotification(
  title: string,
  body: string,
  options?: {
    identifier?: string;
    isAlarm?: boolean;
    data?: Record<string, unknown>;
  }
): Promise<void> {
  const Notifications = getExpoNotificationsModule();
  if (!Notifications) return;
  try {
    const granted = await ensureExpoNotificationPermissions();
    if (!granted) return;

    const isForegroundAlarm =
      Boolean(options?.isAlarm) && options?.data?.source === 'foreground';
    const alarmChannelId = getAlarmChannelId();

    await Notifications.scheduleNotificationAsync({
      identifier: options?.identifier,
      content: {
        title,
        body,
        sound: isForegroundAlarm
          ? false
          : options?.isAlarm
          ? getAlarmNotificationSound()
          : 'default',
        priority: options?.isAlarm ? 'max' : 'high',
        color: '#D96B08',
        vibrate: options?.isAlarm
          ? [0, 500, 250, 500, 250, 500]
          : [0, 250, 250, 250],
        ...(options?.isAlarm ? { categoryIdentifier: ALARM_CATEGORY_ID } : {}),
        ...(Platform.OS === 'ios'
          ? {
              interruptionLevel: options?.isAlarm ? 'timeSensitive' : 'active',
            }
          : {}),
        data: options?.data,
      },
      trigger:
        Platform.OS === 'android'
          ? {
              channelId: isForegroundAlarm
                ? ALARMS_FOREGROUND_CHANNEL_ID
                : options?.isAlarm
                ? alarmChannelId
                : EVENTS_CHANNEL_ID,
            }
          : null,
    });
  } catch {
    // Fallback silencioso para banner in-app
  }
}

export function subscribeExpoNotificationListeners(handlers: {
  onAlarmReceived: (payload: AlarmNotificationPayload) => void;
  onAlarmAction: (
    payload: AlarmNotificationPayload,
    actionId: string
  ) => void;
}): () => void {
  const Notifications = getExpoNotificationsModule();
  if (!Notifications) return () => undefined;

  const extractPayload = (
    rawData: Record<string, unknown> | undefined
  ): AlarmNotificationPayload | null => {
    if (!rawData || !rawData.isAlarm) return null;
    const snoozeTargetRaw = Number(rawData.snoozeTargetMs || 0);
    return {
      id_evento: String(rawData.id_evento || ''),
      titulo: String(rawData.titulo || 'Alarme PetMood'),
      horario: String(rawData.horario || '09:00'),
      animaisNomes: String(rawData.animaisNomes || 'Pet'),
      frequencia: rawData.frequencia ? String(rawData.frequencia) : '',
      data: rawData.data ? String(rawData.data) : '',
      isAlarm: true,
      ringKey: rawData.ringKey ? String(rawData.ringKey) : undefined,
      snoozeId: rawData.snoozeId ? String(rawData.snoozeId) : undefined,
      snoozeTargetMs:
        Number.isFinite(snoozeTargetRaw) && snoozeTargetRaw > 0
          ? snoozeTargetRaw
          : undefined,
      source:
        rawData.source === 'foreground' || rawData.source === 'scheduled'
          ? rawData.source
          : undefined,
    };
  };

  const receivedSub = Notifications.addNotificationReceivedListener?.(
    (notification: any) => {
      const payload = extractPayload(notification?.request?.content?.data);
      if (payload) {
        handlers.onAlarmReceived(payload);
      }
    }
  );

  const responseSub = Notifications.addNotificationResponseReceivedListener?.(
    (response: any) => {
      const payload = extractPayload(
        response?.notification?.request?.content?.data
      );
      if (payload) {
        const actionId = String(response?.actionIdentifier || '');
        handlers.onAlarmAction(payload, actionId);
      }
    }
  );

  return () => {
    receivedSub?.remove?.();
    responseSub?.remove?.();
  };
}

export async function getInitialExpoAlarmResponse(): Promise<{
  payload: AlarmNotificationPayload;
  actionId: string;
} | null> {
  const Notifications = getExpoNotificationsModule();
  if (!Notifications?.getLastNotificationResponseAsync) return null;
  try {
    const response = await Notifications.getLastNotificationResponseAsync();
    const rawData = response?.notification?.request?.content?.data;
    if (!rawData || !rawData.isAlarm) return null;
    const snoozeTargetRaw = Number(rawData.snoozeTargetMs || 0);
    return {
      payload: {
        id_evento: String(rawData.id_evento || ''),
        titulo: String(rawData.titulo || 'Alarme PetMood'),
        horario: String(rawData.horario || '09:00'),
        animaisNomes: String(rawData.animaisNomes || 'Pet'),
        frequencia: rawData.frequencia ? String(rawData.frequencia) : '',
        data: rawData.data ? String(rawData.data) : '',
        isAlarm: true,
        ringKey: rawData.ringKey ? String(rawData.ringKey) : undefined,
        snoozeId: rawData.snoozeId ? String(rawData.snoozeId) : undefined,
        snoozeTargetMs:
          Number.isFinite(snoozeTargetRaw) && snoozeTargetRaw > 0
            ? snoozeTargetRaw
            : undefined,
        source:
          rawData.source === 'foreground' || rawData.source === 'scheduled'
            ? rawData.source
            : undefined,
      },
      actionId: String(response?.actionIdentifier || ''),
    };
  } catch {
    return null;
  }
}

let nativeVibrationInterval: ReturnType<typeof setInterval> | null = null;
let alarmPlayer: any | null = null;
let isAlarmSoundActive = false;

export function startNativeAlarmVibration(): void {
  stopNativeAlarmVibration();
  if (Platform.OS === 'web') return;
  try {
    if (Platform.OS === 'android') {
      Vibration.vibrate([0, 450, 300], true);
    } else if (Platform.OS === 'ios') {
      Vibration.vibrate();
      nativeVibrationInterval = setInterval(() => {
        Vibration.vibrate();
      }, 1500);
    }
  } catch {
    // Ignora caso dispositivo não possua motor de vibração
  }
}

export function stopNativeAlarmVibration(): void {
  if (nativeVibrationInterval) {
    clearInterval(nativeVibrationInterval);
    nativeVibrationInterval = null;
  }
  if (Platform.OS === 'web') return;
  try {
    Vibration.cancel();
  } catch {
    // Ignora
  }
}

export async function startNativeAlarmSound(): Promise<void> {
  startNativeAlarmVibration();
  isAlarmSoundActive = true;
  if (Platform.OS === 'web') return;

  const ExpoAudio = getExpoAudioModule();
  if (!ExpoAudio) return;

  try {
    if (ExpoAudio.setAudioModeAsync) {
      await ExpoAudio.setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'doNotMix',
        allowsRecording: false,
      });
    }

    if (!isAlarmSoundActive) return;

    if (alarmPlayer) {
      try {
        alarmPlayer.pause?.();
        alarmPlayer.remove?.();
      } catch {
        // Ignora erro ao descartar player anterior
      }
      alarmPlayer = null;
    }

    const player = ExpoAudio.createAudioPlayer(ALARM_SOUND_ASSET);
    player.loop = true;
    player.volume = 1.0;
    alarmPlayer = player;
    player.play();
  } catch {
    // Mantém vibração + notificação sonora do sistema caso expo-audio falhe
  }
}

export function stopNativeAlarmSound(): void {
  isAlarmSoundActive = false;
  stopNativeAlarmVibration();
  if (alarmPlayer) {
    try {
      alarmPlayer.pause?.();
      alarmPlayer.remove?.();
    } catch {
      // Ignora erro de limpeza
    }
    alarmPlayer = null;
  }
}

export function getNativeAlarmSoundLabel(): string {
  if (Platform.OS === 'android') return 'Som do Alarme PetMood (Android)';
  if (Platform.OS === 'ios') return 'Som do Alarme PetMood (iOS)';
  return 'Som do Alarme PetMood';
}

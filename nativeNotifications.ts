/**
 * Android (Capacitor) system notifications.
 *
 * The web app shows notifications from in-page timers, which only run while the page is open.
 * In the APK every upcoming reminder (2 days, 1 day, 1 hour, at the time) and alarm is scheduled
 * with the OS instead, so it fires even when the app is closed. The schedule is rebuilt from the
 * current data whenever it changes and whenever the app comes back to the foreground.
 */
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
import type { Animal, Evento, Usuario } from '../types';
import { IS_NATIVE } from './platform';
import {
  REMINDER_OFFSETS,
  formatReminderNotification,
  getAcceptedChannels,
  getEffectiveEventDateTimeMs,
  getEventAnimalNames,
} from './eventNotifications';

export type NativePermissionState = 'granted' | 'denied' | 'default';

const REMINDER_CHANNEL = 'petmood-lembretes';
const ALARM_CHANNEL = 'petmood-alarmes';
const MAX_SCHEDULED = 60; // Android caps pending alarms per app; keep well below it.

/** Fired on window after a permission request, so the schedule can be rebuilt. */
export const PERMISSION_EVENT = 'petmood-native-permission';

let permission: NativePermissionState = 'default';
let initPromise: Promise<void> | null = null;

function mapPermission(display: string): NativePermissionState {
  if (display === 'granted') return 'granted';
  if (display === 'denied') return 'denied';
  return 'default';
}

/** Last known permission (sync, for the existing UI); refreshed by init/request. */
export function getNativePermission(): NativePermissionState {
  return permission;
}

export async function requestNativePermission(): Promise<NativePermissionState> {
  if (!IS_NATIVE) return 'default';
  try {
    permission = mapPermission((await LocalNotifications.requestPermissions()).display);
  } catch {
    // keep the last known value
  }
  window.dispatchEvent(new Event(PERMISSION_EVENT));
  return permission;
}

/** Creates the channels, reads the permission and routes notification taps. */
export function initNativeNotifications(onOpen: (eventId: string | null) => void): Promise<void> {
  if (!IS_NATIVE) return Promise.resolve();
  if (!initPromise) {
    initPromise = (async () => {
      try {
        permission = mapPermission((await LocalNotifications.checkPermissions()).display);
      } catch {
        permission = 'default';
      }
      await LocalNotifications.createChannel({
        id: REMINDER_CHANNEL,
        name: 'Lembretes de eventos',
        description: 'Avisos antes de consultas, vacinas, banhos e passeios',
        importance: 4,
        visibility: 1,
        vibration: true,
      }).catch(() => undefined);
      await LocalNotifications.createChannel({
        id: ALARM_CHANNEL,
        name: 'Alarmes',
        description: 'Alarmes dos seus pets',
        importance: 5,
        visibility: 1,
        vibration: true,
      }).catch(() => undefined);
      await LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
        const eventId = action.notification.extra?.id_evento;
        onOpen(typeof eventId === 'string' ? eventId : null);
      });
    })();
  }
  return initPromise;
}

/** Stable positive 31-bit id, so re-syncing replaces the same notification. */
function notificationId(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (Math.imul(31, hash) + key.charCodeAt(i)) | 0;
  }
  return (hash & 0x7fffffff) || 1;
}

let syncChain: Promise<void> = Promise.resolve();

/** Cancels pending app notifications and schedules the upcoming ones for this data. */
export function syncNativeReminders(
  eventos: Evento[],
  animais: Animal[],
  usuario: Usuario | null
): Promise<void> {
  if (!IS_NATIVE) return Promise.resolve();
  // Serialize: overlapping syncs must not interleave cancel/schedule.
  syncChain = syncChain.then(() => runSync(eventos, animais, usuario)).catch(() => undefined);
  return syncChain;
}

async function runSync(eventos: Evento[], animais: Animal[], usuario: Usuario | null): Promise<void> {
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length > 0) {
    await LocalNotifications.cancel({
      notifications: pending.notifications.map((n) => ({ id: n.id })),
    });
  }
  if (!usuario || permission !== 'granted') return;

  const now = Date.now();
  const planned: LocalNotificationSchema[] = [];

  for (const ev of eventos) {
    if (!getAcceptedChannels(ev, usuario).includes('app')) continue;
    const eventMs = getEffectiveEventDateTimeMs(ev, now);
    if (!eventMs) continue;
    const animaisNomes = getEventAnimalNames(ev, animais);
    const isAlarm = ev.tipo_evento === 'Alarme' && ev.alarme_ligado;

    for (const offset of REMINDER_OFFSETS) {
      const at = eventMs - offset.ms;
      if (at <= now + 5_000) continue;
      const ringsAlarm = isAlarm && offset.key === '0m';
      const { title, body } = ringsAlarm
        ? {
            title: '⏰ Alarme PetMood',
            body: `${ev.titulo} (${animaisNomes})${ev.horario ? ` • ${ev.horario}` : ''}`,
          }
        : formatReminderNotification(ev, offset.shortLabel, animaisNomes);
      planned.push({
        id: notificationId(`${ev.id_evento}|${offset.key}`),
        title,
        body,
        channelId: ringsAlarm ? ALARM_CHANNEL : REMINDER_CHANNEL,
        schedule: { at: new Date(at), allowWhileIdle: true },
        autoCancel: true,
        extra: { id_evento: ev.id_evento, janela: offset.key },
      });
    }
  }

  planned.sort((a, b) => (a.schedule?.at?.getTime() ?? 0) - (b.schedule?.at?.getTime() ?? 0));
  const batch = planned.slice(0, MAX_SCHEDULED);
  if (batch.length > 0) {
    await LocalNotifications.schedule({ notifications: batch });
  }
}

/** Shows a notification right now (used for alarm snoozes, which are not pre-scheduled). */
export async function showNativeNow(title: string, body: string, isAlarm: boolean): Promise<void> {
  if (!IS_NATIVE || permission !== 'granted') return;
  await LocalNotifications.schedule({
    notifications: [
      {
        id: notificationId(`now|${Date.now()}|${title}`),
        title,
        body,
        channelId: isAlarm ? ALARM_CHANNEL : REMINDER_CHANNEL,
        autoCancel: true,
      },
    ],
  }).catch(() => undefined);
}

import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { upcomingAlarms, fmtMin, niceDate, rel, at, TYPES } from './core';

export const CHANNEL = 'alarmes';
export const CATEGORY = 'alarme';
const MAX_SCHEDULED = 120;
const SIG_KEY = 'agenda:alarmSig';

// App au premier plan : on affiche quand même la notification ; l'écran d'alarme plein écran prend le relais.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: true, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
});

export async function setupAlarms() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Alarmes de cours et de rendus',
      description: 'Rappels avant tes cours, SAÉ, rendus et évaluations',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 400, 200, 400, 200, 800],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false,
      enableVibrate: true,
      audioAttributes: { usage: Notifications.AndroidAudioUsage.ALARM, contentType: Notifications.AndroidAudioContentType.SONIFICATION },
    });
  }
  await Notifications.setNotificationCategoryAsync(CATEGORY, [
    { identifier: 'snooze', buttonTitle: 'Rappeler dans 5 min', options: { opensAppToForeground: false } },
    { identifier: 'stop', buttonTitle: 'Arrêter', options: { opensAppToForeground: false, isDestructive: true } },
  ]);
}

export async function permissionState() {
  const n = await Notifications.getPermissionsAsync();
  let exact = { granted: true };
  if (Platform.OS === 'android' && Notifications.getExactAlarmPermissionsAsync) {
    try { exact = await Notifications.getExactAlarmPermissionsAsync(); } catch { /* API absente */ }
  }
  return { notifications: n.granted || n.status === 'granted', exact: !!exact.granted };
}

export async function askNotificationPermission() {
  const r = await Notifications.requestPermissionsAsync();
  return r.granted || r.status === 'granted';
}

/** Ouvre le réglage Android « Alarmes et rappels » (obligatoire pour des alarmes à la minute près sur Android 14+). */
export async function askExactAlarmPermission() {
  if (Platform.OS !== 'android' || !Notifications.requestExactAlarmPermissionsAsync) return true;
  try { const r = await Notifications.requestExactAlarmPermissionsAsync(); return !!r.granted; } catch { return false; }
}

function contentFor(o, lead = 0) {
  const st = at(o.date, o.s).getTime();
  const ev = o.ev;
  const when = ev.type === 'rendu' ? `À rendre ${niceDate(o.date)} à ${fmtMin(o.s)}` : `${niceDate(o.date)}, ${fmtMin(o.s)}–${fmtMin(o.e)}`;
  return {
    title: `${lead >= 10080 ? 'Dans une semaine' : lead >= 1440 ? 'Demain' : ev.type === 'rendu' ? 'Rendu' : TYPES[ev.type]?.label || 'Rappel'} : ${ev.title}`,
    body: [when, ev.location].filter(Boolean).join(', '),
    data: { oid: o.oid, date: o.date, s: o.s, e: o.e, title: ev.title, type: ev.type, location: ev.location || '', startAt: st },
    categoryIdentifier: CATEGORY,
    sound: 'default',
    priority: 'max',
    color: '#3A30FF',
  };
}

let pending = null;
/** Reprogramme les alarmes des 14 prochains jours. Ne refait rien si la liste n'a pas changé. */
export function rescheduleAlarms(events) {
  clearTimeout(pending);
  pending = setTimeout(async () => {
    try {
      const list = upcomingAlarms(events, 14).filter((a) => a.fireAt > Date.now() + 5000).slice(0, MAX_SCHEDULED);
      const sig = list.map((a) => a.key + a.fireAt).join('|');
      if (sig === (await AsyncStorage.getItem(SIG_KEY))) return;
      await Notifications.cancelAllScheduledNotificationsAsync();
      for (const a of list) {
        await Notifications.scheduleNotificationAsync({
          content: contentFor(a.occ, a.lead),
          trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(a.fireAt), channelId: CHANNEL, delivery: 'alarmClock' },
        });
      }
      await AsyncStorage.setItem(SIG_KEY, sig);
    } catch (e) {
      console.warn('Programmation des alarmes impossible', e);
    }
  }, 800);
}

export async function snooze(data, minutes = 5) {
  await Notifications.scheduleNotificationAsync({
    content: { ...contentFor({ ev: { title: data.title, type: data.type, location: data.location }, date: data.date, s: data.s, e: data.e, oid: data.oid }), title: `Rappel : ${data.title}` },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(Date.now() + minutes * 60000), channelId: CHANNEL, delivery: 'alarmClock' },
  });
  await AsyncStorage.removeItem(SIG_KEY);
}

export async function testAlarm() {
  const now = new Date();
  const s = now.getHours() * 60 + now.getMinutes() + 10;
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  await Notifications.scheduleNotificationAsync({
    content: contentFor({ ev: { title: "Test d'alarme : TD UX design", type: 'cours', location: 'Salle 108' }, date: d, s: Math.min(s, 1439), e: Math.min(s + 60, 1439), oid: 'test|x' }),
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(Date.now() + 5000), channelId: CHANNEL, delivery: 'alarmClock' },
  });
}

export const describeWhen = (data) => {
  const st = data.startAt || at(data.date, data.s).getTime();
  const now = Date.now();
  if (st - now > 60000) return `${data.type === 'rendu' ? 'À rendre' : 'Commence'} dans ${rel(st - now)}`;
  if (now - st > 60000) return `A commencé il y a ${rel(now - st)}`;
  return "C'est maintenant";
};

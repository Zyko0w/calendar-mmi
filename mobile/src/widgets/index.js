import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { createSync } from '../core';
import { palettes } from '../theme';
import { DEFAULT_API, DEFAULT_PREFS, PREFS_KEY } from '../config';
import { WIDGET_NAMES, buildModel, renderAgendaWidget } from './AgendaWidgets';

/* Moteur de synchro de l'appli quand elle tourne : le gestionnaire des widgets s'exécute
   dans le même runtime JS, il doit passer par lui pour ne pas écraser son état en mémoire. */
let live = null;
export const setLiveSync = (s) => { live = s; };

async function readPrefs() {
  try { return { ...DEFAULT_PREFS, ...JSON.parse((await AsyncStorage.getItem(PREFS_KEY)) || '{}') }; } catch { return DEFAULT_PREFS; }
}

async function loadEvents() {
  if (live) return live.list();
  try { return (JSON.parse((await AsyncStorage.getItem('agenda:events')) || '[]')).filter((e) => !e.deleted); } catch { return []; }
}

/** Clair et sombre fournis ensemble : Android choisit selon le thème du téléphone, sauf si l'appli en force un. */
function themed(name, prefs, model, info) {
  if (prefs.theme === 'light' || prefs.theme === 'dark') return renderAgendaWidget(name, palettes[prefs.theme], model, info);
  return { light: renderAgendaWidget(name, palettes.light, model, info), dark: renderAgendaWidget(name, palettes.dark, model, info) };
}

const stateFrom = (events, prefs) => ({ events, hidden: new Set(prefs.hidden || []) });

/** Redessine tous les widgets posés. À appeler après chaque changement d'événements ou de préférences. */
export async function updateWidgets(events, prefs) {
  if (Platform.OS !== 'android') return;
  const p = prefs || (await readPrefs());
  const model = buildModel(stateFrom(events || (await loadEvents()), p));
  await Promise.all(WIDGET_NAMES.map((name) =>
    requestWidgetUpdate({ widgetName: name, renderWidget: (info) => themed(name, p, model, info) }).catch(() => {}),
  ));
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);

/** Case « rendu » cochée depuis le widget. */
async function markDone(id) {
  let s = live;
  if (!s) s = await createSync({ storage: AsyncStorage, defaultApiUrl: DEFAULT_API }).init();
  const ev = s.get(id);
  if (!ev || ev.done) return;
  s.save({ ...ev, done: true });
  await withTimeout(s.flush(), 8000);
  // Sans l'appli ouverte, on laisse l'écriture différée du moteur se terminer.
  if (!live) await new Promise((r) => setTimeout(r, 300));
}

export async function widgetTaskHandler({ widgetInfo, widgetAction, clickAction, clickActionData, renderWidget }) {
  if (widgetAction === 'WIDGET_DELETED') return;
  if (widgetAction === 'WIDGET_CLICK' && clickAction === 'MARK_DONE' && clickActionData?.id) {
    await markDone(String(clickActionData.id));
    await updateWidgets();
    return;
  }
  const prefs = await readPrefs();
  const model = buildModel(stateFrom(await loadEvents(), prefs));
  renderWidget(themed(widgetInfo.widgetName, prefs, model, widgetInfo));
}

import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createSync, makeDemo } from './core';
import { DEFAULT_API, DEFAULT_PREFS, PREFS_KEY } from './config';
import { setLiveSync, updateWidgets } from './widgets';

const StoreContext = createContext(null);
export const useStore = () => useContext(StoreContext);

export function StoreProvider({ children }) {
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState({ s: 'local', err: null });
  const [ready, setReady] = useState(false);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [authLost, setAuthLost] = useState(0);
  const syncRef = useRef(null);

  if (!syncRef.current) {
    syncRef.current = createSync({
      storage: AsyncStorage,
      defaultApiUrl: DEFAULT_API,
      onChange: (list) => setEvents(list),
      onStatus: (s, err) => setStatus({ s, err }),
      onAuthLost: () => setAuthLost((n) => n + 1),
    });
  }
  const sync = syncRef.current;
  setLiveSync(sync);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(PREFS_KEY);
        if (raw) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(raw) });
      } catch { /* préférences par défaut */ }
      await sync.init();
      const p = JSON.parse((await AsyncStorage.getItem(PREFS_KEY)) || '{}');
      if (!sync.isLoggedIn() && !sync.hasLocalData() && p.skipLogin) sync.seedDemo(makeDemo());
      if (sync.isLoggedIn()) sync.start(30000);
      setReady(true);
    })();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') sync.sync({ refreshHp: true });
      // En quittant l'appli, les widgets repartent d'un rendu à jour (« Dans 35 min »…).
      else if (s === 'background') updateWidgets(sync.list()).catch(() => {});
    });
    return () => { sub.remove(); sync.stop(); setLiveSync(null); };
  }, [sync]);

  // Widgets d'écran d'accueil : redessinés à chaque changement d'événements, de calques masqués ou de thème.
  useEffect(() => {
    if (!ready) return;
    const id = setTimeout(() => updateWidgets(events, prefs).catch(() => {}), 400);
    return () => clearTimeout(id);
  }, [ready, events, prefs.hidden, prefs.theme]);

  const value = useMemo(() => ({
    sync, events, status, ready, prefs, authLost,
    user: sync.state.user,
    hidden: new Set(prefs.hidden),
    setPref: (k, v) => setPrefs((p) => {
      const next = { ...p, [k]: v };
      AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    }),
  }), [sync, events, status, ready, prefs, authLost]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, StatusBar, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import * as Notifications from 'expo-notifications';
import { useFonts, BricolageGrotesque_200ExtraLight, BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { Geist_400Regular, Geist_500Medium, Geist_600SemiBold } from '@expo-google-fonts/geist';
import { palettes, ThemeContext, useTheme } from './src/theme';
import { StoreProvider, useStore } from './src/store';
import { setupAlarms, rescheduleAlarms, snooze, askNotificationPermission, permissionState, askExactAlarmPermission } from './src/alarms';
import { Icon, T, ToastProvider, tap, thud } from './src/ui';
import TodayScreen from './src/screens/TodayScreen';
import WeekScreen from './src/screens/WeekScreen';
import MonthScreen from './src/screens/MonthScreen';
import AgendaScreen from './src/screens/AgendaScreen';
import EditorSheet from './src/screens/EditorSheet';
import SettingsSheet from './src/screens/SettingsSheet';
import TwoFactorSheet from './src/screens/TwoFactorSheet';
import AuthScreen from './src/screens/AuthScreen';
import AlarmOverlay from './src/screens/AlarmOverlay';
import { today0, key, findOcc } from './src/core';

SplashScreen.preventAutoHideAsync().catch(() => {});

const TABS = [
  { id: 'today', label: "Aujourd'hui", icon: 'sun' },
  { id: 'week', label: 'Semaine', icon: 'columns' },
  { id: 'month', label: 'Mois', icon: 'calendar' },
  { id: 'agenda', label: 'Agenda', icon: 'list' },
];

function TabBar({ tab, setTab, onNew }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
      <Pressable
        onPress={() => { thud(); onNew(); }}
        accessibilityLabel="Nouvel événement"
        style={({ pressed }) => ({ position: 'absolute', right: 18, bottom: insets.bottom + 84, width: 58, height: 58, borderRadius: 18, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center', elevation: 8, shadowColor: '#000000', shadowOpacity: 0.3, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, transform: [{ scale: pressed ? 0.94 : 1 }] })}
      >
        <Icon name="plus" size={26} color={t.bg} />
      </Pressable>
      <View style={{ flexDirection: 'row', backgroundColor: t.surface, borderTopWidth: 1, borderColor: t.line, paddingBottom: insets.bottom, paddingTop: 6 }}>
        {TABS.map((x) => {
          const on = tab === x.id;
          return (
            <Pressable key={x.id} onPress={() => { tap(); setTab(x.id); }} accessibilityRole="tab" accessibilityState={{ selected: on }} style={{ flex: 1, alignItems: 'center', paddingVertical: 6, gap: 3 }}>
              <View style={{ paddingHorizontal: 16, paddingVertical: 5, borderRadius: 99, backgroundColor: on ? t.surface2 : 'transparent' }}>
                <Icon name={x.icon} size={19} color={on ? t.ink : t.muted} />
              </View>
              <T size={11.5} weight={on ? 'bodySemi' : 'body'} color={on ? t.ink : t.muted}>{x.label}</T>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Main() {
  const t = useTheme();
  const { ready, events, sync, prefs, authLost } = useStore();
  const [tab, setTab] = useState('today');
  const [editor, setEditor] = useState(null);
  const [settings, setSettings] = useState(false);
  const [auth, setAuth] = useState(false);
  const [alarm, setAlarm] = useState(null);
  const [link, setLink] = useState(null);
  const [quickFocus, setQuickFocus] = useState(false);
  // Double authentification : { mode: 'enable' | 'disable', fromSignup }.
  const [twoFa, setTwoFa] = useState(null);

  // Premier lancement sans compte : écran de connexion.
  useEffect(() => { if (ready && !sync.isLoggedIn() && !prefs.skipLogin) setAuth(true); }, [ready]);
  useEffect(() => { if (authLost) setAuth(true); }, [authLost]);

  // Notifications : canal, permissions, écoute des alarmes.
  useEffect(() => {
    (async () => {
      await setupAlarms();
      const p = await permissionState();
      if (!p.notifications) await askNotificationPermission();
    })().catch(() => {});
    const received = Notifications.addNotificationReceivedListener((n) => {
      const d = n.request.content.data;
      if (d?.oid) setAlarm(d);
    });
    const response = Notifications.addNotificationResponseReceivedListener((r) => {
      const d = r.notification.request.content.data;
      if (!d?.oid) return;
      if (r.actionIdentifier === 'snooze') snooze(d, 5);
      else if (r.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) setAlarm(d);
      Notifications.dismissNotificationAsync(r.notification.request.identifier).catch(() => {});
    });
    return () => { received.remove(); response.remove(); };
  }, []);

  // Liens ouverts depuis les widgets : agendammi://event?oid=… et agendammi://new.
  useEffect(() => {
    Linking.getInitialURL().then((u) => u && setLink(u)).catch(() => {});
    const sub = Linking.addEventListener('url', ({ url }) => setLink(url));
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!link || !ready || auth) return;
    setLink(null);
    const m = /^agendammi:\/\/([a-z]+)\/?(?:\?(.*))?$/.exec(link);
    if (!m) return;
    const q = Object.fromEntries((m[2] || '').split('&').filter(Boolean).map((kv) => kv.split('=').map(decodeURIComponent)));
    if (m[1] === 'event' && q.oid) {
      const o = findOcc(events, q.oid);
      if (o) setEditor({ ev: o.ev, occDate: o.date });
    } else if (m[1] === 'new') {
      setEditor(null); setSettings(false); setTab('today'); setQuickFocus(true);
    }
  }, [link, ready, auth, events]);

  // Chaque changement d'événements reprogramme les alarmes du système.
  useEffect(() => { if (ready) rescheduleAlarms(events); }, [events, ready]);

  const openEv = useCallback((ev, occDate) => setEditor({ ev, occDate }), []);
  const create = useCallback((pre) => setEditor({ pre }), []);
  const newEvent = () => {
    const n = new Date();
    const s = Math.max(7 * 60, Math.min(22 * 60, Math.ceil((n.getHours() * 60 + n.getMinutes()) / 30) * 30));
    create({ date: key(today0()), s, e: s + 60 });
  };

  if (auth) {
    return (
      <AuthScreen
        onDone={async (isNew) => {
          setAuth(false);
          const p = await permissionState();
          if (!p.exact) askExactAlarmPermission();
          // Connexion ou compte tout neuf sans double authentification : on la propose tout de suite.
          // Pour un nouveau compte, les réglages (Hyperplanning) s'ouvrent ensuite.
          if (isNew || !sync.state.user?.twoFactor) setTimeout(() => setTwoFa({ mode: 'enable', fromSignup: true, isNew }), 400);
        }}
        onCancel={() => setAuth(false)}
      />
    );
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flex: 1, paddingBottom: 70 }}>
        {tab === 'today' && <TodayScreen onOpen={openEv} onSettings={() => setSettings(true)} focusQuick={quickFocus} onQuickFocused={() => setQuickFocus(false)} />}
        {tab === 'week' && <WeekScreen onOpen={openEv} onCreate={create} />}
        {tab === 'month' && <MonthScreen onOpen={openEv} onCreate={create} />}
        {tab === 'agenda' && <AgendaScreen onOpen={openEv} />}
      </View>
      <TabBar tab={tab} setTab={setTab} onNew={newEvent} />
      <EditorSheet target={editor} onClose={() => setEditor(null)} />
      <SettingsSheet visible={settings} onClose={() => setSettings(false)} onLogin={() => setAuth(true)} onTwoFactor={(mode) => setTimeout(() => setTwoFa({ mode }), 350)} />
      <TwoFactorSheet
        visible={!!twoFa} mode={twoFa?.mode} fromSignup={twoFa?.fromSignup} isNew={twoFa?.isNew}
        onClose={() => { const after = twoFa?.isNew; setTwoFa(null); if (after) setTimeout(() => setSettings(true), 400); }}
      />
      <AlarmOverlay data={alarm} onClose={() => setAlarm(null)} />
    </SafeAreaView>
  );
}

function Themed({ children }) {
  const scheme = useColorScheme();
  const { prefs } = useStore();
  const mode = prefs.theme === 'auto' ? (scheme === 'dark' ? 'dark' : 'light') : prefs.theme;
  const t = palettes[mode];
  useEffect(() => { SystemUI.setBackgroundColorAsync(t.bg).catch(() => {}); }, [t.bg]);
  return (
    <ThemeContext.Provider value={t}>
      <StatusBar barStyle={t.dark ? 'light-content' : 'dark-content'} backgroundColor={t.bg} />
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <ToastProvider>{children}</ToastProvider>
      </View>
    </ThemeContext.Provider>
  );
}

export default function App() {
  const [loaded] = useFonts({
    BricolageGrotesque_200ExtraLight, BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold,
    Geist_400Regular, Geist_500Medium, Geist_600SemiBold,
  });
  useEffect(() => { if (loaded) SplashScreen.hideAsync().catch(() => {}); }, [loaded]);
  if (!loaded) return null;
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <Themed>
          <Main />
        </Themed>
      </StoreProvider>
    </SafeAreaProvider>
  );
}


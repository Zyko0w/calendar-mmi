import { useEffect, useRef } from 'react';
import { Animated, Easing, Modal, Pressable, StatusBar, Vibration, View } from 'react-native';
import { TYPES, fmtMin, niceDate } from '../core';
import { useTheme } from '../theme';
import { describeWhen, snooze } from '../alarms';
import { Icon, T, thud, useToast } from '../ui';

function Ripple({ delay, color }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 3000, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }));
    loop.start(); return () => loop.stop();
  }, [v, delay]);
  return (
    <Animated.View pointerEvents="none" style={{
      position: 'absolute', width: 340, height: 340, borderRadius: 170, borderWidth: 2, borderColor: color,
      opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
      transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.4, 2.6] }) }],
    }} />
  );
}

/** Écran d'alarme plein écran quand un rappel arrive alors que l'app est ouverte, ou quand on touche la notification. */
export default function AlarmOverlay({ data, onClose }) {
  const t = useTheme();
  const toast = useToast();
  const bell = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!data) return undefined;
    Vibration.vibrate([0, 400, 200, 400, 200, 800], true);
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(bell, { toValue: 1, duration: 120, useNativeDriver: true }), Animated.timing(bell, { toValue: -1, duration: 120, useNativeDriver: true }),
      Animated.timing(bell, { toValue: 1, duration: 120, useNativeDriver: true }), Animated.timing(bell, { toValue: 0, duration: 120, useNativeDriver: true }),
      Animated.delay(700),
    ]));
    loop.start();
    const stopVib = setTimeout(() => Vibration.cancel(), 30000);
    return () => { loop.stop(); Vibration.cancel(); clearTimeout(stopVib); };
  }, [data, bell]);
  if (!data) return null;
  const fg = t.onAccent;
  const sub = [describeWhen(data), niceDate(data.date) !== "aujourd'hui" ? niceDate(data.date) : '', data.location].filter(Boolean).join(', ');
  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <StatusBar barStyle={t.dark ? 'dark-content' : 'light-content'} />
      <View style={{ flex: 1, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center', padding: 28, overflow: 'hidden' }}>
        <Ripple delay={0} color={fg} /><Ripple delay={1000} color={fg} /><Ripple delay={2000} color={fg} />
        <Animated.View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center', marginBottom: 14, transform: [{ rotate: bell.interpolate({ inputRange: [-1, 1], outputRange: ['-14deg', '14deg'] }) }] }}>
          <Icon name="bell" size={30} color={fg} />
        </Animated.View>
        <T size={15} color={fg} style={{ opacity: 0.85 }}>Rappel, {(TYPES[data.type]?.label || 'événement').toLowerCase()}</T>
        <T weight="displayThin" size={112} color={fg} style={{ lineHeight: 118, letterSpacing: -4 }}>{fmtMin(data.s)}</T>
        <T weight="bodySemi" size={26} color={fg} style={{ textAlign: 'center', lineHeight: 32, letterSpacing: -0.5 }}>{data.title}</T>
        <T size={15} color={fg} style={{ opacity: 0.85, marginTop: 8, textAlign: 'center' }}>{sub}</T>
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 36 }}>
          <Pressable onPress={async () => { thud(); await snooze(data, 5); toast('Rappel dans 5 minutes'); onClose(); }} style={{ height: 54, paddingHorizontal: 22, borderRadius: 16, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.55)', justifyContent: 'center' }}>
            <T weight="bodySemi" size={16} color={fg}>Rappeler dans 5 min</T>
          </Pressable>
          <Pressable onPress={() => { thud(); onClose(); }} style={{ height: 54, paddingHorizontal: 28, borderRadius: 16, backgroundColor: fg, justifyContent: 'center' }}>
            <T weight="bodySemi" size={16} color={t.accent}>Arrêter</T>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { catInk, fonts, tint, useTheme } from './theme';

export const Icon = ({ name, size = 18, color }) => {
  const t = useTheme();
  return <Feather name={name} size={size} color={color || t.ink} />;
};

export const tap = () => Haptics.selectionAsync().catch(() => {});
export const thud = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

export function T({ style, muted, weight = 'body', size = 14, color, children, ...p }) {
  const t = useTheme();
  return (
    <Text {...p} style={[{ fontFamily: fonts[weight] || fonts.body, fontSize: size, color: color || (muted ? t.muted : t.ink), fontVariant: ['tabular-nums'] }, style]}>
      {children}
    </Text>
  );
}

export function IconBtn({ name, onPress, label, size = 40, bordered = true, color }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => { tap(); onPress?.(); }}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => ({
        width: size, height: size, borderRadius: size * 0.32, alignItems: 'center', justifyContent: 'center',
        backgroundColor: pressed ? t.surface2 : bordered ? t.surface : 'transparent',
        borderWidth: bordered ? StyleSheet.hairlineWidth * 2 : 0, borderColor: t.line,
      })}
    >
      <Icon name={name} size={size * 0.45} color={color} />
    </Pressable>
  );
}

export function Button({ title, onPress, kind = 'primary', icon, disabled, style }) {
  const t = useTheme();
  const bg = kind === 'primary' ? t.ink : kind === 'danger' ? 'transparent' : t.surface;
  const fg = kind === 'primary' ? t.bg : kind === 'danger' ? t.danger : t.ink;
  return (
    <Pressable
      onPress={() => { if (!disabled) { tap(); onPress?.(); } }}
      accessibilityRole="button"
      disabled={disabled}
      style={({ pressed }) => [{
        height: 46, paddingHorizontal: 18, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        backgroundColor: bg, opacity: disabled ? 0.5 : 1, transform: [{ scale: pressed ? 0.98 : 1 }],
        borderWidth: kind === 'ghost' ? 1 : 0, borderColor: t.line,
      }, style]}
    >
      {icon ? <Icon name={icon} size={17} color={fg} /> : null}
      <T weight="bodySemi" size={15} color={fg}>{title}</T>
    </Pressable>
  );
}

export function Chip({ label, color, selected, onPress, dim }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => { tap(); onPress?.(); }}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 7, paddingLeft: 11, paddingRight: 13, borderRadius: 99,
        borderWidth: selected ? 0 : 1, borderColor: t.line, margin: selected ? 1 : 0,
        backgroundColor: selected ? (color ? tint(color, 0.16, t.surface) : t.ink) : t.surface, opacity: dim ? 0.5 : 1,
      }}
    >
      {color ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dim ? 'transparent' : color, borderWidth: dim ? 1.5 : 0, borderColor: color }} /> : null}
      <T size={13.5} weight={selected ? 'bodySemi' : 'body'} color={selected ? (color ? catInk(t, color) : t.bg) : undefined}>{label}</T>
    </Pressable>
  );
}

/** Contrôle segmenté avec indicateur qui glisse. */
export function Segmented({ options, value, onChange }) {
  const t = useTheme();
  const [w, setW] = useState(0);
  const idx = Math.max(0, options.findIndex((o) => o.value === value));
  const x = useRef(new Animated.Value(0)).current;
  const seg = w / options.length;
  useEffect(() => { Animated.spring(x, { toValue: idx * seg, useNativeDriver: true, speed: 18, bounciness: 4 }).start(); }, [idx, seg, x]);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width - 6)} style={{ flexDirection: 'row', padding: 3, borderRadius: 11, backgroundColor: t.surface2 }}>
      {w > 0 && <Animated.View style={{ position: 'absolute', top: 3, bottom: 3, left: 3, width: seg, borderRadius: 8, backgroundColor: t.dark ? '#2C2C31' : t.surface, elevation: 1, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 2, shadowOffset: { width: 0, height: 1 }, transform: [{ translateX: x }] }} />}
      {options.map((o) => (
        <Pressable key={o.value} onPress={() => { tap(); onChange(o.value); }} style={{ flex: 1, height: 34, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="tab" accessibilityState={{ selected: o.value === value }}>
          <T weight="bodyMedium" size={13} color={o.value === value ? t.ink : t.muted}>{o.label}</T>
        </Pressable>
      ))}
    </View>
  );
}

export function Toggle({ value, onValueChange, label }) {
  const t = useTheme();
  return (
    <Switch
      value={value}
      onValueChange={(v) => { tap(); onValueChange(v); }}
      trackColor={{ true: t.accent, false: t.line }}
      thumbColor="#FFFFFF"
      accessibilityLabel={label}
    />
  );
}

export function Ring({ size = 40, frac, color, label }) {
  const t = useTheme();
  const r = size / 2 - 3, c = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.line} strokeWidth={3.5} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={3.5} fill="none" strokeLinecap="round"
          strokeDasharray={`${c * frac} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      <T weight="bodySemi" size={11}>{label}</T>
    </View>
  );
}

export function Field({ label, children, style }) {
  return (
    <View style={[{ gap: 6, marginBottom: 14 }, style]}>
      <T muted size={12.5}>{label}</T>
      {children}
    </View>
  );
}

export function inputStyle(t) {
  return { height: 46, borderRadius: 11, borderWidth: 1, borderColor: t.surface2, backgroundColor: t.surface2, paddingHorizontal: 13, color: t.ink, fontFamily: fonts.body, fontSize: 15 };
}

/** Feuille qui monte du bas de l'écran. */
export function Sheet({ visible, onClose, children, title, right }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(12,12,22,0.45)' }} onPress={onClose} accessibilityLabel="Fermer" />
        <View style={{ maxHeight: '92%', backgroundColor: t.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: insets.bottom + 8 }}>
          <View style={{ alignItems: 'center', paddingTop: 8 }}><View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: t.line }} /></View>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, paddingBottom: 4 }}>
            <T muted weight="bodyMedium" size={13} style={{ flex: 1 }}>{title}</T>
            {right}
            <IconBtn name="x" onPress={onClose} label="Fermer" size={36} bordered={false} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12 }}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ---------- Toasts ---------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState(null);
  const y = useRef(new Animated.Value(80)).current;
  const timer = useRef(null);
  const show = useCallback((msg, action) => {
    clearTimeout(timer.current);
    setToast({ msg, action });
    Animated.spring(y, { toValue: 0, useNativeDriver: true, speed: 16, bounciness: 6 }).start();
    timer.current = setTimeout(() => Animated.timing(y, { toValue: 120, duration: 220, useNativeDriver: true }).start(() => setToast(null)), 4500);
  }, [y]);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && (
        <Animated.View pointerEvents="box-none" style={{ position: 'absolute', left: 14, right: 14, bottom: insets.bottom + 92, transform: [{ translateY: y }] }}>
          <View style={{ backgroundColor: t.ink, borderRadius: 14, paddingVertical: 12, paddingLeft: 16, paddingRight: 8, flexDirection: 'row', alignItems: 'center', gap: 10, elevation: 8 }}>
            <T size={14} color={t.bg} style={{ flex: 1 }}>{toast.msg}</T>
            {toast.action && (
              <Pressable onPress={() => { toast.action.fn(); setToast(null); }} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
                <T weight="bodySemi" size={14} color={t.dark ? '#3A30FF' : '#A8A4FF'}>{toast.action.label}</T>
              </Pressable>
            )}
          </View>
        </Animated.View>
      )}
    </ToastCtx.Provider>
  );
}

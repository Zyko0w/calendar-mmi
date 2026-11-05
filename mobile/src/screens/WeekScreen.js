import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { MSHORT, MONTHS, WDS, pad, key, addDays, today0, wdIdx, fmtMin, isPoint, clamp, occurrences, layoutDay } from '../core';
import { catInk, liveBg, tint, useTheme } from '../theme';
import { useStore } from '../store';
import { IconBtn, T, tap } from '../ui';
import { useNow } from './TodayScreen';

const HSTART = 7, HEND = 23, H = 58, GUT = 46;

export default function WeekScreen({ onOpen, onCreate }) {
  const t = useTheme();
  const { events, hidden } = useStore();
  const { width } = useWindowDimensions();
  const n = width >= 900 ? 7 : width >= 620 ? 5 : 3;
  const [start, setStart] = useState(() => today0());
  const now = useNow(30000);
  const scroll = useRef(null);
  const colW = (width - GUT - 20) / n;
  const tk = key(today0());

  const days = useMemo(() => Array.from({ length: n }, (_, i) => addDays(start, i)), [start, n]);
  const list = useMemo(() => occurrences(events, start, addDays(start, n), hidden), [events, hidden, start, n]);
  const byDay = useMemo(() => days.map((d) => layoutDay(list.filter((o) => o.date === key(d)))), [days, list]);

  useEffect(() => {
    const nd = new Date();
    const y = Math.max(0, ((nd.getHours() * 60 + nd.getMinutes()) - HSTART * 60) / 60 * H - 140);
    setTimeout(() => scroll.current?.scrollTo({ y, animated: false }), 50);
  }, []);

  const step = (dir) => { tap(); setStart((s) => addDays(s, dir * n)); };
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
    onPanResponderRelease: (_, g) => { if (g.dx < -60) step(1); else if (g.dx > 60) step(-1); },
  })).current;

  const last = days[days.length - 1];
  const title = start.getMonth() === last.getMonth() ? MONTHS[start.getMonth()] : `${MSHORT[start.getMonth()]} – ${MSHORT[last.getMonth()]}`;
  const nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes();
  const showNow = days.some((d) => key(d) === tk) && nowMin >= HSTART * 60 && nowMin <= HEND * 60;
  const nowTop = (nowMin - HSTART * 60) / 60 * H;

  return (
    <View style={{ flex: 1 }} {...pan.panHandlers}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, gap: 8 }}>
        <T weight="bodySemi" size={24} style={{ flex: 1, textTransform: 'capitalize', letterSpacing: -0.6 }}>
          {title} <T weight="body" size={24} muted>{last.getFullYear()}</T>
        </T>
        <IconBtn name="chevron-left" onPress={() => step(-1)} label="Jours précédents" size={38} />
        <Pressable onPress={() => { tap(); setStart(today0()); }} style={{ height: 38, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, justifyContent: 'center' }}>
          <T weight="bodySemi" size={13}>Auj.</T>
        </Pressable>
        <IconBtn name="chevron-right" onPress={() => step(1)} label="Jours suivants" size={38} />
      </View>

      <View style={{ flex: 1, marginHorizontal: 10, marginBottom: 6, backgroundColor: t.surface, borderRadius: 16, borderWidth: 1, borderColor: t.line, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: t.line }}>
          <View style={{ width: GUT }} />
          {days.map((d) => {
            const k = key(d), today = k === tk;
            return (
              <View key={k} style={{ width: colW, paddingVertical: 10, paddingHorizontal: 8, flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
                <T size={12} weight={today ? 'bodySemi' : 'body'} color={today ? t.accent : t.muted} style={{ textTransform: 'capitalize' }}>{WDS[wdIdx(d)]}</T>
                <T weight="bodyMedium" size={16} color={today ? t.accent : t.ink}>{d.getDate()}</T>
              </View>
            );
          })}
        </View>
        <ScrollView ref={scroll} contentContainerStyle={{ height: (HEND - HSTART) * H }} showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', height: (HEND - HSTART) * H }}>
            <View style={{ width: GUT }}>
              {Array.from({ length: HEND - HSTART - 1 }, (_, i) => (
                <T key={i} muted size={11} style={{ position: 'absolute', top: (i + 1) * H - 7, right: 7 }}>{pad(HSTART + i + 1)}:00</T>
              ))}
              {showNow && (
                <View pointerEvents="none" style={{ position: 'absolute', right: 4, top: nowTop - 9, paddingHorizontal: 5, height: 18, borderRadius: 5, backgroundColor: t.accent, justifyContent: 'center', zIndex: 9 }}>
                  <T weight="bodySemi" size={10.5} color={t.onAccent}>{fmtMin(nowMin)}</T>
                </View>
              )}
            </View>
            {days.map((d, di) => {
              const k = key(d), today = k === tk, we = wdIdx(d) >= 5;
              return (
                <Pressable
                  key={k}
                  onPress={(e) => {
                    const y = e.nativeEvent.locationY ?? e.nativeEvent.offsetY;
                    const raw = Number.isFinite(y) ? y / H * 60 + HSTART * 60 : 9 * 60;
                    const m = clamp(Math.floor(raw / 30) * 30, HSTART * 60, HEND * 60 - 60);
                    tap(); onCreate({ date: k, s: m, e: m + 60 });
                  }}
                  accessibilityLabel={`Créer un événement le ${d.getDate()} ${MONTHS[d.getMonth()]}`}
                  style={{ width: colW, borderLeftWidth: 1, borderColor: t.grid, backgroundColor: today ? tint(t.accent, 0.025, t.surface) : we ? tint(t.surface2, 0.45, t.surface) : t.surface }}
                >
                  {Array.from({ length: HEND - HSTART }, (_, i) => (
                    <View key={i} pointerEvents="none" style={{ position: 'absolute', top: i * H, left: 0, right: 0, height: 1, backgroundColor: t.grid, opacity: i === 0 ? 0 : 1 }} />
                  ))}
                  {byDay[di].map((o) => <EventBlock key={o.oid} o={o} colW={colW} state={stateOf(o, tk, nowMin)} onPress={() => onOpen(o.ev, o.date)} />)}
                  {today && showNow && (
                    <View pointerEvents="none" style={{ position: 'absolute', left: -1, top: nowTop - 5, width: 0, height: 0, borderTopWidth: 5, borderBottomWidth: 5, borderLeftWidth: 6, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: t.accent, zIndex: 9 }} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

/** « past » si terminé, « live » si en cours. */
function stateOf(o, tk, nowMin) {
  if (o.date < tk) return 'past';
  if (o.date > tk) return '';
  if (isPoint(o)) return o.s <= nowMin ? 'past' : '';
  if (o.e <= nowMin) return 'past';
  return o.s <= nowMin ? 'live' : '';
}

function EventBlock({ o, colW, state, onPress }) {
  const t = useTheme();
  const c = t.cat[o.ev.type];
  const sm = clamp(o.s, HSTART * 60, HEND * 60);
  const top = (sm - HSTART * 60) / 60 * H;
  const w = colW / o.n, left = o.lane * w;
  const past = state === 'past' || o.ev.done, live = state === 'live';
  if (isPoint(o)) {
    return (
      <Pressable onPress={() => { tap(); onPress(); }} style={{ position: 'absolute', top: top - 12, left: left + 2, width: w - 4, height: 24, borderRadius: 12, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 7, zIndex: 5, elevation: 2 }}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c }} />
        <T weight="bodySemi" size={11} color={catInk(t, c)}>{fmtMin(o.s)}</T>
        <T weight="bodyMedium" size={11} numberOfLines={1} color={past ? t.muted : t.ink} style={{ flex: 1, textDecorationLine: o.ev.done ? 'line-through' : 'none' }}>{o.ev.title}</T>
      </Pressable>
    );
  }
  const h = Math.max(24, (clamp(o.e, HSTART * 60 + 15, HEND * 60) - sm) / 60 * H - 2);
  const bg = live ? liveBg(t, c) : tint(c, past ? t.mixPast : t.mix, t.surface);
  const fg = live ? t.onLive : past ? t.muted : t.ink;
  const timeC = live ? t.onLive : past ? t.muted : catInk(t, c);
  return (
    <Pressable
      onPress={() => { tap(); onPress(); }}
      accessibilityLabel={`${o.ev.title}, ${fmtMin(o.s)} à ${fmtMin(o.e)}${live ? ', en cours' : ''}`}
      style={({ pressed }) => ({ position: 'absolute', top: top + 1, left: left + 3, width: w - 6, height: h, borderRadius: 10, overflow: 'hidden', backgroundColor: bg, paddingVertical: 5, paddingHorizontal: 7, transform: [{ scale: pressed ? 0.97 : 1 }], zIndex: live ? 3 : 2, elevation: live ? 4 : 0, shadowColor: c, shadowOpacity: live ? 0.5 : 0, shadowRadius: 10, shadowOffset: { width: 0, height: 6 } })}
    >
      {h >= 40 && <T weight={past ? 'bodyMedium' : 'bodySemi'} size={10.5} numberOfLines={1} color={timeC}>{fmtMin(o.s)}–{fmtMin(o.e)}</T>}
      <T weight={past ? 'bodyMedium' : 'bodySemi'} size={12} numberOfLines={h < 50 ? 1 : 3} color={fg} style={o.ev.done ? { textDecorationLine: 'line-through' } : null}>{o.ev.title}</T>
      {h >= 66 && o.ev.location ? <T size={10.5} numberOfLines={1} color={live ? t.onLive : t.muted} style={live ? { opacity: 0.8 } : null}>{o.ev.location}</T> : null}
      {live && h >= 80 && (
        <View style={{ alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 5, borderRadius: 4, backgroundColor: t.dark ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.22)' }}>
          <T weight="bodySemi" size={10} color={t.onLive}>En cours</T>
        </View>
      )}
    </Pressable>
  );
}
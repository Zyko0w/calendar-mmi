import { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { MONTHS, WDS, TYPES, key, fromKey, addDays, sow, today0, wdIdx, fmtMin, isPoint, occurrences } from '../core';
import { catInk, tint, useTheme } from '../theme';
import { useStore } from '../store';
import { Icon, IconBtn, T, tap } from '../ui';

export default function MonthScreen({ onOpen, onCreate }) {
  const t = useTheme();
  const { events, hidden } = useStore();
  const [month, setMonth] = useState(() => { const d = today0(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [sel, setSel] = useState(() => key(today0()));
  const start = sow(month);
  const list = useMemo(() => occurrences(events, start, addDays(start, 42), hidden), [events, hidden, key(start)]);
  const byDate = useMemo(() => { const m = {}; list.forEach((o) => { (m[o.date] = m[o.date] || []).push(o); }); return m; }, [list]);
  const tk = key(today0());
  const go = (dir) => { tap(); setMonth((m) => new Date(m.getFullYear(), m.getMonth() + dir, 1)); };
  const selList = byDate[sel] || [];
  const selD = fromKey(sel);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8, paddingBottom: 10, gap: 8 }}>
        <T weight="bodySemi" size={24} style={{ flex: 1, textTransform: 'capitalize', letterSpacing: -0.6 }}>
          {MONTHS[month.getMonth()]} <T weight="body" size={24} muted>{month.getFullYear()}</T>
        </T>
        <IconBtn name="chevron-left" onPress={() => go(-1)} label="Mois précédent" size={38} />
        <IconBtn name="chevron-right" onPress={() => go(1)} label="Mois suivant" size={38} />
      </View>
      <View style={{ marginHorizontal: 10, backgroundColor: t.surface, borderRadius: 16, borderWidth: 1, borderColor: t.line, padding: 8 }}>
        <View style={{ flexDirection: 'row' }}>
          {WDS.map((w) => <T key={w} muted size={11.5} style={{ flex: 1, textAlign: 'center', paddingVertical: 6 }}>{w}</T>)}
        </View>
        {Array.from({ length: 6 }, (_, r) => (
          <View key={r} style={{ flexDirection: 'row' }}>
            {Array.from({ length: 7 }, (_, c) => {
              const d = addDays(start, r * 7 + c), k = key(d), out = d.getMonth() !== month.getMonth();
              const items = byDate[k] || [];
              const isSel = k === sel, isToday = k === tk;
              const hasDeadline = items.some((o) => isPoint(o) || o.ev.type === 'eval');
              return (
                <Pressable key={k} onPress={() => { tap(); setSel(k); }} onLongPress={() => onCreate({ date: k, s: 540, e: 600 })}
                  accessibilityLabel={`${d.getDate()} ${MONTHS[d.getMonth()]}, ${items.length} événements`}
                  style={{ flex: 1, height: 58, alignItems: 'center', paddingTop: 6, gap: 5, borderRadius: 12, backgroundColor: isSel ? t.surface2 : 'transparent' }}>
                  <View style={{ minWidth: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: isToday ? t.accent : 'transparent', borderWidth: hasDeadline && !isToday ? 1.5 : 0, borderColor: t.cat.rendu }}>
                    <T weight={isToday ? 'bodySemi' : 'bodyMedium'} size={14} color={isToday ? t.onAccent : out ? t.muted : t.ink} style={{ opacity: out ? 0.55 : 1 }}>{d.getDate()}</T>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 3 }}>
                    {items.slice(0, 4).map((o) => <View key={o.oid} style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: t.cat[o.ev.type] }} />)}
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <View style={{ paddingHorizontal: 16, paddingTop: 20, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <T weight="bodySemi" size={16} style={{ flex: 1, textTransform: 'capitalize' }}>{sel === tk ? "Aujourd'hui" : `${WDS[wdIdx(selD)]} ${selD.getDate()} ${MONTHS[selD.getMonth()]}`}</T>
          <Pressable onPress={() => { tap(); onCreate({ date: sel, s: 540, e: 600 }); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 5, padding: 6 }}>
            <Icon name="plus" size={15} color={t.accent} /><T weight="bodySemi" size={13.5} color={t.accent}>Ajouter</T>
          </Pressable>
        </View>
        {selList.length === 0 ? <T muted size={13.5}>Rien ce jour-là. Appui long sur une date pour créer un événement.</T> : selList.map((o) => (
          <Pressable key={o.oid} onPress={() => onOpen(o.ev, o.date)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, backgroundColor: isPoint(o) ? t.surface : tint(t.cat[o.ev.type], t.mix, t.surface), borderWidth: isPoint(o) ? 1 : 0, borderColor: t.line, opacity: pressed ? 0.8 : 1 })}>
            <T weight="bodySemi" size={13.5} color={catInk(t, t.cat[o.ev.type])} style={{ width: 48 }}>{fmtMin(o.s)}</T>
            <View style={{ flex: 1 }}>
              <T weight="bodySemi" size={14.5} numberOfLines={1}>{o.ev.title}</T>
              <T muted size={12.5} numberOfLines={1}>{[TYPES[o.ev.type].label, isPoint(o) ? 'heure limite' : `jusqu'à ${fmtMin(o.e)}`, o.ev.location].filter(Boolean).join(', ')}</T>
            </View>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

import { useMemo } from 'react';
import { Pressable, SectionList, View } from 'react-native';
import { TYPES, WDS, MSHORT, key, fromKey, addDays, today0, wdIdx, fmtMin, at, rel, isPoint, occurrences, alarmsOf, alarmsLabel } from '../core';
import { catInk, liveBg, tint, useTheme } from '../theme';
import { useStore } from '../store';
import { Icon, T } from '../ui';
import { QuickAdd, useNow } from './TodayScreen';

export default function AgendaScreen({ onOpen }) {
  const t = useTheme();
  const { events, hidden } = useStore();
  const now = useNow(30000);
  const tk = key(today0());
  const sections = useMemo(() => {
    const d = today0();
    const list = occurrences(events, d, addDays(d, 35), hidden);
    const m = new Map();
    list.forEach((o) => { if (!m.has(o.date)) m.set(o.date, []); m.get(o.date).push(o); });
    return [...m.entries()].map(([k, data]) => ({ key: k, data }));
  }, [events, hidden]);

  return (
    <SectionList
      sections={sections}
      keyExtractor={(o) => o.oid}
      stickySectionHeadersEnabled
      contentContainerStyle={{ paddingBottom: 140 }}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12, gap: 12 }}>
          <T weight="bodySemi" size={24} style={{ letterSpacing: -0.6 }}>Agenda <T weight="body" size={24} muted>5 semaines</T></T>
          <QuickAdd onCreated={(ev) => onOpen(ev, ev.date)} />
        </View>
      }
      ListEmptyComponent={
        <View style={{ padding: 40, alignItems: 'center', gap: 6 }}>
          <T weight="bodySemi" size={20}>Rien de prévu</T>
          <T muted style={{ textAlign: 'center' }}>Ajoute un cours, une SAÉ ou un rendu avec le bouton + ou l'ajout rapide.</T>
        </View>
      }
      renderSectionHeader={({ section }) => {
        const d = fromKey(section.key), today = section.key === tk;
        return (
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: t.bg }}>
            <T weight="displayThin" size={34} color={today ? t.accent : t.ink} style={{ letterSpacing: -1 }}>{d.getDate()}</T>
            <T size={13} color={today ? t.accent : t.muted}>{today ? "aujourd'hui" : `${WDS[wdIdx(d)]} ${MSHORT[d.getMonth()]}`}</T>
          </View>
        );
      }}
      renderItem={({ item: o }) => {
        const ev = o.ev, st = at(o.date, o.s).getTime(), en = at(o.date, o.e).getTime();
        let cd = '';
        if (ev.done) cd = 'terminé';
        else if (now < st && st - now < 7 * 864e5) cd = `dans ${rel(st - now)}`;
        else if (now >= st && now < en) cd = 'en cours';
        const c = t.cat[ev.type];
        return (
          <Pressable onPress={() => onOpen(ev, o.date)} style={({ pressed }) => ({ marginHorizontal: 10, marginBottom: 6, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, backgroundColor: isPoint(o) ? t.surface : tint(c, ev.done ? t.mixPast : t.mix, t.surface), borderWidth: isPoint(o) ? 1 : 0, borderColor: t.line, opacity: pressed ? 0.8 : 1 })}>
            <View style={{ width: 50 }}>
              <T weight="bodySemi" size={14} color={catInk(t, c)}>{fmtMin(o.s)}</T>
              <T muted size={11.5}>{isPoint(o) ? 'limite' : fmtMin(o.e)}</T>
            </View>
            <View style={{ flex: 1, gap: 3 }}>
              <T weight="bodySemi" size={14.5} numberOfLines={1} style={ev.done ? { textDecorationLine: 'line-through', color: t.muted } : null}>{ev.title}</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                <T muted size={12}>{TYPES[ev.type].label}{ev.source === 'hp' ? ', Hyperplanning' : ''}</T>
                {ev.location ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}><Icon name="map-pin" size={11} color={t.muted} /><T muted size={12}>{ev.location}</T></View> : null}
                {alarmsOf(ev).length ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}><Icon name="bell" size={11} color={t.muted} /><T muted size={12}>{alarmsLabel(ev)}</T></View> : null}
              </View>
            </View>
            {cd ? (
              <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, backgroundColor: cd === 'en cours' ? liveBg(t, c) : t.surface }}>
                <T weight="bodySemi" size={11.5} color={cd === 'en cours' ? t.onLive : catInk(t, c)}>{cd}</T>
              </View>
            ) : null}
          </Pressable>
        );
      }}
    />
  );
}

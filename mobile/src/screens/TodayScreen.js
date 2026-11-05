import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import {
  TYPES, MONTHS, WD, pad, today0, wdIdx, isoWeek, semester, rel, niceDate, fmtMin, at, isPoint, clamp,
  nextOccurrence, upcomingDeadlines, occurrences, addDays, key, parseQuick, alarmsOf, alarmsLabel,
} from '../core';
import { catInk, liveBg, tint, useTheme } from '../theme';
import { useStore } from '../store';
import { Icon, T, tap, useToast, inputStyle } from '../ui';

function useNow(ms = 15000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(i); }, [ms]);
  return now;
}

export function QuickAdd({ onCreated, focus, onFocused }) {
  const t = useTheme();
  const input = useRef(null);
  // Bouton « + » du widget : on arrive directement dans le champ.
  useEffect(() => {
    if (!focus) return;
    const id = setTimeout(() => { input.current?.focus(); onFocused?.(); }, 350);
    return () => clearTimeout(id);
  }, [focus]);
  const { sync, setPref } = useStore();
  const toast = useToast();
  const [v, setV] = useState('');
  const p = v.trim() ? parseQuick(v) : null;
  const submit = () => {
    if (!p) return;
    const ev = sync.save(p); setV(''); setPref('lastType', p.type);
    toast(`« ${ev.title} » ajouté ${niceDate(ev.date)} à ${ev.start}`, { label: 'Modifier', fn: () => onCreated?.(ev) });
  };
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ position: 'absolute', left: 13, zIndex: 1 }}><Icon name="zap" size={16} color={t.muted} /></View>
        <TextInput
          ref={input}
          value={v} onChangeText={setV} onSubmitEditing={submit} returnKeyType="done"
          placeholder="TD UX demain 14h-16h salle 108" placeholderTextColor={t.muted}
          accessibilityLabel="Ajout rapide"
          style={[inputStyle(t), { flex: 1, paddingLeft: 38 }]}
        />
      </View>
      {p && (
        <Pressable onPress={submit} style={{ backgroundColor: t.surface, borderRadius: 12, padding: 12, gap: 8, borderWidth: 1, borderColor: t.line }}>
          <T weight="bodySemi">{p.title}</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            <Tag color={t.cat[p.type]}>{TYPES[p.type].label}</Tag>
            <Tag icon="clock">{`${niceDate(p.date)} ${p.start}${p.end !== p.start ? '–' + p.end : ''}`}</Tag>
            {p.location ? <Tag icon="map-pin">{p.location}</Tag> : null}
            <Tag icon="bell">{alarmsLabel(p)}</Tag>
          </View>
          <T muted size={12}>Touche ici ou « OK » sur le clavier pour ajouter</T>
        </Pressable>
      )}
    </View>
  );
}

function Tag({ children, color, icon }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: color ? tint(color, 0.14, t.surface) : t.surface2 }}>
      {color ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} /> : <Icon name={icon} size={12} color={t.muted} />}
      <T size={12}>{children}</T>
    </View>
  );
}

export default function TodayScreen({ onOpen, onSettings, focusQuick, onQuickFocused }) {
  const t = useTheme();
  const { events, hidden, sync, status } = useStore();
  const toast = useToast();
  const now = useNow();
  const d = today0();
  const next = useMemo(() => nextOccurrence(events, hidden, now), [events, hidden, now]);
  const deadlines = useMemo(() => upcomingDeadlines(events, 45, now).slice(0, 6), [events, now]);
  const todayList = useMemo(() => occurrences(events, d, addDays(d, 1), hidden), [events, hidden, key(d)]);

  const nst = next ? at(next.date, next.s).getTime() : 0, nen = next ? at(next.date, next.e).getTime() : 0;
  const ongoing = next && !isPoint(next) && now >= nst;
  const statusLabel = { local: 'Sur ce téléphone', idle: 'Connecté', syncing: 'Synchro…', ok: 'Synchronisé', offline: 'Hors ligne', error: 'Erreur de synchro' }[status.s];

  return (
    <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 140, gap: 22 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center' }}>
          <T weight="displayHeavy" size={11} color={t.bg}>MMI</T>
        </View>
        <View style={{ flex: 1 }}>
          <T weight="bodySemi" size={15}>Agend-A</T>
          <T muted size={12}>BUT MMI 3</T>
        </View>
        <Pressable onPress={() => { tap(); if (sync.isLoggedIn()) sync.sync(); else onSettings(); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 99, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line }}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: status.s === 'ok' || status.s === 'idle' ? t.cat.stage : status.s === 'error' ? t.danger : status.s === 'syncing' ? t.cat.eval : t.muted }} />
          <T muted size={12}>{statusLabel}</T>
        </Pressable>
        <Pressable onPress={() => { tap(); onSettings(); }} hitSlop={8} accessibilityLabel="Réglages" style={{ padding: 6 }}><Icon name="settings" size={20} color={t.muted} /></Pressable>
      </View>

      <View style={{ gap: 4 }}>
        <T weight="displayThin" size={92} style={{ lineHeight: 92, letterSpacing: -3.5, marginLeft: -4 }}>{pad(d.getDate())}</T>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
          <T weight="bodyMedium" size={16} style={{ textTransform: 'capitalize' }}>{WD[wdIdx(d)]}</T>
          <T muted size={16}>{MONTHS[d.getMonth()]} {d.getFullYear()}</T>
        </View>
        <T muted size={13}>Semaine {isoWeek(d)} · {semester(d)}</T>
      </View>

      <Pressable
        onPress={() => next && onOpen(next.ev, next.date)}
        style={({ pressed }) => ({ borderRadius: 16, padding: 16, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, transform: [{ scale: pressed ? 0.99 : 1 }] })}
      >
        {next ? (
          <View style={{ gap: 3 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: t.cat[next.ev.type] }} />
              <T muted size={12.5}>{ongoing ? 'En cours' : 'Prochain'}, {TYPES[next.ev.type].label.toLowerCase()}</T>
            </View>
            <T weight="bodySemi" size={27} style={{ letterSpacing: -0.9, marginTop: 2 }}>
              {ongoing ? `Fin dans ${rel(nen - now)}` : isPoint(next) ? `Rendu dans ${rel(nst - now)}` : `Dans ${rel(nst - now)}`}
            </T>
            <T weight="bodySemi" size={15}>{next.ev.title}</T>
            <View style={{ flexDirection: 'row', gap: 14, flexWrap: 'wrap', marginTop: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Icon name="clock" size={13} color={t.muted} /><T muted size={13}>{niceDate(next.date)} {fmtMin(next.s)}{isPoint(next) ? '' : '–' + fmtMin(next.e)}</T></View>
              {next.ev.location ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Icon name="map-pin" size={13} color={t.muted} /><T muted size={13}>{next.ev.location}</T></View> : null}
            </View>
            {ongoing && (
              <View style={{ height: 2, borderRadius: 2, backgroundColor: t.line, marginTop: 12, overflow: 'hidden' }}>
                <View style={{ height: '100%', width: `${clamp((now - nst) / (nen - nst) * 100, 0, 100)}%`, backgroundColor: t.ink, borderRadius: 2 }} />
              </View>
            )}
          </View>
        ) : (
          <View style={{ gap: 4 }}>
            <T muted size={12.5}>Prochain</T>
            <T weight="bodySemi" size={26} style={{ letterSpacing: -0.8 }}>Rien de prévu</T>
            <T muted size={13}>Les 3 prochaines semaines sont libres.</T>
          </View>
        )}
      </Pressable>
      <QuickAdd onCreated={(ev) => onOpen(ev, ev.date)} focus={focusQuick} onFocused={onQuickFocused} />

      {sync.hasDemo() && (
        <View style={{ borderRadius: 14, borderWidth: 1, borderColor: t.line, padding: 14, gap: 10, backgroundColor: t.surface }}>
          <T size={13.5}>Voici un emploi du temps d'exemple. Connecte ton compte et ton Hyperplanning dans les réglages, ou efface les exemples.</T>
          <Pressable onPress={() => { tap(); sync.clearDemo(); toast('Exemples effacés'); }} style={{ alignSelf: 'flex-start' }}>
            <T weight="bodySemi" color={t.accent}>Effacer les exemples</T>
          </Pressable>
        </View>
      )}

      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <T weight="bodyMedium" size={13} muted>Aujourd'hui</T>
          <T muted size={12.5}>{todayList.length ? `${todayList.length} événement${todayList.length > 1 ? 's' : ''}` : ''}</T>
        </View>
        {todayList.length === 0 ? <T muted size={13.5}>Journée libre. Profites-en pour avancer ta SAÉ.</T> : todayList.map((o) => {
          const c = t.cat[o.ev.type];
          const st = at(o.date, o.s).getTime(), en = at(o.date, o.e).getTime();
          const past = (isPoint(o) ? st : en) <= now || o.ev.done;
          const live = !isPoint(o) && st <= now && now < en;
          const bg = live ? liveBg(t, c) : isPoint(o) ? t.surface : tint(c, past ? t.mixPast : t.mix, t.surface);
          const fg = live ? t.onLive : past ? t.muted : t.ink;
          return (
            <Pressable key={o.oid} onPress={() => onOpen(o.ev, o.date)} style={({ pressed }) => ({ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12, backgroundColor: bg, borderWidth: isPoint(o) ? 1 : 0, borderColor: t.line, transform: [{ scale: pressed ? 0.99 : 1 }] })}>
              <View style={{ width: 50 }}>
                <T weight="bodySemi" size={13.5} color={live ? t.onLive : past ? t.muted : catInk(t, c)}>{fmtMin(o.s)}</T>
                <T size={11.5} color={live ? t.onLive : t.muted} style={live ? { opacity: 0.8 } : null}>{isPoint(o) ? 'limite' : fmtMin(o.e)}</T>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T weight={past ? 'bodyMedium' : 'bodySemi'} size={14.5} numberOfLines={1} color={fg} style={o.ev.done ? { textDecorationLine: 'line-through' } : null}>{o.ev.title}</T>
                <T size={12.5} numberOfLines={1} color={live ? t.onLive : t.muted} style={live ? { opacity: 0.8 } : null}>{[TYPES[o.ev.type].label, o.ev.location].filter(Boolean).join(', ')}</T>
              </View>
              {live ? (
                <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5, backgroundColor: t.dark ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.22)' }}>
                  <T weight="bodySemi" size={10.5} color={t.onLive}>En cours</T>
                </View>
              ) : alarmsOf(o.ev).length ? <Icon name="bell" size={14} color={t.muted} /> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={{ gap: 0 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
          <T weight="bodyMedium" size={13} muted>Rendus et évaluations</T>
          <T muted size={12.5}>{deadlines.length ? `${deadlines.length} à venir` : ''}</T>
        </View>
        {deadlines.length === 0 ? <T muted size={13.5}>Aucun rendu dans les 45 prochains jours.</T> : deadlines.map((o, i) => {
          const rem = at(o.date, o.s).getTime() - now;
          const urgent = rem < 864e5;
          const dd = Math.floor(rem / 864e5), hh = Math.max(0, Math.floor(rem / 36e5));
          return (
            <Pressable key={o.oid} onPress={() => onOpen(o.ev, o.date)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderTopWidth: i ? 1 : 0, borderColor: t.line, opacity: pressed ? 0.7 : 1 })}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: t.cat[o.ev.type], alignSelf: 'flex-start', marginTop: 6 }} />
              <View style={{ flex: 1, gap: 2 }}>
                <T weight="bodySemi" size={14} numberOfLines={2}>{o.ev.title}</T>
                <T size={12.5} muted>{niceDate(o.date)} à {fmtMin(o.s)}</T>
              </View>
              <T size={12.5} weight={urgent ? 'bodySemi' : 'bodyMedium'} color={urgent ? t.danger : t.muted}>{dd >= 1 ? `J-${dd}` : `${hh} h`}</T>
              {o.ev.type === 'rendu' && (
                <Pressable
                  onPress={() => { tap(); const b = { ...o.ev }; sync.save({ ...o.ev, done: true }); toast(`« ${o.ev.title} » marqué comme rendu`, { label: 'Annuler', fn: () => sync.save(b) }); }}
                  accessibilityLabel={`Marquer ${o.ev.title} comme rendu`}
                  hitSlop={8}
                  style={{ width: 26, height: 26, borderRadius: 8, borderWidth: 1.5, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Icon name="check" size={14} color={t.muted} />
                </Pressable>
              )}
            </Pressable>
          );
        })}
      </View>    </ScrollView>
  );
}

export { useNow, Tag };

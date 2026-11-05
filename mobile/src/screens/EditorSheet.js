import { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { TYPES, ALARMS, MAX_ALARMS, alarmsOf, toggleAlarm, defaultAlarms, MONTHS, MSHORT, WD, WDS, key, fromKey, addDays, wdIdx, toMin, fmtMin, uid, niceDate, validateEvent } from '../core';
import { fonts, tint, useTheme } from '../theme';
import { useStore } from '../store';
import { Button, Chip, Field, Icon, Sheet, T, Toggle, inputStyle, tap, thud, useToast } from '../ui';

function PickerField({ mode, value, onChange, disabled, label }) {
  const t = useTheme();
  const asDate = mode === 'date' ? fromKey(value) : (() => { const d = new Date(); d.setHours(Math.floor(toMin(value) / 60), toMin(value) % 60, 0, 0); return d; })();
  const fmt = mode === 'date' ? (() => { const d = fromKey(value); return `${WDS[wdIdx(d)]} ${d.getDate()} ${MSHORT[d.getMonth()]}`; })() : value;
  const apply = (d) => onChange(mode === 'date' ? key(d) : fmtMin(d.getHours() * 60 + d.getMinutes()));
  if (Platform.OS === 'ios') {
    return <DateTimePicker value={asDate} mode={mode} display="compact" locale="fr-FR" disabled={disabled} onChange={(_, d) => d && apply(d)} />;
  }
  return (
    <Pressable
      disabled={disabled}
      accessibilityLabel={label}
      onPress={() => { tap(); DateTimePickerAndroid.open({ value: asDate, mode, is24Hour: true, onChange: (e, d) => { if (e.type === 'set' && d) apply(d); } }); }}
      style={[inputStyle(t), { justifyContent: 'center', opacity: disabled ? 0.55 : 1 }]}
    >
      <T size={15}>{fmt}</T>
    </Pressable>
  );
}

/** Création et modification d'un événement. `target` : { ev, occDate } ou { pre: {date,s,e} }. */
export default function EditorSheet({ target, onClose }) {
  const t = useTheme();
  const { sync, prefs, setPref } = useStore();
  const toast = useToast();
  const [ev, setEv] = useState(null);
  const [alarmTouched, setAlarmTouched] = useState(false);
  const [err, setErr] = useState('');
  const [askDelete, setAskDelete] = useState(false);

  useEffect(() => {
    if (!target) return;
    setErr(''); setAskDelete(false);
    if (target.ev) { setEv({ ...target.ev, alarms: alarmsOf(target.ev) }); setAlarmTouched(true); return; }
    const type = prefs.lastType || 'cours';
    const p = target.pre;
    setEv({ id: uid(), title: '', type, date: p.date, start: fmtMin(p.s), end: fmtMin(Math.min(p.e, 1439)), location: '', notes: '', alarms: defaultAlarms(type), repeat: 'none', until: '', skip: [], done: false, isNew: true });
    setAlarmTouched(false);
  }, [target]);

  if (!target || !ev) return null;
  const hp = ev.source === 'hp';
  const point = ev.type === 'rendu';
  const set = (patch) => setEv((e) => ({ ...e, ...patch }));
  const setType = (type) => set({ type, ...(alarmTouched ? {} : { alarms: defaultAlarms(type) }), ...(type === 'rendu' ? {} : toMin(ev.end) <= toMin(ev.start) ? { end: fmtMin(Math.min(toMin(ev.start) + 60, 1439)) } : {}) });

  const save = () => {
    const out = { ...ev, title: ev.title.trim(), end: point ? ev.start : ev.end, until: ev.repeat === 'weekly' ? (ev.until || key(addDays(fromKey(ev.date), 70))) : '' };
    const e = validateEvent(out);
    if (e) { setErr(e); thud(); return; }
    const isNew = out.isNew; delete out.isNew;
    setPref('lastType', out.type);
    sync.save(out); thud(); onClose();
    toast(isNew ? `« ${out.title} » ajouté ${niceDate(out.date)}` : 'Modifications enregistrées');
  };
  const remove = (all) => {
    const prev = sync.get(ev.id); onClose(); if (!prev) return;
    if (!all && target.occDate) {
      const before = { ...prev };
      sync.save({ ...prev, skip: [...(prev.skip || []), target.occDate] });
      toast(`Séance du ${niceDate(target.occDate)} supprimée`, { label: 'Annuler', fn: () => sync.save(before) });
      return;
    }
    sync.remove(ev.id);
    toast(`« ${prev.title} » ${hp ? 'masqué' : 'supprimé'}`, { label: 'Annuler', fn: () => (prev.demo ? sync.seedDemo([prev]) : sync.save(prev)) });
  };

  const dd = fromKey(ev.date);
  return (
    <Sheet visible onClose={onClose} title={ev.isNew ? 'Nouvel événement' : hp ? 'Cours Hyperplanning' : 'Modifier'}>
      <TextInput
        value={ev.title} onChangeText={(v) => set({ title: v })} editable={!hp} autoFocus={!!ev.isNew}
        placeholder="Intitulé du cours ou du rendu" placeholderTextColor={t.muted} maxLength={120}
        style={{ fontFamily: fonts.bodySemi, fontSize: 24, letterSpacing: -0.5, color: t.ink, borderBottomWidth: 1, borderColor: t.line, paddingVertical: 8, opacity: hp ? 0.65 : 1 }}
      />
      {hp && (
        <View style={{ marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: tint(t.cat.cours, 0.1, t.surface), gap: 4 }}>
          <T weight="bodySemi" size={13}>Cours importé d'Hyperplanning</T>
          <T muted size={12.5}>L'intitulé, l'horaire et la salle suivent ton emploi du temps officiel. Tu peux régler l'alarme et ajouter des notes.</T>
          {ev.hpInfo ? <T muted size={12.5} style={{ marginTop: 4 }}>{ev.hpInfo}</T> : null}
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 16, alignItems: 'center' }} pointerEvents={hp ? 'none' : 'auto'}>
        {Object.entries(TYPES).map(([k, ty]) => <Chip key={k} label={ty.label} color={t.cat[k]} selected={ev.type === k} onPress={() => setType(k)} />)}
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Field label="Date" style={{ flex: 1.3 }}><PickerField mode="date" value={ev.date} onChange={(v) => set({ date: v })} disabled={hp} label="Date" /></Field>
        <Field label={point ? 'Heure limite' : 'Début'} style={{ flex: 1 }}><PickerField mode="time" value={ev.start} onChange={(v) => set({ start: v, ...(point ? { end: v } : {}) })} disabled={hp} label="Heure de début" /></Field>
        {!point && <Field label="Fin" style={{ flex: 1 }}><PickerField mode="time" value={ev.end} onChange={(v) => set({ end: v })} disabled={hp} label="Heure de fin" /></Field>}
      </View>

      <Field label="Salle ou lieu">
        <TextInput value={ev.location} onChangeText={(v) => set({ location: v })} editable={!hp} placeholder="Salle 112, Amphi A, Discord…" placeholderTextColor={t.muted} maxLength={80} style={[inputStyle(t), hp && { opacity: 0.6 }]} />
      </Field>

      <Field label="Alarmes, plusieurs possibles">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {ALARMS.map(([v, l]) => {
            const on = v == null ? ev.alarms.length === 0 : ev.alarms.includes(v);
            return (
              <Chip key={String(v)} label={on && v != null ? `✓ ${l}` : l} selected={on} onPress={() => {
                setAlarmTouched(true);
                if (v == null) { set({ alarms: [] }); return; }
                const next = toggleAlarm(ev.alarms, v);
                if (next.length === ev.alarms.length && !next.includes(v)) toast(`${MAX_ALARMS} alarmes maximum par événement.`);
                set({ alarms: next });
              }} />
            );
          })}
        </View>
      </Field>

      {!hp && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <Icon name="repeat" size={17} color={t.muted} />
          <View style={{ flex: 1 }}>
            <T size={14.5}>Chaque semaine</T>
            {ev.repeat === 'weekly' && <T muted size={12.5}>Chaque {WD[wdIdx(dd)]}{ev.until ? ` jusqu'au ${fromKey(ev.until).getDate()} ${MONTHS[fromKey(ev.until).getMonth()]}` : ''}</T>}
          </View>
          <Toggle value={ev.repeat === 'weekly'} onValueChange={(v) => set({ repeat: v ? 'weekly' : 'none', until: v ? (ev.until || key(addDays(dd, 70))) : '' })} label="Répéter chaque semaine" />
        </View>
      )}
      {!hp && ev.repeat === 'weekly' && (
        <Field label="Jusqu'au" style={{ marginTop: 8 }}><PickerField mode="date" value={ev.until || key(addDays(dd, 70))} onChange={(v) => set({ until: v })} label="Fin de la répétition" /></Field>
      )}
      {point && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 8 }}>
          <Icon name="check-circle" size={17} color={t.muted} />
          <T size={14.5} style={{ flex: 1 }}>Rendu terminé</T>
          <Toggle value={!!ev.done} onValueChange={(v) => set({ done: v })} label="Rendu terminé" />
        </View>
      )}

      <Field label="Notes" style={{ marginTop: 8 }}>
        <TextInput value={ev.notes} onChangeText={(v) => set({ notes: v })} multiline placeholder="Consignes, lien Moodle, groupe…" placeholderTextColor={t.muted} maxLength={1000} style={[inputStyle(t), { height: 90, paddingTop: 12, textAlignVertical: 'top' }]} />
      </Field>

      {err ? <T color={t.danger} size={13.5} style={{ marginBottom: 10 }}>{err}</T> : null}

      {askDelete && (
        <View style={{ padding: 12, borderRadius: 14, backgroundColor: tint(t.danger, 0.08, t.surface), gap: 10, marginBottom: 12 }}>
          <T size={13.5}>Supprimer quoi ?</T>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button kind="ghost" title="Cette séance" onPress={() => remove(false)} style={{ flex: 1 }} />
            <Button kind="ghost" title="Toute la série" onPress={() => remove(true)} style={{ flex: 1 }} />
          </View>
        </View>
      )}

      <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
        {!ev.isNew && <Button kind="danger" icon="trash-2" title={hp ? 'Masquer' : 'Supprimer'} onPress={() => (ev.repeat === 'weekly' && target.occDate ? setAskDelete(true) : remove(true))} />}
        <View style={{ flex: 1 }} />
        <Button title="Enregistrer" onPress={save} style={{ paddingHorizontal: 24 }} />
      </View>
    </Sheet>
  );
}

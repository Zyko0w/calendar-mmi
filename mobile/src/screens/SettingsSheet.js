import { useEffect, useState } from 'react';
import { Linking, Pressable, TextInput, View } from 'react-native';
import { TYPES, ALARMS, MAX_ALARMS, toggleAlarm, rel } from '../core';
import { tint, useTheme } from '../theme';
import { useStore } from '../store';
import { permissionState, askNotificationPermission, askExactAlarmPermission, testAlarm } from '../alarms';
import { Button, Chip, Field, Icon, Segmented, Sheet, T, inputStyle, useToast } from '../ui';

const ago = (ts) => (ts ? `il y a ${rel(Date.now() - ts)}` : 'jamais');

function Section({ title, children }) {
  const t = useTheme();
  return (
    <View style={{ paddingVertical: 16, borderTopWidth: 1, borderColor: t.line, gap: 10 }}>
      <T weight="bodySemi" size={15}>{title}</T>
      {children}
    </View>
  );
}

export default function SettingsSheet({ visible, onClose, onLogin, onTwoFactor }) {
  const t = useTheme();
  const { sync, prefs, setPref, hidden, events } = useStore();
  const toast = useToast();
  const user = sync.state.user;
  const [hpUrl, setHpUrl] = useState(user?.hpUrl || '');
  const [hpMsg, setHpMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [api, setApi] = useState(sync.state.apiUrl);
  const [perm, setPerm] = useState({ notifications: true, exact: true });
  const [confirmDel, setConfirmDel] = useState(false);
  const [hpAl, setHpAl] = useState(user?.hpAlarms ?? [10]);
  const [alBusy, setAlBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setHpUrl(sync.state.user?.hpUrl || ''); setApi(sync.state.apiUrl); setHpMsg(null); setConfirmDel(false); setHpAl(sync.state.user?.hpAlarms ?? [10]);
    permissionState().then(setPerm).catch(() => {});
  }, [visible, events]);

  const hpStatus = !user ? 'Connecte-toi pour importer ton emploi du temps.'
    : user.hpError ? `Dernière tentative ${ago(user.hpLastSync)} : ${user.hpError}`
      : user.hpUrl ? `${user.hpCount || 0} cours importés, mis à jour ${ago(user.hpLastSync)}.` : 'Aucun lien enregistré.';

  const hp = async (fn, ok) => {
    setBusy(true); setHpMsg({ text: 'Import en cours…' });
    try { const r = await fn(); setHpMsg(null); toast(typeof ok === 'function' ? ok(r) : ok); } catch (e) { setHpMsg({ text: e.message, bad: true }); } finally { setBusy(false); }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Réglages">
      <View style={{ gap: 10, paddingBottom: 16 }}>
        <T weight="bodySemi" size={15}>Compte</T>
        {user ? (
          <>
            <T weight="bodySemi" size={15}>{user.email}</T>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Button kind="ghost" title="Se déconnecter" onPress={async () => { sync.stop(); await sync.logout(); toast('Déconnecté. Les données de ce téléphone ont été effacées.'); onClose(); onLogin(); }} />
              <Button kind="danger" title={confirmDel ? 'Confirmer la suppression' : 'Supprimer mon compte'} onPress={async () => {
                if (!confirmDel) { setConfirmDel(true); return; }
                try { sync.stop(); await sync.deleteAccount(); toast('Compte et événements supprimés.'); onClose(); onLogin(); } catch (e) { toast(e.message); }
              }} />
            </View>
          </>
        ) : (
          <>
            <T muted size={13.5}>Pas connecté : tes événements restent sur ce téléphone.</T>
            <Button title="Se connecter" onPress={() => { onClose(); onLogin(); }} style={{ alignSelf: 'flex-start' }} />
          </>
        )}
      </View>

      {user ? (
        <Section title="Sécurité">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: user.twoFactor ? t.cat.stage : t.cat.eval }} />
            <T size={14} weight="bodyMedium">{user.twoFactor ? 'Double authentification activée' : 'Double authentification désactivée'}</T>
          </View>
          <T muted size={13} style={{ lineHeight: 19 }}>
            {user.twoFactor
              ? `La connexion demande un code de ton appli d'authentification. ${user.recoveryLeft} code${user.recoveryLeft > 1 ? 's' : ''} de secours restant${user.recoveryLeft > 1 ? 's' : ''}.`
              : "Ajoute un code à 6 chiffres donné par une appli d'authentification, en plus du mot de passe."}
          </T>
          <Button
            kind={user.twoFactor ? 'ghost' : 'primary'}
            title={user.twoFactor ? 'Désactiver' : 'Activer la double authentification'}
            style={{ alignSelf: 'flex-start' }}
            onPress={() => { onClose(); onTwoFactor(user.twoFactor ? 'disable' : 'enable'); }}
          />
        </Section>
      ) : null}

      <Section title="Emploi du temps Hyperplanning">
        <T muted size={13} style={{ lineHeight: 19 }}>Dans ton espace Hyperplanning, ouvre ton emploi du temps, touche l'icône d'export iCal puis copie le lien. Tes cours se mettent ensuite à jour tout seuls, environ toutes les 30 minutes.</T>
        <Field label="Lien iCal" style={{ marginBottom: 4 }}>
          <TextInput value={hpUrl} onChangeText={setHpUrl} editable={!!user} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://…/hp/Telechargements/ical/…" placeholderTextColor={t.muted} style={[inputStyle(t), !user && { opacity: 0.5 }]} />
        </Field>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button title="Enregistrer le lien" disabled={!user || busy} onPress={() => {
            if (!hpUrl.trim()) { setHpMsg({ text: "Colle le lien iCal copié depuis Hyperplanning.", bad: true }); return; }
            hp(() => sync.setHyperplanning(hpUrl.trim()), (r) => `${r.result?.count ?? 0} cours importés depuis Hyperplanning`);
          }} />
          {user?.hpUrl ? <Button kind="ghost" title="Synchroniser" disabled={busy} onPress={() => hp(() => sync.syncHyperplanning(), (r) => (r.result?.skipped ? "Déjà à jour : l'emploi du temps vient d'être importé." : `Emploi du temps à jour (${r.result?.changed ?? 0} changement${(r.result?.changed ?? 0) > 1 ? 's' : ''})`))} /> : null}
          {user?.hpUrl ? <Button kind="danger" title="Retirer" disabled={busy} onPress={() => hp(() => sync.setHyperplanning(null), 'Lien retiré, les cours importés sont masqués.')} /> : null}
        </View>
        <T size={13} color={hpMsg?.bad || (!hpMsg && user?.hpError) ? t.danger : t.muted}>{hpMsg ? hpMsg.text : hpStatus}</T>
        {user?.hpUrl ? (
          <View style={{ gap: 10, marginTop: 8, paddingTop: 14, borderTopWidth: 1, borderColor: t.line, borderStyle: 'dashed' }}>
            <T weight="bodySemi" size={14}>Alarmes de tous les cours Hyperplanning</T>
            <T muted size={13} style={{ lineHeight: 19 }}>Choisis les rappels, puis applique-les à tous tes cours importés d'un coup. Les prochains cours importés les recevront aussi.</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {ALARMS.map(([v, l]) => {
                const on = v == null ? hpAl.length === 0 : hpAl.includes(v);
                return (
                  <Chip key={String(v)} label={l} selected={on} onPress={() => {
                    if (v == null) { setHpAl([]); return; }
                    const next = toggleAlarm(hpAl, v);
                    if (next.length === hpAl.length && !next.includes(v)) toast(`Pas plus de ${MAX_ALARMS} alarmes.`);
                    setHpAl(next);
                  }} />
                );
              })}
            </View>
            <Button title={alBusy ? 'Application…' : 'Appliquer à tous les cours'} disabled={alBusy} style={{ alignSelf: 'flex-start' }} onPress={async () => {
              setAlBusy(true);
              try { const r = await sync.setHpAlarms(hpAl); toast(`Alarmes mises à jour sur ${r.count} cours Hyperplanning`); } catch (e) { toast(e.message); } finally { setAlBusy(false); }
            }} />
          </View>
        ) : null}
      </Section>

      <Section title="Alarmes">
        {!perm.notifications && (
          <Pressable onPress={async () => setPerm({ ...perm, notifications: await askNotificationPermission() })} style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, backgroundColor: tint(t.danger, 0.1, t.surface) }}>
            <Icon name="bell-off" size={17} color={t.danger} />
            <T size={13.5} style={{ flex: 1 }}>Les notifications sont désactivées : aucune alarme ne sonnera. Touche pour les autoriser.</T>
          </Pressable>
        )}
        {!perm.exact && (
          <Pressable onPress={async () => { await askExactAlarmPermission(); setPerm(await permissionState()); }} style={{ flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, backgroundColor: tint(t.cat.eval, 0.12, t.surface) }}>
            <Icon name="clock" size={17} color={t.cat.eval} />
            <T size={13.5} style={{ flex: 1 }}>Autorise « Alarmes et rappels » pour que les rappels sonnent à la minute près, même en économie de batterie.</T>
          </Pressable>
        )}
        {perm.notifications && perm.exact && <T muted size={13}>Notifications et alarmes exactes autorisées. Les rappels sonnent même application fermée.</T>}
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button kind="ghost" icon="bell" title="Tester (dans 5 s)" onPress={async () => { await testAlarm(); toast('Alarme de test dans 5 secondes : verrouille ton téléphone pour voir.'); }} />
          <Button kind="ghost" icon="sliders" title="Réglages Android" onPress={() => Linking.openSettings()} />
        </View>
      </Section>

      <Section title="Affichage">
        <Segmented value={prefs.theme} onChange={(v) => setPref('theme', v)} options={[{ value: 'auto', label: 'Auto' }, { value: 'light', label: 'Clair' }, { value: 'dark', label: 'Sombre' }]} />
        <T muted size={12.5} style={{ marginTop: 4 }}>Calques affichés</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {Object.entries(TYPES).map(([k, ty]) => (
            <Chip key={k} label={ty.label} color={t.cat[k]} dim={hidden.has(k)} selected={!hidden.has(k)}
              onPress={() => { const h = new Set(hidden); if (h.has(k)) h.delete(k); else h.add(k); setPref('hidden', [...h]); }} />
          ))}
        </View>
      </Section>

      <Section title="Serveur">
        <TextInput value={api} onChangeText={setApi} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={inputStyle(t)} />
        <Button kind="ghost" title="Enregistrer l'adresse" style={{ alignSelf: 'flex-start' }} onPress={async () => { await sync.setApiUrl(api); sync.sync(); toast('Adresse du serveur enregistrée'); }} />
      </Section>
    </Sheet>
  );
}

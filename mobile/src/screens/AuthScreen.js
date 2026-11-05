import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { makeDemo } from '../core';
import { useTheme } from '../theme';
import { useStore } from '../store';
import { Button, Field, Segmented, T, inputStyle, tap, useToast } from '../ui';

export default function AuthScreen({ onDone, onCancel }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { sync, setPref } = useStore();
  const toast = useToast();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [pwd, setPwd] = useState('');
  const [api, setApi] = useState(sync.state.apiUrl || '');
  const [showApi, setShowApi] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  // Deuxième étape quand le compte a la double authentification.
  const [needCode, setNeedCode] = useState(false);
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);

  const submit = async () => {
    if (!email.trim() || !pwd) { setErr('Renseigne ton e-mail et ton mot de passe.'); return; }
    setBusy(true); setErr('');
    try {
      if (api.trim() && api.trim() !== sync.state.apiUrl) await sync.setApiUrl(api);
      sync.clearDemo();
      await sync.login(email.trim(), pwd, mode === 'register', needCode ? code.trim() : '');
      setPref('skipLogin', false);
      sync.start(30000);
      toast(mode === 'register' ? 'Compte créé. Ajoute ton lien Hyperplanning dans les réglages.' : 'Connecté, tes événements sont synchronisés.');
      onDone(mode === 'register');
    } catch (e) {
      if (e.twoFactor && !needCode) { setNeedCode(true); setErr(''); } else setErr(e.message);
    } finally { setBusy(false); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: t.ink, alignItems: 'center', justifyContent: 'center', marginBottom: 22 }}>
          <T weight="displayHeavy" size={15} color={t.bg}>MMI</T>
        </View>
        <T weight="bodySemi" size={32} style={{ lineHeight: 36, letterSpacing: -1, marginBottom: 10 }}>Connecte ton agenda</T>
        <T muted size={15} style={{ marginBottom: 26, lineHeight: 21 }}>Un seul compte pour retrouver tes cours, rendus et alarmes sur ton téléphone et ton PC.</T>
        {needCode ? (
          <View>
            <T weight="bodySemi" size={17} style={{ marginBottom: 6 }}>Double authentification</T>
            <T muted size={14} style={{ marginBottom: 16, lineHeight: 20 }}>
              {recovery ? "Entre un de tes codes de secours. Il ne servira qu'une fois." : "Ouvre ton appli d'authentification et entre le code à 6 chiffres du compte Agend-A."}
            </T>
            <TextInput
              value={code} onChangeText={setCode} autoFocus
              placeholder={recovery ? 'ABCDE-FGH23' : '123 456'} placeholderTextColor={t.muted}
              keyboardType={recovery ? 'default' : 'number-pad'} autoCapitalize="characters" autoCorrect={false}
              autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={recovery ? 11 : 7}
              onSubmitEditing={submit}
              style={[inputStyle(t), { backgroundColor: t.surface, fontSize: 22, letterSpacing: 4, textAlign: 'center', height: 56, marginBottom: 12 }]}
            />
            {err ? <T color={t.danger} size={13.5} style={{ marginBottom: 12 }}>{err}</T> : null}
            <Button title={busy ? 'Vérification…' : 'Valider'} onPress={submit} disabled={busy || code.trim().length < 6} style={{ height: 52 }} />
            <Pressable onPress={() => { tap(); setRecovery((v) => !v); setCode(''); setErr(''); }} style={{ alignSelf: 'center', padding: 14, marginTop: 4 }}>
              <T weight="bodyMedium" size={14} color={t.accent}>{recovery ? "Utiliser le code de l'appli" : "Je n'ai plus accès à mon appli"}</T>
            </Pressable>
            <Pressable onPress={() => { tap(); setNeedCode(false); setCode(''); setRecovery(false); setErr(''); }} style={{ alignSelf: 'center', padding: 8 }}>
              <T muted size={13.5}>Retour</T>
            </Pressable>
          </View>
        ) : (<>
        <View style={{ marginBottom: 20 }}>
          <Segmented value={mode} onChange={(m) => { setMode(m); setErr(''); }} options={[{ value: 'login', label: 'Se connecter' }, { value: 'register', label: 'Créer un compte' }]} />
        </View>
        <Field label="E-mail">
          <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" placeholder="prenom.nom@etu.univ.fr" placeholderTextColor={t.muted} style={[inputStyle(t), { backgroundColor: t.surface }]} />
        </Field>
        <Field label="Mot de passe">
          <TextInput value={pwd} onChangeText={setPwd} secureTextEntry autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder="8 caractères minimum" placeholderTextColor={t.muted} onSubmitEditing={submit} style={[inputStyle(t), { backgroundColor: t.surface }]} />
        </Field>
        <Pressable onPress={() => { tap(); setShowApi((v) => !v); }} style={{ paddingVertical: 6, marginBottom: 6 }}>
          <T muted size={13}>{showApi ? '▾' : '▸'} Adresse du serveur</T>
        </Pressable>
        {showApi && (
          <Field label="URL de l'API">
            <TextInput value={api} onChangeText={setApi} autoCapitalize="none" autoCorrect={false} keyboardType="url" style={[inputStyle(t), { backgroundColor: t.surface }]} />
          </Field>
        )}
        {err ? <T color={t.danger} size={13.5} style={{ marginBottom: 12 }}>{err}</T> : null}
        <Button title={busy ? 'Connexion…' : mode === 'login' ? 'Se connecter' : 'Créer mon compte'} onPress={submit} disabled={busy} style={{ height: 52, marginTop: 4 }} />
        <Pressable
          onPress={() => { tap(); setPref('skipLogin', true); if (!sync.hasLocalData()) sync.seedDemo(makeDemo()); onCancel(); }}
          style={{ alignSelf: 'center', padding: 14, marginTop: 6 }}
        >
          <T weight="bodyMedium" size={14} color={t.accent}>Continuer sans compte, sur ce téléphone seulement</T>
        </Pressable>
        </>)}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

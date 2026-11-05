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

  const submit = async () => {
    if (!email.trim() || !pwd) { setErr('Renseigne ton e-mail et ton mot de passe.'); return; }
    setBusy(true); setErr('');
    try {
      if (api.trim() && api.trim() !== sync.state.apiUrl) await sync.setApiUrl(api);
      sync.clearDemo();
      await sync.login(email.trim(), pwd, mode === 'register');
      setPref('skipLogin', false);
      sync.start(30000);
      toast(mode === 'register' ? 'Compte créé. Ajoute ton lien Hyperplanning dans les réglages.' : 'Connecté, tes événements sont synchronisés.');
      onDone(mode === 'register');
    } catch (e) {
      setErr(e.message);
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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

import { useEffect, useState } from 'react';
import { Linking, Share, TextInput, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useTheme } from '../theme';
import { useStore } from '../store';
import { Button, Field, Sheet, T, inputStyle, useToast } from '../ui';

/**
 * Double authentification par appli (Google Authenticator, Aegis, 2FAS…).
 * mode « enable » : explication, QR code / lien vers l'appli, premier code, codes de secours.
 * mode « disable » : mot de passe et code.
 * fromSignup : proposé après une connexion ou une création de compte (isNew), avec « Plus tard ».
 */
export default function TwoFactorSheet({ visible, mode = 'enable', fromSignup, isNew, onClose }) {
  const t = useTheme();
  const { sync } = useStore();
  const toast = useToast();
  const [step, setStep] = useState('intro');
  const [setup, setSetup] = useState(null);
  const [code, setCode] = useState('');
  const [pwd, setPwd] = useState('');
  const [codes, setCodes] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!visible) return;
    setStep('intro'); setSetup(null); setCode(''); setPwd(''); setCodes([]); setErr(''); setBusy(false);
  }, [visible]);

  const run = async (fn) => {
    setBusy(true); setErr('');
    try { await fn(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const start = () => run(async () => { setSetup(await sync.twoFactorSetup()); setStep('setup'); });
  const enable = () => run(async () => {
    setCodes(await sync.twoFactorEnable(code.replace(/\s/g, '')));
    setStep('codes');
  });
  const disable = () => run(async () => {
    await sync.twoFactorDisable(pwd, code.trim());
    toast('Double authentification désactivée.');
    onClose();
  });
  const shareCodes = () => Share.share({ message: `Codes de secours Agend-A (${sync.state.user?.email}) :\n\n${codes.join('\n')}\n\nChaque code ne sert qu'une fois.` }).catch(() => {});

  const codeInput = (opts = {}) => (
    <TextInput
      value={code} onChangeText={setCode} placeholder={opts.placeholder || '123 456'} placeholderTextColor={t.muted}
      keyboardType={opts.recovery ? 'default' : 'number-pad'} autoCapitalize="characters" autoCorrect={false}
      autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={opts.recovery ? 11 : 7}
      onSubmitEditing={opts.onSubmit}
      style={[inputStyle(t), { fontSize: 20, letterSpacing: 3, textAlign: 'center' }]}
    />
  );
  const error = err ? <T color={t.danger} size={13.5}>{err}</T> : null;

  if (mode === 'disable') {
    return (
      <Sheet visible={visible} onClose={onClose} title="Double authentification">
        <View style={{ gap: 12, paddingBottom: 8 }}>
          <T weight="bodySemi" size={22} style={{ letterSpacing: -0.5 }}>Désactiver la double authentification</T>
          <T muted size={14} style={{ lineHeight: 20 }}>Ton compte ne sera plus protégé que par ton mot de passe. Tes autres appareils seront déconnectés.</T>
          <Field label="Mot de passe" style={{ marginBottom: 0 }}>
            <TextInput value={pwd} onChangeText={setPwd} secureTextEntry autoComplete="current-password" style={inputStyle(t)} />
          </Field>
          <Field label="Code de l'appli ou code de secours" style={{ marginBottom: 0 }}>
            {codeInput({ recovery: true, placeholder: '123456', onSubmit: disable })}
          </Field>
          {error}
          <Button kind="danger" title={busy ? 'Vérification…' : 'Désactiver'} disabled={busy || !pwd || code.trim().length < 6} onPress={disable} style={{ borderWidth: 1, borderColor: t.line }} />
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet visible={visible} onClose={onClose} title="Double authentification">
      {step === 'intro' && (
        <View style={{ gap: 12, paddingBottom: 8 }}>
          <T weight="bodySemi" size={22} style={{ letterSpacing: -0.5 }}>{fromSignup ? (isNew ? 'Protège ton nouveau compte' : 'Protège ton compte') : 'Activer la double authentification'}</T>
          <T muted size={14} style={{ lineHeight: 20 }}>
            En plus du mot de passe, la connexion demandera un code à 6 chiffres donné par une appli d'authentification (Google Authenticator, Aegis, 2FAS, Microsoft Authenticator…). Même si quelqu'un trouve ton mot de passe, il ne pourra pas entrer.
          </T>
          {error}
          <Button title={busy ? 'Préparation…' : 'Configurer'} disabled={busy} onPress={start} />
          {fromSignup ? <Button kind="ghost" title="Plus tard, dans les réglages" onPress={onClose} /> : null}
        </View>
      )}

      {step === 'setup' && setup && (
        <View style={{ gap: 12, paddingBottom: 8 }}>
          <T weight="bodySemi" size={20} style={{ letterSpacing: -0.4 }}>1. Ajoute le compte dans ton appli</T>
          <Button kind="ghost" title="Ouvrir dans mon appli d'authentification" onPress={() => Linking.openURL(setup.otpauthUrl).catch(() => setErr("Aucune appli d'authentification trouvée. Installe-en une, ou recopie la clé ci-dessous."))} />
          <T muted size={13} style={{ lineHeight: 19 }}>Ou scanne ce QR code depuis un autre appareil, ou recopie la clé à la main.</T>
          <View style={{ alignSelf: 'center', padding: 10, backgroundColor: '#FFFFFF', borderRadius: 14 }}>
            <SvgXml xml={setup.qrSvg} width={176} height={176} />
          </View>
          <View style={{ backgroundColor: t.surface2, borderRadius: 11, padding: 12, gap: 2 }}>
            <T muted size={12}>Clé (compte « Agend-A »)</T>
            <T selectable weight="bodySemi" size={15} style={{ letterSpacing: 1 }}>{setup.secret}</T>
          </View>
          <T weight="bodySemi" size={20} style={{ letterSpacing: -0.4, marginTop: 6 }}>2. Entre le code affiché</T>
          {codeInput({ onSubmit: enable })}
          {error}
          <Button title={busy ? 'Vérification…' : 'Activer'} disabled={busy || code.replace(/\s/g, '').length !== 6} onPress={enable} />
        </View>
      )}

      {step === 'codes' && (
        <View style={{ gap: 12, paddingBottom: 8 }}>
          <T weight="bodySemi" size={22} style={{ letterSpacing: -0.5 }}>C'est activé. Garde tes codes de secours</T>
          <T muted size={14} style={{ lineHeight: 20 }}>
            Si tu perds ton téléphone, chaque code permet une connexion à la place de l'appli. Ils ne seront plus affichés : enregistre-les dans un gestionnaire de mots de passe ou note-les sur papier.
          </T>
          <View style={{ backgroundColor: t.surface2, borderRadius: 12, padding: 14, flexDirection: 'row', flexWrap: 'wrap', rowGap: 8 }}>
            {codes.map((c) => <T key={c} selectable weight="bodySemi" size={16} style={{ width: '50%', letterSpacing: 1 }}>{c}</T>)}
          </View>
          <Button kind="ghost" title="Partager ou enregistrer les codes" onPress={shareCodes} />
          <Button title="J'ai gardé mes codes" onPress={() => { toast('Double authentification activée. Tes autres appareils devront se reconnecter.'); onClose(); }} />
        </View>
      )}
    </Sheet>
  );
}

# Agend-A

Agenda avec alarmes pour étudiant·e de BUT MMI 3. Il tourne sur trois supports qui partagent les mêmes données :

| Dossier | Quoi | Techno |
|---|---|---|
| `api/` | Serveur de synchronisation et import Hyperplanning | Node 22, Express 5, MongoDB |
| `desktop/` | App Windows (.exe) | Tauri 2 + l'interface web |
| `mobile/` | App Android (.apk) | Expo SDK 58, React Native, EAS Build |
| `shared/core.js` | Logique commune : dates, récurrences, ajout rapide, alarmes, synchro | JavaScript |

```
 PC (Tauri)  ─┐                         ┌─ MongoDB Atlas
              ├──  HTTPS + jeton  ──  API (Render) ──┤
 Android ─────┘                         └─ Hyperplanning (lien iCal, toutes les 30 min)
```

Chaque appareil garde une copie locale. Hors ligne, tu continues à ajouter et modifier. Les changements partent dès que le réseau revient, et en cas de conflit, la modification la plus récente gagne.

---

## 1. Base de données : MongoDB Atlas (gratuit) 

1. Crée un compte sur [mongodb.com/atlas](https://www.mongodb.com/atlas), puis un cluster **M0 (Free)** en région Europe.
2. **Database Access** : crée un utilisateur avec un mot de passe.
3. **Network Access** : ajoute `0.0.0.0/0`. Render n'a pas d'adresse IP fixe en offre gratuite ; la base reste protégée par l'utilisateur et son mot de passe.
4. **Connect > Drivers** : copie la chaîne `mongodb+srv://…` en remplaçant `<password>`.

## 2. API : Render (gratuit)

1. Pousse ce dossier sur un dépôt GitHub.
2. Sur [render.com](https://render.com) : **New > Blueprint** et choisis le dépôt. Le fichier `render.yaml` configure tout et génère un `JWT_SECRET`.
3. Renseigne `MONGODB_URI` avec la chaîne Atlas quand Render la demande.
4. Une fois déployé, vérifie `https://<ton-service>.onrender.com/health`, qui doit répondre `{"ok":true}`.

En offre gratuite, Render met l'API en veille après 15 minutes sans requête. La première synchro suivante prend alors 30 à 50 secondes, et l'import Hyperplanning toutes les 10 minutes ne tourne pas pendant la veille.

**Pour garder l'API éveillée (gratuit) :** crée un compte sur [cron-job.org](https://cron-job.org) ou [UptimeRobot](https://uptimerobot.com) et ajoute une requête vers `https://<ton-service>.onrender.com/health` **toutes les 10 minutes**. Une seule app allumée en continu tient dans les 750 heures gratuites par mois de Render. Sans ce ping, tout fonctionne quand même : les apps travaillent sur leur copie locale, et l'import se fait à leur ouverture.

**Mets l'adresse de ton API** à ces deux endroits (elle est aussi modifiable dans Réglages > Serveur) :
- `desktop/web/config.js` → `apiUrl`
- `mobile/eas.json` → `EXPO_PUBLIC_API_URL`, dans les profils `preview` et `production`

### En local

```bash
cd api
cp .env.example .env    # puis remplis MONGODB_URI et JWT_SECRET
npm install
npm run dev             # http://localhost:3000
npm test                # lance une base MongoDB en mémoire et teste l'API
```

## 3. Lier Hyperplanning

Dans l'espace étudiant Hyperplanning, ouvre ton emploi du temps, clique sur l'icône **iCal** (export) et copie le lien. Colle-le dans l'app, dans **Réglages > Emploi du temps Hyperplanning**.

- C'est le serveur qui lit l'iCal, donc les cours arrivent sur tous tes appareils. Il le relit :
  - **à chaque ouverture de l'app** (ou retour sur la fenêtre), et attend jusqu'à 8 s pour t'afficher directement les cours à jour ;
  - **toutes les 10 minutes** en tâche de fond, même app fermée, réglable avec `HP_REFRESH_MIN` ;
  - **quand tu touches « Synchroniser maintenant »**.
- Garde-fou : jamais deux imports à moins de 60 secondes pour un même étudiant (`HP_MIN_GAP_SEC`), pour ne pas surcharger le serveur Hyperplanning de l'IUT. Deux demandes simultanées partagent le même import.
- Les cours importés sont en lecture seule : intitulé, horaire et salle suivent l'emploi du temps officiel. Tu peux y régler l'alarme, ajouter des notes ou les masquer.
- Un cours annulé ou retiré d'Hyperplanning disparaît à la synchro suivante.
- Le type est deviné à partir de l'intitulé : DS, examen ou soutenance → Évaluation ; SAÉ → SAÉ ; le reste → Cours.

## 4. App Windows (.exe)

À compiler **sur Windows** :

1. Installe [Rust](https://rustup.rs) et les **Microsoft C++ Build Tools** (charge de travail « Développement Desktop en C++ »). WebView2 est déjà présent sur Windows 10 et 11.
2. Dans un terminal :
   ```bash
   cd desktop
   npm install
   npm run dev      # test en fenêtre
   npm run build    # installeurs .exe et .msi
   ```
3. L'installeur est généré dans `desktop/src-tauri/target/release/bundle/nsis/Agend-A_1.0.0_x64-setup.exe`.

Fermer la fenêtre la **réduit dans la zone de notification** : les alarmes continuent de sonner, avec une notification Windows et la fenêtre qui revient au premier plan. Clic droit sur l'icône pour activer « Lancer au démarrage de Windows » ou quitter vraiment.

Pour changer l'icône : remplace `desktop/app-icon.png` (1024×1024), puis lance `npm run icons`.

## 5. App Android (.apk) avec EAS Build

```bash
cd mobile
npm install
npx expo install --fix        # aligne les versions sur le SDK 58
npm install -g eas-cli
eas login
eas init                      # crée le projet sur expo.dev et ajoute son projectId dans app.json
eas build -p android --profile preview
```

À la fin, EAS donne un lien et un QR code pour télécharger l'APK : ouvre-le sur ton téléphone et installe-le (autorise l'installation depuis ton navigateur si Android le demande). Le profil `production` produit un `.aab` pour le Play Store.

Pour développer : `npx expo start`. Les alarmes programmées marchent dans Expo Go, mais pour tester exactement comme l'APK, utilise un build (`eas build --profile preview`).

**Alarmes :** chaque événement peut avoir jusqu'à 4 rappels, de « à l'heure » à « 1 semaine avant ». Par défaut, un rendu sonne 1 semaine avant et la veille, une évaluation 1 semaine avant et 1 h avant. Dans l'ajout rapide, écris par exemple « rappel 1 semaine ».

**Alarmes sur Android :** elles sont programmées dans le système (`setAlarmClock`) pour les 14 prochains jours. Elles sonnent donc application fermée, téléphone verrouillé et après redémarrage. Au premier lancement, accepte les notifications. Sur Android 14+, vérifie aussi **Réglages > Alarmes** dans l'app : la permission « Alarmes et rappels » garantit la précision à la minute près. Chaque notification propose « Rappeler dans 5 min ». Si l'app est ouverte, un écran d'alarme plein écran s'affiche.

## 6. Modifier la logique commune

`shared/core.js` est la source. Après modification :

```bash
node scripts/sync-core.mjs    # recopie le fichier dans desktop/web et mobile/src
```

## Ce qui a été vérifié

- Tests de l'API (`npm test`) : inscription et connexion, conflits de synchro, import iCal Hyperplanning (cours, type, salle, enseignant), garde-fou d'une minute, import à l'ouverture de l'app, retrait d'un cours supprimé de l'emploi du temps, refus des liens non https ou internes.
- Synchro de bout en bout entre deux appareils simulés : création hors ligne puis envoi, modification sur le téléphone visible sur le PC, suppression propagée.
- Compilation du code Rust de l'app Windows (`cargo check`), bundle Android Expo, et génération de la config native (`expo prebuild`) avec les bonnes permissions.

Pas testé ici : le build final .exe sous Windows et l'APK sur un vrai téléphone, à faire de ton côté avec les commandes ci-dessus.
# calendar-mmi

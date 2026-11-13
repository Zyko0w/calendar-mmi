<p align="center">
  <img src="desktop/app-icon.png" width="128" alt="Logo Agend-A">
</p>

<h1 align="center">Agend-A</h1>

<p align="center">
  <strong>L'agenda avec alarmes pensé pour les étudiant·e·s de BUT MMI.</strong><br>
  Emploi du temps Hyperplanning, devoirs, rendus et évaluations, synchronisés entre le PC et le téléphone.
</p>

<p align="center">
  <img alt="Windows" src="https://img.shields.io/badge/Windows-.exe-0078D6?logo=windows&logoColor=white">
  <img alt="Android" src="https://img.shields.io/badge/Android-.apk-3DDC84?logo=android&logoColor=white">
  <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-24C8DB?logo=tauri&logoColor=white">
  <img alt="Expo SDK 58" src="https://img.shields.io/badge/Expo-SDK%2058-000020?logo=expo&logoColor=white">
  <img alt="Node 22" src="https://img.shields.io/badge/Node-22-339933?logo=nodedotjs&logoColor=white">
  <img alt="MongoDB" src="https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white">
</p>

<p align="center">
  <a href="#-présentation">Présentation</a> ·
  <a href="#-fonctionnalités">Fonctionnalités</a> ·
  <a href="#-plateformes">Plateformes</a> ·
  <a href="#-architecture">Architecture</a> ·
  <a href="#-structure-du-projet">Structure</a> ·
  <a href="#-démarrage-rapide">Démarrage</a> ·
  <a href="#-sécurité">Sécurité</a>
</p>

---

## 📖 Présentation

Agend-A réunit dans une seule app ton emploi du temps officiel et tout ce que tu dois rendre. Les cours arrivent
tout seuls depuis Hyperplanning, tu ajoutes tes rendus, SAÉ et évaluations en une phrase, et les alarmes sonnent au
bon moment sur ton PC comme sur ton téléphone, même hors ligne.

## ✨ Fonctionnalités

### 📅 Emploi du temps automatique
- **Import Hyperplanning** à partir du lien iCal : cours, salle, enseignant et type (Cours, SAÉ, Évaluation).
- Mise à jour **à chaque ouverture**, **toutes les 10 minutes** en tâche de fond, ou à la demande.
- Un cours annulé ou retiré disparaît tout seul ; les cours importés restent modifiables pour l'alarme, les notes
  ou le masquage.
- Alarmes groupées pour les cours Hyperplanning : un réglage unique s'applique à tous les cours importés.

### 🗓️ Vues
- **Aujourd'hui** : la journée en cours, le prochain créneau et le temps restant.
- **Semaine**, **Mois** et **Agenda** (liste chronologique), avec numéro de semaine et semestre.
- Thème **clair / sombre** (ou celui du système).

### ⏰ Alarmes fiables
- Jusqu'à **4 rappels par événement**, de « à l'heure » à « 1 semaine avant ».
- Rappels par défaut adaptés au type : un rendu sonne 1 semaine avant et la veille, une évaluation 1 semaine avant
  et 1 h avant.
- **Android** : alarmes système qui sonnent app fermée, téléphone verrouillé et après redémarrage, avec écran
  d'alarme plein écran et « Rappeler dans 5 min ».
- **Windows** : l'app reste dans la zone de notification, les alarmes passent par une notification Windows et la
  fenêtre revient au premier plan.

### ✍️ Ajout rapide
- Écris ton événement en une phrase (« rendu SAÉ vendredi 18h salle B204 rappel 1 semaine ») : date, heure,
  salle, type (rendu, évaluation, SAÉ, stage, cours…) et rappel sont reconnus.
- Événements récurrents.
- Rendus à cocher une fois faits.

### 📱 Widgets Android
Trois widgets pour l'écran d'accueil, en clair ou sombre selon le thème du téléphone :

| Widget | Contenu |
|---|---|
| **Prochain cours** | Le prochain cours ou rendu, avec le temps restant. |
| **Aujourd'hui** | La date et les créneaux de la journée. |
| **Journée et rendus** | La journée, les rendus et évaluations à venir, une case pour cocher un rendu et un bouton d'ajout rapide. |

Un appui sur un créneau ouvre directement l'événement dans l'app. Les widgets se mettent à jour à chaque
modification, synchro comprise.

### 🔐 Compte et double authentification
- Compte personnel par e-mail et mot de passe.
- **Double authentification (TOTP)** optionnelle, compatible Google Authenticator, Aegis, 2FAS, Microsoft
  Authenticator, 1Password…
- **Codes de secours** à usage unique, affichés une seule fois à l'activation.
- Suppression du compte et de toutes ses données depuis les réglages.

### 🔄 Synchronisation multi-appareils
- Les mêmes données sur le PC et le téléphone.
- **Fonctionne hors ligne** : chaque appareil garde sa copie locale et envoie les changements dès que le réseau
  revient. En cas de conflit, la modification la plus récente gagne.

## 💻 Plateformes

| Support | Format | Techno |
|---|---|---|
| 🖥️ Windows 10 / 11 | Installeur `.exe` / `.msi` | Tauri 2 + interface web (HTML/CSS/JS) |
| 📱 Android | `.apk` (ou `.aab` pour le Play Store) | Expo SDK 58, React Native |
| ☁️ Serveur | API de synchronisation | Node 22, Express 5, MongoDB Atlas, Render |

## 🧩 Architecture

```
 PC (Tauri)  ─┐                                      ┌─ MongoDB Atlas
              ├──  HTTPS + jeton  ──  API (Render)  ──┤
 Android ─────┘                                      └─ Hyperplanning (lien iCal)
```

La logique commune (dates, récurrences, ajout rapide, alarmes, synchro) est écrite une seule fois dans
[`shared/core.js`](shared/core.js), puis copiée dans chaque app par [`scripts/sync-core.mjs`](scripts/sync-core.mjs).

### API

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/health` | État du serveur |
| `POST` | `/auth/register` · `/auth/login` | Création de compte, connexion (avec code 2FA si activée) |
| `GET` · `DELETE` | `/me` | Profil, suppression du compte |
| `POST` | `/me/2fa/setup` · `/enable` · `/disable` | Gestion de la double authentification |
| `PUT` · `POST` | `/me/hyperplanning` · `/me/hyperplanning/sync` | Lien iCal, synchro à la demande |
| `PUT` | `/me/hyperplanning/alarms` | Alarmes groupées des cours importés |
| `GET` | `/events` | Événements modifiés depuis la dernière synchro |
| `PUT` · `DELETE` | `/events/:id` | Création / modification, suppression |

## 📁 Structure du projet

```
calendar-mmi/
├── api/              API Node/Express : comptes, 2FA, synchro, import Hyperplanning, tests
├── desktop/          App Windows (Tauri 2)
│   ├── web/          Interface (HTML, CSS, JS)
│   └── src-tauri/    Coque native Rust : zone de notification, notifications
├── mobile/           App Android (Expo / React Native)
│   └── src/
│       ├── screens/  Aujourd'hui, Semaine, Mois, Agenda, éditeur, réglages, 2FA, alarme
│       └── widgets/  Widgets d'écran d'accueil
├── shared/core.js    Logique commune aux deux apps
├── scripts/          Copie de shared/core.js dans desktop et mobile
├── render.yaml       Déploiement de l'API sur Render
└── INSTALLATION.md   Guide d'installation complet
```

## 🚀 Démarrage rapide

Prérequis : Node 22, un cluster MongoDB Atlas, Rust (pour l'app Windows) et Android Studio / EAS (pour l'APK).

```bash
# API
cd api
cp .env.example .env      # renseigner MONGODB_URI, JWT_SECRET…
npm install
npm run dev               # serveur local avec rechargement
npm test                  # tests

# App Windows
cd desktop
npm install
npm run dev               # lancement en développement
npm run build             # installeur .exe / .msi

# App Android
cd mobile
npm install
npm run android           # build et lancement sur un appareil
```

Toute la mise en place (base de données, déploiement de l'API, liaison Hyperplanning, compilation de l'app Windows
et de l'APK Android) est décrite pas à pas dans **[INSTALLATION.md](INSTALLATION.md)**.

## 🛡️ Sécurité

- Mots de passe hachés avec **bcrypt**, sessions par **jeton JWT** révocables (changement d'état 2FA = nouvelle session).
- Codes 2FA à usage unique et codes de secours stockés hachés.
- Limitation des tentatives de connexion, en-têtes HTTP durcis (**helmet**), validation de toutes les entrées.
- Les secrets (`.env`) ne sont jamais versionnés : voir [`api/.env.example`](api/.env.example).

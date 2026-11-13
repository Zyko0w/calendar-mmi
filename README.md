<p align="center">
  <img src="desktop/app-icon.png" width="120" alt="Logo Agend-A">
</p>

<h1 align="center">Agend-A</h1>

<p align="center">
  L'agenda avec alarmes pensé pour les étudiant·e·s de BUT MMI.<br>
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

---

## Présentation

Agend-A réunit dans une seule app ton emploi du temps officiel et tout ce que tu dois rendre. Les cours arrivent
tout seuls depuis Hyperplanning, tu ajoutes tes rendus, SAÉ et évaluations en une phrase, et les alarmes sonnent au
bon moment sur ton PC comme sur ton téléphone.

## Fonctionnalités

### 📅 Emploi du temps automatique
- **Import Hyperplanning** à partir du lien iCal : cours, salle, enseignant et type (Cours, SAÉ, Évaluation).
- Mise à jour **à chaque ouverture**, **toutes les 10 minutes** en tâche de fond, ou à la demande.
- Un cours annulé ou retiré disparaît tout seul ; les cours importés restent modifiables pour l'alarme, les notes
  ou le masquage.

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

### 🔄 Synchronisation multi-appareils
- Les mêmes données sur le PC et le téléphone, avec un compte personnel.
- **Fonctionne hors ligne** : chaque appareil garde sa copie locale et envoie les changements dès que le réseau
  revient. En cas de conflit, la modification la plus récente gagne.

## Plateformes

| Support | Format | Techno |
|---|---|---|
| 🖥️ Windows 10 / 11 | Installeur `.exe` / `.msi` | Tauri 2 + interface web |
| 📱 Android | `.apk` (ou `.aab` pour le Play Store) | Expo SDK 58, React Native |
| ☁️ Serveur | API de synchronisation | Node 22, Express 5, MongoDB Atlas, Render |

## Architecture

```
 PC (Tauri)  ─┐                                   ┌─ MongoDB Atlas
              ├──  HTTPS + jeton  ──  API (Render) ──┤
 Android ─────┘                                   └─ Hyperplanning (lien iCal)
```

La logique commune (dates, récurrences, ajout rapide, alarmes, synchro) est écrite une seule fois dans
[`shared/core.js`](shared/core.js) et partagée par les deux apps.

## Installation et déploiement

Toute la mise en place (base de données, API, liaison Hyperplanning, compilation de l'app Windows et de l'APK
Android) est décrite pas à pas dans **[INSTALLATION.md](INSTALLATION.md)**.

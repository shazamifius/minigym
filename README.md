# 💪 MiniGym - Suivi de Pompes & Duel entre Potes (avec Heatmap GitHub)

Une application web moderne, légère et auto-hébergée sur GitHub, conçue pour tracker ses séries de pompes, se défier entre potes en temps réel, et admirer sa progression avec une **heatmap de contributions façon GitHub (carrés verts)**.

---

## 🚀 Fonctionnalités Clés

1. **🥊 Duel en direct :**
   - Comparaison en temps réel entre **toi (Shaza)** et **ta pote**.
   - Indicateur du leader du jour avec couronne dorée 👑 et calcul automatique de l'écart de répétitions.
   - Barre de progression dynamique et comparaison sur les 7 derniers jours.

2. **⚡ Ajout ultra-rapide de pompes :**
   - Gros boutons tactiles instantanés : `+5`, `+10`, `+15`, `+20`, `+30`, `+50`.
   - Bouton `+ Personnalisé` pour entrer n'importe quel montant (ex: 25, 40, 100).
   - Sélecteur de profil rapide pour noter pour soi ou pour son pote.
   - Son de validation interactif (synthèse audio native, sans téléchargement).
   - Bouton **Annuler** immédiat en cas d'erreur de clic.

3. **📊 Profil & Statistiques :**
   - **Total de pompes** réalisées.
   - **Série en cours (Streak 🔥)** en jours consécutifs.
   - **Record personnel (PR ⚡)** en 1 seule journée.
   - **Moyenne quotidienne**.

4. **🟩 Heatmap de Contributions Style GitHub ("les carrés verts") :**
   - Grille complète sur **52 semaines (dernière année)**.
   - 5 niveaux d'intensité de vert GitHub :
     - ⬛ `0` pompe : Case sombre
     - 🟩 `1 - 24` pompes : Vert discret
     - 🟩 `25 - 49` pompes : Vert moyen
     - 🟩 `50 - 99` pompes : Vert soutenu
     - 🟩 `100+` pompes : Vert lumineux intense ✨
   - Tooltip interactif au survol / toucher affichant la date exacte et le nombre de pompes.
   - Bascule en 1 clic pour inspecter ta heatmap ou celle de ta pote !

5. **☁️ Stockage & Synchro GitHub (Dépôt Privé) :**
   - Aucune base de données payante nécessaire : tout est stocké dans `data.json` sur ton dépôt GitHub privé.
   - Chaque série enregistrée committe automatiquement sur GitHub.
   - **Bonus génial :** En activant l'affichage des *"Private contributions"* sur ton profil GitHub (`Settings` > `Public profile` > `Contributions & Activity`), tes vrais carrés de profil GitHub s'allumeront aussi en vert !

---

## 📱 Comment Lancer et Utiliser MiniGym

### Option 1 : Utilisation Immédiate (Local / Navigateur)
Double-clique simplement sur le fichier `index.html` pour l'ouvrir dans Chrome, Firefox, Safari ou Edge. L'application est 100% autonome et fonctionnelle.

### Option 2 : Sur Smartphone (iPhone / Android) comme une vraie App (PWA)
1. Ouvre la page dans Safari (iOS) ou Chrome (Android).
2. Appuie sur **Partager** (sur iOS) ou le menu **⋮** (sur Android).
3. Sélectionne **"Sur l'écran d'accueil"** (Add to Home Screen).
4. MiniGym s'ouvrira en plein écran comme une application native sans barre d'adresse !

### Option 3 : En ligne 100% gratuit via Vercel ou Cloudflare Pages
Comme ton dépôt GitHub est privé, GitHub Pages nécessite un abonnement Pro pour les repos privés. Mais tu peux héberger le frontend gratuitement en 30 secondes :
1. Va sur [Vercel](https://vercel.com) ou [Cloudflare Pages](https://pages.cloudflare.com).
2. Connecte ton compte GitHub et choisis le dépôt privé `shazamifius/minigym`.
3. Clique sur **Deploy**. Tu obtiendras une URL HTTPS privée (ex: `https://minigym.vercel.app`) accessible depuis ton smartphone et celui de ta pote !

---

## 🔑 Gestion du Token GitHub & Invitation de ta Pote

> [!IMPORTANT]
> **Ton token GitHub expire bientôt :**
> Le token que tu as partagé expire demain. Voici la procédure ultra simple pour le renouveler et inviter ta pote :

### 1. Renouveler ton Token d'accès (PAT)
1. Va sur GitHub : **Paramètres** (`Settings`) > tout en bas **Developer Settings** > **Personal access tokens** > **Tokens (classic)** (ou [ce lien direct](https://github.com/settings/tokens)).
2. Clique sur **"Generate new token (classic)"**.
3. Donne-lui un nom (ex: `MiniGym Token`), choisis la durée (ex: 90 jours ou No expiration).
4. Coche la case **`repo`** (accès aux dépôts privés).
5. Clique sur **Generate token** et copie-le.
6. Ouvre MiniGym, va dans l'onglet **⚙️ Paramètres**, colle le nouveau token et clique sur **Sauvegarder & Tester**. Le token reste stocké uniquement dans le navigateur de ton téléphone / PC (dans `localStorage`), il n'est jamais rendu public !

### 2. Comment donner accès à ta Pote
1. Va sur ton dépôt GitHub : [https://github.com/shazamifius/minigym/settings/access](https://github.com/shazamifius/minigym/settings/access)
2. Clique sur **"Add people"** et invite le pseudo GitHub de ta pote.
3. Ta pote accepte l'invitation reçue par email.
4. Ta pote génère son propre token GitHub (avec la permission `repo`) de la même façon que toi.
5. Elle ouvre MiniGym, va dans **⚙️ Paramètres** :
   - Elle colle son token.
   - Dans *"Mon identité par défaut"*, elle sélectionne **Joueur 2 (Pote)**.
6. Dès qu'elle appuie sur `+20 pompes`, son score s'enregistre sur GitHub et s'affiche instantanément sur vos deux écrans !

---

## 📁 Structure du Projet

```text
minigym/
├── index.html       # Interface principale (Design Dark GitHub, Duel, Stats, Heatmap)
├── app.js           # Moteur applicatif, calculs stats, heatmap SVG, synchro GitHub API
├── data.json        # Base de données des pompes synchronisée sur GitHub
├── manifest.json    # Configuration PWA pour installation mobile
├── sw.js            # Service Worker pour le fonctionnement hors ligne
└── README.md        # Documentation complète
```

# Intraday Reversal Engine

Dashboard React pour analyser des setups de fade de gap intraday avec décision automatique basée sur agrégation bayésienne de signaux. Données live via Yahoo Finance (proxy CORS).

## Stack

- React 18 + Vite (build ultra-rapide, bundle léger)
- Aucune dépendance externe au runtime sauf React lui-même
- Données : Yahoo Finance via proxy CORS public

---

## 1. Tester en local

Prérequis : Node.js 18+ installé ([nodejs.org](https://nodejs.org)).

```bash
npm install
npm run dev
```

Ouvre `http://localhost:5173` dans ton navigateur.

Pour builder en production localement :

```bash
npm run build
npm run preview
```

---

## 2. Pousser sur GitHub

Crée un compte sur [github.com](https://github.com) si tu n'en as pas, puis crée un nouveau repo (par exemple `intraday-reversal-engine`). **Laisse-le vide** (pas de README, .gitignore ou licence — on les a déjà).

Dans le terminal, depuis le dossier du projet :

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/TON-USERNAME/intraday-reversal-engine.git
git push -u origin main
```

Remplace `TON-USERNAME` par ton username GitHub. À la première push GitHub te demandera de t'authentifier (token ou GitHub CLI).

---

## 3. Déployer sur Render

1. Va sur [render.com](https://render.com) et crée un compte (login via GitHub recommandé pour gagner du temps).
2. Clique **New +** en haut à droite → **Static Site**.
3. Connecte ton compte GitHub si pas déjà fait, puis sélectionne le repo `intraday-reversal-engine`.
4. Render détecte automatiquement les paramètres depuis `render.yaml`. Vérifie quand même :
   - **Name** : `intraday-reversal-engine` (ou ce que tu veux — ça donne ton URL `intraday-reversal-engine.onrender.com`)
   - **Branch** : `main`
   - **Build Command** : `npm install && npm run build`
   - **Publish Directory** : `dist`
5. Clique **Create Static Site**.

Le premier build prend 2–4 minutes. Une fois terminé, ton URL publique est affichée en haut de la page Render.

À chaque `git push` sur `main`, Render redéploie automatiquement.

---

## 4. Domaine custom (optionnel)

Dans Render → Settings du site → **Custom Domains** → Add domain. Render te donne un CNAME à ajouter chez ton registrar (Gandi, Namecheap, OVH...). HTTPS automatique via Let's Encrypt.

---

## Alternatives à Render

Toutes ces options déploient le même build (`dist/`) gratuitement :

- **Vercel** : `npm i -g vercel && vercel` depuis le dossier. Le plus simple.
- **Netlify** : drag-and-drop du dossier `dist/` sur netlify.com, ou connexion GitHub.
- **Cloudflare Pages** : connecte GitHub, build command `npm run build`, output `dist`.
- **GitHub Pages** : possible mais nécessite un peu plus de config (`vite.config.js` avec `base: '/nom-du-repo/'`).

---

## Limites connues

- **Proxy CORS public** : `corsproxy.io` et `allorigins.win` sont gratuits mais parfois rate-limités. Si ça plante en prod, soit :
  - Héberger ton propre proxy (un serveur Node avec `cors-anywhere`, déployable sur Render Web Service pour 7$/mois)
  - Passer à une vraie API : [Polygon.io](https://polygon.io) (free tier 5 req/min), [Twelve Data](https://twelvedata.com), [Alpha Vantage](https://alphavantage.co), [Finnhub](https://finnhub.io). Stocker la clé API dans les **Environment Variables** de Render et l'utiliser dans le code via `import.meta.env.VITE_API_KEY`.
- **Données Yahoo** : différées de 15-20 min sur actions US. Pour du vrai temps réel, payer un feed.

---

## Structure du projet

```
intraday-reversal-engine/
├── index.html              # Entry HTML
├── package.json            # Dépendances
├── vite.config.js          # Config build
├── render.yaml             # Config déploiement Render
├── .gitignore
├── README.md
└── src/
    ├── main.jsx            # Entry React
    ├── App.jsx             # Root component
    └── StrategyAnalyzer.jsx  # Composant principal
```

## Personnaliser

- **Calibrer les LRs bayésiens** : éditer la fonction `calc` dans `StrategyAnalyzer.jsx`. Les multiplicateurs (1.4 pour VIX optimal, 2.0 pour retest échoué, etc.) sont des estimations à ajuster sur ton journal de trades.
- **Ajouter des timeframes** : section "fetchAll" → ajouter dans `configs`. Le tableau MTF en bas s'adapte automatiquement.
- **Changer le seuil de décision** : 0.65 (taille réduite) et 0.75 (taille pleine) dans la section "Decision" de `calc`.

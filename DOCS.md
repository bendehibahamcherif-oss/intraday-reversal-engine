# Documentation — Intraday Reversal Engine

Documentation complète de la stratégie, des indicateurs, de la logique de décision et de la personnalisation. Toutes les références au code pointent vers `src/StrategyAnalyzer.jsx`.

---

## Table des matières

1. [Stratégie globale](#1-stratégie-globale)
2. [Indicateurs de marché](#2-indicateurs-de-marché)
3. [Confirmations setup](#3-confirmations-setup-manuelles)
4. [Filtres jour](#4-filtres-jour-hard-blocks)
5. [Agrégation bayésienne](#5-agrégation-bayésienne)
6. [Logique de décision](#6-logique-de-décision-en-cascade)
7. [Plan de trade](#7-plan-de-trade)
8. [Personnalisation](#8-personnalisation)
9. [Architecture technique](#9-architecture-technique)

---

## 1. Stratégie globale

### Le pari de fond

On suppose qu'**un mouvement directionnel violent en début de séance, sans catalyseur fondamental, a une probabilité supérieure à 50% de se retracer partiellement dans la même journée**. C'est ce qu'on appelle un "gap fade" ou un "opening range fade". Statistiquement, sur indices US et large caps liquides hors jours de news, le taux de remplissage des gaps modérés (< 1× ATR) tourne autour de 55–65%.

On exprime ce pari avec une option ATM à 3 mois pour 4 raisons :
1. **Delta ≈ 0.50** → exposition directionnelle correcte au sous-jacent
2. **Theta faible** (~0.5–1% du premium par jour) → coût de portage négligeable sur 5h
3. **Gamma modéré** → P&L lisse, pas de pin risk
4. **Liquidité** → spread bid-ask raisonnable

### Le workflow

```
1. Avant l'ouverture : vérifier les filtres news (FOMC, earnings, CPI...)
2. À l'ouverture : observer le gap et son contexte (VIX, breadth)
3. Attendre 60 min : laisser l'opening range se former
4. Évaluer le contexte : taille du gap vs ATR, range 1H vs daily, alignement MTF
5. Attendre le trigger : retest échoué de l'extrême + candle de rejet + divergence
6. Calculer la proba bayésienne : si ≥ 65% → entrée taille réduite, ≥ 75% → taille pleine
7. Placer stop sur le sous-jacent au-delà de l'extrême 1H + 0.2 ATR
8. Cible : retour au milieu de l'opening range, puis extrême opposé
9. Time stop à 14h30 (heure US) pour éviter accélération theta + MOC
```

### Pourquoi cette approche bayésienne

Aucun indicateur n'a un edge décisif tout seul. La force du système vient de **combiner plusieurs signaux faibles décorrélés**. Un signal seul peut être bruit ; trois signaux convergents qui mesurent des dimensions différentes (volatilité, structure de prix, flux) donnent un edge réel. Le framework bayésien permet de quantifier cette combinaison de façon mathématique plutôt qu'à l'instinct.

---

## 2. Indicateurs de marché

### 2.1 ATR — Average True Range

**Quoi** : Mesure de la volatilité réalisée du sous-jacent, exprimée en dollars. C'est la moyenne sur 14 jours du "true range" quotidien (max entre high-low, |high-prevClose|, |low-prevClose|).

**Pourquoi** : Sert de **dénominateur de normalisation** pour comparer un gap à la volatilité habituelle. Un gap de 5$ sur un titre à ATR 2$ est énorme ; un gap de 5$ sur un titre à ATR 10$ est insignifiant.

**Interprétation** :
- `ATR(14) daily` = combien le titre bouge en moyenne par jour
- Si `Gap / ATR > 1.5` → événement anormal, probable news non sourcée → ne pas fader

**Où dans le code** :
- Fonction `atr(bars, period = 14)` ligne ~85
- Utilisé dans `calc.gapAtrRatio` ligne ~285 pour le régime "gap"

**Customisation** :
- Période : changer `atr(bars.slice(-30), 14)` à `atr(bars.slice(-30), 20)` pour lisser davantage
- Seuils de régime : modifier les valeurs `0.5`, `1.0`, `1.5` dans la section `gapRegime` ligne ~290

---

### 2.2 EMA — Exponential Moving Average

**Quoi** : Moyenne mobile pondérée qui donne plus de poids aux prix récents. EMA(20) = moyenne lissée sur 20 bars du timeframe considéré.

**Pourquoi** : Détecte la **direction de la tendance**. Si prix > EMA20 > EMA50, la tendance est haussière sur ce timeframe.

**Interprétation** (par timeframe) :
- Prix > EMA20 et EMA20 > EMA50 → trend haussier
- Prix < EMA20 et EMA20 < EMA50 → trend baissier
- Sinon → mixte / consolidation

**Où dans le code** :
- Fonction `ema(values, period)` ligne ~67
- Calculée pour chaque timeframe dans `tfIndicators` ligne ~210
- Détermination du `trend` lignes ~220–230

**Customisation** :
- Périodes : changer `ema(closes.slice(-50), 20)` pour utiliser EMA9/EMA21 (plus réactif) ou EMA50/EMA200 (plus structurel)
- Ajouter EMA200 sur le daily pour filtrer les trends macro

---

### 2.3 RSI — Relative Strength Index

**Quoi** : Oscillateur 0–100 qui mesure le ratio entre les gains et les pertes récents sur une période (14 bars par défaut).

**Pourquoi** : Détecte la **surextension** d'un mouvement. Un RSI > 70 sur intraday signale un achat probablement trop appuyé, candidat au fade. RSI < 30 = symétrique pour les puts.

**Interprétation** :
- RSI > 75 sur 5m **ou** > 70 sur 15m → surextension haussière confirmée → soutient un fade ↓ (acheter des puts)
- RSI < 25 sur 5m **ou** < 30 sur 15m → surextension baissière → soutient un fade ↑ (acheter des calls)
- Entre 45 et 55 → pas de surextension, signal neutre

**Subtilité importante** : un RSI extrême sur 1m est presque toujours bruité. La règle "5m **ou** 15m" demande que la surextension soit visible sur au moins un timeframe significatif.

**Où dans le code** :
- Fonction `rsi(closes, period = 14)` ligne ~73
- Logique de signal dans `rsiExtremeLR` ligne ~325

**Customisation** :
- Seuils : changer `75`, `70`, `25`, `30` pour des seuils plus stricts (80/20) ou plus permissifs (65/35)
- Ajouter une condition sur RSI 30m si tu veux exiger 3 timeframes en surachat

---

### 2.4 VIX

**Quoi** : Indice de volatilité implicite des options S&P 500 à 30 jours. Le "fear gauge" du marché.

**Pourquoi** : Le **régime de volatilité** détermine si les stratégies mean-reverting fonctionnent. En vol modérée (15–25), les retracements dominent. En vol extrême (> 30), les trends persistent et les fades se font détruire.

**Interprétation** :
| VIX | Régime | LR |
|-----|--------|----|
| < 12 | Trop bas — ranges serrés, pas assez de mouvement à fader | 0.9 |
| 12–25 | Optimal pour fade | 1.4 |
| 25–30 | Tendu — prudence | 0.7 |
| > 30 | Panique — **HARD BLOCK**, ne pas fader | 0.4 + blocage |

**Où dans le code** :
- Fetché séparément via `^VIX` ligne ~155
- Régime calculé dans `vixRegime` ligne ~272
- Hard block ligne ~362 (`vixBlock`)

**Customisation** :
- Si tu trades sur indices européens, remplacer par `^VSTOXX` (Euro Stoxx 50)
- Pour les single names, le VIX est une approximation — l'IV individuelle de l'option serait plus précise mais demanderait un feed payant

---

### 2.5 Gap normalisé (Gap / ATR)

**Quoi** : `(prix_actuel − clôture_veille) / ATR(14)`. Mesure la taille du gap d'ouverture en unités de volatilité quotidienne.

**Pourquoi** : Un nombre absolu de dollars n'a aucun sens — il faut le rapporter à la volatilité du sous-jacent. Cette normalisation rend la stratégie applicable à n'importe quel ticker.

**Interprétation** :
| Gap/ATR | Régime | Action |
|---------|--------|--------|
| < 0.5 | Petit gap | Fadable, mais mouvement potentiel limité (LR 1.3) |
| 0.5–1.0 | Modéré | Sweet spot du fade (LR 1.5) |
| 1.0–1.5 | Large | Prudence, peut être une vraie info (LR 0.8) |
| > 1.5 | Extrême | **HARD BLOCK** — événement probable, danger de continuation |

**Où dans le code** :
- Calcul ligne ~257 : `gapAtrRatio = Math.abs(gap) / atr14`
- Régime ligne ~287
- Hard block ligne ~363

**Customisation** : Si tu trades des stocks à fort momentum (TSLA, NVDA), le seuil 1.5 peut être trop conservateur — les gaps de 2× ATR sur ces noms ne sont pas toujours des news. À calibrer empiriquement.

---

### 2.6 Range première heure (Opening Range)

**Quoi** : Plus haut et plus bas observés pendant les 60 premières minutes de la session. Calculé à partir des bars 5m du jour.

**Pourquoi** : La première heure établit le **terrain de jeu** de la journée. La taille de ce range prédit fortement si la journée sera trending ou rangeante.

**Interprétation** :
- `range_1H / range_moyen_20j < 30%` → range faible, journée probable de consolidation, fades favorisés (LR 1.5)
- `< 50%` → range modéré, neutre
- `> 50%` → **HARD BLOCK** — trend day quasi certain, les fades se font massacrer

**Le piège classique** : la plupart des "trend days" se reconnaissent dans la première heure par un range supérieur à 50% du range journalier moyen. C'est le filtre le plus important du système.

**Où dans le code** :
- Fonction `firstHourOR(intradayBars)` ligne ~111
- Régime ligne ~295 : `trendRisk`
- Hard block ligne ~365

**Customisation** :
- Changer la fenêtre de 60 min à 30 min ou 90 min : modifier `60 * 60 * 1000` dans `firstHourOR`
- Seuils 30%/50% à ajuster selon ton sous-jacent — sur SPY le 50% est strict, sur des stocks volatiles c'est trop bas

---

### 2.7 Breadth pré-marché

**Quoi** : Pourcentage des composantes du secteur du ticker qui bougent dans la même direction en pré-marché.

**Pourquoi** : Distingue un **mouvement idiosyncratique** (un seul titre bouge, candidat au fade) d'un **mouvement institutionnel** (tout le secteur bouge ensemble, momentum réel à éviter de fader).

**Interprétation** :
| Breadth | Régime | LR |
|---------|--------|----|
| < 60% | Mixte — mouvement idiosyncratique, fadable | 1.3 |
| 60–75% | Penchée — direction sectorielle modérée | 0.9 |
| > 75% | Unilatérale — flux institutionnel, ne pas fader | 0.5 |

**Limitation** : Cette donnée est **manuelle** dans le système actuel. Pour l'automatiser il faudrait récupérer en parallèle les pré-marchés des 10–30 composantes du secteur du ticker — faisable mais demanderait 30+ requêtes Yahoo par évaluation. Pour l'instant, à saisir à la main en regardant Finviz ou TradingView.

**Où dans le code** :
- Variable `premarketBreadth` ligne ~178
- Régime ligne ~302

**Customisation** : Si tu trades surtout des ETFs index (SPY, QQQ), tu peux ignorer ce filtre ou utiliser à la place le ratio advance/decline du NYSE.

---

### 2.8 Alignement multi-timeframe (MTF)

**Quoi** : Vérification que les tendances détectées sur les 4 timeframes intraday (5m, 15m, 30m, 1h) ne contredisent pas le trade envisagé.

**Pourquoi** : Si toutes les TF intraday trendent dans le sens du mouvement qu'on veut fader, c'est qu'on est face à un **mouvement structurel**, pas une surextension temporaire. Le fade serait suicidaire.

**Interprétation** :
- **Supports le fade** (LR 1.5) : ≥ 50% des TF intraday trendent dans le sens **opposé** au mouvement → divergence saine, le retournement est déjà en construction
- **Mixte** (LR 1.0) : signaux ambigus
- **Contre le fade** (LR 0.5 + **HARD BLOCK**) : toutes les TF intraday alignées avec le mouvement → momentum confirmé sur toutes les échelles

**Où dans le code** :
- Calcul lignes ~308–320
- Hard block ligne ~366

**Customisation** :
- Ajouter la 1m dans la liste pour plus de réactivité (risque de bruit)
- Pondérer les timeframes (donner plus de poids au 1h qu'au 5m)
- Inclure le daily comme contexte mais pas comme contributeur à l'alignement (déjà le cas)

---

## 3. Confirmations setup (manuelles)

Ces trois confirmations sont **les triggers d'entrée**. Sans elles, même un score bayésien élevé reste théorique. Tu dois les valider visuellement sur ton chart avant d'entrer.

### 3.1 Retest échoué de l'extrême OR

**Quoi** : Le prix revient toucher (ou casser brièvement) le plus haut/bas de l'opening range, puis rejette sans tenir au-dessus/dessous.

**Pourquoi** : C'est la signature d'un **liquidity grab** — les market makers vont chercher les stops au-dessus du plus haut, puis renversent. Sans ce retest, le trade est prématuré.

**LR** : 2.0 (le signal le plus fort du système)

**Où dans le code** : Toggle `failedRetest` ligne ~178, ajouté aux signaux ligne ~337

### 3.2 Divergence volume / CVD

**Quoi** : Le prix fait un nouveau plus haut (ou bas) mais le volume ou le Cumulative Volume Delta diverge — pas de confirmation du flux.

**Pourquoi** : Un mouvement sans volume = pas de conviction réelle. C'est typiquement une extension épuisée.

**LR** : 1.6

### 3.3 Candle de rejet

**Quoi** : Bougie avec longue mèche dans la direction du mouvement (shooting star, hammer, bearish/bullish engulfing inversé).

**Pourquoi** : Signature visuelle classique du rejet de prix à un niveau important.

**LR** : 1.4

---

## 4. Filtres jour (Hard Blocks)

Ces toggles sont des **annulations sèches** — peu importe le score bayésien, le trade est interdit.

### 4.1 Hard blocks
- **FOMC / Annonce Fed** : volatilité directionnelle imprévisible
- **Earnings du ticker** : événement binaire, gap réaction garanti
- **Data macro (CPI, NFP, PMI)** : mouvement souvent persistant pendant 1–2h

Pourquoi sec : le risque d'IV crush + de continuation du mouvement rend l'espérance fortement négative.

### 4.2 Cautions (taille divisée par 2 mais pas bloquant)
- **OPEX (3e vendredi)** : flux de hedging mécaniques peuvent dominer
- **Fin de mois/trimestre** : rééquilibrages des fonds
- **VIX expiry** (mercredi pré-OPEX) : décrochages possibles

**Où dans le code** : Lignes ~351–360

---

## 5. Agrégation bayésienne

### Le principe mathématique

On part d'un **prior** P(retournement) = 55% (taux de remplissage moyen des gaps modérés). Pour chaque signal, on calcule un **likelihood ratio** :

```
LR = P(signal | retournement) / P(signal | continuation)
```

LR > 1 → le signal augmente la probabilité de retournement
LR < 1 → le signal la diminue
LR = 1 → neutre

On combine les LRs en **odds** :

```
odds_final = odds_prior × LR_1 × LR_2 × ... × LR_n
P_posterior = odds_final / (1 + odds_final)
```

### Pourquoi pas une moyenne ou une somme

Une moyenne traiterait tous les signaux comme également informatifs. Le produit des LRs respecte le poids d'information de Bayes : un signal très discriminant (LR 2.0) compte beaucoup plus qu'un signal marginal (LR 1.1).

### Limitation importante : la décorrélation

Cette formule **suppose les signaux indépendants**. En pratique, certains signaux sont corrélés (RSI extrême et touche Bollinger mesurent la même chose). Multiplier les LRs de signaux corrélés **surestime la confiance**.

Mitigation dans le système actuel : on a choisi des signaux qui mesurent des dimensions différentes :
- VIX = régime macro
- Gap/ATR = magnitude de l'événement
- Range 1H = structure intraday
- Breadth = flux sectoriel
- MTF alignment = structure technique
- RSI extrême = positionnement
- Confirmations (retest, volume, candle) = price action

**Où dans le code** : Lignes ~333–349

---

## 6. Logique de décision en cascade

L'ordre des vérifications est crucial — les hard blocks sont évalués **avant** le score bayésien :

```
1. Jour de news ? → NO TRADE (sec)
2. Trop tôt (< 60 min) ? → ATTENDRE
3. VIX > 30 ? → NO TRADE
4. Gap > 1.5× ATR ? → NO TRADE
5. Range 1H > 50% daily ? → NO TRADE
6. MTF tout aligné contre le fade ? → NO TRADE
7. Setup pas confirmé (retest+candle) ? → ATTENDRE SETUP
8. P(reversal) ≥ 75% ? → ACHETER (taille pleine)
9. P(reversal) ≥ 65% ? → ACHETER (1/2 taille)
10. Sinon → NO TRADE
```

**Pourquoi cet ordre** : les hard blocks éliminent les contextes où la stratégie a une **espérance négative connue**. Le score bayésien ne sert qu'à différencier les setups dans les contextes restants. Sauter cette hiérarchie reviendrait à faire un trade avec un score 80% en pleine panique VIX > 35 — perte presque garantie.

**Où dans le code** : Lignes ~370–388

---

## 7. Plan de trade

### Stop loss (sur le sous-jacent)

```javascript
stop = extrême_OR ± 0.2 × ATR
```

Le `0.2 × ATR` ajoute un buffer pour éviter les faux déclenchements sur la mèche d'une bougie unique. Le stop est **sur le sous-jacent**, pas sur le premium de l'option, parce que l'IV peut bouger ton premium sans que la thèse soit cassée.

### Cibles

- **Cible 1** : milieu de l'opening range (mid-OR) — partial exit à 50% de la position
- **Cible 2** : extrême opposé de l'OR — exit complet

### Time stop

Sortie obligatoire à **14h30 (heure US)** soit 1h avant la clôture, pour éviter :
- L'accélération du theta sur l'option
- Le bruit des imbalances MOC (Market On Close)
- Le risque de news after-hours sans pouvoir sortir

### Position sizing

```
risque_max_par_trade = compte × risque_%
perte_par_contrat = distance_stop × delta_option × 100
contrats = floor(risque_max / perte_par_contrat) × sizeMultiplier
```

Le `sizeMultiplier` vient du score bayésien (1.0 si ≥ 75%, 0.5 si ≥ 65%) et est divisé par 2 supplémentaire en jour OPEX/fin de mois.

**Où dans le code** : Lignes ~390–402

---

## 8. Personnalisation

### Calibrer les likelihood ratios sur ton historique

**Étape 1** : Tenir un journal pendant 50+ trades minimum. Pour chaque trade, noter :
- L'état de chaque signal au moment de l'entrée (VIX value, gap/ATR, RSI 5m, MTF alignment, etc.)
- Le résultat (gagnant / perdant)

**Étape 2** : Calculer empiriquement chaque LR :

```
LR_signal = (taux de gain | signal actif) / (taux de gain | signal inactif)
```

Exemple : tu trouves que sur tes trades avec retest échoué confirmé, tu gagnes 78% du temps. Sans, tu gagnes 52%. Alors LR_retest = 0.78/0.52 ≈ 1.5 (et pas 2.0 comme dans le code par défaut).

**Étape 3** : Mettre à jour les valeurs dans la section `signals` ligne ~333.

### Ajouter un nouvel indicateur

Exemple : ajouter un signal "VWAP intraday" (prix < VWAP soutient fade ↑).

1. Calculer le VWAP dans `tfIndicators` (fonction à ajouter dans la section indicators)
2. Calculer le signal dans `calc` (ex. `vwapSignal = currentPrice < vwap ? 'below' : 'above'`)
3. Ajouter au tableau `signals` :
   ```javascript
   { name: 'Position vs VWAP', value: vwapSignal, lr: vwapSignal === 'below' && direction === 'fade_up' ? 1.4 : 1.0 }
   ```

### Changer les seuils de décision

Lignes ~378–385 :
```javascript
else if (posterior >= 0.75) { /* taille pleine */ }
else if (posterior >= 0.65) { /* demi taille */ }
```

Plus conservateur : 0.80 / 0.70. Plus agressif : 0.65 / 0.58.

### Modifier le sizing

Le multiplicateur par défaut (1.0 / 0.5) peut devenir une fonction continue du posterior :

```javascript
sizeMultiplier = Math.max(0, Math.min(1, (posterior - 0.55) / 0.25));
// 55% → 0, 80% → 1
```

### Modifier la fenêtre de l'opening range

Dans `firstHourOR` ligne ~111, changer `60 * 60 * 1000` :
- 30 min : `30 * 60 * 1000` (plus réactif, plus de bruit)
- 90 min : `90 * 60 * 1000` (plus stable, manque d'opportunités)

---

## 9. Architecture technique

### Stack

- **Frontend** : React 18 + Vite, déployé en Static Site Render
- **Backend** : Node/Express, déployé en Web Service Render Starter
- **Data source** : Yahoo Finance (différé 15–20 min sur actions US)

### Flux de données

```
[Browser React]
    ↓ GET /yahoo/chart/SPY?interval=5m&range=1d
[Backend Express sur Render]
    ↓ check cache (30s TTL)
    ↓ si miss → GET query1.finance.yahoo.com avec User-Agent navigateur
    ↑ response
    ↓ stored in cache
    ↑ JSON to browser
[React parse, calcule indicateurs, render]
```

### Pourquoi le backend

Trois raisons :
1. **CORS** : Yahoo n'autorise pas les requêtes navigateur directes
2. **Rate limiting** : Le User-Agent navigateur évite les blocages anti-bot
3. **Cache** : Évite de re-fetcher les mêmes données quand plusieurs onglets sont ouverts ou en auto-refresh

### Sécurité

- `ALLOWED_ORIGINS` doit être restreint en production à ton domaine frontend uniquement
- Validation regex sur tous les paramètres (`VALID_INTERVALS`, `VALID_RANGES`, `VALID_SYMBOL`)
- Timeout 8s sur les fetch upstream pour éviter les requêtes pendantes

### Évolutions possibles

- **Polygon.io / Twelve Data** : remplacer Yahoo par un vrai feed payant. Clé API dans env var du backend, jamais exposée au client.
- **Cache Redis** : si tu déploies plusieurs instances, partager le cache
- **WebSocket** : pour du vrai temps réel (Polygon le supporte)
- **Historique de trades** : ajouter une base de données pour logger chaque évaluation et faire du backtest sur ton historique

---

## Annexe : Glossaire

| Terme | Définition |
|-------|------------|
| **ATM** | At-The-Money — strike de l'option = prix du sous-jacent |
| **ATR** | Average True Range — mesure de volatilité réalisée |
| **CVD** | Cumulative Volume Delta — somme cumulée des volumes acheteur - vendeur |
| **Delta** | Sensibilité du prix d'une option au prix du sous-jacent |
| **EMA** | Exponential Moving Average |
| **Gamma** | Sensibilité du delta au prix du sous-jacent |
| **IV** | Implied Volatility — volatilité implicite du marché des options |
| **LR** | Likelihood Ratio — ratio de vraisemblance bayésien |
| **MOC** | Market On Close — ordres à la clôture |
| **MTF** | Multi-Timeframe |
| **OPEX** | Options Expiration — 3e vendredi du mois |
| **OR** | Opening Range — plus haut/bas de la première période |
| **RSI** | Relative Strength Index — oscillateur 0–100 |
| **Theta** | Décroissance temporelle du prix d'une option |
| **Vega** | Sensibilité du prix d'une option à l'IV |
| **VIX** | Indice de volatilité implicite S&P 500 |
| **VWAP** | Volume Weighted Average Price |

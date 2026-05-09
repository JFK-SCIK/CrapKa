# CrapKa — Documentation projet

## Stack technique
- Frontend : HTML/JS vanilla, multi-fichiers (index.html + JS/CSS séparés)
- Backend futur : FastAPI (Python) + WebSockets, port 8003
- DB future : SQLite
- Environnement : Windows, VSCode + Claude Code

## Fichiers
- `crapka_v4.html` : version monolithique de référence (archivée)
- `index.html` : squelette HTML + liens vers les modules
- `styles.css` : toute la CSS
- `game.js` : constantes + état + règles + actions
- `ai.js` : tout le bloc IA (BF, simulation, évaluation, défausse)
- `ui.js` : rendu + DOM + interactions + log + modal + layout
- `app.js` : bootstrap (`computeLayout` + `renderMenu`)
- `CrapKa.md` : ce fichier

---

## Terminologie UI (mode réseau)

- **Joueur** : le joueur local, affiché en bas de l'écran, qui interagit avec l'interface.
- **Adversaire** : l'autre joueur, affiché en haut de l'écran, à distance.

### Layout mode réseau
- Adversaire (haut) : `right-col` = [main, défausse] / `cr-col` = [badge, crstack] — badge face à la main, crstack face à la défausse.
- Joueur (bas) : `right-col` = [défausse, main] / `cr-col` = [crstack, badge] — crstack face à la défausse, badge face à la main.

---

## Règles du jeu

### Structure
- Jeu à deux joueurs
- Chaque joueur a une crapette de cartes face cachée sauf la première carte qui est découverte, 4 Défausses, vides ou remplies, une Main de 5 cartes maximum
- une zone commune contient: une Pioche de cartes faces cachées, 4 Piles de jeu, une zone de Recyclage de cartes des Piles terminées
- Victoire : le premier joueur qui n'a plus de carte dans sa Crapette gagne instantanément.

### Mise en place
- Chaque joueur reçoit 1 jeu de 52 cartes avec lequel il constitue une Crapette de 21 cartes (pile cachée, 1ère visible), met une carte sur les deux des Piles communes en partant de sa gauche (J1 sur P1 et P2, J2 sur P3 et P4), et prend 5 cartes qui constitueront sa Main de départ.
- les cartes restantes des deux joueurs (soit 2*24 cartes) sont mélangées ensemble et forment la Pioche initiale
- Le joueur dont la crapette est la plus petite commence (Roi=2 pour cette comparaison). En cas d'égalité : 1re carte de pile, 2e carte de pile, tirage au sort.

### Déroulement d'un tour
1. Piocher jusqu'à avoir 5 cartes en Main
2. Jouer autant que désiré et possible des cartes de sa Crapette, de sa Main, de ses Défausses sur les Piles communes
3. Obligatoirement Poser une carte de la Main (pas de la Crapette) sur une Défausse, ce qui marque la fin du tour et le début de celui de l'adversaire

### Poses sur Piles communes
- Valeur strictement +1 par rapport au sommet (ex: 7 sur 6)
- Pas de condition de couleur
- As = 1, peut aller sur Pile vide uniquement
- Dame (12) : dernière carte possible sur une Pile → le joueur actif peut envoyer toute la Pile au Recyclage
- Le Roi = joker : il peut remplacer n'importe quelle carte sauf l'As.
  - Le Roi prend la valeur N+1 par rapport à la carte sur laquelle il se pose.
  - Le Roi ne peut pas se poser sur une Dame (13 n'existe pas).
  - Le Roi ne peut être mis sur une Pile vide depuis la Main d'un joueur (le Roi ne remplace pas l'As)
  - Si un Roi est retourné sur une Pile vide depuis la Pioche, il prend sa valeur quand le joueur actif pose une carte dessus.
  - Le joueur actif peut poser n'importe quelle carte sur un Roi sur une Pile vide sauf un 2 (le Roi ne remplace pas l'As).

### Cas des Piles vides
- Les Piles vides sont réinitialisées, soit par un As, soit en retournant la première carte de la Pioche et en la posant sur la Pile vide
- Si un As est visible sur la Crapette ou les Défausses du joueur actif, il doit poser un As (pas forcément l'As visible)
- S'il n'y a que des Piles vides et que le joueur n'a que des Rois en Main, il doit initialiser une des Piles avec un As visible ou à partir de la Pioche.

### Crapette
- On ne peut que jouer des cartes depuis sa Crapette, jamais sur une Crapette
- La carte visible du dessus de sa Crapette peut être jouée sur les Piles communes
- La Crapette ne peut pas être Posée sur une Défausse
- Victoire : poser la dernière carte de sa Crapette
- Il n'y a pas d'obligation de jouer la Crapette

### Main
- Il n'y a pas d'obligation de jouer les cartes de sa Main.
- Quand la Main est vide, on peut repiocher 5 cartes.

### Colonnes de Défausse
- Pendant son tour, on peut prendre la première carte (celle sur laquelle il n'y a pas d'autre carte) de n'importe quelle Défausse pour la jouer sur les Piles de jeu
- Poser une carte sur une Défausse marque la fin de son tour
  - On pose les cartes sur les Défausses décalées verticalement de sorte à laisser visibles la valeur de toutes les cartes de la Défausse
  - On peut poser une carte non As sur n'importe quelle carte non As de n'importe quelle Défausse
  - On peut poser un As sur n'importe quelle carte de n'importe quelle Défausse
  - On ne peut pas poser une carte non As sur un As d'une Défausse

### Demande
- A la fin du tour du joueur A, on regarde quelles cartes (cartes C) de ses Défausses sont jouables sur les Piles
- Pendant son tour (pas forcément au début), l'autre joueur (joueur B), peut demander au joueur A de jouer une et une seule carte C de sa Défausse
- Le joueur A est alors obligé de la jouer immédiatement, bien que ce ne soit pas son tour, puis le joueur B peut continuer à jouer.
- La Demande est un coup comme un autre (planifié par le BF)

### Recyclage
- Pour être terminée, une Pile doit avoir une Dame en carte apparente (ou un Roi faisant office de Dame)
- Le joueur actif peut envoyer une Pile terminée dans le Recyclage
- A tout moment, si il manque une ou plusieurs cartes dans la Pioche pour faire une action, on mélange les cartes du Recyclage et on les met sous la Pioche (face cachée)

### Stratégie
- On privilégiera de jouer les cartes de la Crapette ou des cartes de sa Main ou des Défausses qui permettent de jouer une carte de la Crapette
- Quand on ne peut pas jouer la Crapette, vider sa Main pour repiocher est un bon objectif
- On ne joue pas les Rois s'ils ne permettent pas de mettre une carte de la Crapette ou de vider la Main
- Quand on défausse, on privilégie de garder en Main les cartes qui aideront à mettre la Crapette, puis celles qui permettent de vider la Main.
- On évite de garder en Main un exemplaire de sa carte de Crapette ou plusieurs exemplaires d'une même carte non Roi.
- On évite de jouer sur les Piles les cartes de sa Main ou de sa Défausse qui aident l'adversaire à poser sa Crapette s'il n'en a pas d'exemplaire visible.
- On peut utilement Poser sur une Défausse ayant une carte indispensable à l'adversaire pour poser sa Crapette.
- Quand sa Crapette est une petite carte (1-4), on évite de terminer les Piles si on n'a pas d'As. On privilégiera de terminer sa Main avant pour piocher 5 cartes et avoir une chance plus grande d'avoir un As.
- Quand sa Crapette est grande (9-D) on peut avoir intérêt à initialiser une Pile vide par la Pioche plutôt que par un As en Main, surtout si l'adversaire a une petite carte sur sa Crapette.

---

## Architecture du code

### État du jeu (`G`)
```javascript
G = {
  players: [
    { name, crapette: [], hand: [], defausse: [[],[],[],[]] },  // pidx=0
    { name, crapette: [], hand: [], defausse: [[],[],[],[]] },  // pidx=1
  ],
  commons: [[],[],[],[]],      // 4 Piles communes
  pioche: [],
  futurePioche: [],            // Recyclage
  cur: 0|1,                    // joueur actif
  phase: 'play'|'game-over',
  winner: null|0|1,
  // Snapshots fin de tour adverse pour les demandes
  startDefSnap: [],            // défausses du joueur qui vient de finir son tour
  startCommonsSnap: [],        // Piles communes à ce moment
  startKingValSnap: [],
  startKingPendSnap: [],
}
```

### Carte
```javascript
{ uid: number, value: string, suit: string, num: 1-13, color: 'red'|'black' }
```

---

## Architecture IA

### Mode unique : Force Brute (BF)
L'IA utilise exclusivement un BFS sur toutes les séquences possibles (`BF_MAX_ACTIVE = 600` branches actives max).

### Flux d'exécution IA (`aiPlayTurn`)
1. `_saveGameState()` : snapshot de l'état réel
2. `_buildAiSequence()` : calcule la séquence sur une copie
   - `_applyForcedMoves()` : coups imposés (Dame→écart, Roi pending, As sur Pile vide, Pioche→Pile vide)
   - `_bruteForce()` : BFS, retourne les moves de la meilleure séquence terminée
   - Les moves `end` (défausse) sont filtrés — `_aiDiscard` s'en chargera
3. `_restoreGameState()` : remet l'état original
4. `_replayMoves(moves)` : anime les coups un par un
   - À chaque **découverte** (Crapette posée, Pioche retournée), s'arrête et relance `aiPlayTurn`
   - Quand la liste est vide, appelle `_aiDiscard` pour choisir la défausse
   - En mode PàP : pause supplémentaire "Défausse — ▶" avant de jouer la défausse

### Gestion des cartes invisibles
- Après la première pose de crapette (`crapettePlayed=true`), la carte suivante est invisible → coups crapette exclus
- Retournement pioche (`init` sans carte) et `redraw` : terminent la séquence, score calculé AVANT le tirage
- L'exécution s'arrête à chaque découverte et recalcule avec les cartes réellement tirées

### Moteur de simulation (fonctions `_s*`)
- `_cloneState(g, ui)` : deep clone incluant les startSnaps
- `_sSources(g, pidx, visibleOnly)` : sources (Crapette, Main, Défausses)
- `_sLegal(g, ui, pidx, visibleOnly)` : tous les coups légaux
  - `play` : jouer une carte sur une Pile commune
  - `clear` : écarter une Pile à Dame
  - `init` : initialiser une Pile vide
  - `demand` : demander une carte adverse (si jouable à la fin du tour adverse)
  - `end` : défausser (fin de tour, frontière d'évaluation)
- `_sApply(g, ui, pidx, mv)` : appliquer un move sur un clone
- `_sCanOnCommon(g, ui, card, ci)` : carte jouable sur Pile ci ?
- `_sWasPlayable(g, defIdx, oppIdx)` : carte jouable à la fin du tour adverse ?
- `_eval(g, ui, aiIdx)` : évaluation de position

### Déduplication (`_bfDedup`)
- Main : deux cartes de même valeur sur la même pile → clé `ph:<num>:<ci>`
- Défausses vides équivalentes : clé `end:<num>:E`

### Fonction d'évaluation `_eval`
| Critère | Points |
|---------|--------|
| Crapette IA posée | +50/carte |
| Crapette adverse jouable | −40 |
| Crapette IA jouable | +30 |
| Carte de Main jouable | +4 |
| Main vide + Pioche dispo | +10 |
| Piles proches Crapette (dist. circulaire) | jusqu'à +22 |
| Pile la plus proche (bonus min-dist) | jusqu'à +24 |
| Pile activable par carte visible IA | +8 |
| Diversité Défausses | +3/valeur différente |
| Main petite (< 5 cartes) | +4/(5−size) |
| Rois en main si crapette injouable | +10/roi |
| Pas de doublon crapette en main | +8 |
| Pas de doublons de valeur en main | +5 |
| Cartes précédant la crapette en main | +8/+4 |
| Piles vides avec pioche dispo | −30/pile |
| Couverture chaîne crapette par la main | +6/valeur couverte (min 5 pas) |
| Valeur chaîne adverse visible en défausse IA | −8/valeur (si non visible chez adv.) |

### Route adverse (`_oppRouteLen`) — concept Nomistek
La **Route** de l'adversaire est la liste ordonnée des valeurs de cartes (Étapes) nécessaires pour poser sa crapette, en partant du sommet de la pile la plus avancée. La dernière Étape est la crapette elle-même. La longueur = distance circulaire minimale `(oppCr - topPile + 12) % 12`, ou `oppCr.num` si la pile est vide. Si la crapette adverse est un Roi, la route est indéterminée (retourne 13). Ex : piles {5,7,3,8}, crapette=3 → pile 8 → Route = {9, T, V, D, A, 2, 3}, longueur 7.

### Bonus de séquence (`extraBonus`)
Accumulé au cours d'une séquence BF, ajouté au score à la terminaison :
- Coup de Main sur chemin de la crapette → +5
- Crapette posée sur Pile → +500 (tier)
- Main vidée (hors `end`) → +150 (tier)
- Roi de Main joué hors chemin → −35
- Défausse au lieu de la même valeur en Main → −8
- **[Nomistek] Coup raccourcissant la Route adverse** (sans jouer crapette, sans vider main, hors chemin) → −15

### Choix de la Défausse (`_aiBestDef`)
Objectif : maximiser la visibilité et l'accessibilité des cartes sur le chemin de la crapette.
Scores (par priorité décroissante) :
- As sur As : +100 (priorité absolue)
- As sur non-As : −50 (quasi-interdit)
- Suite naturelle n−1 sur n : +15 (pose ordonnée, accès au sommet préservé)
- Plus petit (non suite) sur plus grand : +2
- Plus grand sur plus petit : −10 (éviter)
- Colonne vide dispo ailleurs ET pose non-naturelle ET sommet sur chemin non accessible : −20
- Colonne vide dispo ailleurs ET pose non-naturelle (cas général) : −8
- Perte d'accès à une carte du chemin (non accessible ailleurs) : −12
- Cartes précieuses enfouies dans la pile (jusqu'à 3 niveaux, chemin, non accessibles) : jusqu'à −6/carte
- Couvrir une carte demandable adverse : +5 (protection)
- Pile courte : +3/+2/+1 selon longueur

### Priorité des coups dans BF (`_bfSortMoves`)
crapette → init/clear → piles_activant_crapette → autres_piles → demande → défausse (fin de tour)

Les coups de pile non-crapette sont sous-classés : ceux qui rendent la crapette jouable dans l'état résultant passent avant les autres (nécessite un `_sApply` par coup candidat).

### Sauvegardes / Undo
- `saveUndo()` / `_buildUndoSnap()` / `_restoreFromSnap(s)` : undo complet
- 20 niveaux d'undo, sauvegardé avant chaque action **humain uniquement** (pas pendant le replay IA)
- Un seul snapshot IA par tour : celui du début de `aiPlayTurn()` — annuler revient au début du tour IA entier
- `localStorage` : `crapka_debug` pour le dernier snap
- Sauvegarde/chargement fichier JSON (`saveToFile` / `loadFromFile`)

---

## Mode debug (bouton 🐛)
- Cartes IA face visible
- Log : `[IA] M:... | D:... | Cr:...` après chaque coup
- Mode pas-à-pas (case PàP + bouton ▶)
- **Panel séquences BF** : liste toutes les séquences terminées triées par score
  - Crapette = gras rouge, autres découvertes = gras
  - Score total + `(M:+XX)` part main résiduelle en fin de ligne
  - Survol → tooltip détail des critères d'évaluation (`data-eval`)
  - Épinglé par défaut (`_bfSeqPinned=true`) : reste visible, affiche "en attente…" entre les tours
  - En PàP, reste visible jusqu'à la pause "Défausse — ▶" (les séquences ne disparaissent pas entre les coups)
  - Bouton `≡` pour afficher/masquer
- Log demandes : `[D] BUILD`, `[D] sWP di=...`
- **Trace BF** (bouton 🔍) : log extensif des séquences BF + top 8 choix, téléchargeable via ⬇
- **Exec trace** (bouton 📊) : buffer circulaire 1000 entrées actif dès que `_debugMode=true`
  - Format : `[+Nms] TAG | sR=T/F rAI=T/F sM=T/F | extra`
  - Couvre : `aiPlayTurn`, `_replayMoves` (chaque coup), `_applyMoveWithAnim`, tous les `_stepResolve=` et `_stepResolve()`, timers setTimeout, `hideBFSeq`, `renderBFSeq`, `stepOrPlay`, `stepNext`, `undo`, `_restoreFromSnap`, `nextPlayer`
  - Téléchargeable en JSON texte via 📊 (visible dès qu'il y a des données)

## Animations
- `flyCard(card, fromR, toR, cb)` : animation de vol CSS
- `SPEEDS=[0, 4000, 2000, 1200, 600, 250]` ms, slider 0-5, défaut=3
- Demande : blink rouge 3× avant déplacement

## TODO / Backlog

### Bugs (ordre de traitement)

| # | Statut | Description |
|---|--------|-------------|
| B1 | ✅ fait | **Double demande + mauvaise animation** — `_sLegal` vérifie que l'UID du sommet défausse adverse correspond au snap avant de générer `demand` → empêche de demander deux fois la même pile. Animation demand : `[data-def-top]` au lieu de `[data-def-slot] .card`. [v1.2.32] Fix complémentaire : flag `demandMadeThisTurn` dans l'état (jeu + simulation BF) — une seule demande autorisée par tour même si plusieurs piles adverses sont éligibles. Reset dans `saveSnap`, propagé dans undo/restore. |
| B2 | ✅ fait | **Rois hors moves `end` (BF)** — Les Rois ne peuvent pas être défaussés en fin de séquence BF. Filtre `c.num !== 13` dans `_sLegal` pour les moves `end`. |
| B3 | ✅ fait | **Coup inutile avant crapette** — `_bfSortMoves` reçoit l'état et classe les coups de pile en "activent la crapette" (avant) et "autres" (après). `handPlayBonus` passe de +15 flat à +25 (activant) / +5 (autre) → les séquences qui jouent la crapette sans pré-coup inutile dominent. |
| B4 | ✅ fait | **Défausse sans retourner pile vide** — `_eval` pénalise −30/pile vide quand la pioche est disponible → le BF choisit toujours d'init une pile vide avant de terminer. |
| B5 | ✅ fait | **Priorités défausse / main résiduelle** — Nouveau helper `_chainValsForPlayer(pidx)` : valeurs utiles sur min(5,dist) pas depuis la pile la plus proche. `_discardPriority` +3 critères : −20 si carte unique dans ma chaîne, −15 si carte dans chaîne adverse non visible chez l'adversaire, +20 si défausser laisse seulement des rois (→ redraw). `_eval` +2 critères : +6/valeur de chaîne présente en main, −8/valeur chaîne adverse visible en défausse IA non visible chez l'adversaire. |
| B7 | ✅ fait | **Roi de main joué sans avantage** — L'IA jouait un Roi depuis la main même sans activer la crapette ni vider la main. Trois causes :<br>• Dans `_bfExpand` : le gain de position pile compensait la perte `_evalHandScore`. Fix : malus `kingFromHandPenalty=−35` pour Roi de main sans `activatesCrapette`.<br>• Dans `_aiDiscard` : la boucle "jouer cartes jouables depuis la main" jouait le Roi en phase défausse même si le BF avait choisi une séquence vide. Fix : Rois exclus de la boucle dans `_aiDiscard`.<br>• Dans `_bfExpand` : quand Roi ET non-Roi activent tous deux la crapette, le BF préférait le Roi (via `pileKingVal` trick). Fix : si un non-Roi active aussi la crapette, malus partiel `−15` sur le Roi (→ garder le Roi en main = plus de flexibilité). |
| B8 | ✅ fait | **[v1.2.0] Carte de défausse jouée à la place de la même valeur en main** — Deux mécanismes :<br>• `_findAce()` (coups forcés avant BF) : cherche main avant défausse, exception si carte cachée sous la défausse est jouable (`_handCardIsPlayable`).<br>• `_bfExpand()` (BF) : malus fixe `defVsHandPenalty=−8` quand on joue depuis défausse alors que la même valeur est en main. Combiné avec le `handPlayBonus=+5` de la main, net = +13 en faveur de la main. Non soumis au discount.<br>• Système de discount `postKey` : après crapette jouée OU jeu sur pile vide, les bonus suivants (handPlayBonus, crapetteBonus, kingPenalty) sont multipliés par 0.3 → seul un vidage total de main peut contrebalancer défausse vs main dans ces situations. |
| B9 | ✅ fait | **[v1.2.33] IA joue des coups non-indispensables avant le chemin vers la crapette** — Cause racine : les coups hors-chemin (3♠, 5♣…) et les coups du chemin (V, D) avaient le même bonus (+5), donc 3♠→V→D→crT (35) > V→D→crT (30). Fix architectural : `_buildCrapettePath` remonte la chaîne arrière depuis crT pour identifier l'ensemble `pathNums` des cartes indispensables (main, défausse, demande, masquée profondeur 1, substitution Roi). Les coups hors-chemin reçoivent `moveDiscount=BF_DISCOUNT=0.3` — pondérés comme s'ils étaient joués APRÈS la crapette. Résultat : V→D→crT et 3♠→V→D→crT sont à égalité de score total, mais le BF explore V en premier (priorité +5 vs +1.5 au pas 1) → V→D trouvé en priorité. Remplace toute la mécanique `activatesCrapette`/`activates2Step`/`_nonKingActivates`/`preCrapettePenalty`. |
| B11 | ✅ fait | **[Nomistek v1.2.0] Pénalité route adverse** — Quand Nomistek ne joue pas sa crapette et ne vide pas sa main, tout coup de pile qui raccourcit la Route de l'adversaire reçoit −15 (`OPP_ROUTE_PENALTY`). Route = longueur circulaire minimale `(oppCr − topPile + 12) % 12` via `_oppRouteLen`. Condition : `mv.type==='play' && !isCrapettePlay && !isOnPath && !handEmptied && !seq.crapettePlayed && routeAfter < routeBefore`. |
| B10 | ✅ fait | **[Nomistek v1.1.0] `handPlayBonus` positif pour coups hors-chemin** — B9 restait incomplet : les coups de Main hors-chemin recevaient `5*0.3=1.5` d'`extraBonus` (positif). Conséquence : 3♠→D→V(cr) (506.5) > D→V(cr) (505) — le coup gratuit gagnait systématiquement. La doc affirmait "à égalité" mais c'était faux. Fix (`ai_nomistek.js`) : `handPlayBonus=(isOnPath\|\|(isHandPlay&&!hasCrapettePath))?5:0` — les coups de Main hors-chemin en présence d'un chemin de crapette reçoivent 0 (et non 1.5). Séquences désormais réellement à égalité, tie brisé par longueur → chemin direct prioritaire. |
| B6 | ✅ fait | **Non-répétabilité + coups manquants dans le log** — Deux bugs distincts découverts par analyse de la trace d'exécution :<br>• `_aiDiscard` appliquait les coups de pile directement sur `G` via `_applyMoveToState(G,UI,...)` pendant `_simulating=true` → log supprimé, puis `_replayMoves` échouait à les rejouer (`canOnCommon` false) → coups invisibles dans le log. Fix : sauvegarder/restaurer G autour de `_aiDiscard()`.<br>• En PàP, après le coup `discard`, `_stepResolve=()=>_replayMoves([])` était posé alors que `nextPlayer` avait déjà changé G.cur → closure zombie survivant tout le tour humain → au tour IA suivant, ▶ déclenchait `_replayMoves([])` au lieu de `aiPlayTurn` → `_aiDiscard` sans BF → séquence erronée jouée d'un bloc. Fix : ne pas poser `_stepResolve` après un coup `discard`. |

### Divers UI/UX (ordre de traitement)

| # | Statut | Description |
|---|--------|-------------|
| D1 | ✅ fait | **Supprimer sélecteur BF** — Seul mode disponible, le `<select id="ai-level">` est inutile. |
| D2 | ✅ fait | Piles communes en colonne verticale (`flex-direction:column` sur `.commons-col`). |
| D3 | ✅ fait | `computeLayout` : taille calculée depuis la hauteur d'abord. Contrainte largeur = `(gameW−40)/6` : right-col empile défausses et main → max 5 cols + crapette = 6 cols. [v1.2.15] formule corrigée (était `(gameW−60)/10`, sous-estimait la taille possible). |
| D4 | ✅ fait | Contrôles (slider, debug, boutons) déplacés sous le titre dans `#hdr-controls` ; `#hdr` passe en `flex-direction:column`. |
| D5 | ✅ fait | Bouton 📖 dans le header + `showRules()` avec résumé des règles et crédits A&S. |
| D11 | ✅ fait | **Vérification de mise à jour** — Clic sur le badge de version ouvre une modale avec le détail des composants et un bouton "Vérifier les mises à jour". Ce bouton compare le hash git du serveur avec celui chargé ; si différent, rechargement via `?_=timestamp` (contourne le cache sur tous les navigateurs, y compris mobile). [ui.js v1.2.34] |
| D6 | ✅ fait | **Reprise partie solo** — À l'ouverture du menu, si `crapka_debug` (localStorage) contient une partie solo non terminée, `startSoloOrResume()` affiche une modale proposant de reprendre ou de démarrer une nouvelle partie. Si reprise : `_restoreFromSnap` + déclenchement IA si c'est son tour. [ui.js v1.2.33] |
| D7 | ✅ fait | **Snapshot** — Copie directe dans le presse-papier + message bref "Snapshot terminé", sans modale. |
| D8 | ✅ fait | Animation victoire : overlay `#victory-overlay` avec fade-in + scale-up CSS, 300ms après le game-over. `showMenu()` supprime l'overlay. |
| D9 | ✅ fait | **Panneau de démarrage non-bloquant** — `showStartModal(first, reason)` affiche un overlay positionné sur `#game` uniquement (header accessible). Indique qui commence et pourquoi. Bouton "▶ Lancer la partie" démarre. Contrôles debug/PàP/trace du header restent cliquables pendant l'attente. Les cartes sont non-jouables tant que `_waitingToStart=true` (guard dans `isHumanTurn()`). Le panneau (`_startPanel`) survit aux appels `render()` : référence globale réinjectée dans `#game` à chaque rendu. `showMenu()` nettoie `_startPanel` et `_waitingToStart`. |
| D10 | ✅ fait | **Layout portrait mobile** — Media query `(orientation:portrait) and (max-width:900px)` : `#main` en colonne, sidebar en bas (72px, scroll horizontal), seqlog masqué, header réduit au seul bouton Menu. `computeLayout()` branché portrait : `gameW=fullWidth`, `gameH` déduit de la hauteur du log bas (cartes ~35px au lieu de ~23px). `orientationchange` re-déclenche `computeLayout`. |

### Long terme
- Suite descendante en Défausse (règle optionnelle)
- Évaluation probabiliste de la Pioche
- Centraliser tous les textes dans un fichier i18n pour traduction
- Préprod / blue-green deployment
- Session reconnection après déconnexion réseau

### Synchronisation des règles (trois implémentations parallèles)
Les règles du jeu existent en trois endroits distincts, sans partage de code :

| Fichier | Usage | Style |
|---|---|---|
| `game.js` | Règles réelles — solo + réseau côté client | globals `G`/`UI`, side effects, animations |
| `ai.js` (`_s*`) | Simulation BF — miroir paramétré de `game.js` | `(g, ui)` en arguments, pur, sans side effects |
| `server/game_logic.py` | Validation serveur — parties réseau | Python, troisième implémentation indépendante |

**État actuel** : les trois sont encore synchronisées (vérification faite, pas de divergence sémantique). La différence connue et intentionnelle : `_sDrawSafe` ne mélange pas au recyclage (sans effet sur la stratégie BF).

**Risque** : toute modification de règle dans `game.js` doit être répercutée manuellement dans `_s*` et dans `game_logic.py`. Convention pour limiter le risque : commenter `// SYNC: game.js > <fonction>` au-dessus de chaque `_s*` concernée.

**Mutualisation future** (chantier à part entière) : refactorer `game.js` pour accepter `(g, ui)` en paramètres rendrait `_s*` redondant. Non prioritaire tant qu'il n'y a pas de divergence avérée.

### Profils IA multiples
**Implémenté (mai 2026)** — plusieurs personnalités IA sélectionnables par le joueur solo.

Découpage en fichiers :
- `ai.js` (v1.3.0) → dispatcher + état animation + infrastructure partagée (`_s*`, state save/restore, move application). Contient `const _AI_REGISTRY={}` rempli par les fichiers de profils.
- `ai_tibolos.js` (v1.0.0) → stratégie Tibolos complète (BF, `_bfExpand`, `_eval`, `_aiDiscard`) — IA de référence, stratégie inchangée
- `ai_patcartier.js` (v0.1.0) → stub délégant vers Tibolos, en attente d'heuristique "route vers la crapette"

Chaque profil expose `{ name, bruteForce, aiDiscard }` et se déclare via `_AI_REGISTRY['clé']=AI_XXX`.
Le profil actif est stocké dans `UI.aiProfile` (clé) et le nom affiché est `G.players[1].name` (ex. "Tibolos").
`newGame(vsAI, aiDisplayName, aiProfileName)` — les deux nouveaux params ont des valeurs par défaut 'Tibolos'/'tibolos'.

**Ordre de chargement** dans `index.html` : `game.js` → `ai.js` → `ai_tibolos.js` → `ai_patcartier.js` → `net.js` → `ui.js` → `app.js`.

### Dataset pour IA neuronale
Objectif futur : entraîner une **value network** (état → probabilité de victoire) pour remplacer `_eval()` dans un profil IA dédié. La value network se greffe sur le BF existant sans modifier le reste.

**Génération du dataset** : faire jouer des profils IA l'un contre l'autre (Tibolos vs PatCartier) et enregistrer chaque partie.

**Ce qu'il faut stocker par partie** :
```json
{
  "game_id": "uuid", "ts": "...", "mode": "solo|net|ai_vs_ai",
  "profiles": ["tibolos", null],
  "winner": 0,
  "moves": [
    { "player": 0, "state": { /* état visible */ }, "move": { "type": "play", ... } }
  ]
}
```

**État visible par coup** (information réelle du joueur actif) : main (5 cartes), crapette top+taille, 4 défausses tops, crapette adverse top+taille, 4 défausses adverses tops, 4 piles communes top+taille, taille pioche+futurePioche, `demandMadeThisTurn`. Pas la main adverse ni le contenu de la pioche.

**Volume estimé** : ~25 KB/partie en JSON lisible. 10 000 parties ≈ 250 MB — compatible avec le disque GCP.

**Implémentation** : côté client, accumuler les moves dans un tableau pendant la partie et l'envoyer à `/solo/end`. Côté serveur (`main.py`), persister dans `server/game_logs/<game_id>.json`. Pour les parties réseau, le serveur voit déjà tous les coups via WebSocket (`_build_move_info`).

**Remarque** : les parties humaines actuelles sont utiles comme signal de comportement réel, mais le gros du dataset viendra de la génération IA vs IA côté serveur.

---

## Mode réseau (branch reseau-2j)

### Fichiers supplémentaires
- `net.js` : gestion WebSocket, messages réseau, Oooops, abandon
- `server/main.py` : FastAPI, WebSocket, routes REST
- `server/rooms.py` : état des salles réseau
- `server/game_logic.py` : règles serveur (copie Python de game.js)
- `server/stats.py` : persistance stats.json + games.json
- `server/players.py` : UUID→alias, clés stats
- `server/admin.html` : interface d'administration web
- `server/show_games.py` : script console historique parties
- `server/show_stats.py` : script console statistiques
- `deploy.sh` : déploiement prod GCP avec option --wait
- `deploy-preprod.sh` : déploiement préprod GCP (port 8001, service crapka-preprod)
- `server/setup-preprod.sh` : installation du service systemd préprod sur la VM
- `CrapKaMgt.sh` : menu interactif de gestion serveur

### Architecture préprod / prod

| Env | Port | Service systemd | Branch git | URL |
|-----|------|----------------|------------|-----|
| Prod | 8000 | `crapka` | `master` | `https://crapka.duckdns.org` |
| Préprod | 8001 | `crapka-preprod` | `reseau-2j` | `http://crapka.duckdns.org:8001` |

- Le frontend détecte le port 8001 et affiche un badge orange **PRÉPROD** inline dans le titre (jeu + admin).
- `net.js` construit l'URL WebSocket depuis `window.location.host` quand servi depuis GCP → aucune config supplémentaire.
- Le bouton "Deploy" de l'admin redémarre le bon service via `CRAPKA_SERVICE` (env var du service systemd).
- Les données (`stats.json`, `games.json`, `rooms/`, `players.json`) sont **isolées** : préprod écrit dans `~/CrapKa/server/preprod-data/`, prod dans `~/CrapKa/server/`.

### Workflow promotion préprod → prod

```bash
# Tout promouvoir (merge complet)
git checkout master && git merge reseau-2j && git push origin master
# Sur la VM : ~/CrapKa/deploy.sh

# Cherry-pick sélectif
git checkout master
git cherry-pick <hash>    # un commit précis
git push origin master
# Sur la VM : ~/CrapKa/deploy.sh
```

### Installation/mise à jour préprod sur la VM
```bash
# À chaque modification de setup-preprod.sh, ou lors de l'installation initiale :
cd ~/CrapKa && git pull origin reseau-2j && bash server/setup-preprod.sh
# Le script est idempotent — peut être relancé sans risque.
# Port 8001 à ouvrir dans la console GCP (une seule fois, déjà fait).
```

### Endpoints REST
| Endpoint | Description |
|----------|-------------|
| `GET /health` | Healthcheck |
| `GET /status` | Salles actives, joueurs connectés, phase, inactivité |
| `GET /stats` | Statistiques par joueur (games/wins/losses/vs) |
| `POST /solo/start` | Démarrage partie solo (UUID) — abandon implicite si précédente non terminée |
| `POST /solo/end` | Fin de partie solo (UUID, winner, loser) |
| `GET /games?date=YYYY-MM-DD` | Historique parties (filtré ou complet) |
| `GET /admin?pwd=…` | Interface d'administration web |
| `WS /ws/{room_code}` | WebSocket jeu réseau |

### Fonctionnalité Oooops (annulation réseau)
- Bouton toujours visible, annule le dernier coup joué depuis la main sur une pile
- L'adversaire doit accepter (popup côté adversaire)
- 3 refus max par tentative ; au 3ème refus : définitif
- Messages différenciés selon le numéro de tentative (joueur et adversaire)
- `room.prev_state` = snapshot deepcopy avant le coup, effacé après undo ou 3ème refus

### Identité joueur (UUID)
- `localStorage['crapka_uuid']` : UUID stable par navigateur (32 hex, `crypto.randomUUID`)
- Alias d'affichage : 8 premiers hex du UUID (décalage de 8 en cas de collision)
- Clé stats solo : `-(alias8)` ; réseau : `NomRéseau(alias8)`
- Abandon implicite côté serveur : si nouvelle partie réseau reçue pour un UUID déjà actif dans une autre salle non terminée
- Abandon explicite : l'adversaire restant choisit entre "victoire par défaut" ou "abandon mutuel" via une modale
- Messages abandon : `opponent_abandoned` (serveur→client), `abandon_response` (client→serveur)
- `server/players.py` : `register(uuid, name)`, `get_alias(uuid)`, `net_key(name, uuid)`, `solo_key(uuid)`

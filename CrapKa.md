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

### Bonus de séquence (`extraBonus`)
Accumulé au cours d'une séquence BF, ajouté au score à la terminaison :
- Carte de Main posée sur Pile → +15
- Crapette posée sur Pile → +50

### Choix de la Défausse (`_aiBestDef`)
Scores pour choisir sur quelle pile Défausse poser la carte :
- As sur As : +100 (priorité absolue)
- Pile vide : +5
- Couvrir un As avec non-As : −10
- Base (petite sur grande) : +2, (grande sur petite) : +1
- Doublon visible ailleurs (pas de perte d'info) : +5 ; unique : −3
- **Suite croissante (card.num = top.num+1) : −4** (bloque l'accès au sommet)
- Sommet proche de la Crapette (dist ≤ 3) : −4
- Couvrir une carte demandable adverse : +4
- Carte déjà visible en propre défausse : −2
- Pile courte (longueur 0→+4, 1→+3, etc.)
- Carte précieuse enfouie (non disponible ailleurs) : malus décroissant

### Priorité des coups dans BF (`_bfSortMoves`)
crapette → init/clear → main+défausse vers piles → demande → défausse (fin de tour)

### Sauvegardes / Undo
- `saveUndo()` / `_buildUndoSnap()` / `_restoreFromSnap(s)` : undo complet
- 20 niveaux d'undo, sauvegardé avant chaque action (humain ou IA)
- `localStorage` : `crapka_debug` pour le dernier snap
- Sauvegarde/chargement fichier JSON (`saveToFile` / `loadFromFile`)

---

## Mode debug (bouton 🐛)
- Cartes IA face visible
- Log : `[IA] M:... | D:... | Cr:...` après chaque coup
- Mode pas-à-pas (case PàP + bouton ▶)
- **Panel séquences BF** : liste toutes les séquences terminées triées par score
  - Crapette = gras rouge, autres découvertes = gras
  - Épinglé par défaut (`_bfSeqPinned=true`) : reste visible, affiche "en attente…" entre les tours
  - En PàP, reste visible jusqu'à la pause "Défausse — ▶" (les séquences ne disparaissent pas entre les coups)
  - Bouton `≡` pour afficher/masquer
- Log demandes : `[D] BUILD`, `[D] sWP di=...`

## Animations
- `flyCard(card, fromR, toR, cb)` : animation de vol CSS
- `SPEEDS=[0, 4000, 2000, 1200, 600, 250]` ms, slider 0-5, défaut=3
- Demande : blink rouge 3× avant déplacement

## TODO / Backlog

### Bugs (ordre de traitement)

| # | Statut | Description |
|---|--------|-------------|
| B1 | À faire | **Double demande + mauvaise animation** — `_sLegal` génère un 2ème move `demand` sur la carte sous le sommet après que la 1ère a été appliquée. Fix : vérifier que l'UID du sommet actuel correspond au snap avant de générer `demand`. Animation : utiliser `[data-def-top]` au lieu de `[data-def-slot] .card`. |
| B2 | ✅ fait | **Rois hors moves `end` (BF)** — Les Rois ne peuvent pas être défaussés en fin de séquence BF. Filtre `c.num !== 13` dans `_sLegal` pour les moves `end`. |
| B3 | À faire | **Coup inutile avant crapette** — un coup main→pile sans lien avec la crapette est joué avant la chaîne crapette car son extraBonus +15 fait monter le score. Fix : réduire extraBonus main→pile de +15 à +5, ou ne l'accorder que si le coup active la crapette dans l'état résultant. |
| B4 | À faire | **Défausse sans retourner pile vide** — Ne jamais défausser si une pile est vide et la pioche dispo, sauf exception stratégique (crapette ≤ 3, pas d'As, etc.). Renforcer la logique existante dans `_aiDiscard`. |
| B5 | À faire | **Priorités défausse / main résiduelle** — Refonte `_discardPriority` + `_eval` : repiocher main vide avec rois > défausser ; bonus cartes dans la chaîne vers crapette ; malus doublons. |

### Divers UI/UX (ordre de traitement)

| # | Statut | Description |
|---|--------|-------------|
| D1 | ✅ fait | **Supprimer sélecteur BF** — Seul mode disponible, le `<select id="ai-level">` est inutile. |
| D2 | À faire | Aligner les 4 Piles communes verticalement avec les zones joueurs. |
| D3 | À faire | Slider redimensionnement sans réduire les cartes tant qu'on ne touche pas le bord droit du recyclage. |
| D4 | À faire | Déplacer menus et widgets sous le titre "CrapKa". |
| D5 | À faire | Bouton Règles + crédits A&S. |
| D6 | À faire | Sauvegarde partie + paramètres en localStorage (cookie). |
| D7 | ✅ fait | **Snapshot** — Copie directe dans le presse-papier + message bref "Snapshot terminé", sans modale. |
| D8 | À faire | Animation victoire. |

### Long terme
- Suite descendante en Défausse (règle optionnelle)
- Évaluation probabiliste de la Pioche
- Mode multijoueur réseau (FastAPI + WebSockets)

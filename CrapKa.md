# CrapKa — Documentation projet

## Stack technique
- Frontend : HTML/JS vanilla, fichier unique `crapka_v4.html`
- Backend futur : FastAPI (Python) + WebSockets, port 8003
- DB future : SQLite
- Environnement : Windows, VSCode + Claude Code

## Fichiers
- `crapka_v4.html` : prototype jouable complet (2 joueurs même écran + IA)
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
- La Demande est un coup comme un autre (évalué par le minimax)

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

### Niveaux (sélecteur 🧠)
- **Niv 1** : greedy pur (`_aiGreedyMove`)
- **Niv 2-5** : minimax avec alpha-beta (profondeur = niveau en tours)

### Flux d'exécution IA (`aiPlayTurn`)
1. `_saveGameState()` : snapshot de l'état réel
2. `_buildAiSequence()` : calcule la séquence sur une copie
   - `_applyForcedMoves()` : coups imposés (Dame→écart, Roi pending, As sur Pile vide)
   - `_miniMaxBestSequence(depth)` : retourne moves `play/clear/init/demand`
   - Les moves `end` (défausse) sont filtrés — `_aiDiscard` s'en chargera
3. `_restoreGameState()` : remet l'état original
4. `_replayMoves(moves)` : anime les coups un par un
   - Quand la liste est vide, relance `_buildAiSequence` pour les coups restants (demandes, Crapette devenue jouable)
   - Si rien, appelle `_aiDiscard` pour choisir la défausse

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

### Fonction d'évaluation `_eval`
| Critère | Points |
|---------|--------|
| Crapette IA posée | +50/carte |
| Crapette adverse jouable | -40 |
| Crapette IA jouable | +30 |
| Carte de Main jouable | +4 |
| Main vide + Pioche dispo | +15 |
| Piles proches Crapette (dist. circulaire) | jusqu'à +22 |
| Diversité Défausses | +3/valeur différente |

### Priorités `_mvPrio`
| Type | Score |
|------|-------|
| `play` Crapette non-Roi | 100 |
| `demand` mène à Crapette | 90 |
| `play` Roi Crapette chaîne→Dame | 80-90 |
| `play` mène à la Crapette | 60 |
| `demand` dist≤3 vers Crapette | 55 |
| `play` Dame | 35-38 |
| `clear` | 25 |
| `demand` générique | 20 |
| `play` Roi (finalVal≥10) | 40 |
| `init` | 5 |

### Paramètres minimax
- `_MM_MAX_NODES = 3000`
- Branching : 4 coups max IA, 3 adversaire
- Depth = niveau IA (en tours, pas en coups)
- Tie-break : `_mvKey(mv)` = `ci×100000 + uid×10 + srcIdx`

### Sauvegardes / Undo
- `saveUndo()` / `_buildUndoSnap()` / `_restoreFromSnap(s)` : undo complet
- 20 niveaux d'undo, sauvegardé avant chaque action (humain ou IA)
- `localStorage` : `crapka_save_<nom>` pour sauvegardes nommées

---

## Problème architectural en cours

Le flux "minimax → replay → minimax" est fragile :
- Le minimax planifie une séquence partielle
- `_replayMoves` rejoue les moves animés
- À la fin, un second minimax est relancé pour les coups restants (demandes, Crapette devenue jouable après une demande)
- `_aiDiscard` est appelé en dernier pour la défausse

**Objectif** : le minimax devrait planifier la séquence complète en une passe. `_aiDiscard` ne devrait faire que choisir la carte à défausser.

**Bug à corriger** : le Recyclage met les cartes *sous* la Pioche selon les règles, mais l'implémentation actuelle remplace la Pioche entière par le Recyclage mélangé.

---

## Mode debug (bouton 🐛)
- Cartes IA face visible
- Log : `[IA] M:... | D:... | Cr:...` après chaque coup
- Mode pas-à-pas (case PàP + bouton ▶)
- Log minimax : branches avec séquence et score
- Log demandes : `[D] BUILD`, `[D] Legal`, `[D] Sources`, `[D] sWP`

## Animations
- `flyCard(card, fromR, toR, cb)` : animation de vol CSS
- `SPEEDS=[0, 4000, 2000, 1200, 600, 250]` ms, slider 0-5, défaut=3
- Demande : blink rouge 3× avant déplacement

## TODO
- Résoudre le problème architectural du flux minimax → replay (Crapette jouable après demande)
- Corriger le Recyclage : mettre sous la Pioche et non remplacer
- Suite descendante en Défausse
- Évaluation probabiliste de la Pioche

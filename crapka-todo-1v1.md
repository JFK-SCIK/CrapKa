# CrapKa — Todo mode 1v1 réseau

## Bug 1 — Roi sans valeur après pose (pileKingPending non géré en init_pile)

**Symptôme** : jouer un R, il reste affiché "R" au lieu de "R?" puis "R[val]".

**Cause identifiée** : dans `server/game_logic.py`, l'action `init_pile` (pose d'une carte
depuis la main/crapette/défausse sur une pile vide) n'applique `pileKingPending=True`
que quand la carte vient de la pioche (`from_pioche`). Quand le Roi vient d'une autre
source, le serveur ne le marque pas "en attente" → le `state_update` renvoyé a
`pileKingPending=false` et `pileKingVal=null` → rendu affiche juste "R".

**Fichier** : `server/game_logic.py`, action `init_pile`, branche `else` (non-pioche).

**Complexité** : ⭐ Facile — 2 lignes Python à ajouter.

---

## Bug 2 — Retour arrière (undo) désynchronise l'état réseau

**Symptôme** : plusieurs clics undo → on revient à un état local ancien mais le serveur
garde l'état courant → plus possible de jouer.

**Cause** : `undo()` restaure un snapshot local de `G` + `UI.*` sans informer le serveur.
Le client et le serveur ont alors des états différents.

**Fichier** : `ui.js` (bouton `#btn-undo`) et/ou `game.js` (`undo()`).

**Fix** : désactiver le bouton undo et bloquer la fonction en `UI.netMode`.

**Complexité** : ⭐ Facile — 1 guard `if(UI.netMode) return` + griser le bouton.

---

## Ergonomie 1 — Pas d'animation pour les coups adverses

**Symptôme** : quand l'adversaire joue, on reçoit directement le nouvel état via
`state_update` → `render()` brutal, aucune animation de déplacement de carte.

**Cause** : en mode réseau, on ne rejoue pas le coup — on applique juste le diff d'état.
Pour animer, il faudrait comparer l'état précédent au nouvel état carte par carte et
rejouer `flyCard()` pour chaque changement détecté.

**Complexité** : ⭐⭐⭐ Difficile — diff d'état + orchestration des animations, risque de
régression sur les autres modes.

---

## Ergonomie 2 — Touche Entrée ne valide pas les formulaires réseau

**Symptôme** : dans les panels "Créer" / "Rejoindre", appuyer sur Entrée ne fait rien.

**Fix** : ajouter `onkeydown="if(event.key==='Enter') <action>()"` sur chaque `<input>`
dans `showNetCreatePanel()` et `showNetJoinPanel()` dans `net.js`.

**Complexité** : ⭐ Facile — 2 attributs `onkeydown` à ajouter.

---

## Ergonomie 3 — Joueur actif (local) toujours en bas

**Symptôme** : si on est le joueur 0 (créateur de room), on est affiché en haut au lieu
d'être en bas comme le joueur humain l'est toujours en mode IA.

**Cause** : `ui.js` lignes 294-296 :
```js
let topIdx, botIdx;
if(UI.vsAI){ topIdx=UI.aiIdx; botIdx=0; }
else        { topIdx=0;        botIdx=1; }   // ← ignore UI.pidx
```
En mode réseau, `botIdx` devrait être `UI.pidx`.

**Fix** :
```js
else if(UI.netMode){ topIdx=1-UI.pidx; botIdx=UI.pidx; }
else               { topIdx=0;         botIdx=1; }
```

**Complexité** : ⭐ Facile — 1 ligne à ajouter dans `ui.js`.

---

## Ergonomie 4 — Filigrane "undefined" sur le dos des cartes

**Symptôme** : les cartes face cachée (adversaire, pioche…) affichent "undefined" en
filigrane, jamais vu avant le mode réseau.

**Cause probable** : `_fakeArr()` crée `{uid, hidden:true}` sans propriété `value` ni
`suit`. Si une branche de rendu (template littéral) injecte `card.value` sans vérifier
`card.hidden`, on obtient "undefined".

**Fichier** : à localiser précisément dans `ui.js` (chercher les templates qui
utilisent `card.value` sans guard `hidden`).

**Complexité** : ⭐ Facile — guard `card.hidden ? '' : card.value` ou similaire.

---

## Ordre de traitement suggéré

1. Bug 2 (undo) — rapide, évite des états pourris pendant les tests
2. Ergonomie 3 (joueur en bas) — rapide, confort immédiat
3. Ergonomie 2 (Entrée valide) — rapide
4. Bug 1 (Roi / pileKingPending) — serveur, facile mais nécessite déploiement
5. Ergonomie 4 (undefined) — diagnostic + fix
6. Ergonomie 1 (animations adversaire) — gros chantier, après le reste

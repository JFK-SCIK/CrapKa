import random
from copy import deepcopy
from typing import Optional

SUITS = ['♠', '♥', '♦', '♣']
VALS  = ['A','2','3','4','5','6','7','8','9','10','V','D','R']
VNUM  = {'A':1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'V':11,'D':12,'R':13}
SCOL  = {'♠':'black','♥':'red','♦':'red','♣':'black'}

_uid = 0

def _next_uid() -> int:
    global _uid
    _uid += 1
    return _uid

def _make_card(v: str, s: str) -> dict:
    return {'uid': _next_uid(), 'value': v, 'suit': s, 'num': VNUM[v], 'color': SCOL[s]}

def _make_deck() -> list:
    return [_make_card(v, s) for s in SUITS for v in VALS]

def _shuffle(d: list) -> list:
    r = d[:]
    random.shuffle(r)
    return r

def _sort_hand(h: list) -> list:
    return sorted(h, key=lambda c: c['num'])

def peek(pile: list) -> Optional[dict]:
    return pile[-1] if pile else None


# ── Nouvelle partie ──────────────────────────────────────────────────────────

def new_game(name0: str = 'Joueur 1', name1: str = 'Joueur 2') -> dict:
    global _uid
    _uid = 0

    d0 = _shuffle(_make_deck())
    d1 = _shuffle(_make_deck())

    cr0, d0  = d0[:21], d0[21:]
    p0c0, d0 = d0[0], d0[1:]   # J1 → pile 0
    p0c1, d0 = d0[0], d0[1:]   # J1 → pile 1
    h0,  d0  = _sort_hand(d0[:5]), d0[5:]

    cr1, d1  = d1[:21], d1[21:]
    p1c2, d1 = d1[0], d1[1:]   # J2 → pile 2
    p1c3, d1 = d1[0], d1[1:]   # J2 → pile 3
    h1,  d1  = _sort_hand(d1[:5]), d1[5:]

    pioche = _shuffle(d0 + d1)

    def cv(c): return 2 if c['num'] == 13 else c['num']
    v0, v1 = cv(cr0[-1]), cv(cr1[-1])
    if   v0 < v1: first, reason = 0, 'crapette plus petite'
    elif v1 < v0: first, reason = 1, 'crapette plus petite'
    elif p0c0['num'] < p1c2['num']: first, reason = 0, '1ère carte de pile'
    elif p1c2['num'] < p0c0['num']: first, reason = 1, '1ère carte de pile'
    elif p0c1['num'] < p1c3['num']: first, reason = 0, '2ème carte de pile'
    elif p1c3['num'] < p0c1['num']: first, reason = 1, '2ème carte de pile'
    else: first, reason = random.randint(0, 1), 'tirage au sort'

    king_pend = [c['num'] == 13 for c in [p0c0, p0c1, p1c2, p1c3]]

    return {
        'players': [
            {'name': name0, 'crapette': cr0, 'hand': h0, 'defausse': [[],[],[],[]]},
            {'name': name1, 'crapette': cr1, 'hand': h1, 'defausse': [[],[],[],[]]},
        ],
        'commons':       [[p0c0],[p0c1],[p1c2],[p1c3]],
        'pioche':        pioche,
        'futurePioche':  [],
        'cur':           first,
        'phase':         'play',
        'winner':        None,
        'startDefSnap':      None,
        'startCommonsSnap':  None,
        'startKingValSnap':  None,
        'startKingPendSnap': None,
        'pileKingVal':   [None, None, None, None],
        'pileKingPending': king_pend,
        '_firstReason':  reason,
    }


# ── Application d'un coup ────────────────────────────────────────────────────

def _ensure_pioche(G: dict):
    if not G['pioche'] and G['futurePioche']:
        G['pioche'] = _shuffle(G['futurePioche'])
        G['futurePioche'] = []

def _draw_to_five(G: dict, p: dict):
    """Complète la main jusqu'à 5 cartes, avec reshuffle si nécessaire (miroir de drawToFive JS)."""
    drawn = []
    needed = 5 - len(p['hand'])
    while len(drawn) < needed:
        if not G['pioche']:
            if not G['futurePioche']:
                break
            _ensure_pioche(G)
        if G['pioche']:
            drawn.append(G['pioche'].pop())
        else:
            break
    if drawn:
        p['hand'] = _sort_hand(p['hand'] + drawn)

def _pop_card_from_sources(G: dict, pidx: int, uid: int) -> Optional[dict]:
    p = G['players'][pidx]
    for i, c in enumerate(p['hand']):
        if c['uid'] == uid:
            return p['hand'].pop(i)
    if p['crapette'] and p['crapette'][-1]['uid'] == uid:
        return p['crapette'].pop()
    for col in p['defausse']:
        if col and col[-1]['uid'] == uid:
            return col.pop()
    return None

def apply_move(G: dict, pidx: int, move: dict) -> tuple[bool, str]:
    action = move.get('action')
    p   = G['players'][pidx]
    opp = 1 - pidx

    # Validation tour (sauf demand qui se joue pendant le tour adverse)
    if action != 'demand' and G['cur'] != pidx:
        return False, 'not_your_turn'

    # ── draw ─────────────────────────────────────────────────────────────────
    if action == 'draw':
        _draw_to_five(G, p)
        return True, ''

    # ── play ─────────────────────────────────────────────────────────────────
    if action == 'play':
        uid = move.get('card_uid')
        ci  = move.get('target_index')
        if ci is None: return False, 'missing_target'

        card = _pop_card_from_sources(G, pidx, uid)
        if card is None: return False, 'card_not_found'

        if card['num'] == 13:
            if not G['commons'][ci]:
                # Roi seul sur pile vide → valeur à déterminer par la carte suivante
                G['pileKingPending'][ci] = True
                G['pileKingVal'][ci]     = None
                G['commons'][ci].append(card)
            else:
                # Roi sur pile non-vide → valeur = carte dessous + 1
                below = G['commons'][ci][-1]
                if below['num'] == 13:
                    below_val = G['pileKingVal'][ci] if G['pileKingVal'][ci] is not None else 13
                else:
                    below_val = below['num']
                new_val = below_val + 1
                G['pileKingPending'][ci] = False
                G['commons'][ci].append(card)
                if new_val >= 12:
                    # Pile écartée (≥ Dame)
                    G['futurePioche'].extend(G['commons'][ci])
                    G['commons'][ci]         = []
                    G['pileKingVal'][ci]     = None
                    G['pileKingPending'][ci] = False
                else:
                    G['pileKingVal'][ci] = new_val
        elif G['pileKingPending'][ci]:
            # Carte non-Roi sur pile avec Roi pending → fixe la valeur du Roi
            G['pileKingVal'][ci]     = card['num'] - 1
            G['pileKingPending'][ci] = False
            G['commons'][ci].append(card)
        else:
            G['commons'][ci].append(card)

        if not p['crapette']:
            G['phase']  = 'game-over'
            G['winner'] = pidx
        return True, ''

    # ── discard ───────────────────────────────────────────────────────────────
    if action == 'discard':
        uid = move.get('card_uid')
        di  = move.get('defausse_index')
        if di is None: return False, 'missing_defausse'

        card = None
        for i, c in enumerate(p['hand']):
            if c['uid'] == uid:
                card = p['hand'].pop(i)
                break
        if card is None: return False, 'card_not_found'

        p['defausse'][di].append(card)

        # Snapshot pour les demandes
        G['startDefSnap']      = deepcopy(G['players'][pidx]['defausse'])
        G['startCommonsSnap']  = deepcopy(G['commons'])
        G['startKingValSnap']  = G['pileKingVal'][:]
        G['startKingPendSnap'] = G['pileKingPending'][:]

        G['cur'] = opp

        # Auto-distribue au nouveau joueur actif (miroir de nextPlayer→drawToFive)
        opp_p = G['players'][opp]
        _draw_to_five(G, opp_p)

        return True, ''

    # ── init_pile ─────────────────────────────────────────────────────────────
    if action == 'init_pile':
        ci          = move.get('target_index')
        from_pioche = move.get('from_pioche', False)
        if ci is None: return False, 'missing_target'

        if from_pioche:
            _ensure_pioche(G)
            if not G['pioche']: return False, 'pioche_empty'
            card = G['pioche'].pop()
            if card['num'] == 13:
                G['pileKingPending'][ci] = True
                G['pileKingVal'][ci]     = None
        else:
            card = _pop_card_from_sources(G, pidx, move.get('card_uid'))
            if card is None: return False, 'card_not_found'
            if card['num'] == 13:
                G['pileKingPending'][ci] = True
                G['pileKingVal'][ci]     = None

        G['commons'][ci].append(card)
        if not p['crapette']:
            G['phase']  = 'game-over'
            G['winner'] = pidx
        return True, ''

    # ── clear_pile ────────────────────────────────────────────────────────────
    if action == 'clear_pile':
        ci = move.get('target_index')
        if ci is None: return False, 'missing_target'
        G['futurePioche'].extend(G['commons'][ci])
        G['commons'][ci]         = []
        G['pileKingVal'][ci]     = None
        G['pileKingPending'][ci] = False
        return True, ''

    # ── demand ────────────────────────────────────────────────────────────────
    if action == 'demand':
        if G['cur'] != pidx: return False, 'not_your_turn'
        uid    = move.get('card_uid')
        ci     = move.get('target_index')
        src_di = move.get('src_index')
        if src_di is None or ci is None: return False, 'missing_params'

        opp_col = G['players'][opp]['defausse'][src_di]
        if not opp_col or opp_col[-1]['uid'] != uid: return False, 'card_not_accessible'

        card = opp_col.pop()
        G['commons'][ci].append(card)
        return True, ''

    return False, f'unknown_action:{action}'


# ── Vue filtrée ───────────────────────────────────────────────────────────────

def filter_state(G: dict, pidx: int) -> dict:
    players_view = []
    for i in range(2):
        pl  = G['players'][i]
        cr  = pl['crapette']
        pd  = {
            'name':     pl['name'],
            'crapette': {'count': len(cr), 'top': cr[-1] if cr else None},
            'defausse': pl['defausse'],
        }
        if i == pidx:
            pd['hand'] = pl['hand']
        else:
            pd['hand_count'] = len(pl['hand'])
        players_view.append(pd)

    return {
        'your_pidx':        pidx,
        'cur':              G['cur'],
        'phase':            G['phase'],
        'winner':           G['winner'],
        'pileKingVal':      G['pileKingVal'],
        'pileKingPending':  G['pileKingPending'],
        'commons':          G['commons'],
        'pioche_count':     len(G['pioche']),
        'futurePioche_count': len(G['futurePioche']),
        'players':          players_view,
        'startDefSnap':     G['startDefSnap'],
        'startCommonsSnap': G['startCommonsSnap'],
        'startKingValSnap': G['startKingValSnap'],
        'startKingPendSnap':G['startKingPendSnap'],
    }

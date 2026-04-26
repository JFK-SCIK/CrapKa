import json
import secrets
import time
import random
from pathlib import Path
from typing import Optional
from fastapi import WebSocket

ROOM_TTL   = 4 * 3600   # 4h sans activité → supprimée
_ROOMS_DIR = Path(__file__).parent / 'rooms'

_ADJECTIFS = ['ROUGE','BLEU','VERT','NOIR','BLANC','JAUNE','ROSE','GRIS','AZUR','OR']

def _gen_code() -> str:
    return f"{random.choice(_ADJECTIFS)}-{random.randint(10, 99)}"


class Room:
    def __init__(self, code: str):
        self.code            = code
        self.G: Optional[dict] = None
        self.connections: list[Optional[WebSocket]] = [None, None]
        self.player_names    = ['Joueur 1', 'Joueur 2']
        self.names_ready     = [False, False]
        self.tokens          = [None, None]   # token de session par slot
        self.uuids           = [None, None]   # UUID navigateur par slot
        self.last_activity   = time.time()
        self.stats_recorded  = False
        self.prev_state      = None
        self.can_undo        = False
        self.undo_requester  = None
        self.undo_refusals   = 0

    def touch(self):
        self.last_activity = time.time()

    def is_stale(self) -> bool:
        return time.time() - self.last_activity > ROOM_TTL

    def available_slot(self) -> Optional[int]:
        for i, ws in enumerate(self.connections):
            if ws is None:
                return i
        return None

    def is_full(self) -> bool:
        return all(ws is not None for ws in self.connections)

    async def send_to(self, pidx: int, msg: dict):
        ws = self.connections[pidx]
        if ws:
            try:
                await ws.send_json(msg)
            except Exception:
                self.connections[pidx] = None

    async def broadcast(self, msg: dict):
        for i in range(2):
            await self.send_to(i, msg)


_rooms: dict[str, Room] = {}


# ── Persistance ──────────────────────────────────────────────────────────────

def save_room(room: Room):
    _ROOMS_DIR.mkdir(exist_ok=True)
    data = {
        'code':           room.code,
        'player_names':   room.player_names,
        'tokens':         room.tokens,
        'uuids':          room.uuids,
        'names_ready':    room.names_ready,
        'G':              room.G,
        'prev_state':     room.prev_state,
        'can_undo':       room.can_undo,
        'undo_requester': room.undo_requester,
        'undo_refusals':  room.undo_refusals,
        'stats_recorded': room.stats_recorded,
        'last_activity':  room.last_activity,
    }
    (_ROOMS_DIR / f'{room.code}.json').write_text(
        json.dumps(data, ensure_ascii=False), encoding='utf-8'
    )


def _delete_room_file(code: str):
    try:
        (_ROOMS_DIR / f'{code}.json').unlink(missing_ok=True)
    except Exception:
        pass


def load_rooms():
    _ROOMS_DIR.mkdir(exist_ok=True)
    loaded = 0
    for f in _ROOMS_DIR.glob('*.json'):
        try:
            data = json.loads(f.read_text(encoding='utf-8'))
            room = Room(data['code'])
            room.player_names   = data['player_names']
            room.tokens         = data['tokens']
            room.uuids          = data.get('uuids', [None, None])
            room.names_ready    = data['names_ready']
            room.G              = data.get('G')
            room.prev_state     = data.get('prev_state')
            room.can_undo       = data.get('can_undo', False)
            room.undo_requester = data.get('undo_requester')
            room.undo_refusals  = data.get('undo_refusals', 0)
            room.stats_recorded = data.get('stats_recorded', False)
            room.last_activity  = data.get('last_activity', time.time())
            if room.is_stale():
                f.unlink(missing_ok=True)
            else:
                _rooms[room.code] = room
                loaded += 1
        except Exception as e:
            print(f'[rooms] Erreur chargement {f.name}: {e}')
    if loaded:
        print(f'[rooms] {loaded} salle(s) restaurée(s) depuis le disque')


# ── Gestion des salles ────────────────────────────────────────────────────────

def create_room() -> Room:
    _cleanup()
    for _ in range(200):
        code = _gen_code()
        if code not in _rooms:
            room = Room(code)
            _rooms[code] = room
            return room
    raise RuntimeError('Impossible de générer un code de room unique')


def get_room(code: str) -> Optional[Room]:
    return _rooms.get(code.upper().strip())


def _cleanup():
    stale = [c for c, r in _rooms.items() if r.is_stale()]
    for c in stale:
        del _rooms[c]
        _delete_room_file(c)

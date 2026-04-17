import time
import random
from typing import Optional
from fastapi import WebSocket

ROOM_TTL = 4 * 3600  # 4h sans activité → supprimée

_ADJECTIFS = ['ROUGE','BLEU','VERT','NOIR','BLANC','JAUNE','ROSE','GRIS','AZUR','OR']

def _gen_code() -> str:
    return f"{random.choice(_ADJECTIFS)}-{random.randint(10, 99)}"


class Room:
    def __init__(self, code: str):
        self.code            = code
        self.G: Optional[dict] = None
        self.connections: list[Optional[WebSocket]] = [None, None]
        self.player_names    = ['Joueur 1', 'Joueur 2']
        self.last_activity   = time.time()

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

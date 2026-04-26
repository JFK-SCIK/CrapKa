import json
import threading
from pathlib import Path

_FILE = Path(__file__).parent / 'players.json'
_lock = threading.Lock()


def _load() -> dict:
    try:
        return json.loads(_FILE.read_text(encoding='utf-8')) if _FILE.exists() else {}
    except Exception:
        return {}


def _save(data: dict):
    _FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')


def _make_alias(uuid: str, taken: set) -> str:
    clean = uuid.replace('-', '')
    padded = clean + '0' * 32
    for i in range(0, 32, 8):
        chunk = padded[i:i + 8]
        if chunk not in taken:
            return chunk
    return clean[:8]


def register(uuid: str, name: str) -> str:
    """Enregistre/met à jour un UUID. Retourne l'alias 8 caractères."""
    with _lock:
        data = _load()
        if uuid in data:
            data[uuid]['last_name'] = name
            _save(data)
            return data[uuid]['alias']
        taken = {v['alias'] for v in data.values()}
        alias = _make_alias(uuid, taken)
        data[uuid] = {'alias': alias, 'last_name': name}
        _save(data)
        return alias


def get_alias(uuid: str) -> str | None:
    with _lock:
        return _load().get(uuid, {}).get('alias')


def get_name(uuid: str) -> str | None:
    with _lock:
        return _load().get(uuid, {}).get('last_name')


def net_key(name: str, uuid: str | None) -> str:
    """Clé stats pour une partie réseau : NomRéseau(alias8) ou juste le nom."""
    if uuid:
        alias = get_alias(uuid)
        if alias:
            return f'{name}({alias})'
    return name


def solo_key(uuid: str | None) -> str:
    """Clé stats pour une partie solo : -(alias8) ou -."""
    if uuid:
        alias = get_alias(uuid)
        if alias:
            return f'-({alias})'
    return '-'

import json
import os
import threading
from pathlib import Path

_DATA_DIR    = Path(os.environ.get('CRAPKA_DATA_DIR', str(Path(__file__).parent)))
_CONFIG_FILE = _DATA_DIR / 'ai_config.json'
_lock = threading.Lock()

_DEFAULT_PROFILES = [
    {'key': 'tibolos',    'name': 'Tibolos',    'enabled': True},
    {'key': 'patcartier', 'name': 'PatCartier', 'enabled': True},
    {'key': 'nomistek',   'name': 'Nomistek',   'enabled': True},
]


def _load() -> dict:
    if _CONFIG_FILE.exists():
        try:
            return json.loads(_CONFIG_FILE.read_text(encoding='utf-8'))
        except Exception:
            pass
    return {'profiles': [p.copy() for p in _DEFAULT_PROFILES]}


def _save(data: dict):
    _CONFIG_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8'
    )


def get_config() -> dict:
    with _lock:
        return _load()


def toggle(key: str, enabled: bool) -> bool:
    with _lock:
        data = _load()
        for p in data['profiles']:
            if p['key'] == key:
                p['enabled'] = enabled
                _save(data)
                return True
        return False

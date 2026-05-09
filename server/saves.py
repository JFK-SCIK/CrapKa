import json
import os
import threading
import uuid
from datetime import datetime
from pathlib import Path

_DATA_DIR  = Path(os.environ.get('CRAPKA_DATA_DIR', str(Path(__file__).parent)))
_SAVES_DIR = _DATA_DIR / 'saves'
_lock = threading.Lock()


def _path(save_id: str) -> Path:
    return _SAVES_DIR / f'{save_id}.json'


def _meta(data: dict) -> dict:
    return {k: v for k, v in data.items() if k != 'snap'}


def create(snap: dict, ai_name: str, name: str = '') -> dict:
    with _lock:
        _SAVES_DIR.mkdir(exist_ok=True)
        save_id = str(uuid.uuid4())
        now = datetime.utcnow().strftime('%Y-%m-%dT%H:%M:%SZ')
        if not name:
            name = 'auto-' + datetime.utcnow().strftime('%Y-%m-%d %H:%M:%S')
        data = {
            'id': save_id, 'name': name, 'created': now,
            'ai_name': ai_name, 'snap': snap,
        }
        _path(save_id).write_text(
            json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8'
        )
        return _meta(data)


def list_saves() -> list:
    with _lock:
        if not _SAVES_DIR.exists():
            return []
        result = []
        for f in sorted(_SAVES_DIR.glob('*.json'),
                        key=lambda p: p.stat().st_mtime, reverse=True):
            try:
                data = json.loads(f.read_text(encoding='utf-8'))
                result.append(_meta(data))
            except Exception:
                pass
        return result


def get(save_id: str) -> dict | None:
    p = _path(save_id)
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding='utf-8'))
    except Exception:
        return None


def delete(save_id: str) -> bool:
    p = _path(save_id)
    if p.exists():
        p.unlink()
        return True
    return False


def rename(save_id: str, name: str) -> bool:
    with _lock:
        p = _path(save_id)
        if not p.exists():
            return False
        data = json.loads(p.read_text(encoding='utf-8'))
        data['name'] = name[:60]
        p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
        return True

import json
import os
import re
import subprocess
import threading
from datetime import datetime
from pathlib import Path

_DATA_DIR    = Path(os.environ.get('CRAPKA_DATA_DIR', str(Path(__file__).parent)))
_CONFIG_FILE = _DATA_DIR / 'ai_config.json'
_JS_DIR      = Path(__file__).parent.parent   # racine du repo
_lock = threading.Lock()

_DEFAULT_PROFILES = [
    {'key': 'tibolos',    'name': 'Tibolos',    'enabled': True},
    {'key': 'patcartier', 'name': 'PatCartier', 'enabled': True},
    {'key': 'nomistek',   'name': 'Nomistek',   'enabled': True},
]


def _load() -> dict:
    on_disk = {}
    if _CONFIG_FILE.exists():
        try:
            data = json.loads(_CONFIG_FILE.read_text(encoding='utf-8'))
            on_disk = {p['key']: p for p in data.get('profiles', [])}
        except Exception:
            pass
    # Toujours retourner au moins les defaults ; on_disk prime sur les clés connues
    profiles = [on_disk.get(d['key'], d.copy()) for d in _DEFAULT_PROFILES]
    return {'profiles': profiles}


def _save(data: dict):
    _CONFIG_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8'
    )


def _js_info(key: str) -> dict:
    js_file = _JS_DIR / f'ai_{key}.js'
    info = {'version': None, 'updated': None, 'git_hash': None, 'git_msg': None}
    if not js_file.exists():
        return info
    try:
        content = js_file.read_text(encoding='utf-8', errors='replace')
        m = re.search(r"const _VER_AI_\w+='([^']+)'", content)
        if m:
            info['version'] = m.group(1)
        mtime = js_file.stat().st_mtime
        info['updated'] = datetime.fromtimestamp(mtime).strftime('%Y-%m-%d %H:%M')
    except Exception:
        pass
    try:
        log = subprocess.check_output(
            ['git', '-C', str(_JS_DIR), 'log', '-1', '--format=%h|%s', '--', f'ai_{key}.js'],
            text=True, stderr=subprocess.DEVNULL
        ).strip()
        if log:
            parts = log.split('|', 1)
            info['git_hash'] = parts[0]
            info['git_msg']  = parts[1] if len(parts) > 1 else ''
    except Exception:
        pass
    return info


def get_config() -> dict:
    with _lock:
        data = _load()
        for p in data['profiles']:
            p.update(_js_info(p['key']))
        return data


def toggle(key: str, enabled: bool) -> bool:
    with _lock:
        data = _load()
        for p in data['profiles']:
            if p['key'] == key:
                p['enabled'] = enabled
                _save(data)
                return True
        return False

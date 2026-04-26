import json
import threading
from datetime import datetime, timezone
from pathlib import Path

_STATS_FILE = Path(__file__).parent / 'stats.json'
_LOG_FILE   = Path(__file__).parent / 'games.json'
_lock = threading.Lock()


def _load() -> dict:
    if _STATS_FILE.exists():
        try:
            return json.loads(_STATS_FILE.read_text(encoding='utf-8'))
        except Exception:
            pass
    return {}


def _save(data: dict):
    _STATS_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8'
    )


def _ensure(data: dict, key: str):
    if key not in data:
        data[key] = {'games': 0, 'wins': 0, 'losses': 0, 'abandons': 0, 'vs': {}}
    elif 'abandons' not in data[key]:
        data[key]['abandons'] = 0


def record_game(winner_name: str, loser_name: str):
    with _lock:
        data = _load()
        for name, opponent, won in [
            (winner_name, loser_name, True),
            (loser_name, winner_name, False),
        ]:
            _ensure(data, name)
            p = data[name]
            p['games'] += 1
            if won:
                p['wins'] += 1
            else:
                p['losses'] += 1
            if opponent not in p['vs']:
                p['vs'][opponent] = {'games': 0, 'wins': 0, 'losses': 0, 'abandons': 0}
            elif 'abandons' not in p['vs'][opponent]:
                p['vs'][opponent]['abandons'] = 0
            v = p['vs'][opponent]
            v['games'] += 1
            if won:
                v['wins'] += 1
            else:
                v['losses'] += 1
        _save(data)
        _log_game(winner_name, loser_name, 'finished')


def record_abandon(key_a: str, key_b: str | None = None):
    """Enregistre un abandon. key_a a abandonné ; key_b est l'adversaire (si dispo)."""
    with _lock:
        data = _load()
        for key, opp in [(key_a, key_b), (key_b, key_a)] if key_b else [(key_a, None)]:
            if key is None:
                continue
            _ensure(data, key)
            data[key]['games'] += 1
            data[key]['abandons'] += 1
            if opp:
                if opp not in data[key]['vs']:
                    data[key]['vs'][opp] = {'games': 0, 'wins': 0, 'losses': 0, 'abandons': 0}
                elif 'abandons' not in data[key]['vs'][opp]:
                    data[key]['vs'][opp]['abandons'] = 0
                data[key]['vs'][opp]['games'] += 1
                data[key]['vs'][opp]['abandons'] += 1
        _save(data)
        _log_game(key_a, key_b or '?', 'abandoned')


def _log_game(winner: str, loser: str, status: str = 'finished'):
    entry = {
        'ts':     datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'winner': winner,
        'loser':  loser,
        'status': status,
    }
    log = []
    if _LOG_FILE.exists():
        try:
            log = json.loads(_LOG_FILE.read_text(encoding='utf-8'))
        except Exception:
            pass
    log.append(entry)
    _LOG_FILE.write_text(json.dumps(log, ensure_ascii=False, indent=2), encoding='utf-8')


def get_stats() -> dict:
    with _lock:
        return _load()

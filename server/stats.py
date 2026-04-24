import json
import threading
from pathlib import Path

_STATS_FILE = Path(__file__).parent / 'stats.json'
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


def record_game(winner_name: str, loser_name: str):
    with _lock:
        data = _load()
        for name, opponent, won in [
            (winner_name, loser_name, True),
            (loser_name, winner_name, False),
        ]:
            if name not in data:
                data[name] = {'games': 0, 'wins': 0, 'losses': 0, 'vs': {}}
            p = data[name]
            p['games'] += 1
            if won:
                p['wins'] += 1
            else:
                p['losses'] += 1
            if opponent not in p['vs']:
                p['vs'][opponent] = {'games': 0, 'wins': 0, 'losses': 0}
            v = p['vs'][opponent]
            v['games'] += 1
            if won:
                v['wins'] += 1
            else:
                v['losses'] += 1
        _save(data)


def get_stats() -> dict:
    with _lock:
        return _load()

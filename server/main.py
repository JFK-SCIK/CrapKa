import asyncio
import json
import os
import secrets
import subprocess
import time
from copy import deepcopy
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
import rooms as R
import game_logic as GL
import stats as ST

ADMIN_PWD  = os.environ.get('CRAPKA_ADMIN_PWD', '')
_DEPLOY_SH = Path(__file__).parent.parent / 'deploy.sh'
_deploy_task: asyncio.Task | None = None


def _check_admin(pwd: str):
    if ADMIN_PWD and pwd != ADMIN_PWD:
        raise HTTPException(status_code=403, detail='Mot de passe incorrect')


def _launch_deploy():
    subprocess.Popen(
        ['bash', str(_DEPLOY_SH)],
        start_new_session=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


async def _wait_and_deploy():
    try:
        while True:
            has_players = any(
                ws is not None
                for room in R._rooms.values()
                for ws in room.connections
            )
            if not has_players:
                _launch_deploy()
                return
            await asyncio.sleep(30)
    except asyncio.CancelledError:
        pass

app = FastAPI(title='CrapKa Server')


@app.on_event('startup')
async def _startup():
    R.load_rooms()
    asyncio.create_task(_room_cleanup_loop())


async def _room_cleanup_loop():
    while True:
        await asyncio.sleep(600)   # toutes les 10 minutes
        R._cleanup()

app.add_middleware(
    CORSMiddleware,
    allow_origins=['*'],
    allow_methods=['*'],
    allow_headers=['*'],
)

# Répertoire racine du repo (parent de server/)
_STATIC_DIR = Path(__file__).parent.parent


@app.get('/health')
async def health():
    return {'ok': True}


@app.get('/stats')
async def get_stats():
    return ST.get_stats()


@app.post('/stats/record')
async def record_stats(req: Request):
    body = await req.json()
    winner = body.get('winner', '').strip()
    loser  = body.get('loser',  '').strip()
    if winner and loser and winner != loser:
        ST.record_game(winner, loser)
    return {'ok': True}


@app.get('/status')
async def status():
    rooms = []
    for code, room in R._rooms.items():
        rooms.append({
            'code':      code,
            'players':   room.player_names,
            'connected': [ws is not None for ws in room.connections],
            'phase':     room.G.get('phase') if room.G else None,
            'idle_min':  round((time.time() - room.last_activity) / 60, 1),
        })
    return {
        'rooms':          rooms,
        'count':          len(rooms),
        'pending_deploy': _deploy_task is not None and not _deploy_task.done(),
    }


@app.post('/deploy/now')
async def deploy_now(pwd: str = ''):
    _check_admin(pwd)
    _launch_deploy()
    return {'ok': True}


@app.post('/deploy/wait')
async def deploy_wait_start(pwd: str = ''):
    global _deploy_task
    _check_admin(pwd)
    if _deploy_task is None or _deploy_task.done():
        _deploy_task = asyncio.create_task(_wait_and_deploy())
    return {'ok': True, 'pending': True}


@app.delete('/deploy/wait')
async def deploy_wait_cancel(pwd: str = ''):
    global _deploy_task
    _check_admin(pwd)
    if _deploy_task and not _deploy_task.done():
        _deploy_task.cancel()
    _deploy_task = None
    return {'ok': True, 'pending': False}


@app.post('/room')
async def create_room():
    room = R.create_room()
    return {'room_code': room.code}


def _build_move_info(G: dict, pidx: int, data: dict) -> dict:
    action = data.get('action', '')
    info = {'action': action, 'player_idx': pidx}
    ci = data.get('target_index')
    di = data.get('defausse_index')

    if action == 'play' and ci is not None:
        pile = G['commons'][ci]
        if pile: info['card'] = pile[-1]
        info['to_index']   = ci
        info['from_type']  = data.get('src_type', 'hand')
        info['from_index'] = data.get('src_index')

    elif action == 'init_pile' and ci is not None:
        pile = G['commons'][ci]
        if pile: info['card'] = pile[-1]
        info['to_index']   = ci
        info['from_type']  = 'pioche' if data.get('from_pioche') else data.get('src_type', 'hand')
        info['from_index'] = data.get('src_index')

    elif action == 'discard' and di is not None:
        col = G['players'][pidx]['defausse'][di]
        if col: info['card'] = col[-1]
        info['to_index']  = di
        info['from_type'] = 'hand'

    elif action == 'demand' and ci is not None:
        pile = G['commons'][ci]
        if pile: info['card'] = pile[-1]
        info['to_index']   = ci
        info['from_index'] = data.get('src_index')
        info['from_type']  = 'defausse'

    return info


@app.websocket('/ws/{room_code}')
async def ws_endpoint(ws: WebSocket, room_code: str):
    await ws.accept()

    room = R.get_room(room_code)
    if not room:
        await ws.send_json({'type': 'error', 'reason': 'room_not_found'})
        await ws.close()
        return

    # ── Premier message : 'set_name' (nouvelle connexion) ou 'reconnect' ──
    try:
        first = await ws.receive_json()
    except Exception:
        return

    pidx: int
    msg_type0 = first.get('type')

    if msg_type0 == 'reconnect':
        token = first.get('token', '')
        pidx = next((i for i, t in enumerate(room.tokens) if t and t == token), -1)
        if pidx == -1 or room.connections[pidx] is not None:
            await ws.send_json({'type': 'error', 'reason': 'session_expired'})
            await ws.close()
            return
        room.connections[pidx] = ws
        room.touch()
        if room.G is None:
            # Partie pas encore commencée — renvoyer en attente
            await ws.send_json({'type': 'connected', 'pidx': pidx,
                                'room_code': room.code, 'token': token})
        else:
            await ws.send_json({
                'type':     'reconnected',
                'pidx':     pidx,
                'state':    GL.filter_state(room.G, pidx),
                'can_undo': room.can_undo and room.G.get('cur') == pidx,
            })
            await room.send_to(1 - pidx, {
                'type': 'opponent_reconnected',
                'name': room.player_names[pidx],
            })

    elif msg_type0 == 'set_name':
        pidx = room.available_slot()
        if pidx is None:
            await ws.send_json({'type': 'error', 'reason': 'room_full'})
            await ws.close()
            return
        token = secrets.token_hex(16)
        room.tokens[pidx] = token
        room.connections[pidx] = ws
        room.touch()
        await ws.send_json({'type': 'connected', 'pidx': pidx,
                            'room_code': room.code, 'token': token})
        if pidx == 1:
            await room.send_to(0, {'type': 'opponent_connected'})
        name = str(first.get('name', f'Joueur {pidx+1}'))[:30]
        room.player_names[pidx] = name
        room.names_ready[pidx] = True
        if room.G:
            room.G['players'][pidx]['name'] = name
        elif room.is_full() and all(room.names_ready):
            room.G = GL.new_game(room.player_names[0], room.player_names[1])
            R.save_room(room)
            for i in range(2):
                await room.send_to(i, {
                    'type':         'game_start',
                    'state':        GL.filter_state(room.G, i),
                    'first_reason': room.G.get('_firstReason', ''),
                })
    else:
        await ws.close()
        return

    # ── Boucle principale ─────────────────────────────────────────────────
    try:
        while True:
            data = await ws.receive_json()
            room.touch()
            msg_type = data.get('type')

            if msg_type == 'ping':
                await ws.send_json({'type': 'pong'})
                continue

            if msg_type == 'undo_request':
                if not room.can_undo or room.prev_state is None or room.undo_requester is not None:
                    await ws.send_json({'type': 'undo_rejected', 'reason': 'not_allowed'})
                    continue
                room.undo_requester = pidx
                room.can_undo = False
                await room.send_to(1 - pidx, {
                    'type':    'undo_ask',
                    'name':    room.player_names[pidx],
                    'attempt': room.undo_refusals + 1,
                })
                continue

            if msg_type == 'undo_response':
                requester = room.undo_requester
                room.undo_requester = None
                if requester is None:
                    continue
                if data.get('accepted') and room.prev_state:
                    room.G = room.prev_state
                    room.prev_state = None
                    room.undo_refusals = 0
                    for i in range(2):
                        await room.send_to(i, {
                            'type':      'state_update',
                            'seq':       None,
                            'move_info': None,
                            'state':     GL.filter_state(room.G, i),
                            'undo':      True,
                        })
                else:
                    room.undo_refusals += 1
                    if room.undo_refusals >= 3:
                        room.prev_state = None
                        room.undo_refusals = 0
                        await room.send_to(requester, {'type': 'undo_rejected', 'reason': 'refused_final'})
                    else:
                        room.can_undo = True
                        await room.send_to(requester, {'type': 'undo_rejected', 'reason': 'refused'})
                continue

            if msg_type == 'move':
                if not room.G or room.G.get('phase') == 'game-over':
                    await ws.send_json({'type': 'error', 'reason': 'no_game', 'seq': data.get('seq')})
                    continue

                prev_g = deepcopy(room.G)
                ok, err = GL.apply_move(room.G, pidx, data)

                if not ok:
                    await ws.send_json({'type': 'move_rejected', 'seq': data.get('seq'), 'reason': err})
                    continue

                action      = data.get('action', '')
                src_type    = data.get('src_type', 'hand')
                future_grew = len(room.G['futurePioche']) > len(prev_g['futurePioche'])
                can_undo = (
                    action == 'play'
                    and src_type == 'hand'
                    and not future_grew
                    and room.G.get('phase') != 'game-over'
                )
                room.prev_state     = prev_g if can_undo else None
                room.can_undo       = can_undo
                room.undo_requester = None
                room.undo_refusals  = 0

                if (
                    room.G.get('phase') == 'game-over'
                    and room.G.get('winner') is not None
                    and not room.stats_recorded
                ):
                    room.stats_recorded = True
                    winner_idx = room.G['winner']
                    ST.record_game(
                        room.player_names[winner_idx],
                        room.player_names[1 - winner_idx],
                    )

                R.save_room(room)

                move_info = _build_move_info(room.G, pidx, data)

                for i in range(2):
                    msg = {
                        'type':      'state_update',
                        'seq':       data.get('seq'),
                        'move_info': move_info,
                        'state':     GL.filter_state(room.G, i),
                    }
                    if i == pidx:
                        msg['can_undo'] = can_undo
                    await room.send_to(i, msg)

    except WebSocketDisconnect:
        room.connections[pidx] = None
        R.save_room(room)
        await room.send_to(1 - pidx, {'type': 'opponent_disconnected'})
    except Exception:
        room.connections[pidx] = None
        R.save_room(room)

@app.get('/admin', response_class=HTMLResponse)
async def admin_page(pwd: str = ''):
    if ADMIN_PWD and pwd != ADMIN_PWD:
        raise HTTPException(status_code=403, detail='Mot de passe incorrect')
    admin_file = Path(__file__).parent / 'admin.html'
    return HTMLResponse(admin_file.read_text(encoding='utf-8'))


@app.get('/games')
async def get_games(date: str = ''):
    log_file = Path(__file__).parent / 'games.json'
    if not log_file.exists():
        return []
    games = json.loads(log_file.read_text(encoding='utf-8'))
    if date:
        games = [g for g in games if g['ts'].startswith(date)]
    return games


# Fichiers statiques — monté en dernier pour ne pas masquer les routes API
app.mount('/', StaticFiles(directory=_STATIC_DIR, html=True), name='static')

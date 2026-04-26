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
import players as PL

ADMIN_PWD   = os.environ.get('CRAPKA_ADMIN_PWD', '')
_DEPLOY_SH  = Path(__file__).parent.parent / 'deploy.sh'
_DEPLOY_LOG = Path(__file__).parent / 'deploy.log'
_deploy_task: asyncio.Task | None = None

# uuid → room_code  (partie réseau active par navigateur)
_uuid_room: dict[str, str] = {}
# uuid → timestamp ISO (partie solo active par navigateur)
_active_solo: dict[str, str] = {}


def _check_admin(pwd: str):
    if ADMIN_PWD and pwd != ADMIN_PWD:
        raise HTTPException(status_code=403, detail='Mot de passe incorrect')


def _launch_deploy():
    repo = str(Path(__file__).parent.parent)
    log = open(_DEPLOY_LOG, 'w')
    script = f'cd {repo} && git pull origin reseau-2j && sudo systemctl restart crapka'
    # start_new_session=True détache le processus du cgroup du service.
    # systemctl restart envoie l'ordre à systemd avant que bash soit tué.
    subprocess.Popen(['bash', '-c', script], start_new_session=True,
                     stdout=log, stderr=log)


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


@app.get('/version')
async def get_version():
    repo = str(Path(__file__).parent.parent)
    try:
        log = subprocess.check_output(
            ['git', '-C', repo, 'log', '-1', '--format=%h|%s|%ci'],
            text=True, stderr=subprocess.DEVNULL
        ).strip()
        parts = log.split('|', 2)
        branch = subprocess.check_output(
            ['git', '-C', repo, 'rev-parse', '--abbrev-ref', 'HEAD'],
            text=True, stderr=subprocess.DEVNULL
        ).strip()
        return {
            'hash':    parts[0] if len(parts) > 0 else '?',
            'message': parts[1] if len(parts) > 1 else '?',
            'date':    parts[2] if len(parts) > 2 else '?',
            'branch':  branch,
        }
    except Exception as e:
        return {'hash': '?', 'message': str(e), 'date': '?', 'branch': '?'}


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
    now = time.time()
    solo = []
    for uuid, started in _active_solo.items():
        alias = PL.get_alias(uuid) or uuid[:8]
        try:
            started_ts = time.mktime(time.strptime(started, '%Y-%m-%dT%H:%M:%SZ'))
            elapsed_min = round((now - started_ts) / 60, 1)
        except Exception:
            elapsed_min = None
        solo.append({'alias': alias, 'started': started, 'elapsed_min': elapsed_min})
    return {
        'rooms':          rooms,
        'count':          len(rooms),
        'pending_deploy': _deploy_task is not None and not _deploy_task.done(),
        'solo_active':    solo,
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


@app.post('/solo/start')
async def solo_start(req: Request):
    body  = await req.json()
    uuid  = body.get('uuid', '').strip()
    if not uuid:
        return {'ok': False}
    now = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    if uuid in _active_solo:
        solo_key = PL.solo_key(uuid)
        ST.record_abandon(solo_key)
    _active_solo[uuid] = now
    return {'ok': True}


@app.post('/solo/ping')
async def solo_ping(req: Request):
    body = await req.json()
    uuid = body.get('uuid', '').strip()
    if uuid and uuid in _active_solo:
        _active_solo[uuid] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())
    return {'ok': True}


@app.post('/solo/end')
async def solo_end(req: Request):
    body   = await req.json()
    uuid   = body.get('uuid', '').strip()
    winner = body.get('winner', '').strip()
    loser  = body.get('loser',  '').strip()
    if uuid:
        _active_solo.pop(uuid, None)
    if winner and loser and winner != loser:
        ST.record_game(winner, loser)
    return {'ok': True}


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
        uuid = str(first.get('uuid', ''))[:64].strip()
        if uuid:
            PL.register(uuid, name)
            old_code = _uuid_room.get(uuid)
            if old_code and old_code != room_code:
                old_room = R.get_room(old_code)
                if old_room and old_room.G and old_room.G.get('phase') != 'game-over':
                    try:
                        old_pidx = old_room.uuids.index(uuid)
                    except ValueError:
                        old_pidx = -1
                    if old_pidx >= 0:
                        ST.record_abandon(PL.net_key(old_room.player_names[old_pidx], uuid))
                        await old_room.send_to(1 - old_pidx, {
                            'type': 'opponent_abandoned',
                            'name': old_room.player_names[old_pidx],
                        })
            _uuid_room[uuid] = room_code
            room.uuids[pidx] = uuid
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

            if msg_type == 'abandon_response':
                # pidx reçoit la question opponent_abandoned et choisit
                accepted = data.get('accepted', False)
                if room.G and room.G.get('phase') != 'game-over' and not room.stats_recorded:
                    room.stats_recorded = True
                    opp_idx = 1 - pidx
                    if accepted:
                        # les deux abandonnent
                        ST.record_abandon(
                            PL.net_key(room.player_names[pidx],     room.uuids[pidx]),
                            PL.net_key(room.player_names[opp_idx], room.uuids[opp_idx]),
                        )
                    else:
                        # l'adversaire parti perd, pidx gagne
                        ST.record_game(
                            PL.net_key(room.player_names[pidx],     room.uuids[pidx]),
                            PL.net_key(room.player_names[opp_idx], room.uuids[opp_idx]),
                        )
                    R.save_room(room)
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
                    loser_idx  = 1 - winner_idx
                    ST.record_game(
                        PL.net_key(room.player_names[winner_idx], room.uuids[winner_idx]),
                        PL.net_key(room.player_names[loser_idx],  room.uuids[loser_idx]),
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


@app.get('/deploy/log')
async def deploy_log_view(pwd: str = ''):
    from fastapi.responses import PlainTextResponse
    _check_admin(pwd)
    if _DEPLOY_LOG.exists():
        return PlainTextResponse(_DEPLOY_LOG.read_text(encoding='utf-8', errors='replace'))
    return PlainTextResponse('Aucun log de déploiement disponible.')


# Fichiers statiques — monté en dernier pour ne pas masquer les routes API
app.mount('/', StaticFiles(directory=_STATIC_DIR, html=True), name='static')

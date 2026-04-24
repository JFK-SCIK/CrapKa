import time
from copy import deepcopy
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import rooms as R
import game_logic as GL
import stats as ST

app = FastAPI(title='CrapKa Server')

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


@app.get('/status')
async def status():
    rooms = []
    for code, room in R._rooms.items():
        rooms.append({
            'code':     code,
            'players':  room.player_names,
            'connected': [ws is not None for ws in room.connections],
            'phase':    room.G.get('phase') if room.G else None,
            'idle_min': round((time.time() - room.last_activity) / 60, 1),
        })
    return {'rooms': rooms, 'count': len(rooms)}


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

    pidx = room.available_slot()
    if pidx is None:
        await ws.send_json({'type': 'error', 'reason': 'room_full'})
        await ws.close()
        return

    room.connections[pidx] = ws
    room.touch()

    await ws.send_json({'type': 'connected', 'pidx': pidx, 'room_code': room.code})

    if pidx == 1:
        await room.send_to(0, {'type': 'opponent_connected'})

    try:
        while True:
            data = await ws.receive_json()
            room.touch()
            msg_type = data.get('type')

            if msg_type == 'set_name':
                name = str(data.get('name', f'Joueur {pidx+1}'))[:30]
                room.player_names[pidx] = name
                room.names_ready[pidx] = True
                if room.G:
                    room.G['players'][pidx]['name'] = name
                elif room.is_full() and all(room.names_ready):
                    room.G = GL.new_game(room.player_names[0], room.player_names[1])
                    for i in range(2):
                        await room.send_to(i, {
                            'type':         'game_start',
                            'state':        GL.filter_state(room.G, i),
                            'first_reason': room.G.get('_firstReason', ''),
                        })
                continue

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
        await room.send_to(1 - pidx, {'type': 'opponent_disconnected'})
    except Exception:
        room.connections[pidx] = None

# Fichiers statiques — monté en dernier pour ne pas masquer les routes API
app.mount('/', StaticFiles(directory=_STATIC_DIR, html=True), name='static')

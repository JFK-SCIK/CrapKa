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

            if msg_type == 'move':
                if not room.G or room.G.get('phase') == 'game-over':
                    await ws.send_json({'type': 'error', 'reason': 'no_game', 'seq': data.get('seq')})
                    continue

                ok, err = GL.apply_move(room.G, pidx, data)

                if not ok:
                    await ws.send_json({'type': 'move_rejected', 'seq': data.get('seq'), 'reason': err})
                    continue

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
                    await room.send_to(i, {
                        'type':      'state_update',
                        'seq':       data.get('seq'),
                        'move_info': move_info,
                        'state':     GL.filter_state(room.G, i),
                    })

    except WebSocketDisconnect:
        room.connections[pidx] = None
        await room.send_to(1 - pidx, {'type': 'opponent_disconnected'})
    except Exception:
        room.connections[pidx] = None

# Fichiers statiques — monté en dernier pour ne pas masquer les routes API
app.mount('/', StaticFiles(directory=_STATIC_DIR, html=True), name='static')

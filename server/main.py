from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import rooms as R
import game_logic as GL

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


@app.post('/room')
async def create_room():
    room = R.create_room()
    return {'room_code': room.code}


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

    if room.is_full() and room.G is None:
        room.G = GL.new_game(room.player_names[0], room.player_names[1])
        for i in range(2):
            await room.send_to(i, {
                'type':         'game_start',
                'state':        GL.filter_state(room.G, i),
                'first_reason': room.G.get('_firstReason', ''),
            })
    elif pidx == 1:
        await room.send_to(0, {'type': 'opponent_connected'})

    try:
        while True:
            data = await ws.receive_json()
            room.touch()
            msg_type = data.get('type')

            if msg_type == 'set_name':
                name = str(data.get('name', f'Joueur {pidx+1}'))[:30]
                room.player_names[pidx] = name
                if room.G:
                    room.G['players'][pidx]['name'] = name
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

                for i in range(2):
                    await room.send_to(i, {
                        'type':   'state_update',
                        'seq':    data.get('seq'),
                        'action': data.get('action'),
                        'state':  GL.filter_state(room.G, i),
                    })

    except WebSocketDisconnect:
        room.connections[pidx] = None
        await room.send_to(1 - pidx, {'type': 'opponent_disconnected'})
    except Exception:
        room.connections[pidx] = None

# Fichiers statiques — monté en dernier pour ne pas masquer les routes API
app.mount('/', StaticFiles(directory=_STATIC_DIR, html=True), name='static')

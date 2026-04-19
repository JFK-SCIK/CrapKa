// ══════════════════════════════════════════════
// NET — Client WebSocket mode réseau
// ══════════════════════════════════════════════
const _VER_NET = '0.1.0';

// Serveur GCP — forcer local avec ?server=local (ex: localhost:8000)
const _NET_WS   = new URLSearchParams(location.search).get('server') === 'local'
                  ? `ws://${location.hostname}:8000`
                  : 'wss://crapka.duckdns.org';
const _NET_HTTP = _NET_WS.replace('wss://', 'https://').replace('ws://', 'http://');

const NET = {
  ws:        null,
  roomCode:  null,
  pidx:      null,
  seq:       0,
  pending:   false,
};

// ── API publique ─────────────────────────────────────────────────────────────

async function netCreateRoom(playerName) {
  try {
    const resp = await fetch(`${_NET_HTTP}/room`, {method: 'POST'});
    if (!resp.ok) throw new Error('Serveur indisponible');
    const {room_code} = await resp.json();
    NET.roomCode = room_code;
    _netConnect(room_code, playerName);
  } catch(e) {
    setStatus('Erreur : ' + e.message);
  }
}

function netJoinRoom(roomCode, playerName) {
  NET.roomCode = roomCode.toUpperCase().trim();
  _netConnect(NET.roomCode, playerName);
}

function netSendMove(moveData) {
  if (!NET.ws || NET.ws.readyState !== WebSocket.OPEN) {
    setStatus('Connexion perdue');
    return;
  }
  NET.seq++;
  NET.pending = true;
  NET.ws.send(JSON.stringify({type:'move', seq:NET.seq, ...moveData}));
  render();
}

function netIsMyTurn() {
  return !!(G && G.cur === NET.pidx && !NET.pending && !_animating && !_waitingToStart);
}

function netDisconnect() {
  if (NET.ws) { NET.ws.close(); NET.ws = null; }
  UI.netMode  = false;
  NET.pidx    = null;
  NET.roomCode = null;
  NET.pending  = false;
}

// ── Connexion interne ─────────────────────────────────────────────────────────

function _netConnect(roomCode, playerName) {
  UI.netMode = true;
  NET.pending = false;
  const ws = new WebSocket(`${_NET_WS}/ws/${roomCode}`);
  NET.ws = ws;

  ws.onopen = () => {
    ws.send(JSON.stringify({type:'set_name', name: playerName || 'Joueur'}));
  };
  ws.onmessage = e => {
    try { _netOnMessage(JSON.parse(e.data)); }
    catch(err) { console.error('net msg error', err); }
  };
  ws.onclose = () => {
    if (UI.netMode) setStatus('Connexion perdue. Rechargez la page pour rejoindre.');
  };
  ws.onerror = () => setStatus('Erreur de connexion au serveur');
}

// ── Gestion des messages entrants ────────────────────────────────────────────

function _netOnMessage(data) {
  switch(data.type) {

    case 'connected':
      NET.pidx = data.pidx;
      if (NET.pidx === 0) {
        _netShowWaiting();
      } else {
        setStatus('Connecté ! Démarrage de la partie…');
      }
      break;

    case 'opponent_connected':
      setStatus('Adversaire connecté ! Démarrage…');
      break;

    case 'game_start':
      NET.pending = false;
      _netApplyState(data.state);
      render();
      showStartModal(data.state.cur, data.first_reason || '');
      break;

    case 'state_update': {
      NET.pending = false;
      const mi = data.move_info;
      const applyAndRender = () => {
        _netApplyState(data.state);
        render();
        if (G.phase === 'game-over' && G.winner !== null) {
          setTimeout(() => showVictory(G.winner), 300);
        } else if (G.cur === NET.pidx) {
          setStatus('Votre tour');
        } else {
          setStatus('Tour de ' + G.players[G.cur].name + '…');
        }
      };
      if (mi && mi.card && flyDur > 0) {
        _netAnimateMove(mi, applyAndRender);
      } else {
        applyAndRender();
      }
      break;
    }

    case 'move_rejected':
      NET.pending = false;
      setStatus('Coup refusé (' + (data.reason || '?') + ')');
      render();
      break;

    case 'opponent_disconnected':
      setStatus('⚠️ Adversaire déconnecté…');
      break;

    case 'error':
      setStatus('Erreur : ' + data.reason);
      if (data.reason === 'room_not_found') { netDisconnect(); showMenu(); }
      break;
  }
}

// ── Reconstruction de G depuis l'état filtré serveur ─────────────────────────

function _netApplyState(state) {
  const pidx = state.your_pidx;
  G = {
    cur:              state.cur,
    phase:            state.phase,
    winner:           state.winner,
    pileKingVal:      state.pileKingVal,
    pileKingPending:  state.pileKingPending,
    commons:          state.commons,
    pioche:           _fakeArr(state.pioche_count),
    futurePioche:     _fakeArr(state.futurePioche_count),
    startDefSnap:     state.startDefSnap,
    startCommonsSnap: state.startCommonsSnap,
    startKingValSnap: state.startKingValSnap,
    startKingPendSnap:state.startKingPendSnap,
    demandMadeThisTurn: false,
    players: state.players.map((p, i) => ({
      name:     p.name,
      crapette: _fakeCrapette(p.crapette),
      hand:     i === pidx ? (p.hand || []) : _fakeArr(p.hand_count || 0),
      defausse: p.defausse,
    })),
  };
  UI.pileKingVal     = state.pileKingVal;
  UI.pileKingPending = state.pileKingPending;
  UI.pidx            = pidx;
  UI.vsAI            = false;
  UI.sel             = null;
  UI.vtgts           = [];
}

function _fakeArr(count) {
  return Array.from({length: count || 0}, (_, i) => ({uid:-(i+1), hidden:true}));
}

function _fakeCrapette(cr) {
  if (!cr || cr.count === 0) return [];
  const arr = _fakeArr(cr.count);
  if (cr.top) arr[cr.count - 1] = cr.top;
  return arr;
}

// ── Écran d'attente (J1 attend J2) ────────────────────────────────────────────

function _netShowWaiting() {
  const game = document.getElementById('game');
  game.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                height:100%;gap:18px;padding:20px;text-align:center;">
      <div style="font-size:2.8rem">🃏</div>
      <h2 style="color:var(--gold)">En attente…</h2>
      <p style="color:var(--text2)">Partage ce code à ton adversaire :</p>
      <div style="font-size:2rem;font-weight:bold;letter-spacing:6px;color:var(--gold);
                  padding:12px 24px;border:2px solid var(--gold);border-radius:8px;">
        ${NET.roomCode}
      </div>
      <button class="btn" style="margin-top:8px"
        onclick="navigator.clipboard.writeText('${NET.roomCode}').then(()=>setStatus('Code copié !'))">
        📋 Copier le code
      </button>
      <button class="btn" style="background:var(--bg3);margin-top:4px"
        onclick="netDisconnect();showMenu();">✕ Annuler</button>
    </div>`;
}

// ── Menu réseau (Create / Join) ───────────────────────────────────────────────

function showNetCreatePanel() {
  const game = document.getElementById('game');
  game.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                height:100%;gap:14px;padding:20px;text-align:center;">
      <h2 style="color:var(--gold)">Nouvelle partie réseau</h2>
      <input id="net-name" type="text" maxlength="20" placeholder="Votre prénom"
        style="padding:10px;border-radius:6px;border:1px solid var(--gold);background:var(--bg2);
               color:var(--text1);font-size:1rem;width:200px;text-align:center;"
        value=""
        onkeydown="if(event.key==='Enter') netCreateRoom(document.getElementById('net-name').value||'Joueur 1')" />
      <button class="btn" style="padding:12px;width:200px;"
        onclick="netCreateRoom(document.getElementById('net-name').value||'Joueur 1')">
        ▶ Créer la partie
      </button>
      <button class="btn" style="background:var(--bg3);padding:10px;width:200px;"
        onclick="showMenu()">← Retour</button>
    </div>`;
  setTimeout(()=>document.getElementById('net-name').focus(), 50);
}

function showNetJoinPanel() {
  const game = document.getElementById('game');
  game.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                height:100%;gap:14px;padding:20px;text-align:center;">
      <h2 style="color:var(--gold)">Rejoindre une partie</h2>
      <input id="net-code" type="text" maxlength="10" placeholder="Code (ex: ROUGE-42)"
        style="padding:10px;border-radius:6px;border:1px solid var(--gold);background:var(--bg2);
               color:var(--text1);font-size:1.1rem;width:200px;text-align:center;letter-spacing:3px;"
        oninput="this.value=this.value.toUpperCase()"
        onkeydown="if(event.key==='Enter') document.getElementById('net-name2').focus()" />
      <input id="net-name2" type="text" maxlength="20" placeholder="Votre prénom"
        style="padding:10px;border-radius:6px;border:1px solid var(--bg3);background:var(--bg2);
               color:var(--text1);font-size:1rem;width:200px;text-align:center;"
        onkeydown="if(event.key==='Enter') netJoinRoom(document.getElementById('net-code').value, document.getElementById('net-name2').value||'Joueur 2')" />
      <button class="btn" style="padding:12px;width:200px;"
        onclick="netJoinRoom(document.getElementById('net-code').value, document.getElementById('net-name2').value||'Joueur 2')">
        ▶ Rejoindre
      </button>
      <button class="btn" style="background:var(--bg3);padding:10px;width:200px;"
        onclick="showMenu()">← Retour</button>
    </div>`;
  setTimeout(()=>document.getElementById('net-code').focus(), 50);
}

// ── Animation du coup adverse ─────────────────────────────────────────────────

function _netAnimateMove(info, cb) {
  const {action, card, to_index, from_type, from_index, player_idx} = info;
  let fromEl = null, toEl = null;

  if (action === 'play' || action === 'init_pile') {
    toEl = document.querySelector(`[data-common="${to_index}"]`);
    if      (from_type === 'crapette') fromEl = document.querySelector(`[data-crapette="${player_idx}"]`);
    else if (from_type === 'defausse') fromEl = document.querySelector(`[data-def-top="${player_idx}-${from_index}"]`)
                                             || document.querySelector(`[data-def-slot="${player_idx}-${from_index}"]`);
    else if (from_type === 'pioche')   fromEl = document.querySelector('[data-pioche]');
    else                               fromEl = document.querySelector(`[data-hand-uid="${card.uid}"]`)
                                             || document.querySelector(`[data-pidx="${player_idx}"] .hand .card`);

  } else if (action === 'discard') {
    fromEl = document.querySelector(`[data-pidx="${player_idx}"] .hand .card`);
    toEl   = document.querySelector(`[data-def-slot="${player_idx}-${to_index}"]`);

  } else if (action === 'demand') {
    const defOwner = 1 - player_idx;
    fromEl = document.querySelector(`[data-def-top="${defOwner}-${from_index}"]`);
    toEl   = document.querySelector(`[data-common="${to_index}"]`);
  }

  if (fromEl && toEl) {
    flyCard(card, fromEl.getBoundingClientRect(), toEl.getBoundingClientRect(), cb);
  } else {
    cb();
  }
}

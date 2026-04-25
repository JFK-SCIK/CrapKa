// ══════════════════════════════════════════════
// NET — Client WebSocket mode réseau
// ══════════════════════════════════════════════
const _VER_NET = '0.1.9';

// Serveur GCP — forcer local avec ?server=local (ex: localhost:8000)
const _NET_WS   = new URLSearchParams(location.search).get('server') === 'local'
                  ? `ws://${location.hostname}:8000`
                  : 'wss://crapka.duckdns.org';
const _NET_HTTP = _NET_WS.replace('wss://', 'https://').replace('ws://', 'http://');

const NET = {
  ws:               null,
  roomCode:         null,
  pidx:             null,
  seq:              0,
  pending:          false,
  canUndo:          false,
  movedThisTurn:    false,
  undoRefusals:     0,
  undoFinalRefused: false,
};

// ── API publique ─────────────────────────────────────────────────────────────

async function netCreateRoom(playerName) {
  try {
    if (playerName) localStorage.setItem('crapka_name', playerName);
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
  if (playerName) localStorage.setItem('crapka_name', playerName);
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
  UI.netMode     = false;
  NET.pidx       = null;
  NET.roomCode   = null;
  NET.pending    = false;
  NET.canUndo    = false;
  NET.movedThisTurn = false;
  const undoBtn = document.getElementById('btn-undo');
  if (undoBtn) undoBtn.style.display = '';
}

// ── Connexion interne ─────────────────────────────────────────────────────────

function _netConnect(roomCode, playerName) {
  UI.netMode = true;
  NET.pending = false;
  const undoBtn = document.getElementById('btn-undo');
  if (undoBtn) undoBtn.style.display = 'none';
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
      NET.canUndo = false;
      NET.movedThisTurn = false;
      _netApplyState(data.state);
      render();
      showStartModal(data.state.cur, data.first_reason || '');
      break;

    case 'state_update': {
      NET.pending = false;
      if ('can_undo' in data) {
        NET.canUndo          = data.can_undo;
        NET.movedThisTurn    = true;
        NET.undoRefusals     = 0;
        NET.undoFinalRefused = false;
      } else if (!data.undo) {
        NET.canUndo          = false;
        NET.movedThisTurn    = false;
        NET.undoRefusals     = 0;
        NET.undoFinalRefused = false;
      }
      if (data.undo) {
        NET.canUndo          = false;
        NET.movedThisTurn    = false;
        NET.undoRefusals     = 0;
        NET.undoFinalRefused = false;
      }
      const mi = data.move_info;
      if (mi) _netLogMove(mi);
      const applyAndRender = () => {
        _netApplyState(data.state);
        render();
        if (G.phase === 'game-over' && G.winner !== null) {
          setTimeout(() => showVictory(G.winner), 300);
        } else if (data.undo) {
          setStatus('Coup annulé — à toi de rejouer');
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

    case 'undo_ask':
      _netShowUndoAsk(data.name, data.attempt || 1);
      break;

    case 'undo_rejected': {
      if (data.reason === 'refused' || data.reason === 'refused_final') {
        let msg;
        if (data.reason === 'refused_final') {
          NET.undoFinalRefused = true;
          msg = 'Tu n\'as pas compris,<br>il a dit <b>NOOOOOOOON</b> !';
        } else {
          NET.undoRefusals++;
          NET.canUndo = true;
          msg = NET.undoRefusals === 1
            ? 'Tu vas pas aimer, mais ta demande est refuséee !'
            : 'Toujours pas ! Essaie encore,<br>tu vas l\'avoir à l\'usure…';
        }
        document.getElementById('mtitle').textContent = '↩ Oooops';
        document.getElementById('mbody').innerHTML =
          '<p style="text-align:center;padding:8px 0;">' + msg + '</p>';
        const _el = document.getElementById('mbtns'); _el.innerHTML = '';
        const _b = document.createElement('button'); _b.className = 'btn';
        _b.textContent = 'Fermer'; _b.onclick = closeModal; _el.appendChild(_b);
        document.getElementById('movl').classList.add('on');
      } else {
        setStatus('Annulation impossible.');
      }
      break;
    }

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
        value="${localStorage.getItem('crapka_name')||''}"
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
        value="${localStorage.getItem('crapka_name')||''}"
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

// ── Bouton Oooops ────────────────────────────────────────────────────────────

function clickOoooops() {
  if (NET.canUndo) {
    NET.canUndo = false;
    NET.ws.send(JSON.stringify({type: 'undo_request'}));
    setStatus('Demande d\'annulation envoyée…');
    return;
  }
  let msg;
  if (NET.undoFinalRefused) {
    msg = 'Le troisième refus est DEFINITIF !<br>Joue et essaie de gagner quand même…';
  } else if (NET.movedThisTurn) {
    msg = 'Et quoi encore,<br>une carte a été découverte !!!';
  } else {
    msg = 'Rien à annuler, joue !';
  }
  document.getElementById('mtitle').textContent = '↩ Oooops';
  document.getElementById('mbody').innerHTML = '<p style="text-align:center;padding:8px 0;">' + msg + '</p>';
  const el = document.getElementById('mbtns'); el.innerHTML = '';
  const b = document.createElement('button'); b.className = 'btn';
  b.textContent = 'Fermer'; b.onclick = closeModal; el.appendChild(b);
  document.getElementById('movl').classList.add('on');
}

function _netShowUndoAsk(name, attempt) {
  let intro;
  if (attempt >= 3) {
    intro = 'Tu me dis si ton adversaire t\'énerve.<br>On accepte ?';
  } else if (attempt === 2) {
    intro = name + ' a l\'air d\'y tenir,<br>tu veux pas être sympa ?';
  } else {
    intro = name + ' souhaite annuler son dernier coup.<br>Tu es d\'accord ?';
  }
  document.getElementById('mtitle').textContent = '↩ Annulation demandée';
  document.getElementById('mbody').innerHTML =
    '<p style="text-align:center;padding:8px 0;">' + intro + '</p>';
  const el = document.getElementById('mbtns'); el.innerHTML = '';
  const yes = document.createElement('button'); yes.className = 'btn';
  yes.textContent = '✓ Oui';
  yes.onclick = () => { closeModal(); NET.ws.send(JSON.stringify({type: 'undo_response', accepted: true})); };
  const no = document.createElement('button'); no.className = 'btn';
  no.style.background = 'var(--bg3)'; no.textContent = '✗ Non';
  no.onclick = () => { closeModal(); NET.ws.send(JSON.stringify({type: 'undo_response', accepted: false})); };
  el.appendChild(yes); el.appendChild(no);
  document.getElementById('movl').classList.add('on');
}

// ── Log des coups en mode réseau ─────────────────────────────────────────────

function _netLogMove(mi) {
  const {action, card, to_index, from_type, from_index, player_idx} = mi;
  const cls = player_idx === NET.pidx ? 'p0' : 'p1';
  const c = card ? card.value + card.suit : '?';
  const fromLbl = from_type === 'crapette' ? 'Cr'
                : from_type === 'defausse'  ? 'D' + (from_index + 1)
                : from_type === 'pioche'    ? '↑'
                : 'M';
  if (action === 'play' || action === 'init_pile') {
    addMoveLog(c + ' (' + fromLbl + ')→P' + (to_index + 1), cls);
  } else if (action === 'discard') {
    addMoveLog(c + ' (M)→D' + (to_index + 1), cls);
  } else if (action === 'demand') {
    addMoveLog('⚡' + c + '→P' + (to_index + 1), cls);
  }
}

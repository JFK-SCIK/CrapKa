// ══════════════════════════════════════════════
// ANIMATION
// ══════════════════════════════════════════════
function findCardEl(card,src){
  if(src.type==='hand'){
    return document.querySelector(`[data-hand-uid="${card.uid}"]`);
  }
  if(src.type==='crapette') return document.querySelector(`[data-crapette="${G.cur}"]`);
  if(src.type==='defausse') return document.querySelector(`[data-def-top="${G.cur}-${src.index}"]`);
  return null;
}

function doFly(card,fromEl,toEl,cb){
  if(flyDur===0||!fromEl||!toEl){if(cb)cb();return;}
  flyCard(card,fromEl.getBoundingClientRect(),toEl.getBoundingClientRect(),cb);
}

function flyCard(card,fromR,toR,cb){
  if(flyDur===0){if(cb)cb();return;}
  _animating=true;
  const fly=document.createElement('div');
  fly.className=`flying-card ${card.color}`;
  fly.innerHTML=`<div class="ct">${card.value}</div><div class="cs">${card.suit}</div><div class="cb">${card.value}</div>`;
  fly.style.left=fromR.left+'px';
  fly.style.top=fromR.top+'px';
  fly.style.transform='translate(0,0)';
  document.body.appendChild(fly);
  fly.getBoundingClientRect();
  const dx=toR.left-fromR.left;
  const dy=toR.top-fromR.top;
  fly.style.transform=`translate(${dx}px,${dy}px)`;
  setTimeout(()=>{fly.remove();_animating=false;if(cb)cb();},flyDur+20);
}

// ══════════════════════════════════════════════
// INTERACTIONS HUMAIN
// ══════════════════════════════════════════════
function isHumanTurn(){return !_animating&&!(UI.vsAI&&G.cur===UI.aiIdx);}

function selectCard(card,src){
  if(!G||G.phase==='game-over'||!isHumanTurn()) return;
  if(UI.sel&&UI.sel.card.uid===card.uid){UI.sel=null;UI.vtgts=[];render();return;}
  UI.sel={card,src};
  UI.vtgts=[];
  for(let ci=0;ci<4;ci++) if(canOnCommon(card,ci)) UI.vtgts.push({type:'common',index:ci});
  render();
}

function clickCommon(ci){
  if(!G||G.phase==='game-over'||!isHumanTurn()) return;
  saveUndo();
  const pile=G.commons[ci];

  // Roi pending : proposer écarter (avec ou sans sélection)
  // Si carte sélectionnée et jouable → on peut aussi poser directement
  if(UI.pileKingPending[ci]){
    const sel=UI.sel;
    // Carte sélectionnée non-as et non-roi → la jouer directement (fixe la valeur)
    if(sel&&sel.card.num!==1&&sel.card.num!==13){
      UI.pileKingPending[ci]=false;
      UI.pileKingVal[ci]=sel.card.num-1;
      playOnCommon(sel.card,sel.src,ci,(ok)=>{
        if(ok){UI.sel=null;UI.vtgts=[];}
        else{UI.pileKingPending[ci]=true;UI.pileKingVal[ci]=null;setStatus('Impossible');}
      });
      return;
    }
    // Sinon (pas de sélection, as sélectionné, ou roi sélectionné) → proposer écarter
    showModal('Roi seul sur la pile',
      'Posez une carte (sauf as) pour fixer sa valeur, ou écartez (= dame → recyclage).',[
      {label:'Écarter (=dame)',fn:()=>{clearCommon(ci);closeModal();UI.sel=null;UI.vtgts=[];setTimeout(()=>render(),0);}},
      {label:'Annuler',fn:closeModal}
    ]);return;
  }

  // Pile à dame → écarter
  if(topNum(ci)===12&&!UI.sel){
    clearCommon(ci);
    setStatus(`Pile ${ci+1} → recyclage`);
    setTimeout(()=>render(),0); // setTimeout évite la propagation du clic sur le DOM reconstruit
    return;
  }

  // Pile vide sans sélection → retourner pioche SEULEMENT si pas d'as visible
  if(pile.length===0&&!UI.sel){
    if(visibleAce(G.cur)){
      setStatus('Un As est visible — vous devez initialiser la pile avec un As');
      return;
    }
    initCommon(ci,null,null);render();return;
  }

  if(!UI.sel) return;

  const {card,src}=UI.sel;

  // Pile vide : as obligatoire si as visible, sinon carte quelconque
  if(pile.length===0&&card.num!==1){
    if(visibleAce(G.cur)){
      setStatus('Un As est visible — vous devez poser un As sur la pile vide');
      return;
    }
    // Pas d'as visible → on peut piocher depuis la pioche (pas depuis la main)
    setStatus('Seul un As peut initialiser une pile vide (ou retournez la pioche)');
    return;
  }

  if(!canOnCommon(card,ci)){setStatus('Impossible de jouer cette carte ici');return;}

  playOnCommon(card,src,ci,(ok)=>{
    if(ok){UI.sel=null;UI.vtgts=[];}
    else setStatus('Impossible');
  });
}

function clickDefausse(pidx,di){
  if(!G||G.phase==='game-over') return;

  // Clic sur défausse ADVERSE → demande
  if(pidx!==G.cur){
    if(isHumanTurn()) tryDemand(pidx,di);
    return;
  }
  if(!isHumanTurn()) return;

  const p=G.players[pidx];

  const t=peek(p.defausse[di]);

  // Carte sélectionnée
  if(UI.sel){
    // Si c'est la même carte de défausse → désélectionner (double clic)
    if(UI.sel.src.type==='defausse'&&UI.sel.src.index===di&&t&&UI.sel.card.uid===t.uid){
      UI.sel=null;UI.vtgts=[];render();return;
    }
    // Crapette sélectionnée → interdit
    if(UI.sel.src.type==='crapette'){
      setStatus('La crapette ne peut pas être défaussée — jouez-la sur une pile');
      return;
    }
    // Carte de défausse sélectionnée → interdit de défausser sur défausse
    if(UI.sel.src.type==='defausse'){
      setStatus('Une carte de défausse ne peut aller que sur une pile commune');
      return;
    }
    // Carte de main → fin de tour via défausse
    saveUndo();
    endTurnViaDiscard(UI.sel.card,UI.sel.src,di);
    return;
  }

  // Sinon sélectionner la carte du dessus
  if(!t) return;
  selectCard(t,{type:'defausse',index:di});
}

function clickCrapette(pidx){
  if(!G||G.phase==='game-over') return;
  if(pidx!==G.cur||!isHumanTurn()) return;
  const t=peek(G.players[pidx].crapette);
  if(!t) return;
  selectCard(t,{type:'crapette'});
}

function clickHand(uid){
  if(!G||G.phase==='game-over'||!isHumanTurn()) return;
  const card=G.players[G.cur].hand.find(c=>c.uid===uid);
  if(!card) return;
  selectCard(card,{type:'hand'});
}

function clickEmptyHand(){
  if(!G||G.phase==='game-over'||!isHumanTurn()) return;
  const p=G.players[G.cur];
  if(p.hand.length>0) return; // main non vide, ignorer
  if(G.pioche.length===0&&G.futurePioche.length===0){setStatus('Pioche vide !');return;}
  drawToFive(()=>{render();setStatus(`Main : ${G.players[G.cur].hand.length} carte(s)`);});
}

function clickFuturePioche(){setStatus(`♻️ Recyclage : ${G.futurePioche.length} carte(s)`);}

function clickPioche(){
  setStatus(`Pioche : ${G?G.pioche.length:0} carte(s) + recyclage : ${G?G.futurePioche.length:0}`);
}

// ══════════════════════════════════════════════
// SAUVEGARDES — FICHIERS
// ══════════════════════════════════════════════
// Sauvegarde vers un fichier téléchargé dans le dossier de téléchargement de l'OS.
// Le fichier contient : état courant + 2 niveaux de rollback + niveau IA.
function saveToFile(){
  if(!G){setStatus('Pas de partie en cours');return;}
  const aiLevel=parseInt(document.getElementById('ai-level')?.value||'6');
  const current=_buildUndoSnap();
  const rollback=_undoStack.slice(-2);
  const data={version:1,aiLevel,current,rollback};
  const now=new Date();
  const ts=now.toISOString().slice(0,19).replace('T','_').replace(/:/g,'-');
  const filename='crapka_'+ts+'.json';
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=filename;
  document.body.appendChild(a);a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  setStatus('💾 Téléchargé: '+filename);
  addMoveLog('💾 Sauvegarde: '+filename,'sys');
}

// Chargement depuis un fichier JSON sélectionné par l'utilisateur.
function loadFromFile(){
  const inp=document.createElement('input');
  inp.type='file';inp.accept='.json';
  inp.onchange=()=>{
    const file=inp.files&&inp.files[0];
    if(!file) return;
    const reader=new FileReader();
    reader.onload=(e)=>{
      try{
        const data=JSON.parse(e.target.result);
        const snap=data.version?data.current:data; // compat ancien format
        _restoreFromSnap(snap);
        if(data.rollback&&Array.isArray(data.rollback)){
          _undoStack.push(...data.rollback);
        }
        if(data.aiLevel){
          const sel=document.getElementById('ai-level');
          if(sel) sel.value=String(data.aiLevel);
        }
        setStatus('📂 Chargé: '+file.name);
        addMoveLog('📂 Load: '+file.name,'sys');
      } catch(err){ setStatus('Erreur lecture fichier'); }
    };
    reader.readAsText(file);
  };
  inp.click();
}

// ══════════════════════════════════════════════
// RENDU
// ══════════════════════════════════════════════
function cs(card){return card?card.value+card.suit:'?';}
function pname(){return G.players[G.cur].name;}
function mkDown(){return `<div class="card down"></div>`;}

function render(){
  if(!G){renderMenu();return;}
  let topIdx,botIdx;
  if(UI.vsAI){topIdx=UI.aiIdx;botIdx=0;}
  else{topIdx=0;botIdx=1;}
  let html='';
  html+=renderPzone(topIdx);
  html+=renderMiddle();
  html+=renderPzone(botIdx);
  document.getElementById('game').innerHTML=html;
  showBtns();
  // Recalculer layout après chaque rendu (les éléments DOM existent maintenant)
  requestAnimationFrame(computeLayout);
}

function renderPzone(pidx){
  const p=G.players[pidx];
  const isActive=G.cur===pidx&&G.phase!=='game-over';
  const isAI=UI.vsAI&&pidx===UI.aiIdx;

  let h=`<div class="pzone ${isActive?'active':'inactive'}">`;
  h+=`<div class="plabel">
    <span class="nm">${p.name}${isActive?' ▶':''}</span>
    <span class="cr">Crapette:${p.crapette.length}</span>
    <span style="font-size:0.6rem">Pioche:${G.pioche.length}+${G.futurePioche.length}</span>
  </div>`;

  h+=`<div class="prow">`;

  // ── Colonne gauche : crapette seule ──
  const crTop=peek(p.crapette);
  const crSel=UI.sel&&crTop&&UI.sel.card.uid===crTop.uid&&UI.sel.src.type==='crapette'?'sel':'';
  h+=`<div class="cr-col" onclick="clickCrapette(${pidx})">`;
  h+=`<div class="crstack">`;
  if(p.crapette.length>1) h+=`<div class="card down back"></div>`;
  if(crTop){
    h+=`<div class="card ${crTop.color} ${crSel} front" data-crapette="${pidx}">
      <div class="ct">${crTop.value}</div><div class="cs">${crTop.suit}</div><div class="cb">${crTop.value}</div>
    </div>`;
  } else {
    h+=`<div class="slot front"><span class="slbl">Vide</span></div>`;
  }
  h+=`</div></div>`;

  // ── Colonne droite : défausses + main ──
  h+=`<div class="right-col">`;

  // Défausses en éventail
  h+=`<div class="dzone">`;
  for(let di=0;di<4;di++){
    const pile=p.defausse[di];
    const vtgt=pidx===G.cur&&isHumanTurn()&&UI.sel&&canOnDefausse(UI.sel.card,pile);
    const n=pile.length;const OFF=11;
    const isDemandable=pidx!==G.cur&&isHumanTurn()&&wasPlayableAtStartOfTurn(pidx,di);
    const totalH=n>0?`calc(var(--ch) + ${Math.max(0,n-1)*OFF}px)`:`var(--ch)`;
    h+=`<div class="dpile${vtgt?' vtgt':''}" style="height:${totalH}"
        data-def-slot="${pidx}-${di}"
        onclick="clickDefausse(${pidx},${di})">`;
    if(n===0){
      h+=`<div class="slot" style="position:absolute;inset:0;width:var(--cw);height:var(--ch);">
        <span class="slbl">D${di+1}</span></div>`;
    } else {
      for(let k=0;k<n;k++){
        const card=pile[k];const isTop=k===n-1;
        const isSel=isTop&&UI.sel&&UI.sel.card.uid===card.uid&&UI.sel.src.type==='defausse'&&UI.sel.src.index===di;
        const dem=isTop&&isDemandable?'demandable':'';
        h+=`<div class="card ${card.color} ${isSel?'sel':''} ${dem} dcard"
          style="position:absolute;top:${k*OFF}px;z-index:${k+1};left:0;width:var(--cw);
            ${!isTop?`height:${OFF}px;overflow:hidden;border-bottom:none;border-radius:5px 5px 0 0;`:''}"
          ${isTop?`data-def-top="${pidx}-${di}"`:''}>
          <div class="ct">${card.value}${!isTop?card.suit:''}</div>
          ${isTop?`<div class="cs">${card.suit}</div><div class="cb">${card.value}</div>`:''}
        </div>`;
      }
    }
    h+=`</div>`;
  }
  h+=`</div>`; // dzone

  // Main (dans la colonne droite)
  h+=`<div class="hand">`;
  if(isAI&&!_debugMode){
    for(const card of p.hand) h+=`<div class="card down" data-hand-uid="${card.uid}"></div>`;
  } else {
    for(const card of p.hand){
      const isSel=UI.sel&&UI.sel.card.uid===card.uid&&UI.sel.src.type==='hand';
      h+=`<div class="card ${card.color} ${isSel?'sel':''}"
        onclick="clickHand(${card.uid})" data-hand-uid="${card.uid}">
        <div class="ct">${card.value}</div><div class="cs">${card.suit}</div><div class="cb">${card.value}</div>
      </div>`;
    }
    if(!p.hand.length) h+=`<span style="color:var(--gold);font-size:0.7rem;align-self:center;cursor:pointer;text-decoration:underline dotted;" onclick="clickEmptyHand()">Main vide — piocher</span>`;
  }
  h+=`</div>`; // hand

  h+=`</div></div></div>`; // right-col + prow + pzone
  return h;
}

function renderMiddle(){
  let h=`<div id="mid"><div class="mid-inner">`;

  // Pioche
  h+=`<div class="pioche-col">
    <div class="zone-lbl">Pioche</div>`;
  if(G.pioche.length){
    h+=`<div class="card down" onclick="clickPioche()" style="cursor:pointer;" title="Piocher"></div>`;
  } else {
    h+=`<div class="slot" onclick="clickPioche()" style="cursor:pointer;"><span class="slbl">Vide</span></div>`;
  }
  h+=`<div class="zone-lbl">${G.pioche.length}</div></div>`;

  // 4 piles communes
  h+=`<div class="commons-col">`;
  for(let ci=0;ci<4;ci++){
    const pile=G.commons[ci];const t=peek(pile);
    const vtgt=UI.vtgts.some(v=>v.index===ci);
    const disp=topDisplay(ci);const isPend=UI.pileKingPending[ci];
    let inner='';
    if(t){
      inner=`<div class="card ${t.color}"
        style="position:absolute;inset:0;width:100%;height:100%;border-radius:4px;"
        data-common="${ci}" onclick="clickCommon(${ci})">
        <div class="ct">${disp}${isPend?'<span style="font-size:0.4rem;color:orange;position:absolute;top:1px;right:2px">?</span>':''}</div>
        <div class="cs">${t.suit}</div><div class="cb">${disp}</div>
      </div>`;
    }
    // Pile vide : indiquer l'action possible
    let emptyLabel=`P${ci+1}`;
    if(!t&&isHumanTurn&&G.phase!=='game-over'){
      if(visibleAce(G.cur)) emptyLabel=`P${ci+1}<br><span style="color:var(--green);font-size:0.5rem">as↓</span>`;
      else emptyLabel=`P${ci+1}<br><span style="color:var(--gold);font-size:0.5rem">pioche↓</span>`;
    }
    h+=`<div class="slot${vtgt?' vtgt':''}" data-common="${ci}" onclick="clickCommon(${ci})">
      ${inner||`<span class="slbl" style="line-height:1.4">${emptyLabel}</span>`}
    </div>`;
  }
  h+=`</div>`;

  // Recyclage
  h+=`<div class="fpioche-col">
    <div class="zone-lbl">Recyclage</div>`;
  h+=G.futurePioche.length
    ?`<div class="card down" onclick="clickFuturePioche()" style="cursor:pointer;"></div>`
    :`<div class="slot"><span class="slbl">Vide</span></div>`;
  h+=`<div class="zone-lbl">${G.futurePioche.length}</div></div>`;

  h+=`</div></div>`;
  return h;
}

function renderMenu(){
  document.getElementById('game').innerHTML=`
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                height:100%;gap:18px;padding:20px;">
      <div style="text-align:center;">
        <div style="font-size:2.8rem">🃏</div>
        <h2 style="color:var(--gold);font-size:1.7rem;letter-spacing:3px;margin-top:4px">CrapKa</h2>
        <p style="color:var(--text2);margin-top:6px;font-size:0.82rem">Le jeu de cartes familial</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;width:100%;max-width:230px;">
        <button class="btn red" style="padding:13px;font-size:0.95rem;" onclick="newGame(false)">
          🧑‍🤝‍🧑 2 Joueurs — même écran
        </button>
        <button class="btn" style="padding:13px;font-size:0.95rem;background:var(--bg3);" onclick="newGame(true)">
          🤖 Contre l'IA
        </button>
      </div>
      <p style="color:var(--text2);font-size:0.65rem;text-align:center;max-width:250px;">v0.4</p>
    </div>`;
  // btn-ai supprimé, géré par step-next
}

function showBtns(){
  if(!G||G.phase==='game-over'){document.getElementById('btn-ai').style.display='none';return;}
  if(_debugMode) _updateStepUI();
}

// ══════════════════════════════════════════════
// LOG
// ══════════════════════════════════════════════
let _moveCount=0;
function renderBFSeq(){
  const panel=document.getElementById('seqlog');
  const seqs=window._dbgBFSequences;
  if(!panel) return;
  panel.innerHTML='';
  const title=document.createElement('div');
  title.id='seqlog-title';
  panel.appendChild(title);
  if(!seqs||!seqs.length){
    if(_bfSeqPinned&&_debugMode){
      title.textContent='Séquences BF — en attente\u2026';
      panel.classList.add('visible');
    } else {
      panel.classList.remove('visible');
    }
    return;
  }
  title.textContent='Séquences BF ('+seqs.length+')';
  let bestEl=null;
  for(const s of seqs){
    const e=document.createElement('div');
    e.className='mle '+(s.isBest?'bf-best':'bf-other');
    // Score
    let html=s.score.toFixed(1)+'#';
    if(!s.moves.length){
      html+='(fin)';
    } else {
      html+=s.moves.map(mv=>{
        const txt=_fmtMove(mv);
        const isCr=mv.type==='play'&&mv.src&&mv.src.type==='crapette';
        const isDisco=isCr||(mv.type==='init'&&!mv.card)||(mv.type==='redraw');
        if(isCr)    return '<b style="color:#ff4444">'+txt+'</b>';
        if(isDisco) return '<b>'+txt+'</b>';
        return txt;
      }).join('|');
    }
    e.innerHTML=html;
    panel.appendChild(e);
    if(s.isBest) bestEl=e;
  }
  panel.classList.add('visible');
  if(bestEl) bestEl.scrollIntoView({block:'nearest'});
}

function hideBFSeq(){
  window._dbgBFSequences=null;
  if(_bfSeqPinned&&_debugMode){
    // Panel épinglé en debug : on garde la visibilité mais on vide les lignes
    const panel=document.getElementById('seqlog');
    if(!panel) return;
    panel.innerHTML='';
    const t=document.createElement('div');
    t.id='seqlog-title';
    t.textContent='Séquences BF — en attente\u2026';
    panel.appendChild(t);
    panel.classList.add('visible');
    return;
  }
  const panel=document.getElementById('seqlog');
  if(panel){panel.classList.remove('visible');panel.innerHTML='<div id="seqlog-title">Séquences BF</div>';}
}

function addMoveLog(msg,cls='sys'){
  if(window._simulating) return;
  const el=document.getElementById('movelog');
  const e=document.createElement('div');
  e.className='mle '+(cls||'sys');
  // Numéroter les coups de jeu (pas les messages système)
  const prefix=(cls&&cls!=='sys'&&cls!=='turn-sep')?String(++_moveCount)+'. ':''
  e.textContent=prefix+msg;
  el.prepend(e);
  while(el.children.length>30) el.removeChild(el.lastChild);
}
function clearMoveLog(){document.getElementById('movelog').innerHTML='';_moveCount=0;}

function toggleDebug(){
  _debugMode=!_debugMode;
  document.getElementById('btn-debug').style.background=_debugMode?'var(--green)':'var(--bg3)';
  document.getElementById('btn-debug').textContent=_debugMode?'🐛ON':'🐛';
  // Afficher/masquer les contrôles pas-à-pas
  document.getElementById('step-controls').style.display=_debugMode?'flex':'none';
  if(_debugMode){
    // Afficher le panel immédiatement si épinglé
    if(_bfSeqPinned) hideBFSeq(); // affiche "en attente" et rend visible
  } else {
    _stepMode=false;
    window._dbgBFSequences=null;
    const panel=document.getElementById('seqlog');
    if(panel){panel.classList.remove('visible');panel.innerHTML='<div id="seqlog-title">Séquences BF</div>';}
  }
  _updateStepUI();
  render();
  setStatus(_debugMode?'Mode debug activé':'Mode debug désactivé');
}

function _updateStepUI(){
  const cb=document.getElementById('step-check');
  if(cb) cb.checked=_stepMode;
  const btn=document.getElementById('step-next');
  if(!btn) return;
  // Afficher si : pause en attente OU tour IA en mode debug
  const showBtn=_debugMode&&(_stepResolve||(UI.vsAI&&G&&G.cur===UI.aiIdx&&G.phase!=='game-over'));
  btn.style.display=showBtn?'inline-block':'none';
  btn.textContent=_stepResolve?'▶':'▶ IA';
  // Bouton toggle séquences : visible dès que le mode debug est actif
  const tbtn=document.getElementById('btn-seq-toggle');
  if(tbtn){
    tbtn.style.display=_debugMode?'inline-block':'none';
    tbtn.style.background=_bfSeqPinned?'var(--green)':'var(--bg3)';
  }
}

function toggleBFSeqPin(){
  _bfSeqPinned=!_bfSeqPinned;
  _updateStepUI();
  if(_bfSeqPinned){
    // Ré-afficher : données fraîches ou "en attente"
    if(window._dbgBFSequences) renderBFSeq(); else hideBFSeq();
  } else {
    const panel=document.getElementById('seqlog');
    if(panel){panel.classList.remove('visible');panel.innerHTML='<div id="seqlog-title">Séquences BF</div>';}
  }
}

function toggleStepMode(){
  _stepMode=document.getElementById('step-check').checked;
  _updateStepUI();
  setStatus(_stepMode?'Pas-à-pas activé — cliquez ▶ pour chaque coup IA':'Pas-à-pas désactivé');
}

function stepNext(){
  if(_stepResolve){
    const fn=_stepResolve;
    _stepResolve=null;
    _updateStepUI();
    fn();
  }
}

function stepOrPlay(){
  if(_stepResolve) stepNext();
  else if(UI.vsAI&&G&&G.cur===UI.aiIdx) aiPlayTurn();
}

// Log la main d'un joueur (appelé en mode debug après chaque coup)
function _debugLogHand(pidx){
  if(!_debugMode||!G) return;
  const p=G.players[pidx];
  const handStr=p.hand.map(c=>c.value+c.suit).join(' ')||'∅';
  const defStr=p.defausse.map(d=>{const t=peek(d);return t?t.value+t.suit:'_';}).join(' ');
  const crTop=peek(p.crapette);
  addMoveLog(`[${p.name}] M:${handStr} | D:${defStr} | Cr:${crTop?crTop.value+crTop.suit:'∅'}(${p.crapette.length})`,'sys');
}

function _fbCopy(txt){
  const ta=document.createElement('textarea');ta.value=txt;
  document.body.appendChild(ta);ta.select();
  try{document.execCommand('copy');setStatus('Copié !');}catch(e){setStatus('Copie manuelle nécessaire');}
  ta.remove();
}
function setStatus(msg){document.getElementById('status').textContent=msg;}
function showModal(title,body,btns){
  document.getElementById('mtitle').textContent=title;
  document.getElementById('mbody').textContent=body;
  const el=document.getElementById('mbtns');el.innerHTML='';
  for(const b of btns){const btn=document.createElement('button');btn.className='btn';btn.textContent=b.label;btn.onclick=b.fn;el.appendChild(btn);}
  document.getElementById('movl').classList.add('on');
}
function closeModal(){document.getElementById('movl').classList.remove('on');}
function showMenu(){
  closeModal();
  const ov=document.getElementById('victory-overlay');if(ov)ov.remove();
  clearTimeout(_aiTimer);G=null;UI.sel=null;setStatus('Bienvenue !');renderMenu();
}
function showRules(){
  document.getElementById('mtitle').textContent='📖 Règles CrapKa';
  document.getElementById('mbody').innerHTML=
    '<b>Tour</b> : piocher jusqu\'à 5 cartes, jouer autant que voulu sur les piles communes, puis défausser une carte de la main (fin de tour).<br><br>'+
    '<b>Piles communes</b> : valeur +1 strictement, pas de condition de couleur. As = 1 (pile vide uniquement). Roi = joker (valeur N+1 sous lui). Dame = pile terminable → recyclage.<br><br>'+
    '<b>Crapette</b> : 21 cartes face cachée sauf la 1ère. Se joue uniquement sur les piles communes. Vider sa crapette = victoire immédiate.<br><br>'+
    '<b>Défausse</b> : 4 colonnes. On peut poser une carte de la main sur n\'importe quelle pile sauf as sur as. La défausse marque la fin du tour.<br><br>'+
    '<b>Demande</b> : pendant son tour, on peut exiger que l\'adversaire joue une carte de sa défausse qui était jouable à la fin de son tour.<br><br>'+
    '<b>Victoire</b> : le premier joueur à poser sa dernière carte de crapette gagne.<br><br>'+
    '<i>— Jeu créé par A&amp;S</i>';
  const el=document.getElementById('mbtns');el.innerHTML='';
  const btn=document.createElement('button');btn.className='btn';btn.textContent='Fermer';btn.onclick=closeModal;el.appendChild(btn);
  document.getElementById('movl').classList.add('on');
}

// ── SNAPSHOT pour debug ──
function snapshot(){
  if(!G){addMoveLog('Pas de partie en cours','sys');return;}
  const state={
    tour:G.players[G.cur].name,
    piles:G.commons.map((p,i)=>({
      top:peek(p)?cs(peek(p)):'vide',
      n:p.length,
      kingVal:UI.pileKingVal[i],
      kingPend:UI.pileKingPending[i]
    })),
    joueurs:G.players.map((p,i)=>({
      nom:p.name,
      crapette:p.crapette.length,
      crapetteTop:peek(p.crapette)?cs(peek(p.crapette)):'vide',
      main:p.hand.map(cs),
      defausses:p.defausse.map(d=>peek(d)?cs(peek(d)):'vide')
    })),
    pioche:G.pioche.length,
    recyclage:G.futurePioche.length
  };
  const txt=JSON.stringify(state,null,1);
  const done=()=>setStatus('Snapshot terminé');
  if(navigator.clipboard){navigator.clipboard.writeText(txt).then(done).catch(()=>{_fbCopy(txt);done();});}
  else{_fbCopy(txt);done();}
}

// ══════════════════════════════════════════════
// LAYOUT ADAPTATIF
// ══════════════════════════════════════════════
function computeLayout(){
  const root=document.documentElement;
  const sideW=parseInt(getComputedStyle(root).getPropertyValue('--log-w'))||115;

  // Espace disponible pour le jeu
  const totalW=window.innerWidth;
  const totalH=window.innerHeight;
  const hdrH=document.getElementById('hdr').offsetHeight||32;
  const statusH=document.getElementById('status').offsetHeight||22;
  const abarH=document.getElementById('abar').offsetHeight||32;
  const gameW=totalW-sideW-5; // 5px resizer
  const gameH=totalH-hdrH-statusH-abarH;

  // Taille des cartes déterminée par la hauteur disponible.
  // Layout : pzone(top) + mid(1 ligne) + pzone(bot)
  // pzone ≈ label(18px) + prow(ch) + hand(ch) + gaps ≈ 2*ch + 50px  (×2)
  // mid   ≈ ch + 20px
  // Total ≈ 5*ch + 120px  → ch = (gameH - 120) / 5  → cw = ch / 1.41
  const cwFromH=Math.floor((gameH-120)/5/1.41);

  // Contrainte horizontale : zone joueur = crapette(1) + 4 défausses(4) + main(5) = 10 cols + gaps
  // (plus contraignante que la ligne mid : 6 cols)
  // → cw = (gameW - 60) / 10
  const cwFromW=Math.floor((gameW-60)/10);

  // La hauteur fixe la taille idéale ; la largeur la réduit si elle manque.
  // Pas de minimum sur cwFromW : les cartes doivent pouvoir rétrécir autant que nécessaire.
  let cw=Math.min(62,cwFromH);
  if(cw>cwFromW) cw=cwFromW;
  cw=Math.max(20,cw); // plancher absolu pour rester lisible
  let ch=Math.round(cw*1.41); // ratio carte standard

  root.style.setProperty('--cw',cw+'px');
  root.style.setProperty('--ch',ch+'px');
  // Fontes proportionnelles
  root.style.setProperty('--cf',Math.max(8,Math.round(cw*0.22))+'px');
  root.style.setProperty('--cs',Math.max(10,Math.round(cw*0.38))+'px');

  // Font log adaptative à la largeur du sidebar
  const logFs=Math.max(8,Math.min(11,Math.round(sideW/12)));
  root.style.setProperty('--log-fs',logFs+'px');
}

// Resizer drag
(function(){
  const resizer=document.getElementById('resizer');
  const sidebar=document.getElementById('sidebar');
  let dragging=false,startX=0,startW=0;

  resizer.addEventListener('mousedown',e=>{
    dragging=true;startX=e.clientX;
    startW=sidebar.offsetWidth;
    resizer.classList.add('dragging');
    document.body.style.cursor='col-resize';
    document.body.style.userSelect='none';
  });
  resizer.addEventListener('touchstart',e=>{
    dragging=true;startX=e.touches[0].clientX;
    startW=sidebar.offsetWidth;
    resizer.classList.add('dragging');
  },{passive:true});

  function onMove(x){
    if(!dragging) return;
    const dx=startX-x; // tirer vers la gauche agrandit le sidebar
    const newW=Math.max(50,Math.min(window.innerWidth*0.5,startW+dx));
    document.documentElement.style.setProperty('--log-w',newW+'px');
    sidebar.style.width=newW+'px';
    computeLayout();
  }
  document.addEventListener('mousemove',e=>onMove(e.clientX));
  document.addEventListener('touchmove',e=>onMove(e.touches[0].clientX),{passive:true});
  function onUp(){
    if(!dragging) return;
    dragging=false;
    resizer.classList.remove('dragging');
    document.body.style.cursor='';
    document.body.style.userSelect='';
    computeLayout();
  }
  document.addEventListener('mouseup',onUp);
  document.addEventListener('touchend',onUp);
})();

window.addEventListener('resize',()=>{computeLayout();});

// ══════════════════════════════════════════════
// ANIMATION VICTOIRE (D8)
// ══════════════════════════════════════════════
function showVictory(winnerIdx){
  if(!G) return;
  const existing=document.getElementById('victory-overlay');
  if(existing) existing.remove();
  const name=G.players[winnerIdx].name;
  const ov=document.createElement('div');
  ov.id='victory-overlay';
  ov.innerHTML=`
    <div id="victory-box">
      <div style="font-size:3.5rem;line-height:1">🏆</div>
      <div id="victory-name">${name}</div>
      <div id="victory-sub">a vidé sa crapette !</div>
      <button class="btn red" style="margin-top:14px;padding:10px 24px;font-size:0.9rem;" onclick="showMenu()">Rejouer</button>
    </div>`;
  document.body.appendChild(ov);
  // Forcer le reflow pour déclencher l'animation CSS
  ov.getBoundingClientRect();
  ov.classList.add('visible');
}

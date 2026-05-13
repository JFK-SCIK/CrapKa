// ══════════════════════════════════════════════
// IA — FILE DE COUPS ASYNCHRONE
// ══════════════════════════════════════════════
const _VER_AI='1.3.2';
const _AI_REGISTRY={}; // profils IA : rempli par ai_tibolos.js, ai_patcartier.js, etc.
// ── IA : liste de moves à rejouer un par un avec animation ──
let _aiMoves=[];
let _aiTimer=null;
let _animating=false; // bloque les clics humain pendant une animation
let _undoStack=[]; // pile des états précédents (max 20)
let _debugMode=false; // mode debug : cartes IA visibles + log main à chaque coup
let _replayingAI=false; // true pendant le replay des moves IA
let _stepMode=false;  // mode pas-à-pas IA
let _stepResolve=null; // callback en attente du clic "suivant"
let _bfSeqPinned=true; // panel séquences épinglé (ne se masque pas automatiquement)
let _waitingToStart=false; // true entre la création de la partie et le clic "Lancer"

function aiPlayTurn(){
  _T('aiPlayTurn:entry','cur='+G?.cur+' phase='+G?.phase);
  if(_stepResolve!==null){_T('aiPlayTurn:blocked','_stepResolve set');return;} // pas-à-pas en cours, ignorer
  saveUndo(); // sauvegarder avant chaque tour IA
  _replayingAI=false; // reset au cas où
  if(!G||G.phase==='game-over'||G.cur!==UI.aiIdx){_T('aiPlayTurn:skip','phase='+G?.phase+' cur='+G?.cur);return;}
  _aiMoves=[];
  clearTimeout(_aiTimer);
  _traceState('aiPlayTurn');
  // Sauvegarder état courant, calculer la séquence, restaurer
  const savedState=_saveGameState();
  _buildAiSequence();
  const moves=[..._aiMoves];
  _restoreGameState(savedState);
  if(window._traceMode){
    if(moves.length) moves.forEach((m,i)=>_traceMove('move#'+i,m));
    else _tlog('  !! Aucun move calculé');
  }
  // Afficher debug log rois si mode debug
  if(_debugMode&&window._dbgKingLog&&window._dbgKingLog.length){
    window._dbgKingLog.slice(0,5).forEach(l=>addMoveLog(l,'sys'));
    window._dbgKingLog=[];
  }
  if(_debugMode&&window._dbgDemandLog&&window._dbgDemandLog.length){
    const uniq=[...new Set(window._dbgDemandLog)];
    uniq.slice(0,8).forEach(l=>addMoveLog('[D] '+l,'sys'));
    window._dbgDemandLog=[];
  }
  // Toujours mettre à jour le panel en mode debug
  if(_debugMode) renderBFSeq();
  // En mode pas-à-pas debug : attendre ▶ avant de jouer
  if(_stepMode&&_debugMode){
    _T('aiPlayTurn:pap-wait','moves='+moves.length);
    _stepResolve=()=>_replayMoves(moves);
    _T('aiPlayTurn:sR=replayMoves('+moves.length+')');
    _updateStepUI();
    setStatus('[PàP] '+(window._dbgBFSequences?window._dbgBFSequences.length:0)+' séquence(s) — ▶ pour jouer');
    return;
  }
  _T('aiPlayTurn:direct-replay','moves='+moves.length);
  _replayMoves(moves);
}

function _saveGameState(){
  return {
    commons:G.commons.map(p=>[...p]),
    hands:G.players.map(p=>([...p.hand])),
    crapettes:G.players.map(p=>([...p.crapette])),
    defausses:G.players.map(p=>p.defausse.map(d=>[...d])),
    pioche:[...G.pioche],
    futurePioche:[...G.futurePioche],
    kingVal:[...UI.pileKingVal],
    kingPend:[...UI.pileKingPending],
    cur:G.cur, phase:G.phase, winner:G.winner,
    startDefSnap:G.startDefSnap?G.startDefSnap.map(p=>[...p]):null,
    startCommonsSnap:G.startCommonsSnap?G.startCommonsSnap.map(p=>[...p]):null,
    startKingValSnap:G.startKingValSnap?[...G.startKingValSnap]:null,
    startKingPendSnap:G.startKingPendSnap?[...G.startKingPendSnap]:null,
  };
}

function _restoreGameState(s){
  G.commons=s.commons.map(p=>[...p]);
  G.players.forEach((p,i)=>{
    p.hand=[...s.hands[i]];
    p.crapette=[...s.crapettes[i]];
    p.defausse=s.defausses[i].map(d=>[...d]);
  });
  G.pioche=[...s.pioche];
  G.futurePioche=[...s.futurePioche];
  UI.pileKingVal=[...s.kingVal];
  UI.pileKingPending=[...s.kingPend];
  G.cur=s.cur; G.phase=s.phase; G.winner=s.winner;
  G.startDefSnap=s.startDefSnap;
  G.startCommonsSnap=s.startCommonsSnap;
  G.startKingValSnap=s.startKingValSnap;
  G.startKingPendSnap=s.startKingPendSnap;
}

function _replayMoves(moves){
  _T('_replayMoves:entry','remaining='+moves.length+' phase='+G?.phase);
  if(!moves.length||G.phase==='game-over'){
    _replayingAI=false;
    if(G.phase!=='game-over'&&G.cur===UI.aiIdx){
      // Défausse : calculée sur l'état réel courant
      // _aiDiscard mute G directement → sauvegarder/restaurer pour que _replayMoves puisse
      // rejouer les coups proprement (avec animation et log)
      window._simulating=true;
      _aiMoves=[];
      const _discardStateSave=_saveGameState();
      (_AI_REGISTRY[UI.aiProfile||'tibolos']||AI_TIBOLOS).aiDiscard();
      _restoreGameState(_discardStateSave);
      window._simulating=false;
      const discardMoves=[..._aiMoves];
      _aiMoves=[];
      if(discardMoves.length){
        // PàP : pause avant la défausse, séquences BF encore visibles
        if(_stepMode&&_debugMode){
          _T('_replayMoves:pap-discard-wait');
          _stepResolve=()=>{hideBFSeq();_replayingAI=true;_replayMoves(discardMoves);};
          _T('_replayMoves:sR=discard('+discardMoves.length+')');
          setStatus('[PàP] Défausse — ▶ pour jouer');
          _updateStepUI();
          return;
        }
        _T('_replayMoves:direct-discard','discards='+discardMoves.length);
        hideBFSeq();
        _replayingAI=true;
        _replayMoves(discardMoves);
        return;
      }
    }
    hideBFSeq();
    render();showBtns();return;
  }
  _replayingAI=true;
  const mv=moves.shift();
  // Vérifier découverte AVANT application (G est encore l'état avant le coup)
  const _discovery=(mv.type==='play'&&mv.src&&mv.src.type==='crapette')
    ||(mv.type==='init'&&(!mv.card||mv.fromPioche))
    ||(mv.type==='redraw');
  _T('_replayMoves:apply','mv='+mv.type+(mv.card?'['+mv.card.value+mv.card.suit+']':'')+(mv.src?' src='+mv.src.type:'')+' disco='+_discovery+' left='+moves.length);
  _applyMoveWithAnim(mv,()=>{
    const delay=flyDur>0?flyDur+150:100;
    // Toujours mettre à jour le panel en mode debug
    if(_debugMode) renderBFSeq();
    if(_stepMode&&_debugMode){
      // Pause après le coup : attendre ▶
      if(_discovery){
        _T('_replayMoves:pap-disco-wait');
        _stepResolve=()=>{hideBFSeq();aiPlayTurn();};
        _T('_replayMoves:sR=disco->aiPlayTurn');
        setStatus('[PàP] Découverte — ▶ pour recalculer');
      } else if(mv.type==='discard'){
        // nextPlayer a déjà changé G.cur → ne pas poser de stepResolve zombie
        // Le prochain tour IA sera géré par nextPlayer→aiPlayTurn (ou ▶ via stepOrPlay)
        _T('_replayMoves:discard-turn-end','no stepResolve set');
        _replayingAI=false;
      } else {
        _T('_replayMoves:pap-move-wait','left='+moves.length);
        _stepResolve=()=>_replayMoves(moves);
        _T('_replayMoves:sR=continue('+moves.length+')');
        setStatus('[PàP] Coup joué — ▶ pour continuer');
      }
      _updateStepUI();
    } else {
      if(_discovery){
        _T('_replayMoves:timer-aiPlayTurn','delay='+delay);
        hideBFSeq();
        _aiTimer=setTimeout(aiPlayTurn,delay);
      } else {
        _T('_replayMoves:timer-continue','left='+moves.length+' delay='+delay);
        _aiTimer=setTimeout(()=>_replayMoves(moves),delay);
      }
    }
  });
}

function _applyMoveWithAnim(mv,cb){
  _T('_applyMoveWithAnim','type='+mv.type+(mv.card?'['+mv.card.value+mv.card.suit+']':''));
  if(mv.type==='play'){
    playOnCommon(mv.card,mv.src,mv.ci,()=>cb());
  } else if(mv.type==='redraw'){
    // Piocher une nouvelle main — la relance IA est gérée par _replayMoves via _discovery=true
    drawToFive(()=>{
      render();
      cb();
    });
  } else if(mv.type==='demand'){
    const card=mv.card;
    // Faire clignoter la carte en rouge avant de la bouger
    const defEl=document.querySelector(`[data-def-top="${mv.oppIdx}-${mv.defIdx}"]`);
    const doMove=()=>{
      G.players[mv.oppIdx].defausse[mv.defIdx].pop();
      G.commons[mv.ci].push(card);
      if(card.num===13) resolveKingPushed(mv.ci);
      else{UI.pileKingVal[mv.ci]=null;UI.pileKingPending[mv.ci]=false;}
      addMoveLog('⚡'+cs(card)+'→P'+(mv.ci+1),'sys');
      checkWin();render();
      if(flyDur>0) setTimeout(cb,Math.round(flyDur*0.7)); else cb();
    };
    if(defEl&&flyDur>0){
      let n=0;
      const blink=setInterval(()=>{
        defEl.style.boxShadow=n%2===0?'0 0 14px 4px rgba(233,69,96,0.95),0 0 0 2px #e94560':'none';
        defEl.style.outline=n%2===0?'2px solid #e94560':'none';
        n++;
        if(n>=6){clearInterval(blink);defEl.style.boxShadow='';defEl.style.outline='';setTimeout(doMove,80);}
      },100);
    } else {
      doMove();
    }
  } else if(mv.type==='pass'||mv.type==='redraw'){
    drawToFive(()=>{nextPlayer();setTimeout(cb,flyDur>0?Math.min(flyDur,500):30);});
  } else if(mv.type==='discard'){
    // cb appelé après nextPlayer pour garantir l'ordre des opérations
    endTurnViaDiscard(mv.card,mv.src,mv.di,cb);
  } else if(mv.type==='clear'){
    clearCommon(mv.ci);render();
    if(flyDur>0) setTimeout(cb,Math.round(flyDur*0.5)); else cb();
  } else if(mv.type==='init'){
    if(mv.fromPioche&&mv.card){
      // Carte déterminée pendant simulation → consommer depuis la pioche réelle (même carte, déterministe)
      if(G.pioche.length===0) reshufflePioche();
      if(G.pioche.length>0) G.pioche.pop();
      G.commons[mv.ci].push(mv.card);
      if(mv.card.num===13) resolveKingPushed(mv.ci);
      else{UI.pileKingVal[mv.ci]=null;UI.pileKingPending[mv.ci]=false;}
      addMoveLog(pname()+' retourne '+cs(mv.card)+' → P'+(mv.ci+1),P_COLORS[G.cur]);
      checkWin();render();
      if(flyDur>0) setTimeout(cb,Math.round(flyDur*0.6)); else cb();
    } else {
      initCommon(mv.ci,mv.card,mv.src,cb);
    }
  } else {
    cb();
  }
}

function _buildAiSequence(){
  window._simulating=true;
  if(_debugMode){
    window._dbgDemandLog=window._dbgDemandLog||[];
    window._dbgDemandLog.push('BUILD BF cur='+G.cur+' snap='+!!G.startDefSnap);
  }

  // PHASE 0 : coups imposés inconditionnels avant toute recherche
  // (piles à dame, rois pending, piles vides avec as visible)
  // Ces coups ne nécessitent pas d'évaluation.
  _applyForcedMoves();

  if(G.phase!=='game-over'){
    try {
      const moves=(_AI_REGISTRY[UI.aiProfile||'tibolos']||AI_TIBOLOS).bruteForce();
      const playMoves=moves.filter(mv=>mv.type!=='end');
      _aiMoves.push(...playMoves);
      for(const mv of playMoves) _applyMoveToState(G,UI,mv);
    } catch(e) {
      console.error('BruteForce error:',e);
    }
  }
  window._simulating=false;
}

// Appliquer tous les coups imposés : piles à dame, rois pending, piles vides avec as
// Ces coups sont déterministes, pas de choix à faire.
function _applyForcedMoves(){
  if(window._traceMode) _tlog('  ForcedMoves:');
  let changed=true,iters=0;
  while(changed&&iters<50&&G.phase!=='game-over'){
    changed=false;iters++;

    // 1. Vider piles à dame
    for(let ci=0;ci<4;ci++){
      if(topNum(ci)===12){
        const mv={type:'clear',ci};
        if(window._traceMode) _tlog('    forced: '+_fmtMove(mv));
        _q(mv);_applyMoveToState(G,UI,mv);
        changed=true;break;
      }
    }
    if(changed) continue;

    // 2. Roi pending : jouer une carte UTILE ou écarter
    // Utile = la carte posée mène à la crapette OU vide la main avec pioche dispo
    for(let ci=0;ci<4;ci++){
      if(UI.pileKingPending[ci]){
        const p=G.players[G.cur];
        const crTop=peek(p.crapette);const crNum=crTop?crTop.num:0;
        const cards=[
          ...p.hand.map(c=>({c,src:{type:'hand'}})),
          crTop?{c:crTop,src:{type:'crapette'}}:null,
          ...p.defausse.map((pile,i)=>peek(pile)?{c:peek(pile),src:{type:'defausse',index:i}}:null)
        ].filter(Boolean);
        const playable=cards.filter(({c})=>canOnCommon(c,ci));
        // Filtrer : la carte posée doit être utile
        // Filtrer avec la règle centralisée du roi
        // Pour roi pending, la valeur sera card.num-1 → simuler l'état après pose
        const useful=playable.filter(({c:card2,src:src2})=>{
          // Simuler brièvement : si on pose card2 sur le roi pending,
          // le roi vaudra card2.num-1. Est-ce utile ?
          const crTop2=peek(p.crapette);
          const crNum2=crTop2?crTop2.num:0;
          const kingWillBe=card2.num-1;
          if(kingWillBe>=12) return false;
          const nextNeeded=kingWillBe+1;
          if(nextNeeded>12) return false;
          // Crapette peut se poser après ?
          // Si card2 vient de la crapette, la suivante est p.crapette[length-2]
          const crAfter=src2.type==='crapette'
            ?(p.crapette.length>1?p.crapette[p.crapette.length-2]:null)
            :crTop2;
          if(crAfter&&crAfter.num===nextNeeded) return true;
          // Carte de main valant nextNeeded avec pioche dispo ?
          const canDraw=G.pioche.length>0||G.futurePioche.length>0;
          if(canDraw&&p.hand.some(h=>h.num===nextNeeded&&nextNeeded<12)) return true;
          return false;
        });
        // Parmi les cartes utiles, priorité absolue à la crapette
        // (jouer la crapette fait toujours progresser, même si la suite est incertaine)
        const crTopCard=peek(p.crapette);
        const crInUseful=useful.find(({src})=>src.type==='crapette');
        const crInPlayable=!crInUseful&&crTopCard&&playable.find(({c,src})=>src.type==='crapette');
        // Si la crapette est jouable sur ce roi (même sans passer le filtre useful),
        // on la joue quand même car c'est toujours prioritaire
        const chosen=crInUseful||(crInPlayable?crInPlayable:null);
        const finalCands=chosen?[chosen,...useful.filter(x=>x!==chosen)]:useful;
        if(finalCands.length){
          const best=finalCands[0];
          UI.pileKingPending[ci]=false;UI.pileKingVal[ci]=best.c.num-1;
          _q({type:'play',card:best.c,src:best.src,ci});
          _applyMoveToState(G,UI,{type:'play',card:best.c,src:best.src,ci});
        } else {
          // Pas de carte utile → écarter le roi
          _q({type:'clear',ci});_applyMoveToState(G,UI,{type:'clear',ci});
        }
        changed=true;break;
      }
    }
    if(changed) continue;

    // 3. Piles vides avec as visible → initialiser, SAUF si la crapette est jouable sur une pile
    // non-vide (dans ce cas, le BF jouera d'abord la crapette, puis placera l'as au bon moment).
    {
      const crTopF=peek(G.players[G.cur].crapette);
      const crapetteCanPlay=crTopF&&G.commons.some((c,ci2)=>c.length&&canOnCommon(crTopF,ci2));
      if(!crapetteCanPlay){
        for(let ci=0;ci<4;ci++){
          if(G.commons[ci].length===0){
            const ace=_findAce();
            if(ace){
              _q({type:'init',ci,card:ace.card,src:ace.src});
              _applyMoveToState(G,UI,{type:'init',ci,card:ace.card,src:ace.src});
              changed=true;break;
            }
          }
        }
      }
    }
    if(changed) continue;

    // 4. Piles vides sans as → retourner pioche (as non disponible = laissé au BF)
    for(let ci=0;ci<4;ci++){
      if(G.commons[ci].length===0&&!_findAce()&&(G.pioche.length>0||G.futurePioche.length>0)){
        if(G.pioche.length===0){G.pioche=shuffle([...G.futurePioche]);G.futurePioche=[];}
        if(G.pioche.length>0){
          const drawn=G.pioche.pop();
          const mv={type:'init',ci,card:drawn,src:null,fromPioche:true};
          _q(mv);
          _applyMoveToState(G,UI,mv);
          changed=true;break;
        }
      }
    }
  }
}

function _q(mv){_aiMoves.push(mv);}

// ══════════════════════════════════════════════
// MOTEUR DE SIMULATION PURE
// ══════════════════════════════════════════════
function _cloneState(g,ui){
  return {
    g:{
      players:g.players.map(p=>({
        name:p.name,
        crapette:[...p.crapette],
        hand:[...p.hand],
        defausse:p.defausse.map(d=>[...d]),
      })),
      commons:g.commons.map(p=>[...p]),
      pioche:[...g.pioche],
      futurePioche:[...g.futurePioche],
      cur:g.cur,phase:g.phase,winner:g.winner,
      startDefSnap:g.startDefSnap?g.startDefSnap.map(p=>[...p]):null,
      startCommonsSnap:g.startCommonsSnap?g.startCommonsSnap.map(p=>[...p]):null,
      startKingValSnap:g.startKingValSnap?[...g.startKingValSnap]:null,
      startKingPendSnap:g.startKingPendSnap?[...g.startKingPendSnap]:null,
    },
    ui:{
      pileKingVal:[...ui.pileKingVal],
      pileKingPending:[...ui.pileKingPending],
    }
  };
}

function _sTopNum(g,ui,ci){
  const pile=g.commons[ci];
  if(!pile.length) return 0;
  const t=pile[pile.length-1];
  if(t.num===13){
    if(ui.pileKingVal[ci]!==null) return ui.pileKingVal[ci];
    return 13;
  }
  return t.num;
}

function _sCanOnCommon(g,ui,card,ci){
  const pile=g.commons[ci];
  if(!pile.length) return card.num===1;
  const tNum=_sTopNum(g,ui,ci);
  if(tNum===12) return false;
  if(ui.pileKingPending[ci]) return card.num!==1&&card.num!==13;
  if(card.num===13) return tNum<12&&tNum>0;
  return card.num===tNum+1;
}

function _sResolveKing(g,ui,ci){
  const pile=g.commons[ci];
  if(!pile.length) return;
  const king=pile[pile.length-1];
  if(!king||king.num!==13) return;
  if(pile.length===1){ui.pileKingPending[ci]=true;ui.pileKingVal[ci]=null;return;}
  const below=pile[pile.length-2];
  const belowVal=below.num===13?(ui.pileKingVal[ci]!==null?ui.pileKingVal[ci]:13):below.num;
  const newVal=belowVal+1;
  ui.pileKingPending[ci]=false;
  if(newVal>=12){
    ui.pileKingVal[ci]=null;
    g.futurePioche.push(...pile);
    g.commons[ci]=[];
    ui.pileKingPending[ci]=false;
  } else {
    ui.pileKingVal[ci]=newVal;
  }
}

function _sRemove(g,pidx,card,src){
  const p=g.players[pidx];
  if(src.type==='hand'){const i=p.hand.findIndex(c=>c.uid===card.uid);if(i>=0)p.hand.splice(i,1);}
  else if(src.type==='crapette'){if(p.crapette.length) p.crapette.pop();}
  else if(src.type==='defausse'){const pile=p.defausse[src.index];if(pile.length&&pile[pile.length-1].uid===card.uid)pile.pop();}
}

function _sPlay(g,ui,pidx,card,src,ci){
  _sRemove(g,pidx,card,src);
  g.commons[ci].push(card);
  if(card.num===13) _sResolveKing(g,ui,ci);
  else if(ui.pileKingPending[ci]){ui.pileKingPending[ci]=false;ui.pileKingVal[ci]=card.num-1;}
  else{ui.pileKingVal[ci]=null;ui.pileKingPending[ci]=false;}
  if(g.players[pidx].crapette.length===0){g.phase='game-over';g.winner=pidx;}
}

function _sClear(g,ui,ci){
  g.futurePioche.push(...g.commons[ci]);
  g.commons[ci]=[];
  ui.pileKingVal[ci]=null;ui.pileKingPending[ci]=false;
}

function _sDrawSafe(g,pidx){
  const p=g.players[pidx];
  let iters=0;
  while(p.hand.length<5&&iters<60){
    iters++;
    if(g.pioche.length===0){
      if(!g.futurePioche.length) break;
      g.pioche=[...g.futurePioche];g.futurePioche=[];
    }
    if(g.pioche.length) p.hand.push(g.pioche.pop());
    else break;
  }
  p.hand.sort((a,b)=>a.num-b.num);
}

// Sources VISIBLES pour un joueur (adversaire = seulement crapette+défausse)
function _sSources(g,pidx,visibleOnly){
  const p=g.players[pidx];
  const srcs=[];
  // Crapette : toujours visible
  if(p.crapette.length) srcs.push({card:p.crapette[p.crapette.length-1],src:{type:'crapette'}});
  // Défausse : toujours visible
  for(let i=0;i<4;i++){if(p.defausse[i].length) srcs.push({card:p.defausse[i][p.defausse[i].length-1],src:{type:'defausse',index:i}});}
  // Main : visible seulement si c'est notre joueur
  if(!visibleOnly) for(const c of p.hand) srcs.push({card:c,src:{type:'hand'}});
  return srcs;
}

// Vérifie si une carte de défausse adverse était jouable au début du tour IA
// en utilisant les snapshots stockés dans g
function _sWasPlayable(g,defIdx,oppIdx){
  if(!g.startDefSnap||!g.startCommonsSnap){
    if(_debugMode) addMoveLog('[sWP] NO SNAP di='+defIdx,'sys');
    return false;
  }
  const snap=g.startDefSnap[defIdx];
  if(!snap||!snap.length){
    if(_debugMode) addMoveLog('[sWP] EMPTY SNAP di='+defIdx,'sys');
    return false;
  }
  const card=snap[snap.length-1];
  if(_debugMode){
    window._dbgDemandLog=window._dbgDemandLog||[];
    const snapTops=g.startCommonsSnap.map(p=>p.length?p[p.length-1].value+p[p.length-1].suit:'_').join(',');
    window._dbgDemandLog.push('sWP di='+defIdx+' card='+card.value+card.suit+' piles='+snapTops);
  }
  const commSnap=g.startCommonsSnap;
  const kvSnap=g.startKingValSnap||[null,null,null,null];
  const kpSnap=g.startKingPendSnap||[false,false,false,false];
  for(let ci=0;ci<4;ci++){
    const snapPile=commSnap[ci];
    const t=snapPile&&snapPile.length?snapPile[snapPile.length-1]:null;
    const kVal=kvSnap[ci];
    const kPend=kpSnap[ci];
    let tNum=0;
    if(t){
      if(t.num===13&&kVal!==null) tNum=kVal;
      else if(t.num===13&&kPend) tNum=13;
      else tNum=t.num;
    }
    if(!t&&card.num===1) return true;
    if(!t) continue;
    if(tNum===12) continue;
    if(kPend&&card.num!==1&&card.num!==13) return true;
    if(card.num===13&&tNum<12) return true;
    if(card.num===tNum+1) return true;
  }
  return false;
}

// Coups légaux — visibleOnly=true pour l'adversaire
function _sLegal(g,ui,pidx,visibleOnly){
  const p=g.players[pidx];
  const moves=[];

  // Coups imposés (priorité absolue, pas de branchement)
  for(let ci=0;ci<4;ci++) if(_sTopNum(g,ui,ci)===12) return [{type:'clear',ci}];
  for(let ci=0;ci<4;ci++){
    if(ui.pileKingPending[ci]){
      const srcs=_sSources(g,pidx,visibleOnly);
      const playable=srcs.filter(({card})=>_sCanOnCommon(g,ui,card,ci));
      if(playable.length) return [{type:'play',card:playable[0].card,src:playable[0].src,ci}];
      return [{type:'clear',ci}];
    }
  }

  // Main vide → tirage immédiat (priorité sur tout sauf clear/king forcés)
  if(p.hand.length===0&&!visibleOnly) return [{type:'redraw'}];

  // Piles vides : tous les As disponibles (main + défausse + crapette), sinon pioche.
  // Générer un coup par As trouvé : le BF compare via defVsHandPenalty + handPlayBonus.
  // Exception : si la crapette est jouable sur une pile non-vide, l'As attend (crapette passe en premier).
  const crTop=peek(p.crapette);
  const crapetteBlocksAce=!visibleOnly&&crTop&&g.commons.some((_,ci2)=>g.commons[ci2].length&&_sCanOnCommon(g,ui,crTop,ci2));
  for(let ci=0;ci<4;ci++){
    if(!g.commons[ci].length){
      const srcs=_sSources(g,pidx,visibleOnly);
      const aces=srcs.filter(({card})=>card.num===1);
      if(aces.length){
        if(!crapetteBlocksAce)
          for(const ace of aces) moves.push({type:'play',card:ace.card,src:ace.src,ci});
      } else if(g.pioche.length>0||g.futurePioche.length>0){
        // Ne pas initier depuis pioche si crapette ≤ 3 et aucun as visible (trop risqué)
        const crLen=g.players[pidx].crapette.length;
        const hasVisibleAce=_sSources(g,pidx,true).some(({card})=>card.num===1);
        if(crLen>3||hasVisibleAce) moves.push({type:'init',ci});
      }
    }
  }

  // Coups normaux
  const srcs=_sSources(g,pidx,visibleOnly);
  for(const {card,src} of srcs){
    for(let ci=0;ci<4;ci++){
      if(!g.commons[ci].length) continue;
      if(_sCanOnCommon(g,ui,card,ci)){
        moves.push({type:'play',card,src,ci});
      }
    }
  }

  // Demandes : cartes de défausse adverse jouables au début du tour IA (une seule par tour)
  if(!visibleOnly&&!g.demandMadeThisTurn){
    const oppIdx=1-pidx;
    const opp=g.players[oppIdx];
    for(let di=0;di<4;di++){
      const card=opp.defausse[di].length?opp.defausse[di][opp.defausse[di].length-1]:null;
      if(!card) continue;
      // Vérifier que la carte actuelle est bien celle du snap (pas une sous-jacente après demande appliquée)
      const snapPile=g.startDefSnap&&g.startDefSnap[di];
      const snapTop=snapPile&&snapPile.length?snapPile[snapPile.length-1]:null;
      if(!snapTop||card.uid!==snapTop.uid) continue;
      if(_sWasPlayable(g,di,oppIdx)){
        for(let ci=0;ci<4;ci++){
          if(_sCanOnCommon(g,ui,card,ci)){
            moves.push({type:'demand',card,oppIdx,defIdx:di,ci});
            break;
          }
        }
      }
    }
  }

  // Fin de tour : défausser une carte de la main (pas crapette, pas un Roi) — toutes les combinaisons
  if(!visibleOnly){
    for(let di=0;di<4;di++){
      const defTop=p.defausse[di].length?p.defausse[di][p.defausse[di].length-1]:null;
      for(const c of p.hand){
        if(c.num===13) continue; // les Rois ne peuvent pas être défaussés en fin de séquence BF
        if(!defTop||defTop.num!==1||c.num===1)
          moves.push({type:'end',card:c,src:{type:'hand'},di});
      }
    }
  }

  return moves;
}

function _sApply(g,ui,pidx,mv){
  const s=_cloneState(g,ui);
  const ng=s.g,nui=s.ui;
  if(mv.type==='clear') _sClear(ng,nui,mv.ci);
  else if(mv.type==='play') _sPlay(ng,nui,pidx,mv.card,mv.src,mv.ci);
  else if(mv.type==='init'){
    if(!ng.pioche.length&&ng.futurePioche.length){ng.pioche=[...ng.futurePioche];ng.futurePioche=[];}
    if(ng.pioche.length){
      const d=ng.pioche.pop();
      ng.commons[mv.ci].push(d);
      if(d.num===13) _sResolveKing(ng,nui,mv.ci);
      else{nui.pileKingVal[mv.ci]=null;nui.pileKingPending[mv.ci]=false;}
    }
  } else if(mv.type==='demand'){
    const oppDef=ng.players[mv.oppIdx].defausse[mv.defIdx];
    if(oppDef.length&&oppDef[oppDef.length-1].uid===mv.card.uid) oppDef.pop();
    ng.commons[mv.ci].push(mv.card);
    ng.demandMadeThisTurn=true;
    if(mv.card.num===13) _sResolveKing(ng,nui,mv.ci);
    else if(nui.pileKingPending[mv.ci]){nui.pileKingPending[mv.ci]=false;nui.pileKingVal[mv.ci]=mv.card.num-1;}
    else{nui.pileKingVal[mv.ci]=null;nui.pileKingPending[mv.ci]=false;}
  } else if(mv.type==='end'){
    _sRemove(ng,pidx,mv.card,mv.src);
    ng.players[pidx].defausse[mv.di].push(mv.card);
    ng.cur=1-pidx;
    // Pas de piochage : on évalue sans traverser la frontière de piochage
  }
  return {g:ng,ui:nui};
}

// ══════════════════════════════════════════════
// UTILITAIRES PARTAGÉS — formatage et helpers BF
// ══════════════════════════════════════════════

function _fmtCV(card){ return card?( card.value==='10'?'T':card.value ):'?'; }

function _fmtSrc(src){
  if(!src) return 'Pio';
  if(src.type==='crapette') return 'Cr';
  if(src.type==='hand') return 'Ma';
  if(src.type==='defausse') return 'Df'+(src.index+1);
  return '?';
}

function _fmtMove(mv){
  let s;
  if(mv.type==='play')   s=_fmtCV(mv.card)+'('+_fmtSrc(mv.src)+')->P'+(mv.ci+1);
  else if(mv.type==='clear')  s='P'+(mv.ci+1)+'->Rcy';
  else if(mv.type==='init')   s=mv.src?_fmtCV(mv.card)+'('+_fmtSrc(mv.src)+')->P'+(mv.ci+1):'Pio->P'+(mv.ci+1);
  else if(mv.type==='demand') s=_fmtCV(mv.card)+'(Dm'+(mv.defIdx+1)+')->P'+(mv.ci+1);
  else if(mv.type==='end')    s=_fmtCV(mv.card)+'(Ma)->Df'+(mv.di+1);
  else if(mv.type==='redraw'||mv.type==='pass') s='Pio->Ma';
  else s=mv.type;
  if((mv.type==='play'&&mv.src&&mv.src.type==='crapette')||
     (mv.type==='init'&&!mv.card)) s+='*';
  return s;
}

function _bfDedup(moves,p,g){
  const seen=new Set();
  const out=[];
  for(const mv of moves){
    let key;
    if(mv.type==='play'&&mv.src&&mv.src.type==='hand'){
      const pileEmpty=g&&!g.commons[mv.ci].length;
      key='ph:'+mv.card.num+':'+(pileEmpty?'E':mv.ci);
    } else if(mv.type==='play'&&mv.src&&mv.src.type==='defausse'){
      const pileEmpty=g&&!g.commons[mv.ci].length;
      key=pileEmpty?'pdf:'+mv.card.uid+':E':null;
    } else if(mv.type==='end'){
      const empty=p.defausse[mv.di].length===0;
      key='end:'+mv.card.num+':'+(empty?'E':mv.di);
    } else {
      out.push(mv); continue;
    }
    if(key===null||!seen.has(key)){if(key)seen.add(key);out.push(mv);}
  }
  return out;
}

function _sCardAvailableForPath(g,ui,pidx,num){
  const p=g.players[pidx];
  if(p.hand.some(c=>c.num===num)) return true;
  if(p.defausse.some(d=>d.length&&d[d.length-1].num===num)) return true;
  if(p.defausse.some(d=>d.length>=2&&d[d.length-2].num===num)) return true;
  if(!g.demandMadeThisTurn&&g.startDefSnap){
    for(let di=0;di<4;di++){
      const snap=g.startDefSnap[di];
      if(snap&&snap.length&&snap[snap.length-1].num===num) return true;
    }
  }
  return false;
}

function _applyMoveToState(g,ui,mv){
  const pidx=g.cur;
  if(mv.type==='clear'){
    g.futurePioche.push(...g.commons[mv.ci]);
    g.commons[mv.ci]=[];
    ui.pileKingVal[mv.ci]=null;ui.pileKingPending[mv.ci]=false;
    _animating=true;setTimeout(()=>{_animating=false;},200);
  } else if(mv.type==='play'){
    _sRemove(g,pidx,mv.card,mv.src);
    g.commons[mv.ci].push(mv.card);
    if(mv.card.num===13) _sResolveKing(g,ui,mv.ci);
    else if(ui.pileKingPending[mv.ci]){ui.pileKingPending[mv.ci]=false;ui.pileKingVal[mv.ci]=mv.card.num-1;}
    else{ui.pileKingVal[mv.ci]=null;ui.pileKingPending[mv.ci]=false;}
    if(g.players[pidx].crapette.length===0){g.phase='game-over';g.winner=pidx;}
  } else if(mv.type==='init'){
    if(mv.card){
      if(mv.src) _sRemove(g,g.cur,mv.card,mv.src);
      g.commons[mv.ci].push(mv.card);
      if(mv.card.num===13) _sResolveKing(g,ui,mv.ci);
      else{ui.pileKingVal[mv.ci]=null;ui.pileKingPending[mv.ci]=false;}
    } else {
      if(!g.pioche.length&&g.futurePioche.length){g.pioche=g.futurePioche.splice(0);g.futurePioche=[];}
      if(g.pioche.length){
        const d=g.pioche.pop();
        g.commons[mv.ci].push(d);
        if(d.num===13) _sResolveKing(g,ui,mv.ci);
        else{ui.pileKingVal[mv.ci]=null;ui.pileKingPending[mv.ci]=false;}
      }
    }
  }
}

function _findAce(){
  const p=G.players[G.cur];
  const ct=peek(p.crapette);if(ct&&ct.num===1)return{card:ct,src:{type:'crapette'}};
  const handAce=p.hand.find(c=>c.num===1);
  let defAce=null,defAceIdx=-1;
  for(let i=0;i<4;i++){const t=peek(p.defausse[i]);if(t&&t.num===1){defAce=t;defAceIdx=i;break;}}
  if(handAce&&defAce){
    const pile=p.defausse[defAceIdx];
    const hidden=pile.length>=2?pile[pile.length-2]:null;
    const hiddenUseful=hidden&&_handCardIsPlayable(hidden);
    if(hiddenUseful) return{card:defAce,src:{type:'defausse',index:defAceIdx}};
    return{card:handAce,src:{type:'hand'}};
  }
  if(handAce) return{card:handAce,src:{type:'hand'}};
  if(defAce) return{card:defAce,src:{type:'defausse',index:defAceIdx}};
  return null;
}

function _handCardIsPlayable(card){
  for(let ci=0;ci<4;ci++) if(canOnCommon(card,ci)) return true;
  return false;
}

function _chainValsForPlayer(pidx){
  const p=G.players[pidx];
  const crT=peek(p.crapette);
  if(!crT) return new Set();
  const crNum=crT.num;
  const target=(crNum-1+12)%12||12;
  let minDist=12,bestTn=0;
  for(let ci=0;ci<4;ci++){
    const tn=topNum(ci);
    if(tn>0&&tn<12){const dist=(target-tn+12)%12;if(dist<minDist){minDist=dist;bestTn=tn;}}
  }
  const vals=new Set();
  if(minDist===0||minDist>=12) return vals;
  const chainLen=Math.min(5,minDist);
  for(let step=1;step<=chainLen;step++){
    const v=((bestTn+step-1)%12)+1;
    if(v!==crNum) vals.add(v);
  }
  return vals;
}

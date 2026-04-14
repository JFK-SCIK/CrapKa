// ══════════════════════════════════════════════
// IA — FILE DE COUPS ASYNCHRONE
// ══════════════════════════════════════════════
const _VER_AI='1.2.32';
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
      _aiDiscard();
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
      const moves=_bruteForce();
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

    // 3. Piles vides avec as visible → initialiser (priorité)
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
    if(changed) continue;

    // 4. Piles vides sans as → retourner pioche
    for(let ci=0;ci<4;ci++){
      if(G.commons[ci].length===0&&(G.pioche.length>0||G.futurePioche.length>0)){
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
  for(let ci=0;ci<4;ci++){
    if(!g.commons[ci].length){
      const srcs=_sSources(g,pidx,visibleOnly);
      const aces=srcs.filter(({card})=>card.num===1);
      if(aces.length){
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
// ÉVALUATION
// ══════════════════════════════════════════════

// Sous-score "main résiduelle" : critères portant uniquement sur la main de l'IA en fin de séquence
function _evalHandScore(g,ui,aiIdx){
  const ai=g.players[aiIdx];
  const crT=ai.crapette.length?ai.crapette[ai.crapette.length-1]:null;
  let sc=0;
  // Cartes de main jouables sur les piles
  for(const c of ai.hand) for(let ci=0;ci<4;ci++) if(_sCanOnCommon(g,ui,c,ci)){sc+=4;break;}
  // Main vide + pioche dispo
  if(ai.hand.length===0&&(g.pioche.length>0||g.futurePioche.length>0)) sc+=10;
  // Taille de main (plus petite = mieux)
  const handSize=ai.hand.length;
  sc+=Math.max(0,5-handSize)*4;
  // Rois si crapette injouable
  const crPlayable=crT&&g.commons.some((_,ci)=>_sCanOnCommon(g,ui,crT,ci));
  if(!crPlayable&&handSize>0) sc+=ai.hand.filter(c=>c.num===13).length*10;
  // Pas de doublon de la crapette, pas de doublons de valeur
  if(crT&&handSize>0){
    const handNums=ai.hand.map(c=>c.num);
    if(!handNums.includes(crT.num)) sc+=8;
    if(new Set(handNums).size===handNums.length) sc+=5;
    // Cartes précédant la crapette
    const prev1=crT.num===1?12:crT.num-1;
    const prev2=crT.num<=2?crT.num+10:crT.num-2;
    if(handNums.includes(prev1)) sc+=8;
    if(handNums.includes(prev2)) sc+=4;
  }
  // Couverture de la chaîne vers la crapette par la main résiduelle
  if(crT){
    const target=(crT.num-1+12)%12||12;
    let minDist=12,bestTn=0;
    for(let ci=0;ci<4;ci++){
      const tn=_sTopNum(g,ui,ci);
      if(tn>0&&tn<12){const dist=(target-tn+12)%12;if(dist<minDist){minDist=dist;bestTn=tn;}}
    }
    if(minDist>0&&minDist<12){
      const chainLen=Math.min(5,minDist);
      const handNums=new Set(ai.hand.map(c=>c.num));
      for(let step=1;step<=chainLen;step++){
        const v=((bestTn+step-1)%12)+1;
        if(v!==crT.num&&handNums.has(v)) sc+=6;
      }
    }
  }
  return sc;
}

// Détail du score pour le tooltip — retourne une string multi-ligne
function _evalBreakdown(g,ui,aiIdx){
  if(g.phase==='game-over') return g.winner===aiIdx?'🏆 Victoire: +10000':'💀 Défaite: −10000';
  const ai=g.players[aiIdx],opp=g.players[1-aiIdx];
  const crT=ai.crapette.length?ai.crapette[ai.crapette.length-1]:null;
  const oppCrT=opp.crapette.length?opp.crapette[opp.crapette.length-1]:null;
  const L=[],fmt=(v)=>(v>=0?'+':'')+v;
  function add(label,v){if(v!==0)L.push(label+': '+fmt(v));}

  // Crapette relative
  const crSc=(21-ai.crapette.length)*50-(21-opp.crapette.length)*50;
  add('Cr '+ai.crapette.length+'→'+opp.crapette.length,crSc);

  // Crapette IA jouable
  let crPlay=0;
  if(crT) for(let ci=0;ci<4;ci++) if(_sCanOnCommon(g,ui,crT,ci)){crPlay=30;break;}
  add('Cr jouable ('+( crT?crT.value:'∅')+')',crPlay);

  // Crapette adverse jouable
  let oppPlay=0;
  if(oppCrT) for(let ci=0;ci<4;ci++) if(_sCanOnCommon(g,ui,oppCrT,ci)){oppPlay=-40;break;}
  add('Cr adv jouable ('+(oppCrT?oppCrT.value:'∅')+')',oppPlay);

  // Piles dist circulaire
  let pDist=0;
  if(crT){const tgt=(crT.num-1+12)%12||12;for(let ci=0;ci<4;ci++){const tn=_sTopNum(g,ui,ci);if(tn>0&&tn<12){const d=(tgt-tn+12)%12;pDist+=Math.max(0,(11-d)*2);}}}
  add('Piles dist',pDist);

  // Piles activables
  const aiSrcs=[...ai.hand,...ai.defausse.map(d=>d.length?d[d.length-1]:null).filter(Boolean)];
  let activ=0;
  for(let ci=0;ci<4;ci++){const tn=_sTopNum(g,ui,ci);if(tn>0&&tn<12&&aiSrcs.some(c=>c.num===tn+1))activ+=8;}
  add('Piles activables',activ);

  // Diversité défausses
  const dv=new Set(ai.defausse.map(d=>d.length?d[d.length-1].num:null).filter(n=>n!==null)).size;
  add('Déf diversité',dv*3);

  // Min dist
  let minD=12;
  if(crT){const tgt=(crT.num-1+12)%12||12;for(let ci=0;ci<4;ci++){const tn=_sTopNum(g,ui,ci);if(tn>0&&tn<12)minD=Math.min(minD,(tgt-tn+12)%12);}}
  add('Min dist pile',minD<12?Math.max(0,(6-minD)*4):0);

  // Malus piles vides
  if(g.pioche.length>0||g.futurePioche.length>0){const e=g.commons.filter(p=>!p.length).length;add('Piles vides',-e*30);}

  // Malus chaîne adverse
  let chainAdv=0;
  if(oppCrT){
    const tgt=(oppCrT.num-1+12)%12||12;let od=12,otn=0;
    for(let ci=0;ci<4;ci++){const tn=_sTopNum(g,ui,ci);if(tn>0&&tn<12){const d=(tgt-tn+12)%12;if(d<od){od=d;otn=tn;}}}
    if(od>0&&od<12){const cv=new Set();for(let s=1;s<=Math.min(5,od);s++){const v=((otn+s-1)%12)+1;if(v!==oppCrT.num)cv.add(v);}
      for(const d of ai.defausse){const t=d.length?d[d.length-1]:null;if(!t||!cv.has(t.num))continue;
        const vis=opp.defausse.some(od2=>{const ot=od2.length?od2[od2.length-1]:null;return ot&&ot.num===t.num;})
          ||(opp.crapette.length&&opp.crapette[opp.crapette.length-1].num===t.num);
        if(!vis)chainAdv-=8;}}
  }
  add('Chaîne adv',chainAdv);

  // Détail main résiduelle
  L.push('── Main ('+ai.hand.map(c=>c.value).join(' ')+') ──');
  const handSize=ai.hand.length;
  let mj=0;for(const c of ai.hand)for(let ci=0;ci<4;ci++)if(_sCanOnCommon(g,ui,c,ci)){mj+=4;break;}
  add('  Jouables',mj);
  if(handSize===0&&(g.pioche.length>0||g.futurePioche.length>0))L.push('  Vide: +10');
  add('  Taille('+handSize+')',Math.max(0,5-handSize)*4);
  const crPlayable2=crT&&g.commons.some((_,ci)=>_sCanOnCommon(g,ui,crT,ci));
  if(!crPlayable2&&handSize>0){const rk=ai.hand.filter(c=>c.num===13).length;add('  Rois',rk*10);}
  if(crT&&handSize>0){
    const hn=ai.hand.map(c=>c.num);
    add('  NoDupCr',hn.includes(crT.num)?0:8);
    add('  NoDupVal',new Set(hn).size===hn.length?5:0);
    const p1=crT.num===1?12:crT.num-1,p2=crT.num<=2?crT.num+10:crT.num-2;
    add('  Prev1('+p1+')',hn.includes(p1)?8:0);
    add('  Prev2('+p2+')',hn.includes(p2)?4:0);
  }
  // Couverture chaîne
  if(crT){
    const tgt=(crT.num-1+12)%12||12;let md=12,bTn=0;
    for(let ci=0;ci<4;ci++){const tn=_sTopNum(g,ui,ci);if(tn>0&&tn<12){const d=(tgt-tn+12)%12;if(d<md){md=d;bTn=tn;}}}
    if(md>0&&md<12){const hn=new Set(ai.hand.map(c=>c.num));let ch=0;
      for(let s=1;s<=Math.min(5,md);s++){const v=((bTn+s-1)%12)+1;if(v!==crT.num&&hn.has(v))ch+=6;}
      add('  Chaine cov',ch);}
  }

  return L.join('\n');
}

function _eval(g,ui,aiIdx){
  if(g.phase==='game-over') return g.winner===aiIdx?10000:-10000;
  const ai=g.players[aiIdx],opp=g.players[1-aiIdx];
  let sc=0;
  sc+=(21-ai.crapette.length)*50-(21-opp.crapette.length)*50;
  const crT=ai.crapette.length?ai.crapette[ai.crapette.length-1]:null;
  if(crT) for(let ci=0;ci<4;ci++) if(_sCanOnCommon(g,ui,crT,ci)){sc+=30;break;}
  const oppCrT=opp.crapette.length?opp.crapette[opp.crapette.length-1]:null;
  if(oppCrT) for(let ci=0;ci<4;ci++) if(_sCanOnCommon(g,ui,oppCrT,ci)){
    sc-=40; // bloquer la crapette adverse : priorité haute (≈ jouer 1 carte de sa crapette)
    break;
  }
  // Bonus piles : distance circulaire vers crNum-1 (plus proche = plus utile)
  if(crT){
    const crNum=crT.num;
    const target=(crNum-1+12)%12||12; // valeur juste avant la crapette
    for(let ci=0;ci<4;ci++){
      const tn=_sTopNum(g,ui,ci);
      if(tn>0&&tn<12){
        const dist=(target-tn+12)%12; // 0=pile prête, 11=très loin
        sc+=Math.max(0,(11-dist)*2); // dist=0→+22, dist=4→+14, dist=6→+10
      }
    }
  }
  // Bonus : piles activables par une carte visible de l'IA (main ou défausse)
  const aiSrcs=[
    ...ai.hand,
    ...ai.defausse.map(d=>d.length?d[d.length-1]:null).filter(Boolean)
  ];
  for(let ci=0;ci<4;ci++){
    const tn=_sTopNum(g,ui,ci);
    if(tn>0&&tn<12){
      if(aiSrcs.some(card=>card.num===tn+1)) sc+=8;
    }
  }
  // Bonus diversité des défausses IA : valeurs différentes exposées
  const defVals=new Set(ai.defausse.map(d=>d.length?d[d.length-1].num:null).filter(n=>n!==null));
  sc+=defVals.size*3; // plus de valeurs différentes = plus de flexibilité

  // ── Critères supplémentaires ────────────────────────────────────────────

  // 1. Bonus min(distance pile → crapette) : récompense la pile la plus proche
  if(crT){
    const crNum=crT.num;
    const target=(crNum-1+12)%12||12;
    let minDist=12;
    for(let ci=0;ci<4;ci++){
      const tn=_sTopNum(g,ui,ci);
      if(tn>0&&tn<12) minDist=Math.min(minDist,(target-tn+12)%12);
    }
    if(minDist<12) sc+=Math.max(0,(6-minDist)*4); // dist=0→+24, dist=3→+12, dist=6+→0
  }

  // Malus fort : piles vides non initialisées quand la pioche est disponible
  if(g.pioche.length>0||g.futurePioche.length>0){
    const emptyPiles=g.commons.filter(p=>!p.length).length;
    if(emptyPiles>0) sc-=emptyPiles*30;
  }

  // Critères main résiduelle (délégués à _evalHandScore)
  sc+=_evalHandScore(g,ui,aiIdx);

  // Malus : valeurs de la chaîne adverse visibles dans les défausses IA
  // et non déjà visibles chez l'adversaire → dangereux (demandables ou exploitables)
  if(oppCrT){
    const oppTarget=(oppCrT.num-1+12)%12||12;
    let oppMinDist=12,oppBestTn=0;
    for(let ci=0;ci<4;ci++){
      const tn=_sTopNum(g,ui,ci);
      if(tn>0&&tn<12){const dist=(oppTarget-tn+12)%12;if(dist<oppMinDist){oppMinDist=dist;oppBestTn=tn;}}
    }
    if(oppMinDist>0&&oppMinDist<12){
      const oppChainLen=Math.min(5,oppMinDist);
      const oppChainVals=new Set();
      for(let step=1;step<=oppChainLen;step++){
        const v=((oppBestTn+step-1)%12)+1;
        if(v!==oppCrT.num) oppChainVals.add(v);
      }
      for(const d of ai.defausse){
        const t=d.length?d[d.length-1]:null;
        if(!t||!oppChainVals.has(t.num)) continue;
        const visForOpp=opp.defausse.some(od=>{const ot=od.length?od[od.length-1]:null;return ot&&ot.num===t.num;})
          ||(opp.crapette.length&&opp.crapette[opp.crapette.length-1].num===t.num);
        if(!visForOpp) sc-=8;
      }
    }
  }

  return sc;
}

// ══════════════════════════════════════════════
// FORCE BRUTE
// ══════════════════════════════════════════════
// Limite sur le nombre d'expansions (séquences traitées) plutôt que sur les actives simultanées.
// Le best-first garantit que les meilleures séquences sont explorées en premier.
const BF_MAX_EXPANSIONS=3000;

// Borne supérieure optimiste du bonus encore atteignable depuis une séquence non terminée.
// Utilisée pour l'élagage : si score+hMax < meilleur_terminé, la séquence ne peut plus gagner.
function _hMax(seq,aiIdx){
  const hand=seq.state.g.players[aiIdx].hand;
  return (seq.crapettePlayed?0:500)+(hand.length>0?150:0)+hand.length*5;
}

// Formate une valeur de carte sur 1 caractère (10 → T)
function _fmtCV(card){ return card?( card.value==='10'?'T':card.value ):'?'; }

// Formate la source d'un move
function _fmtSrc(src){
  if(!src) return 'Pio';
  if(src.type==='crapette') return 'Cr';
  if(src.type==='hand') return 'Ma';
  if(src.type==='defausse') return 'Df'+(src.index+1);
  return '?';
}

// Formate un move en notation compacte (* = découverte de carte)
function _fmtMove(mv){
  let s;
  if(mv.type==='play')   s=_fmtCV(mv.card)+'('+_fmtSrc(mv.src)+')->P'+(mv.ci+1);
  else if(mv.type==='clear')  s='P'+(mv.ci+1)+'->Rcy';
  else if(mv.type==='init')   s=mv.src?_fmtCV(mv.card)+'('+_fmtSrc(mv.src)+')->P'+(mv.ci+1):'Pio->P'+(mv.ci+1);
  else if(mv.type==='demand') s=_fmtCV(mv.card)+'(Dm'+(mv.defIdx+1)+')->P'+(mv.ci+1);
  else if(mv.type==='end')    s=_fmtCV(mv.card)+'(Ma)->Df'+(mv.di+1);
  else if(mv.type==='redraw'||mv.type==='pass') s='Pio->Ma';
  else s=mv.type;
  // Marquer les coups découverte (crapette ou init pioche)
  if((mv.type==='play'&&mv.src&&mv.src.type==='crapette')||
     (mv.type==='init'&&!mv.card)) s+='*';
  return s;
}

// Point d'entrée : construit toutes les séquences possibles et retourne les moves
// de la meilleure séquence terminée.
function _bruteForce(){
  const aiIdx=UI.aiIdx;
  const {g:g0,ui:ui0}=_cloneState(G,UI);

  const initSeq={
    id:'0',
    state:{g:g0,ui:ui0},
    moves:[],
    terminated:false,
    score:_eval(g0,ui0,aiIdx),
    extraBonus:0,
    crapettePlayed:false,  // true après la première pose de crapette (suivante invisible)
    postKey:false,         // true après crapette jouée OU jeu sur pile vide → bonus suivants réduits
    triggerIdx:-1,         // index du 1er coup déclencheur (crapette/main vide/recyclage)
    moveMeta:[]            // flags par coup pour l'affichage
  };
  initSeq.hMax=_hMax(initSeq,aiIdx);

  // Best-first : toujours traiter la séquence active avec le meilleur score+hMax.
  // Les séquences terminées et actives sont séparées pour éviter de parcourir les terminées.
  let active=[initSeq];
  let terminated=[];
  let bestTermScore=-Infinity;
  let expansions=0;

  while(active.length>0&&expansions<BF_MAX_EXPANSIONS){
    // Trouver la séquence active avec le meilleur score+hMax (best-first)
    let bestIdx=0, bestF=active[0].score+active[0].hMax;
    for(let i=1;i<active.length;i++){
      const f=active[i].score+active[i].hMax;
      if(f>bestF){bestF=f;bestIdx=i;}
    }
    // Si même la meilleure active ne peut plus battre le meilleur terminé → arrêt
    if(bestF<bestTermScore) break;

    const seq=active[bestIdx];
    active.splice(bestIdx,1);
    expansions++;

    const expanded=_bfExpand(seq,aiIdx);
    for(const s of expanded){
      if(s.terminated){
        terminated.push(s);
        if(s.score>bestTermScore) bestTermScore=s.score;
      } else {
        s.hMax=_hMax(s,aiIdx);
        // N'ajouter que si la séquence peut encore potentiellement gagner
        if(bestTermScore===-Infinity||s.score+s.hMax>=bestTermScore)
          active.push(s);
      }
    }
    // Élagage : retirer les actives qui ne peuvent plus battre le meilleur terminé
    if(bestTermScore>-Infinity)
      active=active.filter(s=>s.score+s.hMax>=bestTermScore);
  }

  // Meilleure séquence terminée (tie-break : plus courte si scores égaux)
  let best=null;
  for(const seq of terminated){
    if(best===null||seq.score>best.score||(seq.score===best.score&&seq.moves.length<best.moves.length))
      best=seq;
  }

  // Stocker les séquences pour le panel debug pas-à-pas
  const sortedTerm=terminated.sort((a,b)=>b.score-a.score||a.moves.length-b.moves.length);
  if(_debugMode){
    const bestId=best?best.id:null;
    window._dbgBFExpansions=expansions;
    window._dbgBFSequences=sortedTerm.map(s=>({
      score: s.score,
      handScore: s.handScore||0,
      moves: s.moves,
      moveMeta: s.moveMeta||[],
      triggerIdx: s.triggerIdx??-1,
      isBest: s.id===bestId,
      breakdown: _evalBreakdown(s.state.g,s.state.ui,aiIdx)
    }));
  }

  // Trace BF
  if(window._traceMode){
    const bestId=best?best.id:null;
    _traceBF(sortedTerm.map(s=>({
      score:s.score,handScore:s.handScore||0,
      moves:s.moves,moveMeta:s.moveMeta||[],triggerIdx:s.triggerIdx??-1,isBest:s.id===bestId
    })),best,aiIdx);
    _tlog('  BF expansions='+expansions+' terminées='+terminated.length+' actives_restantes='+active.length);
    // Vérifier si la crapette est dans une séquence et pourquoi la meilleure ne la joue pas
    const ai=G.players[aiIdx];
    const crT=ai.crapette.length?ai.crapette[ai.crapette.length-1]:null;
    if(crT){
      const seqsWithCr=terminated.filter(s=>s.moves.some(m=>m.type==='play'&&m.src&&m.src.type==='crapette'));
      const bestHasCr=best&&best.moves.some(m=>m.type==='play'&&m.src&&m.src.type==='crapette');
      _tlog('  Cr='+crT.value+crT.suit+' | séq avec Cr:'+seqsWithCr.length+' | best a Cr:'+bestHasCr);
      if(!bestHasCr&&seqsWithCr.length>0){
        const bestCrSeq=seqsWithCr[0];
        _tlog('  Meilleure séq AVEC Cr: score='+bestCrSeq.score.toFixed(1)+' moves='+bestCrSeq.moves.map(m=>_fmtMove(m)).join('|'));
        _tlog('  Meilleure séq SANS Cr: score='+(best?best.score.toFixed(1):'?')+' moves='+(best?best.moves.map(m=>_fmtMove(m)).join('|'):'—'));
        _tlog('  Delta: '+(best&&bestCrSeq?(best.score-bestCrSeq.score).toFixed(1):'?'));
      }
    }
  }

  return best?best.moves:[];
}


// Supprime les coups dupliqués de la liste :
// - main sur pile non-vide : deux cartes de même valeur → résultats identiques
// - main sur pile vide : toutes les piles vides sont équivalentes → 'E'
// - défausse sur pile vide : toutes les piles vides équivalentes pour un même As → 'E' par uid
// - end : défausse vide vs non-vide
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

// Développe une séquence active en autant de séquences qu'il y a de coups légaux.
function _bfExpand(seq,aiIdx){
  const {g,ui}=seq.state;
  const pidx=g.cur;
  const p=g.players[pidx];
  let lm=_sLegal(g,ui,pidx,false);
  // Trace uniquement au premier niveau (seq.id==='0') pour ne pas surcharger
  if(window._traceMode&&seq.id==='0'){
    _tlog('  Legal[0]: '+lm.map(m=>_fmtMove(m)).join(' | '));
    const crMoves=lm.filter(m=>m.type==='play'&&m.src&&m.src.type==='crapette');
    _tlog('  Legal Cr: '+(crMoves.length?crMoves.map(m=>_fmtMove(m)).join(' '):'aucun'));
  }

  // Après une pose de crapette, la carte suivante est invisible → exclure les coups crapette
  if(seq.crapettePlayed)
    lm=lm.filter(m=>!(m.type==='play'&&m.src&&m.src.type==='crapette'));

  // Aucun coup légal
  if(!lm.length) return[{...seq,terminated:true,score:_eval(g,ui,aiIdx)+seq.extraBonus,handScore:_evalHandScore(g,ui,aiIdx)}];

  // Main vide sans coup 'end' ni coup jouable possible → le tour se terminera par redraw
  if(p.hand.length===0&&!lm.some(m=>m.type==='end')&&!lm.some(m=>m.type==='play'||m.type==='demand'))
    return[{...seq,terminated:true,score:_eval(g,ui,aiIdx)+seq.extraBonus,handScore:_evalHandScore(g,ui,aiIdx)}];

  const deduped=_bfDedup(_bfSortMoves(lm,g,ui,aiIdx),p,g);
  // Pré-calculer si un coup non-Roi depuis la main active aussi la crapette.
  // Si oui, le Roi ne devrait pas "gaspiller" son activation — préférer le non-Roi.
  const _baseCrT=g.players[aiIdx].crapette.length?g.players[aiIdx].crapette[g.players[aiIdx].crapette.length-1]:null;
  const _baseCrAlready=_baseCrT&&g.commons.some((_,ci)=>_sCanOnCommon(g,ui,_baseCrT,ci));
  let _nonKingActivates=false;
  if(_baseCrT&&!_baseCrAlready){
    for(const m of deduped){
      if(m.type==='play'&&m.src?.type==='hand'&&m.card.num!==13){
        const{g:tg,ui:tui}=_sApply(g,ui,pidx,m);
        if(tg.commons.some((_,ci)=>_sCanOnCommon(tg,tui,_baseCrT,ci))){_nonKingActivates=true;break;}
      }
    }
  }
  // Activation en 2 étapes : coup main → tNum=12 → vidage forcé → As dispo → crT jouable
  // Ex : D♦→P1 (tNum=12) → clear P1 → A♦(Df)→P1 → 2♠(Cr) jouable
  if(!_nonKingActivates&&_baseCrT&&!_baseCrAlready){
    for(const m of deduped){
      if(m.type==='play'&&m.src?.type==='hand'&&m.card.num!==13){
        const{g:tg,ui:tui}=_sApply(g,ui,pidx,m);
        const clearCi=tg.commons.findIndex((_,ci2)=>_sTopNum(tg,tui,ci2)===12);
        if(clearCi>=0){
          const{g:cg,ui:cui}=_sApply(tg,tui,pidx,{type:'clear',ci:clearCi});
          const srcs2=_sSources(cg,pidx,false);
          for(const{card:ac,src:asrc} of srcs2){
            if(ac.num===1){
              const{g:ag,ui:aui}=_sApply(cg,cui,pidx,{type:'play',card:ac,src:asrc,ci:clearCi});
              if(ag.commons.some((_,ci3)=>_sCanOnCommon(ag,aui,_baseCrT,ci3))){_nonKingActivates=true;break;}
            }
          }
        }
        if(_nonKingActivates) break;
      }
    }
  }
  // Facteur de discount : après crapette jouée OU jeu sur pile vide, les bonus suivants
  // sont réduits à 30% → seul un vidage total de main peut contrebalancer défausse vs main.
  const BF_DISCOUNT=0.3;
  const currentDiscount=seq.postKey?BF_DISCOUNT:1;

  return deduped.map((mv,i)=>{
    const isCrapettePlay=mv.type==='play'&&mv.src&&mv.src.type==='crapette';
    // Tirage pioche : carte inconnue → termine la séquence, score l'état AVANT tirage
    const isPiocheDiscovery=(mv.type==='init'&&!mv.card)||mv.type==='redraw';
    const {g:ng,ui:nui}=_sApply(g,ui,pidx,mv);
    // Bonus cumulés : crapette→pile (+50), tout coup activant crapette (+25), autre main→pile (+5)
    // Note : le bonus d'activation (+25) s'applique quelle que soit la source (main OU défausse),
    // car jouer 2 depuis la défausse sur un As vaut autant que jouer un Roi depuis la main.
    const crTb=!isCrapettePlay&&g.players[aiIdx].crapette.length
      ?g.players[aiIdx].crapette[g.players[aiIdx].crapette.length-1]:null;
    const crWasPlayable=crTb&&g.commons.some((_,ci2)=>_sCanOnCommon(g,ui,crTb,ci2));
    const crNowPlayable=crTb&&ng.commons.some((_,ci2)=>_sCanOnCommon(ng,nui,crTb,ci2));
    const isHandPlay=mv.type==='play'&&mv.src?.type==='hand';
    // Activation 2 étapes par ce coup : coup → tNum=12 → vidage forcé → As → crT jouable
    let activates2Step=false;
    if(crTb&&!crWasPlayable&&!crNowPlayable){
      const clearCi2=ng.commons.findIndex((_,ci2)=>_sTopNum(ng,nui,ci2)===12);
      if(clearCi2>=0){
        const{g:cg2,ui:cui2}=_sApply(ng,nui,pidx,{type:'clear',ci:clearCi2});
        const srcs3=_sSources(cg2,pidx,false);
        for(const{card:ac2,src:asrc2} of srcs3){
          if(ac2.num===1){
            const{g:ag2,ui:aui2}=_sApply(cg2,cui2,pidx,{type:'play',card:ac2,src:asrc2,ci:clearCi2});
            if(ag2.commons.some((_,ci3)=>_sCanOnCommon(ag2,aui2,crTb,ci3))){activates2Step=true;break;}
          }
        }
      }
    }
    const activatesCrapette=!crWasPlayable&&(crNowPlayable||activates2Step);
    const handPlayBonus=activatesCrapette?25:(isHandPlay?5:0);
    // Bonus de tier — hors discount, garantissent la hiérarchie quelle que soit la diff _eval
    // Tier 1 : pose de crapette → +500 (aucune diff _eval dans un tour ne peut combler ça)
    // Tier 2 : vidage de main → +150 (entre max diff _eval ~80 et tier1 500)
    // Main vidée par un coup sur pile (pas par défausse) → on va repiocher
    const handEmptied=mv.type!=='end'&&p.hand.length>0&&ng.players[pidx].hand.length===0;
    const tierBonus=isCrapettePlay?500:handEmptied?150:0;
    // Malus Roi de main :
    // • Pas d'activation crapette → −35 (ne jouer R que pour Crapette ou vider Main)
    // • Activation, mais un non-Roi active aussi → −15 (préférer garder le Roi en main)
    // • Activation et seul le Roi peut activer → 0 (le Roi est nécessaire ici)
    const kingFromHandPenalty=isHandPlay&&mv.card.num===13
      ?(!activatesCrapette?-35:(_nonKingActivates?-15:0))
      :0;
    // Malus défausse vs main : si même valeur disponible en main, pénaliser le coup défausse.
    // Non soumis au discount : garanti quelle que soit la position dans la séquence.
    const isEmptyPilePlay=mv.type==='play'&&mv.ci!==undefined&&!g.commons[mv.ci].length;
    const isDefPlay=mv.type==='play'&&mv.src?.type==='defausse';
    const defVsHandPenalty=isDefPlay&&p.hand.some(c=>c.num===mv.card.num)?-8:0;
    // Pénalité pré-crapette : -55 si la crapette est ACTUELLEMENT jouable mais qu'on joue autre chose.
    // Pénalité pré-activation : -10 si un coup de main (non-Roi) activerait la crapette mais qu'on joue
    // un coup non-activateur — empêche de délayer inutilement le chemin vers la crapette.
    const crCard=!seq.crapettePlayed&&!isCrapettePlay&&g.players[aiIdx].crapette.length
      ?g.players[aiIdx].crapette[g.players[aiIdx].crapette.length-1]:null;
    const crCurrentlyPlayable=crCard&&g.commons.some((_,ci2)=>_sCanOnCommon(g,ui,crCard,ci2));
    const preCrapettePenalty=crCurrentlyPlayable?-55
      :(!seq.crapettePlayed&&_nonKingActivates&&!activatesCrapette)?-10:0;
    // handPlayBonus hors discount : la valeur d'un coup de main ne dépend pas de sa position
    // dans la séquence (avant ou après crapette). Seul kingFromHandPenalty reste discounté.
    const discounted=handPlayBonus+kingFromHandPenalty*currentDiscount;
    const newBonus=seq.extraBonus+tierBonus+discounted+defVsHandPenalty+preCrapettePenalty;
    // Post-key : les coups suivants seront discountés
    const newPostKey=seq.postKey||isCrapettePlay||isEmptyPilePlay;
    const willTerminate=mv.type==='end'||isPiocheDiscovery;
    // init-pioche : la carte est connue dans la simulation → évaluer sur ng (pile remplie, pas de malus vide)
    // redraw : nouvelles cartes inconnues → évaluer sur g (avant le tirage)
    const evalG=mv.type==='redraw'?g:ng, evalUi=mv.type==='redraw'?ui:nui;
    const sc=_eval(evalG,evalUi,aiIdx);
    const hs=willTerminate?_evalHandScore(evalG,evalUi,aiIdx):0;
    // Flags d'affichage par coup
    const isClear=mv.type==='clear';
    // "découverte" = les coups suivants portent sur des cartes inconnues
    const isDiscovery=isCrapettePlay||isPiocheDiscovery||(mv.type==='redraw');
    const meta={activatesCrapette,handEmptied,isCrapettePlay,isClear};
    // triggerIdx : index du coup découverte → les coups APRÈS sont en italique gris
    const newTriggerIdx=seq.triggerIdx!==-1?seq.triggerIdx:(isDiscovery?seq.moves.length:-1);
    return{
      id:seq.id+'.'+i,
      state:{g:ng,ui:nui},
      moves:[...seq.moves,mv],
      moveMeta:[...(seq.moveMeta||[]),meta],
      terminated:willTerminate,
      // Score : sc+newBonus pour tous les nœuds (terminés et intermédiaires).
      // Les intermédiaires incluent extraBonus accumulé → guide le beam vers les bonnes branches
      // (crapette +500, main vide +150 restent visibles par le beam avant termination).
      // Les early returns utilisent seq.extraBonus (pas newBonus) → pas de double-comptage.
      score:sc+newBonus,
      handScore:willTerminate?hs:0,
      extraBonus:newBonus,
      crapettePlayed:seq.crapettePlayed||isCrapettePlay,
      postKey:newPostKey,
      triggerIdx:newTriggerIdx
    };
  });
}

// Trie les coups par catégorie de priorité :
// crapette → init/clear → piles_activant_crapette → autres_piles → demande → défausse
// "piles_activant_crapette" inclut main ET défausse : toute source qui rend la crapette jouable.
function _bfSortMoves(moves,g,ui,aiIdx){
  const crT=g.players[aiIdx].crapette.length?g.players[aiIdx].crapette[g.players[aiIdx].crapette.length-1]:null;
  const crAlreadyPlayable=crT&&g.commons.some((_,ci)=>_sCanOnCommon(g,ui,crT,ci));
  const crapette=moves.filter(m=>m.type==='play'&&m.src?.type==='crapette');
  const init    =moves.filter(m=>m.type==='init'||m.type==='clear');
  const nonCrPiles=moves.filter(m=>m.type==='play'&&m.src?.type!=='crapette');
  let pilesActivating=[],pilesOther=nonCrPiles;
  if(crT&&!crAlreadyPlayable&&nonCrPiles.length){
    pilesActivating=nonCrPiles.filter(m=>{
      const {g:ng,ui:nui}=_sApply(g,ui,g.cur,m);
      return ng.commons.some((_,ci)=>_sCanOnCommon(ng,nui,crT,ci));
    });
    pilesOther=nonCrPiles.filter(m=>!pilesActivating.includes(m));
  }
  const demand=moves.filter(m=>m.type==='demand');
  const end   =moves.filter(m=>m.type==='end');
  return[...crapette,...init,...pilesActivating,...pilesOther,...demand,...end];
}

// Appliquer un move à G/UI globaux
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
      // Carte déjà déterminée (as ou carte piochée en simulation)
      if(mv.src) _sRemove(g,g.cur,mv.card,mv.src);
      g.commons[mv.ci].push(mv.card);
      if(mv.card.num===13) _sResolveKing(g,ui,mv.ci);
      else{ui.pileKingVal[mv.ci]=null;ui.pileKingPending[mv.ci]=false;}
    } else {
      // Retourner depuis la pioche
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
  // Crapette toujours prioritaire
  const ct=peek(p.crapette);if(ct&&ct.num===1)return{card:ct,src:{type:'crapette'}};
  // Trouver As de main et de défausse
  const handAce=p.hand.find(c=>c.num===1);
  let defAce=null,defAceIdx=-1;
  for(let i=0;i<4;i++){const t=peek(p.defausse[i]);if(t&&t.num===1){defAce=t;defAceIdx=i;break;}}
  // Si les deux disponibles : main prioritaire SAUF si la carte cachée sous l'As de défausse
  // est jouable sur une pile commune (elle resterait inaccessible si on utilise la défausse en dernier)
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

function _aiDiscard(){
  const p=G.players[G.cur];

  // Si main vide ET pile vide ET pioche dispo → initialiser la pile AVANT de défausser
  // (permet de piocher une carte potentiellement utile)
  if(p.hand.length===0){
    for(let ci=0;ci<4;ci++){
      if(G.commons[ci].length===0&&(G.pioche.length>0||G.futurePioche.length>0)){
        const ace=_findAce();
        if(ace){
          _q({type:'init',ci,card:ace.card,src:ace.src});
          _applyMoveToState(G,UI,{type:'init',ci,card:ace.card,src:ace.src});
        } else {
          if(G.pioche.length===0&&G.futurePioche.length>0){G.pioche=shuffle([...G.futurePioche]);G.futurePioche=[];}
          if(G.pioche.length>0){
            const drawn_d=G.pioche.pop();
            G.commons[ci].push(drawn_d);
            if(drawn_d.num===13) resolveKingPushed(ci);
            else{UI.pileKingVal[ci]=null;UI.pileKingPending[ci]=false;}
            _q({type:'init',ci,card:drawn_d,src:null,fromPioche:true});
          }
        }
        break; // une seule pile à la fois
      }
    }
  }

  const crTop=peek(p.crapette);const crNum=crTop?crTop.num:7;const opp=1-G.cur;
  const oppP=G.players[opp];

  // Jouer TOUTES les cartes jouables depuis la main avant de défausser
  // Après chaque coup, re-vérifier les piles à dame (écarter) et les piles vides (init)
  let moved=true;
  while(moved&&G.phase!=='game-over'){
    moved=false;
    // Vérifier piles à dame → écarter
    for(let ci=0;ci<4;ci++){
      if(topNum(ci)===12){
        _q({type:'clear',ci});_applyMoveToState(G,UI,{type:'clear',ci});
        moved=true;break;
      }
    }
    if(moved) continue;
    // Piles vides avec as visible → imposé par règle
    for(let ci=0;ci<4;ci++){
      if(G.commons[ci].length===0){
        const ace=_findAce();
        if(ace){
          const mva={type:'init',ci,card:ace.card,src:ace.src};
          _q(mva);_applyMoveToState(G,UI,mva);
          moved=true;break;
        }
        // Init depuis pioche = choix stratégique, pas imposé → géré séparément
      }
    }
    if(moved) continue;
    // Crapette : peut devenir jouable après un init/clear (ex: Roi posé → pile king-pending)
    {
      const crT=peek(G.players[G.cur].crapette);
      if(crT){
        for(let ci=0;ci<4;ci++){
          if(canOnCommon(crT,ci)){
            _q({type:'play',card:crT,src:{type:'crapette'},ci});
            _applyMoveToState(G,UI,{type:'play',card:crT,src:{type:'crapette'},ci});
            moved=true;break;
          }
        }
      }
    }
    if(moved) continue;
    // Jouer cartes jouables depuis la main — hors Rois (le BF les aurait inclus si bénéfiques)
    {
      const allMoves=[];
      for(const card of p.hand){
        if(card.num===13) continue;
        for(let ci=0;ci<4;ci++)
          if(canOnCommon(card,ci))
            allMoves.push({type:'play',card,src:{type:'hand'},ci});
      }
      if(allMoves.length){
        allMoves.sort((a,b)=>a.card.uid-b.card.uid||a.ci-b.ci);
        const best=allMoves[0];
        _q(best);_applyMoveToState(G,UI,best);
        moved=true;
      }
    }
  }

  // Si pile vide ET aucune carte de main jouable → init depuis pioche avant de défausser
  const anyPlayable=p.hand.some(hc=>hc.num!==13&&_handCardIsPlayable(hc));
  if(!anyPlayable){
    for(let ci=0;ci<4;ci++){
      if(G.commons[ci].length===0&&(G.pioche.length>0||G.futurePioche.length>0)){
        // Boucle : si la carte retournée est une D, on recycle et on en retourne une autre
        while(G.commons[ci].length===0&&(G.pioche.length>0||G.futurePioche.length>0)){
          if(G.pioche.length===0){G.pioche=shuffle([...G.futurePioche]);G.futurePioche=[];}
          if(G.pioche.length===0) break;
          const drn=G.pioche.pop();
          const mva={type:'init',ci,card:drn,src:null,fromPioche:true};
          _q(mva);_applyMoveToState(G,UI,mva);
          if(topNum(ci)===12){
            _q({type:'clear',ci});_applyMoveToState(G,UI,{type:'clear',ci});
            // pile vide à nouveau → la boucle while réinitiera
          }
        }
        // Après init depuis pioche (ex: Roi → king-pending), la crapette peut être jouable
        {
          const crT2=peek(G.players[G.cur].crapette);
          if(crT2){
            for(let ci2=0;ci2<4;ci2++){
              if(canOnCommon(crT2,ci2)){
                _q({type:'play',card:crT2,src:{type:'crapette'},ci:ci2});
                _applyMoveToState(G,UI,{type:'play',card:crT2,src:{type:'crapette'},ci:ci2});
                break;
              }
            }
          }
        }
        break; // une seule pile à la fois
      }
    }
  }

  // Les candidats à la défausse = cartes restantes non jouables (hors rois)
  let cands=p.hand.filter(c=>c.num!==13&&!_handCardIsPlayable(c));
  if(!cands.length) cands=p.hand.filter(c=>c.num!==13);
  if(!cands.length) cands=[...p.hand];
  let toDiscard=null,src={type:'hand'};
  if(cands.length){
    const aceDanger=_aceDangerousToDiscard(opp);
    cands.sort((a,b)=>{
      const sa=_discardPriority(a,crNum,opp,aceDanger,p);
      const sb=_discardPriority(b,crNum,opp,aceDanger,p);
      return sb-sa; // score élevé = défausser en premier
    });
    toDiscard=cands[0];
    if(window._traceMode){
      _tlog('  Discard cands: '+cands.map(c=>c.value+c.suit+'('+_discardPriority(c,crNum,opp,aceDanger,p)+')').join(' '));
      _tlog('  Discard chosen: '+toDiscard.value+toDiscard.suit);
    }
  }
  // JAMAIS défausser depuis la crapette
  if(!toDiscard){
    // Main vide ou rien de défaussable → enregistrer un move 'redraw'
    // Le redraw sera exécuté pendant le replay (pas pendant la simulation)
    _q({type:'redraw'});
    return;
  }
  const di=_aiBestDef(toDiscard);
  _q({type:'discard',card:toDiscard,src,di});
}

// Score de priorité de défausse : score ÉLEVÉ = à défausser en premier
// Vérifier si une carte de la main peut être jouée sur une pile commune
function _handCardIsPlayable(card){
  for(let ci=0;ci<4;ci++) if(canOnCommon(card,ci)) return true;
  return false;
}

// Retourne le Set des valeurs utiles dans la chaîne vers la crapette d'un joueur
// (depuis la pile la plus proche, limitée à min(5, distance) pas)
// Utilise l'état global G/UI (appelé depuis _discardPriority uniquement)
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

function _discardPriority(card, crNum, opp, aceDanger, p){
  let score=0;

  // 1. Doublon de la crapette → défausser en priorité
  if(crNum>0 && card.num===crNum) return 100;

  // 2. Distance circulaire vers la crapette
  // La carte n est précieuse si elle est proche de crNum-1 dans le cycle 1..12
  // dist = (crNum-1 - n + 12) mod 12
  // dist=0 → n est juste avant la crapette (ex: n=2, crNum=3) → très précieux
  // dist=11 → n est juste après la crapette → peu utile
  if(crNum>0 && card.num!==crNum){
    const target=crNum-1; // valeur juste avant la crapette
    const dist=(target-card.num+12)%12;
    const count=p.hand.filter(hc=>hc.num===card.num).length;
    if(count===1){
      score-=Math.max(0,(11-dist)*4); // dist=0→-44, dist=2→-36, dist=10→-4
    } else {
      score+=Math.max(0,(11-dist)*2); // doublon → défausser l'un
    }
  }

  // 4. As dangereux
  if(card.num===1 && aceDanger) score-=30;

  // 5. Demandable par l'adversaire → pénaliser
  if(_wouldBedemandable(card)) score-=20;

  // 6. Jouable sur une pile → malus fort (jouer > défausser)
  for(let ci=0;ci<4;ci++){
    if(canOnCommon(card,ci)){
      const oppCrTop=peek(G.players[opp].crapette);
      const danger=(card.num===1&&oppCrTop&&oppCrTop.num===2&&!visibleAce(opp));
      if(!danger) score-=30;
      break;
    }
  }

  // 7. Doublon en main → bonus à défausser
  const cnt=p.hand.filter(hc=>hc.num===card.num).length;
  if(cnt>=2) score+=15;

  // 8. Carte dans la chaîne vers la crapette IA
  const myChain=_chainValsForPlayer(G.cur);
  if(myChain.has(card.num)){
    if(cnt===1) score-=20; // unique en main, précieuse pour la chaîne → ne pas défausser
    else score+=10;        // doublon dans la chaîne → l'un peut partir
  }

  // 9. Carte dans la chaîne adverse et non visible chez l'adversaire → dangereux de la défausser
  // (elle deviendra visible en défausse, demandable ou exploitable par l'adversaire)
  const oppChain=_chainValsForPlayer(opp);
  if(oppChain.has(card.num)){
    const oppP=G.players[opp];
    const visibleForOpp=
      (peek(oppP.crapette)&&peek(oppP.crapette).num===card.num)||
      oppP.defausse.some(d=>{const t=peek(d);return t&&t.num===card.num;});
    if(!visibleForOpp) score-=15; // on révèle une carte utile à l'adversaire
  }

  // 10. Défausser cette carte laisse uniquement des rois → rapproche du redraw
  const residual=p.hand.filter(hc=>hc.uid!==card.uid);
  const onlyKingsLeft=residual.length>0&&residual.every(c=>c.num===13);
  if(onlyKingsLeft&&(G.pioche.length>0||G.futurePioche.length>0)) score+=20;

  return score;
}

// Défausser un as est dangereux si :
// - l'adversaire a un 2 en crapette (notre as l'aiderait)
// - ET l'adversaire n'a pas d'as visible (sinon la pile serait déjà initialisée)
// - ET on n'a pas de 2 pour l'empêcher d'exploiter notre as
function _aceDangerousToDiscard(oppIdx){
  const opp=G.players[oppIdx];
  const oppCrTop=peek(opp.crapette);
  if(!oppCrTop||oppCrTop.num!==2) return false; // adversaire n'a pas de 2 en crapette
  // L'adversaire a-t-il un as visible ? Si oui, pas de danger supplémentaire
  const oppHasVisibleAce=visibleAce(oppIdx);
  if(oppHasVisibleAce) return false;
  // On n'a pas de 2 pour bloquer → l'as débloquera l'adversaire
  const myP=G.players[G.cur];
  const iHave2=myP.hand.some(c=>c.num===2)||
               (peek(myP.crapette)&&peek(myP.crapette).num===2)||
               myP.defausse.some(d=>{const t=peek(d);return t&&t.num===2;});
  // Si on a un 2 visible, on pourrait jouer dessus après → moins dangereux
  if(iHave2) return false;
  return true; // dangereux : ne pas défausser l'as
}

function _wouldBedemandable(card){
  for(let ci=0;ci<4;ci++) if(canOnCommon(card,ci))return true;return false;
}

function _aiBestDef(card){
  const p=G.players[G.cur];
  const crTop=peek(p.crapette);
  const crNum=crTop?crTop.num:7;

  // Ensemble des valeurs sur le chemin de la crapette (crNum..12)
  const chainNums=new Set();
  for(let v=crNum;v<=12;v++) chainNums.add(v);

  // Valeur accessible ailleurs (main + crapette + autres défausses) hors colonne excl
  const accessibleElsewhere=(num,excl)=>{
    if(p.hand.some(c=>c.num===num)) return true;
    if(crTop&&crTop.num===num) return true;
    return p.defausse.some((d,j)=>j!==excl&&peek(d)&&peek(d).num===num);
  };

  // Y a-t-il une colonne vide disponible hors colonne excl ?
  const emptyElsewhere=(excl)=>p.defausse.some((d,j)=>j!==excl&&d.length===0);

  let best=0,bs=-9999;
  for(let i=0;i<4;i++){
    if(!canOnDefausse(card,p.defausse[i])) continue;
    const t=peek(p.defausse[i]);
    let sc=0;

    if(!t){
      // Colonne vide : base neutre — meilleure que couvrir une carte du chemin
      sc=0;
    } else {
      const n=t.num; // carte qui sera couverte
      const m=card.num; // carte qui couvre

      // As sur As → priorité absolue
      if(m===1&&n===1){sc=100;if(sc>bs){bs=sc;best=i;}continue;}

      // As sur non-As : quasi-interdit (canOnDefausse bloque déjà, garde-fou)
      if(m===1&&n!==1){sc=-50;}
      else {
        // ── Règle de succession ──
        if(m===n-1){
          // Suite naturelle : n-1 sur n → idéal (n reste en dessous, m s'ajoute de façon ordonnée)
          sc+=15;
        } else if(m<n){
          sc+=2; // plus petit mais pas suite → acceptable
        } else {
          sc-=10; // plus grand sur plus petit → mauvais
        }

        // ── Ne pas masquer n si colonne vide dispo ET m≠n-1 ──
        // Si n est sur le chemin et non accessible ailleurs → gros malus
        if(emptyElsewhere(i)&&m!==n-1){
          if(chainNums.has(n)&&!accessibleElsewhere(n,i)) sc-=20;
          else sc-=8; // pas sur le chemin mais colonne vide dispo : préférer le vide quand même
        }

        // ── Perte d'accès à n ──
        if(chainNums.has(n)&&!accessibleElsewhere(n,i)) sc-=12;

        // ── Cartes précieuses déjà enfouies dans la pile (jusqu'à 3 niveaux) ──
        const pile=p.defausse[i];
        for(let d=1;d<=Math.min(3,pile.length-1);d++){
          const buried=pile[pile.length-1-d];
          if(!buried) break;
          if(chainNums.has(buried.num)&&!accessibleElsewhere(buried.num,i)){
            sc-=(4-d)*2; // proche du sommet = moins grave car accessible ; profond = grave
          }
        }

        // Bonus : couvrir une carte demandable par l'adversaire (protection)
        if(_wouldBedemandable(t)) sc+=5;

        // Préférer les piles courtes (plus de cartes accessibles)
        sc+=Math.max(0,3-p.defausse[i].length);
      }
    }

    if(sc>bs){bs=sc;best=i;}
  }
  return best;
}

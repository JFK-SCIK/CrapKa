// ══════════════════════════════════════════════
// IA — FILE DE COUPS ASYNCHRONE
// ══════════════════════════════════════════════
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

function aiPlayTurn(){
  if(_stepResolve!==null) return; // pas-à-pas en cours, ignorer
  saveUndo(); // sauvegarder avant chaque tour IA
  _replayingAI=false; // reset au cas où
  if(!G||G.phase==='game-over'||G.cur!==UI.aiIdx) return;
  _aiMoves=[];
  clearTimeout(_aiTimer);
  // Sauvegarder état courant, calculer la séquence, restaurer
  const savedState=_saveGameState();
  _buildAiSequence();
  const moves=[..._aiMoves];
  _restoreGameState(savedState);
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
    _stepResolve=()=>_replayMoves(moves);
    _updateStepUI();
    setStatus('[PàP] '+(window._dbgBFSequences?window._dbgBFSequences.length:0)+' séquence(s) — ▶ pour jouer');
    return;
  }
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
  if(!moves.length||G.phase==='game-over'){
    _replayingAI=false;
    if(G.phase!=='game-over'&&G.cur===UI.aiIdx){
      // Défausse : calculée sur l'état réel courant
      window._simulating=true;
      _aiMoves=[];
      _aiDiscard();
      window._simulating=false;
      const discardMoves=[..._aiMoves];
      _aiMoves=[];
      if(discardMoves.length){
        // PàP : pause avant la défausse, séquences BF encore visibles
        if(_stepMode&&_debugMode){
          _stepResolve=()=>{hideBFSeq();_replayingAI=true;_replayMoves(discardMoves);};
          setStatus('[PàP] Défausse — ▶ pour jouer');
          _updateStepUI();
          return;
        }
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
    ||(mv.type==='init'&&!mv.card)
    ||(mv.type==='redraw');
  _applyMoveWithAnim(mv,()=>{
    const delay=flyDur>0?flyDur+150:100;
    // Toujours mettre à jour le panel en mode debug
    if(_debugMode) renderBFSeq();
    if(_stepMode&&_debugMode){
      // Pause après le coup : attendre ▶
      if(_discovery){
        _stepResolve=()=>{hideBFSeq();aiPlayTurn();};
        setStatus('[PàP] Découverte — ▶ pour recalculer');
      } else {
        _stepResolve=()=>_replayMoves(moves);
        setStatus('[PàP] Coup joué — ▶ pour continuer');
      }
      _updateStepUI();
    } else {
      if(_discovery){
        hideBFSeq();
        _aiTimer=setTimeout(aiPlayTurn,delay);
      } else {
        _aiTimer=setTimeout(()=>_replayMoves(moves),delay);
      }
    }
  });
}

function _applyMoveWithAnim(mv,cb){
  if(mv.type==='play'){
    playOnCommon(mv.card,mv.src,mv.ci,()=>cb());
  } else if(mv.type==='redraw'){
    // Piocher une nouvelle main et relancer le tour IA
    drawToFive(()=>{
      render();
      // Relancer l'IA pour jouer avec la nouvelle main
      if(G.phase!=='game-over'&&UI.vsAI&&G.cur===UI.aiIdx){
        setTimeout(aiPlayTurn,300);
      }
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
      // Carte déterminée pendant simulation → injecter directement sans repiocher
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
  let changed=true,iters=0;
  while(changed&&iters<50&&G.phase!=='game-over'){
    changed=false;iters++;

    // 1. Vider piles à dame
    for(let ci=0;ci<4;ci++){
      if(topNum(ci)===12){
        _q({type:'clear',ci});_applyMoveToState(G,UI,{type:'clear',ci});
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

  // Piles vides : as d'abord (visible), sinon pioche (un seul choix)
  for(let ci=0;ci<4;ci++){
    if(!g.commons[ci].length){
      const srcs=_sSources(g,pidx,visibleOnly);
      const ace=srcs.find(({card})=>card.num===1);
      if(ace) moves.push({type:'play',card:ace.card,src:ace.src,ci});
      else if(g.pioche.length>0||g.futurePioche.length>0) moves.push({type:'init',ci});
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

  // Demandes : cartes de défausse adverse jouables au début du tour IA
  if(!visibleOnly){
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
function _eval(g,ui,aiIdx){
  if(g.phase==='game-over') return g.winner===aiIdx?10000:-10000;
  const ai=g.players[aiIdx],opp=g.players[1-aiIdx];
  let sc=0;
  sc+=(21-ai.crapette.length)*50-(21-opp.crapette.length)*50;
  const crT=ai.crapette.length?ai.crapette[ai.crapette.length-1]:null;
  if(crT) for(let ci=0;ci<4;ci++) if(_sCanOnCommon(g,ui,crT,ci)){sc+=30;break;}
  for(const c of ai.hand) for(let ci=0;ci<4;ci++) if(_sCanOnCommon(g,ui,c,ci)){sc+=4;break;}
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
  if(ai.hand.length===0&&(g.pioche.length>0||g.futurePioche.length>0)) sc+=10;

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

  // 2+3. Taille de la main (plus petite = mieux) + rois si main non vidée et crapette injouable
  const crPlayable=crT&&g.commons.some((_,ci)=>_sCanOnCommon(g,ui,crT,ci));
  const handSize=ai.hand.length;
  sc+=Math.max(0,5-handSize)*4; // 0 cartes→+20, 5 cartes→0
  if(!crPlayable&&handSize>0){
    // Situation bloquée : garder des rois en main > garder d'autres cartes (polyvalents)
    sc+=ai.hand.filter(c=>c.num===13).length*10;
  }

  // 4. Main résiduelle : pas de doublon de la crapette (prioritaire) + pas de doublons de valeur
  if(crT&&handSize>0){
    const crNum=crT.num;
    const handNums=ai.hand.map(c=>c.num);
    if(!handNums.includes(crNum)) sc+=8; // pas de carte de même valeur que la crapette en main
    if(new Set(handNums).size===handNums.length) sc+=5; // pas de doublons de valeur
  }

  // 5. Main résiduelle comporte des cartes précédant la crapette (ex. V ou D précède As)
  if(crT&&handSize>0){
    const crNum=crT.num;
    const prev1=crNum===1?12:crNum-1; // carte juste avant crT (cyclique)
    const prev2=crNum<=2?crNum+10:crNum-2; // deux avant
    const handNums=ai.hand.map(c=>c.num);
    if(handNums.includes(prev1)) sc+=8;
    if(handNums.includes(prev2)) sc+=4;
  }

  // Malus fort : piles vides non initialisées quand la pioche est disponible
  // (règle : on ne défausse jamais en laissant une pile non retournée)
  if(g.pioche.length>0||g.futurePioche.length>0){
    const emptyPiles=g.commons.filter(p=>!p.length).length;
    if(emptyPiles>0) sc-=emptyPiles*30;
  }

  // Bonus : couverture de la chaîne principale vers la crapette par la main résiduelle
  // Pour la pile la plus proche, chaque valeur de la chaîne présente en main = +6
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
// Limite sur les branches actives (non terminées) plutôt que sur le total :
// les séquences terminées (end) n'étouffent plus l'exploration en profondeur.
const BF_MAX_ACTIVE=600;

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

  let sequences=[{
    id:'0',
    state:{g:g0,ui:ui0},
    moves:[],
    terminated:false,
    score:_eval(g0,ui0,aiIdx),
    extraBonus:0,
    crapettePlayed:false   // true après la première pose de crapette (suivante invisible)
  }];

  let nonTermCount=1; // nombre de séquences actives (non terminées)
  while(nonTermCount>0&&nonTermCount<BF_MAX_ACTIVE){
    const idx=sequences.findIndex(s=>!s.terminated);
    if(idx===-1) break;
    const active=sequences[idx];
    const expanded=_bfExpand(active,aiIdx);
    sequences.splice(idx,1); nonTermCount--;  // retirer la séquence active
    for(const s of expanded){
      sequences.push(s);
      if(!s.terminated) nonTermCount++;
    }
  }

  // Meilleure séquence terminée (tie-break : plus courte si scores égaux)
  let best=null;
  for(const seq of sequences){
    if(!seq.terminated) continue;
    if(best===null||seq.score>best.score||(seq.score===best.score&&seq.moves.length<best.moves.length))
      best=seq;
  }

  // Stocker les séquences pour le panel debug pas-à-pas
  if(_debugMode){
    const terminated=sequences.filter(s=>s.terminated).sort((a,b)=>b.score-a.score||a.moves.length-b.moves.length);
    const bestId=best?best.id:null;
    window._dbgBFSequences=terminated.map(s=>({
      score: s.score,
      moves: s.moves,
      isBest: s.id===bestId
    }));
  }

  return best?best.moves:[];
}


// Supprime les coups dupliqués de la liste :
// - main : deux cartes de même valeur sur la même pile → résultats identiques (règles num-only)
// - défausse : poser sur deux piles vides différentes → résultat identique
function _bfDedup(moves,p){
  const seen=new Set();
  const out=[];
  for(const mv of moves){
    let key;
    if(mv.type==='play'&&mv.src&&mv.src.type==='hand'){
      key='ph:'+mv.card.num+':'+mv.ci;
    } else if(mv.type==='end'){
      const empty=p.defausse[mv.di].length===0;
      key='end:'+mv.card.num+':'+(empty?'E':mv.di);
    } else {
      out.push(mv); continue;
    }
    if(!seen.has(key)){seen.add(key);out.push(mv);}
  }
  return out;
}

// Développe une séquence active en autant de séquences qu'il y a de coups légaux.
function _bfExpand(seq,aiIdx){
  const {g,ui}=seq.state;
  const pidx=g.cur;
  const p=g.players[pidx];
  let lm=_sLegal(g,ui,pidx,false);

  // Après une pose de crapette, la carte suivante est invisible → exclure les coups crapette
  if(seq.crapettePlayed)
    lm=lm.filter(m=>!(m.type==='play'&&m.src&&m.src.type==='crapette'));

  // Aucun coup légal
  if(!lm.length) return[{...seq,terminated:true,score:_eval(g,ui,aiIdx)}];

  // Main vide sans coup 'end' possible → le tour se terminera par redraw
  if(p.hand.length===0&&!lm.some(m=>m.type==='end'))
    return[{...seq,terminated:true,score:_eval(g,ui,aiIdx)}];

  const deduped=_bfDedup(_bfSortMoves(lm,g,ui,aiIdx),p);
  return deduped.map((mv,i)=>{
    const isCrapettePlay=mv.type==='play'&&mv.src&&mv.src.type==='crapette';
    // Tirage pioche : carte inconnue → termine la séquence, score l'état AVANT tirage
    const isPiocheDiscovery=(mv.type==='init'&&!mv.card)||mv.type==='redraw';
    const {g:ng,ui:nui}=_sApply(g,ui,pidx,mv);
    // Bonus cumulés : crapette→pile (+50), main→pile activant crapette (+25), autre main→pile (+5)
    const crTb=!isCrapettePlay&&g.players[aiIdx].crapette.length
      ?g.players[aiIdx].crapette[g.players[aiIdx].crapette.length-1]:null;
    const crWasPlayable=crTb&&g.commons.some((_,ci2)=>_sCanOnCommon(g,ui,crTb,ci2));
    const crNowPlayable=crTb&&ng.commons.some((_,ci2)=>_sCanOnCommon(ng,nui,crTb,ci2));
    const handPlayBonus=(mv.type==='play'&&mv.src&&mv.src.type==='hand')
      ?((!crWasPlayable&&crNowPlayable)?25:5):0;
    const crapetteBonus=isCrapettePlay?50:0;
    const newBonus=seq.extraBonus+handPlayBonus+crapetteBonus;
    const willTerminate=mv.type==='end'||isPiocheDiscovery;
    const sc=isPiocheDiscovery?_eval(g,ui,aiIdx):_eval(ng,nui,aiIdx);
    return{
      id:seq.id+'.'+i,
      state:{g:ng,ui:nui},
      moves:[...seq.moves,mv],
      terminated:willTerminate,
      score:willTerminate?sc+newBonus:sc,
      extraBonus:newBonus,
      crapettePlayed:seq.crapettePlayed||isCrapettePlay
    };
  });
}

// Trie les coups par catégorie de priorité :
// crapette → init/clear → piles_activant_crapette → autres_piles → demande → défausse
// Les coups qui activent directement la crapette sont triés avant les autres coups de pile.
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
  const ct=peek(p.crapette);if(ct&&ct.num===1)return{card:ct,src:{type:'crapette'}};
  for(let i=0;i<4;i++){const t=peek(p.defausse[i]);if(t&&t.num===1)return{card:t,src:{type:'defausse',index:i}};}
  const h=p.hand.find(c=>c.num===1);if(h)return{card:h,src:{type:'hand'}};
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
    // Jouer cartes jouables depuis la main — meilleure pile (non-rois d'abord)
    {
      const allMoves=[];
      for(const card of p.hand){
        for(let ci=0;ci<4;ci++)
          if(canOnCommon(card,ci))
            allMoves.push({type:'play',card,src:{type:'hand'},ci});
      }
      if(allMoves.length){
        // Non-rois d'abord, puis rois ; stable par (card.uid, ci)
        allMoves.sort((a,b)=>{
          if(a.card.num===13&&b.card.num!==13) return 1;
          if(a.card.num!==13&&b.card.num===13) return -1;
          return a.card.uid-b.card.uid||a.ci-b.ci;
        });
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
        if(G.pioche.length===0){G.pioche=shuffle([...G.futurePioche]);G.futurePioche=[];}
        if(G.pioche.length>0){
          const drn=G.pioche.pop();
          const mva={type:'init',ci,card:drn,src:null,fromPioche:true};
          _q(mva);_applyMoveToState(G,UI,mva);
          if(topNum(ci)===12){
            _q({type:'clear',ci});_applyMoveToState(G,UI,{type:'clear',ci});
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
  const opp=1-G.cur;

  // Valeurs actuellement visibles dans toutes les sources (pour éviter doublons)
  const visibleNums=new Set();
  // Défausses adversaire
  G.players[opp].defausse.forEach(d=>{const t=peek(d);if(t)visibleNums.add(t.num);});
  // Crapette IA
  if(crTop) visibleNums.add(crTop.num);
  // Défausses IA (valeurs actuellement visibles AVANT cette défausse)
  p.defausse.forEach(d=>{const t=peek(d);if(t)visibleNums.add(t.num);});

  let best=0,bs=-999;
  for(let i=0;i<4;i++){
    const t=peek(p.defausse[i]);let sc=0;

    // As sur as → priorité absolue
    if(card.num===1&&t&&t.num===1){sc=100;}
    // Pile vide → légèrement préférable à couvrir une carte utile
    else if(!t){sc=5;}
    // Ne pas couvrir un as
    else if(t.num===1&&card.num!==1){sc=-10;}
    else {
      // Base : préférer mettre une petite valeur sur une grande
      sc=(card.num<t.num)?2:1;

      // Bonus : la valeur du sommet actuel (t) est un doublon visible ailleurs
      // → la couvrir ne fait pas perdre d'information
      const tNumIsElsewhere=p.defausse.some((d,j)=>{
        if(j===i) return false;
        const tj=peek(d);return tj&&tj.num===t.num;
      })||crNum===t.num;
      if(tNumIsElsewhere) sc+=5; // doublon visible → couvrir sans perte

      // Malus : la valeur du sommet actuel (t) est unique → la couvrir fait perdre de l'info
      if(!tNumIsElsewhere) sc-=3;

      // Malus : créer une suite croissante (card vient juste après t) → bloque l'accès à t
      if(card.num===t.num+1) sc-=4;

      // Malus : ne pas couvrir une carte proche de la crapette (utile à garder visible)
      const target=crNum-1;
      const distT=(target-t.num+12)%12;
      if(distT<=3) sc-=4; // valeur précieuse → ne pas couvrir

      // Bonus : couvrir une carte demandable par l'adversaire
      if(_wouldBedemandable(t)) sc+=4;

      // Malus : ne pas couvrir avec une valeur déjà visible en défausse soi-même
      const cardAlreadyVisible=p.defausse.some((d,j)=>{
        if(j===i) return false;
        const tj=peek(d);return tj&&tj.num===card.num;
      });
      if(cardAlreadyVisible) sc-=2;

      // Bonus : préférer les piles courtes (moins de cartes = plus d'accès)
      const pileLen=p.defausse[i].length;
      sc+=Math.max(0,4-pileLen); // pile vide→+4, 1 carte→+3, 2→+2, 3→+1, ≥4→0

      // Malus : si une des 2-3 premières cartes sous le sommet est précieuse
      // et non disponible ailleurs → préserver l'accès
      const pile=p.defausse[i];
      const depth=Math.min(3,pile.length-1); // regarder jusqu'à 3 cartes sous le sommet
      for(let d=1;d<=depth;d++){
        const buried=pile[pile.length-1-d];
        if(!buried) break;
        const bTarget=(crNum-1);
        const bDist=(bTarget-buried.num+12)%12;
        if(bDist<=4){
          // Carte précieuse enfouie - est-elle disponible ailleurs ?
          const availableElsewhere=
            p.hand.some(h=>h.num===buried.num)||
            p.defausse.some((d2,j)=>j!==i&&d2.some(c2=>c2.num===buried.num))||
            (crTop&&crTop.num===buried.num);
          if(!availableElsewhere){
            sc-=(5-d)*3; // plus elle est proche du sommet, plus le malus est fort
          }
        }
      }
    }

    if(sc>bs){bs=sc;best=i;}
  }
  return best;
}

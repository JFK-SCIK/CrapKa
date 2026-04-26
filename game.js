// ══════════════════════════════════════════════
// CONSTANTES
// ══════════════════════════════════════════════
const _VER_GAME='1.2.4';
function getPlayerName(){
  let n=localStorage.getItem('crapka_name');
  if(!n){
    n='Joueur-'+Math.floor(Math.random()*0xFFFF).toString(16).toUpperCase().padStart(4,'0');
    localStorage.setItem('crapka_name',n);
  }
  return n;
}

const SUITS=['♠','♥','♦','♣'];
const SCOL={'♠':'black','♥':'red','♦':'red','♣':'black'};
const VALS=['A','2','3','4','5','6','7','8','9','10','V','D','R'];
const VNUM={A:1,2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:10,V:11,D:12,R:13};
const VNAME={1:'A',2:'2',3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',11:'V',12:'D',13:'R'};
const P_COLORS=['p0','p1']; // couleurs log par joueur

// Vitesses : [off, très lent, lent, normal, rapide]
const SPEEDS=[0,4000,2000,1200,600,250];
let flyDur=SPEEDS[3];
function setSpeed(v){
  flyDur=SPEEDS[parseInt(v)];
  document.documentElement.style.setProperty('--fly-dur',flyDur+'ms');
}

let _uid=0;
function makeCard(v,s){return Object.freeze({uid:++_uid,value:v,suit:s,num:VNUM[v],color:SCOL[s]});}
function makeDeck(){const d=[];for(const s of SUITS)for(const v of VALS)d.push(makeCard(v,s));return d;}
function shuffle(a){const b=[...a];for(let i=b.length-1;i>0;i--){const j=0|Math.random()*(i+1);[b[i],b[j]]=[b[j],b[i]];}return b;}
function peek(pile){return pile.length?pile[pile.length-1]:null;}
function numToVal(n){return VNAME[n]||String(n);}

// ══════════════════════════════════════════════
// ÉTAT
// ══════════════════════════════════════════════
let G=null;
let UI={
  sel:null,vtgts:[],
  vsAI:false,aiIdx:1,
  pileKingVal:[null,null,null,null],
  pileKingPending:[false,false,false,false],
  _lastKingInfo:null, // info roi pour enrichir le log du coup
};

// ══════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════
function newGame(vsAI){
  _uid=0;
  UI={sel:null,vtgts:[],vsAI,aiIdx:1,
      pileKingVal:[null,null,null,null],
      pileKingPending:[false,false,false,false],
      _lastKingInfo:null,
      netMode:false, pidx:null};

  // Chaque joueur a son propre jeu de 52 cartes distinct et mélangé indépendamment
  const deck0=shuffle(makeDeck()); // jeu J1
  const deck1=shuffle(makeDeck()); // jeu J2

  // J1 : crapette=21, P1+P2=1 carte chacune, main=5, reste=24 → pioche
  const cr0=deck0.splice(0,21);
  const p1card=deck0.splice(0,1)[0]; // J1 pose sur P1
  const p2card=deck0.splice(0,1)[0]; // J1 pose sur P2
  const h0=sortHand(deck0.splice(0,5));
  const reste0=deck0; // 24 cartes

  // J2 : crapette=21, P3+P4=1 carte chacune, main=5, reste=24 → pioche
  const cr1=deck1.splice(0,21);
  const p3card=deck1.splice(0,1)[0]; // J2 pose sur P3
  const p4card=deck1.splice(0,1)[0]; // J2 pose sur P4
  const h1=sortHand(deck1.splice(0,5));
  const reste1=deck1; // 24 cartes

  const cm=[[p1card],[p2card],[p3card],[p4card]];

  G={
    players:[
      {name:getPlayerName(),crapette:cr0,hand:h0,defausse:[[],[],[],[]]},
      {name:vsAI?'IA':'Joueur 2',crapette:cr1,hand:h1,defausse:[[],[],[],[]]},
    ],
    commons:cm,
    pioche:shuffle([...reste0,...reste1]),
    futurePioche:[],
    cur:0,phase:'play',winner:null,
    startDefSnap:null,
    demandMadeThisTurn:false,
  };

  // Détecter rois initiaux sur piles communes
  for(let ci=0;ci<4;ci++){
    const t=peek(G.commons[ci]);
    if(t&&t.num===13) UI.pileKingPending[ci]=true;
  }

  // Déterminer qui commence selon la règle de mise en place
  const {first,reason}=_determineFirstPlayer(
    cr0[cr0.length-1], cr1[cr1.length-1],
    p1card, p3card, p2card, p4card
  );
  G.cur=first;

  _moveCount=0;
  saveSnap();clearMoveLog();
  addMoveLog('═ Début de partie','sys');
  addMoveLog(`${G.players[first].name} commence (${reason})`,'sys');
  render();setStatus(`${G.players[first].name} commence (${reason}) !`);showBtns();
  showStartModal(first, reason);
  if (vsAI) {
    fetch('/solo/start', {method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({uuid: getUUID()})}).catch(()=>{});
  }
}

// Règle de mise en place : plus petite crapette → 1re carte de pile → 2e carte de pile → aléatoire
// Le roi vaut 2 pour cette comparaison.
function _determineFirstPlayer(crTop0,crTop1,pile1a,pile1b,pile2a,pile2b){
  const cv=c=>c.num===13?2:c.num;
  if(cv(crTop0)!==cv(crTop1))
    return {first:cv(crTop0)<cv(crTop1)?0:1,
            reason:'crapette '+crTop0.value+' vs '+crTop1.value};
  if(cv(pile1a)!==cv(pile1b))
    return {first:cv(pile1a)<cv(pile1b)?0:1,
            reason:'1re pile '+pile1a.value+' vs '+pile1b.value};
  if(cv(pile2a)!==cv(pile2b))
    return {first:cv(pile2a)<cv(pile2b)?0:1,
            reason:'2e pile '+pile2a.value+' vs '+pile2b.value};
  return {first:Math.random()<0.5?0:1, reason:'tirage au sort'};
}

function sortHand(cards){return [...cards].sort((a,b)=>a.num-b.num);}

function saveSnap(){
  if(!G) return;
  // Sauvegarder les défausses du joueur COURANT (celui qui vient de jouer)
  // car saveSnap est appelé avant G.cur = 1-G.cur dans nextPlayer
  // Le prochain joueur pourra demander les cartes du joueur courant
  const cur=G.cur;
  G.startDefSnap=G.players[cur].defausse.map(pile=>[...pile]);
  G.startCommonsSnap=G.commons.map(pile=>[...pile]);
  G.startKingValSnap=[...UI.pileKingVal];
  G.startKingPendSnap=[...UI.pileKingPending];
  G.demandMadeThisTurn=false;
}

// ══════════════════════════════════════════════
// VALEUR EFFECTIVE DU SOMMET DE PILE ci
// ══════════════════════════════════════════════
function topNum(ci){
  const t=peek(G.commons[ci]);
  if(!t) return 0;
  if(t.num===13){
    if(UI.pileKingVal[ci]!==null) return UI.pileKingVal[ci];
    if(UI.pileKingPending[ci]) return 13; // indéterminé, traité séparément
    return 13; // roi joker non-pending (ne devrait pas arriver)
  }
  return t.num;
}

function topDisplay(ci){
  const t=peek(G.commons[ci]);
  if(!t) return '';
  if(t.num===13){
    if(UI.pileKingPending[ci]) return 'R?';
    if(UI.pileKingVal[ci]!==null) return 'R'+numToVal(UI.pileKingVal[ci]);
  }
  return t.value;
}

// ══════════════════════════════════════════════
// RÈGLES
// ══════════════════════════════════════════════
function canOnCommon(card,ci){
  const pile=G.commons[ci];
  const t=peek(pile);
  if(!t) return card.num===1; // pile vide → as seulement
  const tNum=topNum(ci);
  if(tNum===12) return false; // dame ou roi=dame
  if(UI.pileKingPending[ci]){
    // Roi seul sans valeur → tout sauf as (et pas un autre roi pour éviter empilement infini)
    return card.num!==1 && card.num!==13;
  }
  if(card.num===13){
    // Roi joker → se pose si tNum < 12 (inclut tNum=1 : roi sur as = vaut 2)
    return tNum<12;
  }
  return card.num===tNum+1;
}

function canOnDefausse(card,pile){
  if(!card) return false;
  const t=peek(pile);
  if(!t) return true;
  if(t.num===1) return card.num===1;
  return true;
}

// As visible = crapette ou défausse (main est cachée)
function visibleAce(pidx){
  const p=G.players[pidx];
  const ct=peek(p.crapette);
  if(ct&&ct.num===1) return true;
  return p.defausse.some(pile=>{const t=peek(pile);return t&&t.num===1;});
}

// ══════════════════════════════════════════════
// RÉSOLUTION ROI
// ══════════════════════════════════════════════
// Appelé après avoir poussé un roi sur la pile ci
// Ne mute pas la carte — stocke dans UI.pileKingVal/pileKingPending
function resolveKingPushed(ci){
  const pile=G.commons[ci];
  const king=peek(pile);
  if(!king||king.num!==13) return;

  if(pile.length===1){
    // Roi seul sur pile vide → pending
    UI.pileKingPending[ci]=true;
    UI.pileKingVal[ci]=null;
    addMoveLog(`Roi seul pile ${ci+1}: valeur ?`,'sys');
    return;
  }

  // Carte sous le roi (peut être un roi déjà fixé)
  const below=pile[pile.length-2];
  let belowVal;
  if(below.num===13){
    // Le roi sous l'autre roi avait une valeur fixée
    belowVal=UI.pileKingVal[ci]!==null?UI.pileKingVal[ci]:13;
  } else {
    belowVal=below.num;
  }

  const newVal=belowVal+1;
  UI.pileKingPending[ci]=false;

  if(newVal>=12){
    UI.pileKingVal[ci]=null;
    clearCommonNoLog(ci);
    // Le log est émis par playOnCommon avec suffix
    UI._lastKingInfo=`→P${ci+1} écartée (=D)`;
  } else {
    UI.pileKingVal[ci]=newVal;
    UI._lastKingInfo=`R=${numToVal(newVal)}`;
  }
}

// ══════════════════════════════════════════════
// ACTIONS
// ══════════════════════════════════════════════
function drawToFive(cb){
  if(UI.netMode){netSendMove({action:'draw'});if(cb)cb();return;}
  const p=G.players[G.cur];
  if(p.hand.length>=5){if(cb)cb();return;}

  // Piocher immédiatement toutes les cartes nécessaires
  const drawn=[];
  while(p.hand.length+drawn.length<5){
    if(G.pioche.length===0){
      if(G.futurePioche.length===0) break;
      reshufflePioche();
    }
    if(G.pioche.length>0) drawn.push(G.pioche.pop());
    else break;
  }
  if(!drawn.length){if(cb)cb();return;}

  // Ajouter à la main immédiatement
  p.hand.push(...drawn);
  p.hand=sortHand(p.hand);
  addMoveLog(`↑ ${G.players[G.cur].name} pioche ${drawn.length} carte(s) → main:${p.hand.length}`,'sys');
  if(_debugMode) _debugLogHand(G.cur);

  // Animation décorative uniquement
  render();
  if(cb) cb();
}

function reshufflePioche(){
  // Les cartes du recyclage sont mélangées et mises SOUS la pioche (face cachée)
  const recycled=shuffle([...G.futurePioche]);
  G.futurePioche=[];
  G.pioche=[...recycled,...G.pioche]; // recyclage en dessous
  addMoveLog('♻️ Recyclage sous la pioche','sys');
}

function removeFromSource(card,src){
  const p=G.players[G.cur];
  if(src.type==='hand'){
    const i=p.hand.findIndex(c=>c.uid===card.uid);
    if(i>=0) p.hand.splice(i,1);
  } else if(src.type==='crapette'){
    p.crapette.pop();
  } else if(src.type==='defausse'){
    // Ne retire QUE la dernière carte (peek)
    const pile=p.defausse[src.index];
    if(pile.length&&peek(pile).uid===card.uid) pile.pop();
  }
}

function srcLabel(src){
  if(src.type==='hand') return 'main';
  if(src.type==='crapette') return 'crapette';
  return `df${src.index+1}`;
}

// ── Jouer sur pile commune ──
// L'état est modifié IMMÉDIATEMENT. L'animation est cosmétique.
function playOnCommon(card,src,ci,cb){
  if(!canOnCommon(card,ci)){if(cb)cb(false);return false;}
  if(UI.netMode&&!window._simulating){
    netSendMove({action:'play',card_uid:card.uid,src_type:src.type,src_index:src.index??null,target_index:ci});
    if(cb)cb(true);return true;
  }
  if(isHumanTurn()&&!window._simulating) saveUndo();

  // Capturer positions AVANT modification d'état
  const fromEl=findCardEl(card,src);
  const toEl=document.querySelector(`[data-common="${ci}"]`);
  const fromR=fromEl?fromEl.getBoundingClientRect():null;
  const toR=toEl?toEl.getBoundingClientRect():null;

  // === MODIFIER L'ÉTAT IMMÉDIATEMENT ===
  removeFromSource(card,src);
  G.commons[ci].push(card);

  if(card.num===13){
    resolveKingPushed(ci);
  } else {
    if(UI.pileKingPending[ci]){
      UI.pileKingPending[ci]=false;
      UI.pileKingVal[ci]=card.num-1;
      addMoveLog('Roi→'+numToVal(card.num-1)+' pile '+(ci+1),'sys');
    } else {
      UI.pileKingVal[ci]=null;
      UI.pileKingPending[ci]=false;
    }
  }
  let logSuffix='';
  if(card.num===13&&UI._lastKingInfo){logSuffix=' ['+UI._lastKingInfo+']';UI._lastKingInfo=null;}
  const logCls=P_COLORS[G.cur]+(src.type==='crapette'?' craplog':'');
  addMoveLog(cs(card)+' ('+srcLabel(src)+')→P'+(ci+1)+logSuffix,logCls);
  _debugLogHand(G.cur);
  checkWin();

  // === ANIMATION (purement visuelle, ne bloque pas l'état) ===
  if(flyDur>0&&fromR&&toR){
    flyCard(card,fromR,toR,()=>{render();if(cb)cb(true);});
  } else {
    render();if(cb)cb(true);
  }
  return true;
}

// ── Défausser ──
function discardCard(card,src,di,cb){
  if(isHumanTurn()&&!window._simulating) saveUndo();
  const p=G.players[G.cur];
  // Seule la main peut être défaussée (pas la crapette, pas une défausse)
  if(src.type!=='hand'){if(cb)cb(false);return false;}
  if(!canOnDefausse(card,p.defausse[di])){if(cb)cb(false);return false;}

  const fromEl=findCardEl(card,src);
  const toEl=document.querySelector(`[data-def-slot="${G.cur}-${di}"]`);
  const fromR=fromEl?fromEl.getBoundingClientRect():null;
  const toR=toEl?toEl.getBoundingClientRect():null;

  // === ÉTAT IMMÉDIATEMENT ===
  removeFromSource(card,src);
  p.defausse[di].push(card);
  addMoveLog(cs(card)+' ('+srcLabel(src)+')→df'+(di+1),P_COLORS[G.cur]);
  _debugLogHand(G.cur);

  // === ANIMATION ===
  if(flyDur>0&&fromR&&toR){
    flyCard(card,fromR,toR,()=>{render();if(cb)cb(true);});
  } else {
    render();if(cb)cb(true);
  }
  return true;
}

// ── Vider pile commune → recyclage ──
function clearCommonNoLog(ci){
  G.futurePioche.push(...G.commons[ci]);
  G.commons[ci]=[];
  UI.pileKingVal[ci]=null;
  UI.pileKingPending[ci]=false;
  // Bloquer les clics brièvement après écart pour éviter init accidentelle
  _animating=true;
  setTimeout(()=>{_animating=false;},200);
}
function clearCommon(ci){
  if(UI.netMode&&!window._simulating){netSendMove({action:'clear_pile',target_index:ci});return;}
  if(isHumanTurn()&&!window._simulating) saveUndo();
  clearCommonNoLog(ci);
  addMoveLog('P'+(ci+1)+'→♻️',P_COLORS[G.cur]);
}

// ── Initialiser pile vide ──
function initCommon(ci,card,src,cb){
  if(UI.netMode&&!window._simulating){
    if(card) netSendMove({action:'init_pile',card_uid:card.uid,target_index:ci,from_pioche:false});
    else     netSendMove({action:'init_pile',target_index:ci,from_pioche:true});
    if(cb)cb();return;
  }
  if(isHumanTurn()&&!window._simulating) saveUndo();
  if(card){
    const fromEl=findCardEl(card,src);
    const toEl=document.querySelector(`[data-common="${ci}"]`);
    const fromR=fromEl?fromEl.getBoundingClientRect():null;
    const toR=toEl?toEl.getBoundingClientRect():null;
    removeFromSource(card,src);
    G.commons[ci].push(card);
    if(card.num===13) resolveKingPushed(ci);
    else{UI.pileKingVal[ci]=null;UI.pileKingPending[ci]=false;}
    addMoveLog('Init P'+(ci+1)+': '+cs(card),P_COLORS[G.cur]);
    checkWin();
    if(flyDur>0&&fromR&&toR) flyCard(card,fromR,toR,()=>{render();if(cb)cb();});
    else{render();if(cb)cb();}
  } else {
    if(G.pioche.length===0) reshufflePioche();
    if(G.pioche.length===0){setStatus('Pioche vide !');if(cb)cb();return;}
    const c2=G.pioche.pop();
    G.commons[ci].push(c2);
    if(c2.num===13) resolveKingPushed(ci);
    else{UI.pileKingVal[ci]=null;UI.pileKingPending[ci]=false;}
    addMoveLog('Init P'+(ci+1)+': '+cs(c2)+' (pioche)',P_COLORS[G.cur]);
    checkWin();render();if(cb)cb();
  }
}

function checkWin(){
  for(let i=0;i<2;i++){
    if(G.players[i].crapette.length===0){
      if(window._simulating){G.phase='game-over';G.winner=i;return true;}
      G.phase='game-over';G.winner=i;render();
      setTimeout(()=>showVictory(i),300);
      return true;
    }
  }
  return false;
}

// ── UNDO ──
function saveUndo(){
  if(!G) return;
  const snap=_buildUndoSnap();
  if(!snap) return;
  _undoStack.push(snap);
  if(_undoStack.length>20) _undoStack.shift(); // garder max 20
  try{localStorage.setItem('crapka_debug',JSON.stringify(snap));}catch(e){}
}

function loadDebugSnap(){
  try{const raw=localStorage.getItem('crapka_debug');if(!raw)return null;return JSON.parse(raw);}
  catch(e){return null;}
}

function undo(){
  if(UI.netMode){setStatus('↩ Indisponible en mode réseau');return;}
  _T('undo:entry','stack='+_undoStack.length);
  const s=_undoStack.length?_undoStack.pop():loadDebugSnap();
  if(!s){setStatus('Rien à annuler');return;}
  _T('undo:restore','restoring cur='+s.cur+' stack-after='+_undoStack.length);
  _restoreFromSnap(s);
  setStatus('↩ Situation restaurée');
  addMoveLog('↩ Retour arrière','sys');
}

function checkBlocked(){
  const p=G.players[G.cur];
  if(!p.defausse.every(pile=>{const t=peek(pile);return t&&t.num===1;})) return false;
  // Peut-il jouer sur une pile commune ?
  const cards=[
    ...p.hand.map(c=>c),
    peek(p.crapette),
    ...p.defausse.map(peek)
  ].filter(Boolean);
  for(const c of cards) for(let ci=0;ci<4;ci++) if(canOnCommon(c,ci)) return false;
  return true;
}

// Fin de tour via défausse
function endTurnViaDiscard(card,src,di,afterCb){
  if(UI.netMode){
    netSendMove({action:'discard',card_uid:card.uid,defausse_index:di});
    UI.sel=null;UI.vtgts=[];
    if(afterCb)afterCb();
    return;
  }
  discardCard(card,src,di,(ok)=>{
    if(!ok){setStatus('Impossible (as sur as uniquement)');if(afterCb)afterCb();return;}
    UI.sel=null;UI.vtgts=[];
    G.phase='play';
    if(checkBlocked()){
      G.phase='game-over';render();
      showModal('💀 '+G.players[G.cur].name+' est bloqué !',
        '4 as en défausse et aucun coup possible.',[{label:'Rejouer',fn:showMenu}]);
      if(afterCb)afterCb();
      return;
    }
    // afterCb est appelé APRÈS nextPlayer pour garantir l'ordre
    const delay=flyDur>0?flyDur+30:0;
    setTimeout(()=>{nextPlayer();if(afterCb)setTimeout(afterCb,10);}, delay);
  });
}

function nextPlayer(){
  _T('nextPlayer:entry','cur='+G.cur+'->'+( 1-G.cur));
  addMoveLog(`── Tour ${G.players[1-G.cur].name}→${G.players[1-G.cur===0?1:0].name}`,'turn-sep');
  saveSnap();
  if(UI.vsAI) fetch('/solo/ping',{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({uuid:getUUID()})}).catch(()=>{});
  G.cur=1-G.cur;G.phase='play';
  UI.sel=null;UI.vtgts=[];
  drawToFive(()=>{
    render();showBtns();
    if(UI.vsAI&&G.cur===UI.aiIdx&&(_stepMode&&_debugMode)){
      setStatus('[PàP] Tour de '+G.players[G.cur].name+' — ▶ pour lancer');
    } else {
      setStatus('Tour de '+G.players[G.cur].name);
    }
    if(UI.vsAI&&G.cur===UI.aiIdx&&!(_stepMode&&_debugMode)) setTimeout(aiPlayTurn,300);
    if(_debugMode) _updateStepUI();
  });
}

// ══════════════════════════════════════════════
// DEMANDE
// ══════════════════════════════════════════════
function wasPlayableAtStartOfTurn(oppIdx,defIdx){
  if(!G.startDefSnap||!G.startCommonsSnap) return false;
  const snap=G.startDefSnap[defIdx];
  const card=peek(snap);
  if(!card) return false;
  // Utiliser le snapshot des piles communes du début du tour adverse
  for(let ci=0;ci<4;ci++){
    const snapPile=G.startCommonsSnap[ci];
    const t=peek(snapPile);
    const kVal=G.startKingValSnap[ci];
    const kPend=G.startKingPendSnap[ci];
    // Calculer topNum du snapshot
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

function tryDemand(oppIdx,defIdx){
  if(oppIdx===G.cur) return;
  if(G.demandMadeThisTurn){setStatus('Une seule demande par tour');return;}
  if(!wasPlayableAtStartOfTurn(oppIdx,defIdx)){setStatus('Cette carte ne peut pas être demandée');return;}
  const card=peek(G.players[oppIdx].defausse[defIdx]);
  if(!card) return;
  if(UI.netMode){
    const savedCur=G.cur; G.cur=oppIdx;
    for(let ci=0;ci<4;ci++){
      if(canOnCommon(card,ci)){
        G.cur=savedCur;
        netSendMove({action:'demand',card_uid:card.uid,src_index:defIdx,target_index:ci});
        G.demandMadeThisTurn=true;
        return;
      }
    }
    G.cur=savedCur;
    setStatus('Aucune pile disponible pour cette demande');
    return;
  }
  if(!window._simulating) saveUndo();
  const savedCur=G.cur;
  G.cur=oppIdx;
  let played=false;
  for(let ci=0;ci<4;ci++){
    if(canOnCommon(card,ci)){
      // retirer la carte de la défausse adverse
      G.players[oppIdx].defausse[defIdx].pop();
      G.commons[ci].push(card);
      if(card.num===13) resolveKingPushed(ci);
      else{UI.pileKingVal[ci]=null;UI.pileKingPending[ci]=false;}
      addMoveLog(`⚡${cs(card)}→P${ci+1}`,'sys');
      played=true;break;
    }
  }
  G.cur=savedCur;
  if(played){G.demandMadeThisTurn=true;checkWin();render();}
}

// ══════════════════════════════════════════════
// SAUVEGARDES — ÉTAT
// ══════════════════════════════════════════════
function _buildUndoSnap(){
  if(!G) return null;
  return {
    commons:G.commons.map(p=>[...p]),
    hands:G.players.map(p=>[...p.hand]),
    crapettes:G.players.map(p=>[...p.crapette]),
    defausses:G.players.map(p=>p.defausse.map(d=>[...d])),
    pioche:[...G.pioche],
    futurePioche:[...G.futurePioche],
    cur:G.cur,phase:G.phase,winner:G.winner,
    startDefSnap:G.startDefSnap?G.startDefSnap.map(p=>[...p]):null,
    startCommonsSnap:G.startCommonsSnap?G.startCommonsSnap.map(p=>[...p]):null,
    startKingValSnap:G.startKingValSnap?[...G.startKingValSnap]:null,
    startKingPendSnap:G.startKingPendSnap?[...G.startKingPendSnap]:null,
    demandMadeThisTurn:G.demandMadeThisTurn||false,
    kingVal:[...UI.pileKingVal],
    kingPend:[...UI.pileKingPending],
    vsAI:UI.vsAI,
    playerNames:G.players.map(p=>p.name),
  };
}

function _restoreFromSnap(s){
  _T('_restoreFromSnap:entry','cur='+s?.cur);
  if(!s) return;
  if(!G||!G.players){
    G={
      players:[
        {name:s.playerNames?s.playerNames[0]:'Joueur 1',crapette:[],hand:[],defausse:[[],[],[],[]]},
        {name:s.playerNames?s.playerNames[1]:(s.vsAI?'IA':'Joueur 2'),crapette:[],hand:[],defausse:[[],[],[],[]]},
      ],
      commons:[[],[],[],[]],pioche:[],futurePioche:[],
      cur:0,phase:'play',winner:null,
      startDefSnap:null,startCommonsSnap:null,
      startKingValSnap:null,startKingPendSnap:null,demandMadeThisTurn:false,
    };
  }
  G.commons=s.commons.map(p=>[...p]);
  G.players.forEach((p,i)=>{
    p.hand=[...s.hands[i]];
    p.crapette=[...s.crapettes[i]];
    p.defausse=s.defausses[i].map(d=>[...d]);
    if(s.playerNames) p.name=s.playerNames[i];
  });
  G.pioche=[...s.pioche];
  G.futurePioche=[...s.futurePioche];
  G.cur=s.cur;G.phase=s.phase;G.winner=s.winner!==undefined?s.winner:null;
  G.startDefSnap=s.startDefSnap;
  G.startCommonsSnap=s.startCommonsSnap;
  G.startKingValSnap=s.startKingValSnap;
  G.startKingPendSnap=s.startKingPendSnap;
  G.demandMadeThisTurn=s.demandMadeThisTurn||false;
  UI.pileKingVal=[...s.kingVal];
  UI.pileKingPending=[...s.kingPend];
  if(s.vsAI!==undefined) UI.vsAI=s.vsAI;
  UI.sel=null;UI.vtgts=[];_animating=false;
  clearTimeout(_aiTimer);_aiMoves=[];
  _replayingAI=false;_stepResolve=null;
  _T('_restoreFromSnap:done','cur='+G.cur+' sR=null rAI=false');
  render();showBtns();
}

// ══════════════════════════════════════════════
// IA — PROFIL NOMISTEK
// ══════════════════════════════════════════════
const _VER_AI_NOMISTEK='1.4.8';

const AI_NOMISTEK=(()=>{

const BF_MAX_EXPANSIONS=3000;

// ── Évaluation ──────────────────────────────────────────────────────────────

function _evalHandScore(g,ui,aiIdx){
  const ai=g.players[aiIdx];
  const crT=ai.crapette.length?ai.crapette[ai.crapette.length-1]:null;
  let sc=0;
  for(const c of ai.hand) for(let ci=0;ci<4;ci++) if(_sCanOnCommon(g,ui,c,ci)){sc+=4;break;}
  if(ai.hand.length===0&&(g.pioche.length>0||g.futurePioche.length>0)) sc+=10;
  const handSize=ai.hand.length;
  sc+=Math.max(0,5-handSize)*4;
  const crPlayable=crT&&g.commons.some((_,ci)=>_sCanOnCommon(g,ui,crT,ci));
  if(!crPlayable&&handSize>0) sc+=ai.hand.filter(c=>c.num===13).length*10;
  if(crT&&handSize>0){
    const handNums=ai.hand.map(c=>c.num);
    if(!handNums.includes(crT.num)) sc+=8;
    if(new Set(handNums).size===handNums.length) sc+=5;
    const prev1=crT.num===1?12:crT.num-1;
    const prev2=crT.num<=2?crT.num+10:crT.num-2;
    if(handNums.includes(prev1)) sc+=8;
    if(handNums.includes(prev2)) sc+=4;
  }
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

function _evalBreakdown(g,ui,aiIdx){
  if(g.phase==='game-over') return g.winner===aiIdx?'🏆 Victoire: +10000':'💀 Défaite: −10000';
  const ai=g.players[aiIdx],opp=g.players[1-aiIdx];
  const crT=ai.crapette.length?ai.crapette[ai.crapette.length-1]:null;
  const oppCrT=opp.crapette.length?opp.crapette[opp.crapette.length-1]:null;
  const L=[],fmt=(v)=>(v>=0?'+':'')+v;
  function add(label,v){if(v!==0)L.push(label+': '+fmt(v));}
  const crSc=(21-ai.crapette.length)*50-(21-opp.crapette.length)*50;
  add('Cr '+ai.crapette.length+'→'+opp.crapette.length,crSc);
  let crPlay=0;
  if(crT) for(let ci=0;ci<4;ci++) if(_sCanOnCommon(g,ui,crT,ci)){crPlay=30;break;}
  add('Cr jouable ('+(crT?crT.value:'∅')+')',crPlay);
  let oppPlay=0;
  if(oppCrT) for(let ci=0;ci<4;ci++) if(_sCanOnCommon(g,ui,oppCrT,ci)){oppPlay=-40;break;}
  add('Cr adv jouable ('+(oppCrT?oppCrT.value:'∅')+')',oppPlay);
  let pDist=0;
  if(crT){const tgt=(crT.num-1+12)%12||12;for(let ci=0;ci<4;ci++){const tn=_sTopNum(g,ui,ci);if(tn>0&&tn<12){const d=(tgt-tn+12)%12;pDist+=Math.max(0,(11-d)*2);}}}
  add('Piles dist',pDist);
  const aiSrcs=[...ai.hand,...ai.defausse.map(d=>d.length?d[d.length-1]:null).filter(Boolean)];
  let activ=0;
  for(let ci=0;ci<4;ci++){const tn=_sTopNum(g,ui,ci);if(tn>0&&tn<12&&aiSrcs.some(c=>c.num===tn+1))activ+=8;}
  add('Piles activables',activ);
  const dv=new Set(ai.defausse.map(d=>d.length?d[d.length-1].num:null).filter(n=>n!==null)).size;
  add('Déf diversité',dv*3);
  let minD=12;
  if(crT){const tgt=(crT.num-1+12)%12||12;for(let ci=0;ci<4;ci++){const tn=_sTopNum(g,ui,ci);if(tn>0&&tn<12)minD=Math.min(minD,(tgt-tn+12)%12);}}
  add('Min dist pile',minD<12?Math.max(0,(6-minD)*4):0);
  if(g.pioche.length>0||g.futurePioche.length>0){const e=g.commons.filter(p=>!p.length).length;add('Piles vides',-e*30);}
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
  if(oppCrT) for(let ci=0;ci<4;ci++) if(_sCanOnCommon(g,ui,oppCrT,ci)){sc-=40;break;}
  if(crT){
    const crNum=crT.num;
    const target=(crNum-1+12)%12||12;
    for(let ci=0;ci<4;ci++){
      const tn=_sTopNum(g,ui,ci);
      if(tn>0&&tn<12){const dist=(target-tn+12)%12;sc+=Math.max(0,(11-dist)*2);}
    }
  }
  const aiSrcs=[...ai.hand,...ai.defausse.map(d=>d.length?d[d.length-1]:null).filter(Boolean)];
  for(let ci=0;ci<4;ci++){
    const tn=_sTopNum(g,ui,ci);
    if(tn>0&&tn<12&&aiSrcs.some(card=>card.num===tn+1)) sc+=8;
  }
  const defVals=new Set(ai.defausse.map(d=>d.length?d[d.length-1].num:null).filter(n=>n!==null));
  sc+=defVals.size*3;
  if(crT){
    const crNum=crT.num;
    const target=(crNum-1+12)%12||12;
    let minDist=12;
    for(let ci=0;ci<4;ci++){
      const tn=_sTopNum(g,ui,ci);
      if(tn>0&&tn<12) minDist=Math.min(minDist,(target-tn+12)%12);
    }
    if(minDist<12) sc+=Math.max(0,(6-minDist)*4);
  }
  // Pile vide + pioche dispo + crapette non jouable → opportunité de retourner une carte utile.
  // Bonus proportionnel à l'aspect "intermédiaire" de la crapette : min(crT-1, 12-crT+1),
  // maximal vers crT=6-7 (beaucoup de valeurs utiles à tirer), minimal aux extrêmes.
  if(crT&&(g.pioche.length>0||g.futurePioche.length>0)){
    const emptyPiles=g.commons.filter(p=>!p.length).length;
    if(emptyPiles>0){
      const crPlayableNow=g.commons.some((_,ci)=>_sCanOnCommon(g,ui,crT,ci));
      if(!crPlayableNow){
        const interm=Math.min(crT.num-1,12-crT.num+1);
        sc+=emptyPiles*interm*2;
      }
    }
  }
  sc+=_evalHandScore(g,ui,aiIdx);
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

// ── Force Brute ──────────────────────────────────────────────────────────────

function _hMax(seq,aiIdx){
  const hand=seq.state.g.players[aiIdx].hand;
  return (seq.crapettePlayed?0:500)+(hand.length>0?150:0)+hand.length*5;
}

function _buildCrapettePath(g,ui,pidx){
  const cr=g.players[pidx].crapette;
  if(!cr.length) return null;
  const crT=cr[cr.length-1];
  // Crapette directement jouable → on-path = {crT seule}, plein bonus tier sans discount
  if(g.commons.some((_,ci)=>_sCanOnCommon(g,ui,crT,ci))) return new Set([crT.num]);
  const pathNums=new Set();
  let target=crT.num-1;
  let limit=15;
  while(limit-->0){
    if(g.commons.some((_,ci)=>_sTopNum(g,ui,ci)===target)) break;
    if(target===0){
      if(pathNums.has(12)) break;
      if(!_sCardAvailableForPath(g,ui,pidx,12)){
        // Le Roi peut servir de Dame (Roi sur pile à 11 → valeur 12 → vide → As)
        if(!pathNums.has(13)&&g.players[pidx].hand.some(c=>c.num===13)){
          pathNums.add(13);target=11;continue;
        }
        return null;
      }
      pathNums.add(12);target=11;continue;
    }
    if(!_sCardAvailableForPath(g,ui,pidx,target)) return null;
    pathNums.add(target);
    const prevTarget=target-1;
    if(prevTarget===0?g.commons.some(p2=>!p2.length):g.commons.some((_,ci)=>_sTopNum(g,ui,ci)===prevTarget)) break;
    if(target!==1&&prevTarget>=1){
      const anyPileForKing=g.commons.some((_,ci)=>{const t=_sTopNum(g,ui,ci);return t>0&&t<12;});
      if(anyPileForKing&&g.players[pidx].hand.some(c=>c.num===13)
         &&!_sCardAvailableForPath(g,ui,pidx,prevTarget)){pathNums.add(13);break;}
    }
    target=prevTarget;
  }
  const unmaskNums=new Set();
  for(const num of pathNums){
    g.players[pidx].defausse.forEach(d=>{
      if(d.length>=2&&d[d.length-2].num===num) unmaskNums.add(d[d.length-1].num);
    });
  }
  for(const n of unmaskNums) pathNums.add(n);
  return pathNums.size>0?pathNums:null;
}

// Longueur de la route de l'adversaire (nombre d'Étapes jusqu'à sa crapette, crapette incluse).
// La route est le chemin circulaire le plus court depuis le sommet de n'importe quelle pile
// jusqu'à la crapette adverse. Ex : piles {8}, crapette=3 → 9 T V D As 2 3 = 7 Étapes.
// Retourne 13 si indéterminé (Roi ou aucune pile valide).
function _oppRouteLen(g,ui,aiIdx){
  const oppIdx=1-aiIdx;
  const opp=g.players[oppIdx];
  if(!opp.crapette.length) return 0;
  const oppCrT=opp.crapette[opp.crapette.length-1];
  if(oppCrT.num===13) return 13;
  let minDist=13;
  for(let ci=0;ci<4;ci++){
    const tn=_sTopNum(g,ui,ci);
    if(tn===13) continue;
    const dist=tn===0?oppCrT.num:(oppCrT.num-tn+12)%12;
    if(dist>0&&dist<minDist) minDist=dist;
  }
  return minDist;
}

// Construit l'ensemble des valeurs sur la Route : du sommet de pile le plus proche (circulaire)
// jusqu'à crTNum inclus. Ex : piles {9,V,5,6}, crT=4 → V(11) est le plus proche → Route={12,1,2,3,4}.
function _buildRoute(g,ui,crTNum){
  let minDist=13,bestTop=-1;
  for(let ci=0;ci<4;ci++){
    const tn=_sTopNum(g,ui,ci);
    if(tn===13) continue;
    const dist=tn===0?crTNum:(crTNum-tn+12)%12;
    if(dist>0&&dist<minDist){minDist=dist;bestTop=tn;}
  }
  if(bestTop===-1) return new Set([crTNum]);
  const routeNums=new Set();
  let cur=bestTop===0?1:(bestTop%12)+1;
  for(let i=0;i<minDist;i++){routeNums.add(cur);cur=(cur%12)+1;}
  return routeNums;
}

function _bfSortMoves(moves,g,ui,aiIdx,pathNums){
  const p=g.players[aiIdx];
  const crT=p.crapette.length?p.crapette[p.crapette.length-1]:null;
  const routeNums=(crT&&crT.num!==13)?_buildRoute(g,ui,crT.num):null;

  // Sommet de défausse qui démasque une carte de la Route
  const unmaskNums=new Set();
  if(routeNums&&p.defausse){
    for(const d of p.defausse){
      if(d.length>=2&&routeNums.has(d[d.length-2].num)) unmaskNums.add(d[d.length-1].num);
    }
  }

  const tier1cr=[],tier1other=[],tier2=[],tier3init=[],tier3other=[],tier3demand=[],tier3end=[];
  for(const m of moves){
    if(m.type==='init'||m.type==='clear'){tier3init.push(m);}
    else if(m.type==='demand'){tier3demand.push(m);}
    else if(m.type==='end'){tier3end.push(m);}
    else if(m.type==='play'&&m.card){
      const isCr=m.src?.type==='crapette';
      if(isCr||(routeNums&&routeNums.has(m.card.num))||(pathNums&&pathNums.has(m.card.num))){
        (isCr?tier1cr:tier1other).push(m);
      } else if(m.src?.type==='defausse'&&unmaskNums.has(m.card.num)){
        tier2.push(m);
      } else{
        tier3other.push(m);
      }
    } else{tier3other.push(m);}
  }
  return[...tier1cr,...tier1other,...tier2,...tier3init,...tier3other,...tier3demand,...tier3end];
}

function _bfExpand(seq,aiIdx){
  const {g,ui}=seq.state;
  const pidx=g.cur;
  const p=g.players[pidx];
  let lm=_sLegal(g,ui,pidx,false);
  if(window._traceMode&&seq.id==='0'){
    _tlog('  Legal[0]: '+lm.map(m=>_fmtMove(m)).join(' | '));
    const crMoves=lm.filter(m=>m.type==='play'&&m.src&&m.src.type==='crapette');
    _tlog('  Legal Cr: '+(crMoves.length?crMoves.map(m=>_fmtMove(m)).join(' '):'aucun'));
  }
  if(seq.crapettePlayed)
    lm=lm.filter(m=>!(m.type==='play'&&m.src&&m.src.type==='crapette'));
  if(!lm.length) return[{...seq,terminated:true,score:_eval(g,ui,aiIdx)+seq.extraBonus,handScore:_evalHandScore(g,ui,aiIdx)}];
  if(p.hand.length===0&&!lm.some(m=>m.type==='end')&&!lm.some(m=>m.type==='play'||m.type==='demand'))
    return[{...seq,terminated:true,score:_eval(g,ui,aiIdx)+seq.extraBonus,handScore:_evalHandScore(g,ui,aiIdx)}];
  const hasCrapettePath=g.players[aiIdx].crapette.length>0;
  const pathNums=hasCrapettePath?_buildCrapettePath(g,ui,aiIdx):null;
  const deduped=_bfDedup(_bfSortMoves(lm,g,ui,aiIdx,pathNums),p,g);
  const BF_DISCOUNT=0.3;
  const OPP_ROUTE_PENALTY=-15;
  const oppRouteLenBefore=_oppRouteLen(g,ui,aiIdx);
  return deduped.map((mv,i)=>{
    const isCrapettePlay=mv.type==='play'&&mv.src&&mv.src.type==='crapette';
    const isPiocheDiscovery=(mv.type==='init'&&!mv.card)||mv.type==='redraw';
    const {g:ng,ui:nui}=_sApply(g,ui,pidx,mv);
    const isHandPlay=mv.type==='play'&&mv.src?.type==='hand';
    const isOnPath=!seq.postKey&&pathNums&&(mv.type==='clear'||(mv.card&&pathNums.has(mv.card.num)));
    const moveDiscount=(seq.postKey||(hasCrapettePath&&!isOnPath))?BF_DISCOUNT:1;
    const handPlayBonus=(isOnPath||(isHandPlay&&!hasCrapettePath))?5:0;
    const handEmptied=mv.type!=='end'&&p.hand.length>0&&ng.players[pidx].hand.length===0;
    const tierBonus=isCrapettePlay?500:handEmptied?150:0;
    const kingFromHandPenalty=isHandPlay&&mv.card.num===13?(isOnPath?0:-35):0;
    const isEmptyPilePlay=mv.type==='play'&&mv.ci!==undefined&&!g.commons[mv.ci].length;
    const isDefPlay=mv.type==='play'&&mv.src?.type==='defausse';
    const defVsHandPenalty=isDefPlay&&p.hand.some(c=>c.num===mv.card.num)?-8:0;
    // Pénalité si le coup raccourcit la route adverse sans jouer notre crapette ni vider la main
    const oppRoutePenalty=(mv.type==='play'&&!isCrapettePlay&&!isOnPath&&!handEmptied&&!seq.crapettePlayed&&_oppRouteLen(ng,nui,aiIdx)<oppRouteLenBefore)?OPP_ROUTE_PENALTY:0;
    const discounted=(handPlayBonus+kingFromHandPenalty)*moveDiscount;
    const newPostKey=seq.postKey||isCrapettePlay||isEmptyPilePlay;
    const willTerminate=mv.type==='end'||isPiocheDiscovery;
    const evalG=mv.type==='redraw'?g:ng, evalUi=mv.type==='redraw'?ui:nui;
    const sc=_eval(evalG,evalUi,aiIdx);
    const hs=willTerminate?_evalHandScore(evalG,evalUi,aiIdx):0;
    const isClear=mv.type==='clear';
    const isDiscovery=isCrapettePlay||isPiocheDiscovery||(mv.type==='redraw');
    // Pénalité de délai : chaque coup non-chemin joué avant la crapette coûte -1 → D-first score mieux que T-first
    const preCrapetteDelay=(!isDiscovery&&seq.triggerIdx===-1&&hasCrapettePath&&!isOnPath)?-1:0;
    const newBonus=seq.extraBonus+tierBonus+discounted+defVsHandPenalty+oppRoutePenalty+preCrapetteDelay;
    const meta={isOnPath,handEmptied,isCrapettePlay,isClear};
    const newTriggerIdx=seq.triggerIdx!==-1?seq.triggerIdx:(isDiscovery?seq.moves.length:-1);
    return{
      id:seq.id+'.'+i,
      state:{g:ng,ui:nui},
      moves:[...seq.moves,mv],
      moveMeta:[...(seq.moveMeta||[]),meta],
      terminated:willTerminate,
      score:sc+newBonus,
      handScore:willTerminate?hs:0,
      extraBonus:newBonus,
      crapettePlayed:seq.crapettePlayed||isCrapettePlay,
      postKey:newPostKey,
      triggerIdx:newTriggerIdx
    };
  });
}

function _bruteForce(){
  const aiIdx=UI.aiIdx;
  const {g:g0,ui:ui0}=_cloneState(G,UI);
  const initSeq={
    id:'0',state:{g:g0,ui:ui0},moves:[],terminated:false,
    score:_eval(g0,ui0,aiIdx),extraBonus:0,
    crapettePlayed:false,postKey:false,triggerIdx:-1,moveMeta:[]
  };
  initSeq.hMax=_hMax(initSeq,aiIdx);
  let active=[initSeq];
  let terminated=[];
  let bestTermScore=-Infinity;
  let expansions=0;
  while(active.length>0&&expansions<BF_MAX_EXPANSIONS){
    const seq=active.pop(); // DFS LIFO — _bfSortMoves (Route) guide la direction
    if(seq.score+seq.hMax<bestTermScore) continue;
    expansions++;
    const expanded=_bfExpand(seq,aiIdx);
    // Pousser en ordre inverse : Tier1 (Route/crapette) arrive au sommet de la pile
    for(let i=expanded.length-1;i>=0;i--){
      const s=expanded[i];
      if(s.terminated){
        terminated.push(s);
        if(s.score>bestTermScore) bestTermScore=s.score;
      } else {
        s.hMax=_hMax(s,aiIdx);
        if(s.score+s.hMax>=bestTermScore) active.push(s);
      }
    }
  }
  let best=null;
  for(const seq of terminated){
    if(!best||seq.score>best.score
      ||(seq.score===best.score&&seq.moves.length<best.moves.length)
      ||(seq.score===best.score&&seq.moves.length===best.moves.length
         &&seq.triggerIdx>=0&&(best.triggerIdx<0||seq.triggerIdx<best.triggerIdx)))
      best=seq;
  }
  const sortedTerm=terminated.sort((a,b)=>b.score-a.score||a.moves.length-b.moves.length);
  if(_debugMode){
    const bestId=best?best.id:null;
    window._dbgBFExpansions=expansions;
    window._dbgBFSequences=sortedTerm.map(s=>({
      score:s.score,handScore:s.handScore||0,moves:s.moves,
      moveMeta:s.moveMeta||[],triggerIdx:s.triggerIdx??-1,
      isBest:s.id===bestId,
      breakdown:_evalBreakdown(s.state.g,s.state.ui,aiIdx)
    }));
  }
  if(window._traceMode){
    const bestId=best?best.id:null;
    _traceBF(sortedTerm.map(s=>({
      score:s.score,handScore:s.handScore||0,moves:s.moves,
      moveMeta:s.moveMeta||[],triggerIdx:s.triggerIdx??-1,isBest:s.id===bestId
    })),best,aiIdx);
    _tlog('  BF expansions='+expansions+' terminées='+terminated.length+' actives_restantes='+active.length);
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

// ── Défausse ─────────────────────────────────────────────────────────────────

function _wouldBedemandable(card){
  for(let ci=0;ci<4;ci++) if(canOnCommon(card,ci))return true;return false;
}

function _aceDangerousToDiscard(oppIdx){
  const opp=G.players[oppIdx];
  const oppCrTop=peek(opp.crapette);
  if(!oppCrTop||oppCrTop.num!==2) return false;
  if(visibleAce(oppIdx)) return false;
  const myP=G.players[G.cur];
  const iHave2=myP.hand.some(c=>c.num===2)||
               (peek(myP.crapette)&&peek(myP.crapette).num===2)||
               myP.defausse.some(d=>{const t=peek(d);return t&&t.num===2;});
  if(iHave2) return false;
  return true;
}

function _discardPriority(card,crNum,opp,aceDanger,p){
  let score=0;
  if(crNum>0&&card.num===crNum) return 100;
  if(crNum>0&&card.num!==crNum){
    const target=crNum-1;
    const dist=(target-card.num+12)%12;
    const count=p.hand.filter(hc=>hc.num===card.num).length;
    if(count===1) score-=Math.max(0,(11-dist)*4);
    else score+=Math.max(0,(11-dist)*2);
  }
  if(card.num===1&&aceDanger) score-=30;
  if(_wouldBedemandable(card)) score-=20;
  for(let ci=0;ci<4;ci++){
    if(canOnCommon(card,ci)){
      const oppCrTop=peek(G.players[opp].crapette);
      const danger=(card.num===1&&oppCrTop&&oppCrTop.num===2&&!visibleAce(opp));
      if(!danger) score-=30;
      break;
    }
  }
  const cnt=p.hand.filter(hc=>hc.num===card.num).length;
  if(cnt>=2) score+=15;
  const myChain=_chainValsForPlayer(G.cur);
  if(myChain.has(card.num)){
    if(cnt===1) score-=20;
    else score+=10;
  }
  const oppChain=_chainValsForPlayer(opp);
  if(oppChain.has(card.num)){
    const oppP=G.players[opp];
    const visibleForOpp=
      (peek(oppP.crapette)&&peek(oppP.crapette).num===card.num)||
      oppP.defausse.some(d=>{const t=peek(d);return t&&t.num===card.num;});
    if(!visibleForOpp) score-=15;
  }
  const residual=p.hand.filter(hc=>hc.uid!==card.uid);
  const onlyKingsLeft=residual.length>0&&residual.every(c=>c.num===13);
  if(onlyKingsLeft&&(G.pioche.length>0||G.futurePioche.length>0)) score+=20;
  return score;
}

function _aiBestDef(card){
  const p=G.players[G.cur];
  const crTop=peek(p.crapette);
  const crNum=crTop?crTop.num:7;
  const chainNums=new Set();
  for(let v=crNum;v<=12;v++) chainNums.add(v);
  const accessibleElsewhere=(num,excl)=>{
    if(p.hand.some(c=>c.num===num)) return true;
    if(crTop&&crTop.num===num) return true;
    return p.defausse.some((d,j)=>j!==excl&&peek(d)&&peek(d).num===num);
  };
  const emptyElsewhere=(excl)=>p.defausse.some((d,j)=>j!==excl&&d.length===0);
  let best=0,bs=-9999;
  for(let i=0;i<4;i++){
    if(!canOnDefausse(card,p.defausse[i])) continue;
    const t=peek(p.defausse[i]);
    let sc=0;
    if(!t){
      sc=0;
    } else {
      const n=t.num,m=card.num;
      if(m===1&&n===1){sc=100;if(sc>bs){bs=sc;best=i;}continue;}
      if(m===1&&n!==1){sc=-50;}
      else {
        if(m===n-1) sc+=15;
        else if(m<n) sc+=2;
        else sc-=10;
        if(emptyElsewhere(i)&&m!==n-1){
          if(chainNums.has(n)&&!accessibleElsewhere(n,i)) sc-=20;
          else sc-=8;
        }
        if(chainNums.has(n)&&!accessibleElsewhere(n,i)) sc-=12;
        const pile=p.defausse[i];
        for(let d=1;d<=Math.min(3,pile.length-1);d++){
          const buried=pile[pile.length-1-d];
          if(!buried) break;
          if(chainNums.has(buried.num)&&!accessibleElsewhere(buried.num,i))
            sc-=(4-d)*2;
        }
        if(_wouldBedemandable(t)) sc+=5;
        sc+=Math.max(0,3-p.defausse[i].length);
      }
    }
    if(sc>bs){bs=sc;best=i;}
  }
  return best;
}

function _aiDiscard(){
  const p=G.players[G.cur];
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
        break;
      }
    }
  }
  const crTop=peek(p.crapette);const crNum=crTop?crTop.num:7;const opp=1-G.cur;
  let moved=true;
  while(moved&&G.phase!=='game-over'){
    moved=false;
    for(let ci=0;ci<4;ci++){
      if(topNum(ci)===12){_q({type:'clear',ci});_applyMoveToState(G,UI,{type:'clear',ci});moved=true;break;}
    }
    if(moved) continue;
    for(let ci=0;ci<4;ci++){
      if(G.commons[ci].length===0){
        const ace=_findAce();
        if(ace){const mva={type:'init',ci,card:ace.card,src:ace.src};_q(mva);_applyMoveToState(G,UI,mva);moved=true;break;}
      }
    }
    if(moved) continue;
    {
      const crT=peek(G.players[G.cur].crapette);
      if(crT){
        for(let ci=0;ci<4;ci++){
          if(canOnCommon(crT,ci)){_q({type:'play',card:crT,src:{type:'crapette'},ci});_applyMoveToState(G,UI,{type:'play',card:crT,src:{type:'crapette'},ci});moved=true;break;}
        }
      }
    }
    if(moved) continue;
    {
      const allMoves=[];
      for(const card of p.hand){
        if(card.num===13) continue;
        for(let ci=0;ci<4;ci++) if(canOnCommon(card,ci)) allMoves.push({type:'play',card,src:{type:'hand'},ci});
      }
      if(allMoves.length){
        allMoves.sort((a,b)=>a.card.uid-b.card.uid||a.ci-b.ci);
        const best=allMoves[0];_q(best);_applyMoveToState(G,UI,best);moved=true;
      }
    }
  }
  const anyPlayable=p.hand.some(hc=>hc.num!==13&&_handCardIsPlayable(hc));
  if(!anyPlayable){
    for(let ci=0;ci<4;ci++){
      if(G.commons[ci].length===0&&(G.pioche.length>0||G.futurePioche.length>0)){
        while(G.commons[ci].length===0&&(G.pioche.length>0||G.futurePioche.length>0)){
          if(G.pioche.length===0){G.pioche=shuffle([...G.futurePioche]);G.futurePioche=[];}
          if(G.pioche.length===0) break;
          const drn=G.pioche.pop();
          const mva={type:'init',ci,card:drn,src:null,fromPioche:true};
          _q(mva);_applyMoveToState(G,UI,mva);
          if(topNum(ci)===12){_q({type:'clear',ci});_applyMoveToState(G,UI,{type:'clear',ci});}
        }
        {
          const crT2=peek(G.players[G.cur].crapette);
          if(crT2){
            for(let ci2=0;ci2<4;ci2++){
              if(canOnCommon(crT2,ci2)){_q({type:'play',card:crT2,src:{type:'crapette'},ci:ci2});_applyMoveToState(G,UI,{type:'play',card:crT2,src:{type:'crapette'},ci:ci2});break;}
            }
          }
        }
        break;
      }
    }
  }
  let cands=p.hand.filter(c=>c.num!==13&&!_handCardIsPlayable(c));
  if(!cands.length) cands=p.hand.filter(c=>c.num!==13);
  if(!cands.length) cands=[...p.hand];
  let toDiscard=null,src={type:'hand'};
  if(cands.length){
    const aceDanger=_aceDangerousToDiscard(opp);
    cands.sort((a,b)=>_discardPriority(b,crNum,opp,aceDanger,p)-_discardPriority(a,crNum,opp,aceDanger,p));
    toDiscard=cands[0];
    if(window._traceMode){
      _tlog('  Discard cands: '+cands.map(c=>c.value+c.suit+'('+_discardPriority(c,crNum,opp,aceDanger,p)+')').join(' '));
      _tlog('  Discard chosen: '+toDiscard.value+toDiscard.suit);
    }
  }
  if(!toDiscard){_q({type:'redraw'});return;}
  const di=_aiBestDef(toDiscard);
  _q({type:'discard',card:toDiscard,src,di});
}

// ── Interface profil ─────────────────────────────────────────────────────────

return{name:'Nomistek',bruteForce:_bruteForce,aiDiscard:_aiDiscard};

})();

_AI_REGISTRY['nomistek']=AI_NOMISTEK;

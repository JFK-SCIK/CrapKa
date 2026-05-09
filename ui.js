// ══════════════════════════════════════════════
// ANIMATION
// ══════════════════════════════════════════════
const _VER_UI='1.2.40';
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
function isHumanTurn(){
  if(UI.netMode) return netIsMyTurn();
  return !_animating&&!_waitingToStart&&!(UI.vsAI&&G.cur===UI.aiIdx);
}

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
  if(p.hand.length>0) return;
  if(G.pioche.length===0&&G.futurePioche.length===0){setStatus('Pioche vide !');return;}
  if(UI.netMode){netSendMove({action:'draw'});return;}
  drawToFive(()=>{render();setStatus(`Main : ${G.players[G.cur].hand.length} carte(s)`);});
}

function clickFuturePioche(){setStatus(`♻️ Recyclage : ${G.futurePioche.length} carte(s)`);}

function clickPioche(){
  setStatus(`Pioche : ${G?G.pioche.length:0} carte(s) + recyclage : ${G?G.futurePioche.length:0}`);
}

// ══════════════════════════════════════════════
// SAUVEGARDES — FICHIERS
// ══════════════════════════════════════════════
// Sauvegarde vers fichier JSON.
// Le dossier de destination est choisi via un bouton 📁 dédié
// (showDirectoryPicker doit être appelé directement depuis un clic,
//  sans await préalable qui consommerait le geste utilisateur).
// Le handle est gardé en mémoire pour la session.
// Fallback téléchargement classique si pas de dossier configuré.

let _saveDirHandle=null;

function _localTs(){
  const n=new Date();
  const pad=v=>String(v).padStart(2,'0');
  return n.getFullYear()+'-'+pad(n.getMonth()+1)+'-'+pad(n.getDate())
    +'_'+pad(n.getHours())+'-'+pad(n.getMinutes())+'-'+pad(n.getSeconds());
}

// Appelé par le bouton 📁 — geste utilisateur direct, pas d'await avant
async function chooseSaveDir(){
  if(!window.showDirectoryPicker){
    setStatus('📁 Non disponible sur ce navigateur (Firefox). Les saves vont dans Téléchargements.');
    return;
  }
  try{
    _saveDirHandle=await window.showDirectoryPicker({id:'crapka-saves',mode:'readwrite',startIn:'documents'});
    setStatus('📁 Dossier: '+_saveDirHandle.name+' — actif pour cette session');
  } catch(e){
    if(e.name!=='AbortError') setStatus('Erreur sélection dossier');
  }
}

async function saveToFile(){
  if(!G){setStatus('Pas de partie en cours');return;}
  const aiLevel=parseInt(document.getElementById('ai-level')?.value||'6');
  const current=_buildUndoSnap();
  const rollback=_undoStack.slice(-2);
  const data={version:1,aiLevel,current,rollback};
  const filename='crapka_'+_localTs()+'.json';
  const json=JSON.stringify(data,null,2);

  if(_saveDirHandle){
    try{
      const fh=await _saveDirHandle.getFileHandle(filename,{create:true});
      const w=await fh.createWritable();
      await w.write(json);
      await w.close();
      setStatus('💾 Sauvegardé: '+filename);
      addMoveLog('💾 Sauvegarde: '+filename,'sys');
      return;
    } catch(e){ _saveDirHandle=null; /* permission perdue → fallback */ }
  }
  // Fallback : téléchargement classique
  const blob=new Blob([json],{type:'application/json'});
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
  else if(UI.netMode){topIdx=1-UI.pidx;botIdx=UI.pidx;}
  else{topIdx=0;botIdx=1;}
  let html='';
  html+=renderPzone(topIdx,true);
  html+=renderMiddle();
  html+=renderPzone(botIdx,false);
  const gameDiv=document.getElementById('game');
  gameDiv.innerHTML=html;
  // Ré-attacher le panneau de démarrage s'il existe (render() détruit innerHTML)
  if(_waitingToStart&&_startPanel){
    gameDiv.style.position='relative';
    gameDiv.appendChild(_startPanel);
  }
  showBtns();
  // Recalculer layout après chaque rendu (les éléments DOM existent maintenant)
  requestAnimationFrame(computeLayout);
}

function renderPzone(pidx, isTop=false){
  const p=G.players[pidx];
  const isActive=G.cur===pidx&&G.phase!=='game-over';
  const isAI=UI.vsAI&&pidx===UI.aiIdx;

  let h=`<div class="pzone ${isActive?'active':'inactive'}" data-pidx="${pidx}">`;
  h+=`<div class="prow${isTop?' prow-top':''}">`;

  // ── Crapette ──
  // Chaque joueur a deux "slots" de hauteur --ch dans cr-col, alignés avec les
  // deux rangées de right-col (main / défausse).
  // Adversaire (haut) : [slot-badge, crstack] → badge face à la main, crstack face à la défausse
  // Joueur    (bas)   : [crstack, slot-badge] → crstack face à la défausse, badge face à la main
  const crTop=peek(p.crapette);
  const crSel=UI.sel&&crTop&&UI.sel.card.uid===crTop.uid&&UI.sel.src.type==='crapette'?'sel':'';
  const crStack=`<div class="crstack">
      ${p.crapette.length>1?`<div class="card down back"></div>`:''}
      ${crTop
        ?`<div class="card ${crTop.color} ${crSel} front" data-crapette="${pidx}">
            <div class="ct">${crTop.value}</div><div class="cs">${crTop.suit}</div><div class="cb">${crTop.value}</div>
          </div>`
        :`<div class="slot front"><span class="slbl">Vide</span></div>`}
    </div>`;
  const crBadgeInner=`<div class="cr-badge">
        <div class="cr-badge-title">Crapette</div>
        <div class="cr-badge-count">${p.crapette.length}</div>
      </div>`;
  const crNameEl=`<div class="cr-name">${p.name}${isActive?' ▶':''}</div>`;
  // Adversaire (haut) : nom en haut, badge en bas — Joueur (bas) : badge en haut, nom en bas
  const crBadge=`<div class="cr-slot">${isTop?crNameEl+crBadgeInner:crBadgeInner+crNameEl}</div>`;
  const crHtml=`<div class="cr-col" onclick="clickCrapette(${pidx})">${isTop?crBadge:''}${crStack}${!isTop?crBadge:''}</div>`;

  // ── Défausses ──
  let dzoneHtml=`<div class="dzone">`;
  const diOrder=isTop?[3,2,1,0]:[0,1,2,3];
  for(const di of diOrder){
    const pile=p.defausse[di];
    const vtgt=pidx===G.cur&&isHumanTurn()&&UI.sel&&canOnDefausse(UI.sel.card,pile);
    const n=pile.length;const OFF=15;
    const isDemandable=pidx!==G.cur&&isHumanTurn()&&wasPlayableAtStartOfTurn(pidx,di);
    const totalH=n>0?`calc(var(--ch) + ${Math.max(0,n-1)*OFF}px)`:`var(--ch)`;
    dzoneHtml+=`<div class="dpile${vtgt?' vtgt':''}" style="height:${totalH}"
        data-def-slot="${pidx}-${di}"
        onclick="clickDefausse(${pidx},${di})">`;
    if(n===0){
      dzoneHtml+=`<div class="slot" style="position:absolute;inset:0;width:var(--cw);height:var(--ch);">
        <span class="slbl">D${di+1}</span></div>`;
    } else {
      for(let k=0;k<n;k++){
        const card=pile[k];const isTop2=k===n-1;
        const isSel=isTop2&&UI.sel&&UI.sel.card.uid===card.uid&&UI.sel.src.type==='defausse'&&UI.sel.src.index===di;
        const dem=isTop2&&isDemandable?'demandable':'';
        dzoneHtml+=`<div class="card ${card.color} ${isSel?'sel':''} ${dem} dcard"
          style="position:absolute;top:${k*OFF}px;z-index:${k+1};left:0;width:var(--cw);
            ${!isTop2?`height:${OFF}px;overflow:hidden;border-bottom:none;border-radius:5px 5px 0 0;`:''}"
          ${isTop2?`data-def-top="${pidx}-${di}"`:''}>
          <div class="ct">${card.value}${!isTop2?card.suit:''}</div>
          ${isTop2?`<div class="cs">${card.suit}</div><div class="cb">${card.value}</div>`:''}
        </div>`;
      }
    }
    dzoneHtml+=`</div>`;
  }
  dzoneHtml+=`</div>`; // dzone

  // ── Main ──
  let handHtml=`<div class="hand">`;
  if((isAI&&!_debugMode)||(UI.netMode&&pidx!==UI.pidx)){
    for(const card of p.hand) handHtml+=`<div class="card down" data-hand-uid="${card.uid}"></div>`;
  } else {
    for(const card of p.hand){
      const isSel=UI.sel&&UI.sel.card.uid===card.uid&&UI.sel.src.type==='hand';
      handHtml+=`<div class="card ${card.color} ${isSel?'sel':''}"
        onclick="clickHand(${card.uid})" data-hand-uid="${card.uid}">
        <div class="ct">${card.value}</div><div class="cs">${card.suit}</div><div class="cb">${card.value}</div>
      </div>`;
    }
    if(!p.hand.length) handHtml+=`<span style="color:var(--gold);font-size:0.7rem;align-self:center;cursor:pointer;text-decoration:underline dotted;" onclick="clickEmptyHand()">Main vide — piocher</span>`;
  }
  handHtml+=`</div>`; // hand

  // ── Assemblage ──
  if(isTop){
    h+=`<div class="right-col">${handHtml}${dzoneHtml}</div>`;
    h+=crHtml;
  } else {
    h+=crHtml;
    h+=`<div class="right-col">${dzoneHtml}${handHtml}</div>`;
  }

  h+=`</div></div>`; // prow + pzone
  return h;
}

function renderMiddle(){
  let h=`<div id="mid"><div class="mid-inner">`;

  // Pioche
  h+=`<div class="pioche-col">
    <div class="zone-lbl">Pioche</div>`;
  if(G.pioche.length){
    h+=`<div class="card down" onclick="clickPioche()" style="cursor:pointer;" title="Piocher" data-pioche></div>`;
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

let _gitHash = '';
fetch('/version').then(r=>r.json()).then(v=>{
  _gitHash = v.hash || '';
  if (!G) renderMenu();
}).catch(()=>{});

function _buildVerBadge(){
  const exp=window._EXPECTED||{};
  const actual={game:_VER_GAME,ai:_VER_AI,ui:_VER_UI,app:_VER_APP};
  const mismatches=Object.keys(actual).filter(k=>exp[k]&&actual[k]!==exp[k]);
  const maxVer=Object.values(actual).reduce((best,v)=>{
    const [a1,a2,a3]=(best||'0.0.0').split('.').map(Number);
    const [b1,b2,b3]=v.split('.').map(Number);
    return(b1>a1||(b1===a1&&b2>a2)||(b1===a1&&b2===a2&&b3>a3))?v:best;
  });
  const detail=Object.keys(actual).map(k=>{
    const ok=!exp[k]||actual[k]===exp[k];
    return k+':'+actual[k]+(ok?'':' ✗exp:'+exp[k]);
  }).join(' | ');
  const col=mismatches.length===0?'#2ecc71':'#e74c3c';
  const lbl=mismatches.length===0?'OK':'KO';
  const hash=_gitHash?' ('+_gitHash+')':'';
  return '<span style="color:'+col+';font-weight:bold;" title="'+detail+'">'+lbl+' v'+maxVer+hash+'</span>';
}

function showVersionModal(){
  const exp=window._EXPECTED||{};
  const actual={game:_VER_GAME,ai:_VER_AI,ui:_VER_UI,app:_VER_APP};
  let rows='';
  for(const [k,v] of Object.entries(actual)){
    const ok=!exp[k]||v===exp[k];
    rows+=`<div style="display:flex;justify-content:space-between;gap:16px;padding:3px 0;">
      <span style="color:var(--text2)">${k}</span>
      <span style="color:${ok?'#2ecc71':'#e74c3c'}">${v}${ok?'':` <span style="font-size:0.8em;opacity:0.7">(attendu ${exp[k]})</span>`}</span>
    </div>`;
  }
  const hashLine=_gitHash?`<div style="margin-top:10px;color:var(--text2);font-size:0.82em">Commit : ${_gitHash}</div>`:'';
  document.getElementById('mtitle').textContent='📦 Versions';
  document.getElementById('mbody').innerHTML=`<div style="font-size:0.88rem;text-align:left;min-width:200px">${rows}${hashLine}</div>`;
  const el=document.getElementById('mbtns');el.innerHTML='';
  const checkBtn=document.createElement('button');
  checkBtn.className='btn';checkBtn.id='btn-check-updates';
  checkBtn.textContent='🔄 Vérifier les mises à jour';
  checkBtn.onclick=checkForUpdates;
  el.appendChild(checkBtn);
  const closeBtn=document.createElement('button');
  closeBtn.className='btn';closeBtn.textContent='Fermer';
  closeBtn.onclick=closeModal;
  el.appendChild(closeBtn);
  document.getElementById('movl').classList.add('on');
}

async function checkForUpdates(){
  const btn=document.getElementById('btn-check-updates');
  if(!btn) return;
  btn.textContent='⏳ Vérification…';btn.disabled=true;
  try{
    const v=await fetch('/version?_='+Date.now()).then(r=>r.json());
    if(v.hash&&_gitHash&&v.hash!==_gitHash){
      btn.textContent='🆕 Mise à jour disponible ! Rechargement…';
      setTimeout(()=>{window.location.href=window.location.pathname+'?_='+Date.now();},700);
    } else {
      btn.textContent='✅ Déjà à jour';btn.disabled=false;
    }
  } catch{
    btn.textContent='❌ Pas de connexion';btn.disabled=false;
  }
}

function _pickAI(onPick){
  const profiles=Object.entries(_AI_REGISTRY)
    .filter(([key])=>!window._AI_CONFIG||window._AI_CONFIG[key]!==false);
  const btns=profiles.map(([key,p])=>({label:p.name,fn:()=>{closeModal();onPick(key,p.name);}}));
  btns.push({label:'← Retour',fn:()=>closeModal()});
  showModal('Choisir un adversaire','Quelle IA veux-tu affronter ?',btns);
}

function startSoloOrResume(){
  const snap=loadDebugSnap();
  if(snap&&snap.vsAI&&snap.phase!=='game-over'&&snap.winner==null){
    showModal(
      '🃏 Partie en cours',
      'Tu veux reprendre la partie d\'avant ou tu étais tellement mal barré que tu préfères que je te laisse une chance avec une nouvelle partie ?',
      [
        {label:'↩ Reprendre',fn:()=>{
          closeModal();
          _restoreFromSnap(snap);
          setStatus('Partie reprise.');
          fetch('/solo/ping',{method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({uuid:getUUID(),name:getPlayerName(),moves:_moveCount||0})}).catch(()=>{});
          if(UI.vsAI&&G&&G.cur===UI.aiIdx&&G.phase==='play'&&!(_stepMode&&_debugMode))
            setTimeout(aiPlayTurn,300);
        }},
        {label:'🎲 Nouvelle partie',fn:()=>_pickAI((key,name)=>newGame(true,name,key))},
      ]
    );
  } else {
    _pickAI((key,name)=>newGame(true,name,key));
  }
}

function renderMenu(){
  const _sess = _loadSession();
  const resumeBtn = _sess
    ? `<button class="btn" style="padding:13px;font-size:0.95rem;background:var(--gold);color:var(--bg);font-weight:bold;"
         onclick="netReconnect(_loadSession())">
         ↩ Reprendre ${_sess.roomCode}
       </button>` : '';
  document.getElementById('game').innerHTML=`
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;
                height:100%;gap:18px;padding:20px;">
      <div style="text-align:center;">
        <div style="font-size:2.8rem">🃏</div>
        <h2 style="color:var(--gold);font-size:1.7rem;letter-spacing:3px;margin-top:4px">CrapKa</h2>
        <p style="color:var(--text2);margin-top:6px;font-size:0.82rem">Le jeu de cartes familial</p>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;width:100%;max-width:230px;">
        ${resumeBtn}
        <button class="btn" style="padding:13px;font-size:0.95rem;background:var(--bg3);" onclick="startSoloOrResume()">
          🤖 Contre l'IA
        </button>
        <button class="btn" style="padding:13px;font-size:0.95rem;" onclick="showNetCreatePanel()">
          🌐 Créer une partie
        </button>
        <button class="btn" style="padding:13px;font-size:0.95rem;background:var(--bg3);" onclick="showNetJoinPanel()">
          🔗 Rejoindre une partie
        </button>
      </div>
      <button onclick="showVersionModal()" style="background:none;border:none;cursor:pointer;font-size:0.65rem;color:inherit;padding:10px 0;width:100%;">${_buildVerBadge()}</button>
    </div>`;
}

function showBtns(){
  if(!G||G.phase==='game-over') return;
  if(_debugMode) _updateStepUI();
}

// ══════════════════════════════════════════════
// LOG
// ══════════════════════════════════════════════
let _moveCount=0;
// ── Tooltip BF ──────────────────────────────────────────────────────────────
let _bfTip=null;
function _getBFTip(){
  if(!_bfTip){
    _bfTip=document.createElement('div');
    _bfTip.id='bf-tip';
    document.body.appendChild(_bfTip);
    document.addEventListener('mousemove',e=>{
      if(!_bfTip.classList.contains('visible')) return;
      const x=e.clientX+14,y=e.clientY+10;
      const tw=_bfTip.offsetWidth,th=_bfTip.offsetHeight;
      _bfTip.style.left=Math.min(x,window.innerWidth-tw-6)+'px';
      _bfTip.style.top=(y+th>window.innerHeight?e.clientY-th-6:y)+'px';
    });
  }
  return _bfTip;
}

function renderBFSeq(){
  _T('renderBFSeq','seqs='+(window._dbgBFSequences?window._dbgBFSequences.length:0));
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
  const expCount=window._dbgBFExpansions!=null?' · '+window._dbgBFExpansions+' exp':'';
  title.textContent='Séquences BF ('+seqs.length+expCount+')';
  let bestEl=null;
  for(const s of seqs){
    const e=document.createElement('div');
    e.className='mle '+(s.isBest?'bf-best':'bf-other');
    if(s.breakdown) e.dataset.eval=s.breakdown;
    // Score
    let html=s.score.toFixed(1)+'#';
    if(!s.moves.length){
      html+='(fin)';
    } else {
      html+=s.moves.map((mv,idx)=>{
        const meta=(s.moveMeta&&s.moveMeta[idx])||{};
        const isPost=(s.triggerIdx??-1)!==-1&&idx>s.triggerIdx;
        const txt=_fmtMove(mv);
        const isTrigger=meta.isCrapettePlay||meta.handEmptied||meta.isClear;
        const inner=isTrigger?'<u>'+txt+'</u>':txt;
        // Priorité haute : coups de crapette et coups activant la crapette → vert gras
        if(meta.isCrapettePlay||meta.isOnPath) return '<b style="color:#2ecc71">'+inner+'</b>';
        // Vidage de main → gras (souligné si c'est le coup exact)
        if(meta.handEmptied) return '<b>'+inner+'</b>';
        // Post-déclencheur → italique grisé (après crapette/vidage/recyclage)
        if(isPost) return '<i style="color:var(--text2);font-size:0.88em">'+txt+'</i>';
        return inner;
      }).join(' | ');
    }
    const hs=s.handScore||0;
    html+=' <span style="color:var(--text2);font-size:0.75em">(M:'+(hs>=0?'+':'')+hs.toFixed(0)+')</span>';
    e.innerHTML=html;
    e.addEventListener('mouseenter',()=>{
      if(!e.dataset.eval) return;
      const tip=_getBFTip();
      tip.textContent=e.dataset.eval;
      tip.classList.add('visible');
    });
    e.addEventListener('mouseleave',()=>_getBFTip().classList.remove('visible'));
    panel.appendChild(e);
    if(s.isBest) bestEl=e;
  }
  panel.classList.add('visible');
  if(bestEl) bestEl.scrollIntoView({block:'nearest'});
}

function hideBFSeq(){
  _T('hideBFSeq','pinned='+_bfSeqPinned);
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
    _etStart=Date.now(); window._execTrace=[]; window._traceSeq=0;
    _T('toggleDebug:ON');
    _traceState('debug:ON');
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
  // Désactiver pendant l'animation entre deux étapes (évite la race condition)
  const busy=_replayingAI&&!_stepResolve;
  btn.disabled=busy;
  btn.style.opacity=busy?'0.4':'1';
  btn.textContent=_stepResolve?'▶':'▶ IA';
  // Bouton toggle séquences : visible dès que le mode debug est actif
  const tbtn=document.getElementById('btn-seq-toggle');
  if(tbtn){
    tbtn.style.display=_debugMode?'inline-block':'none';
    tbtn.style.background=_bfSeqPinned?'var(--green)':'var(--bg3)';
  }
  // Boutons trace : visibles en mode debug
  const btrace=document.getElementById('btn-trace');
  const btdl=document.getElementById('btn-trace-dl');
  if(btrace) btrace.style.display=_debugMode?'inline-block':'none';
  if(btdl) btdl.style.display=(_debugMode&&window._traceLog&&window._traceLog.length)?'inline-block':'none';
  // Bouton exec trace download : visible si buffer non vide
  const betdl=document.getElementById('btn-etrace-dl');
  if(betdl) betdl.style.display=(_debugMode&&window._execTrace&&window._execTrace.length)?'inline-block':'none';
  // Boutons saves serveur : visibles en mode debug
  const bsrvsave=document.getElementById('btn-srv-save');
  const bsrvload=document.getElementById('btn-srv-load');
  if(bsrvsave) bsrvsave.style.display=_debugMode?'inline-block':'none';
  if(bsrvload) bsrvload.style.display=_debugMode?'inline-block':'none';
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
  _T('toggleStepMode','sM='+_stepMode);
  _updateStepUI();
  setStatus(_stepMode?'Pas-à-pas activé — cliquez ▶ pour chaque coup IA':'Pas-à-pas désactivé');
}

function stepNext(){
  if(_stepResolve){
    _T('stepNext:fire','calling resolve');
    const fn=_stepResolve;
    _stepResolve=null;
    _T('stepNext:sR=null');
    _updateStepUI();
    fn();
  } else {
    _T('stepNext:no-resolve');
  }
}

// ══════════════════════════════════════════════
// EXEC TRACE — buffer circulaire 1000 entrées, actif si _debugMode
// ══════════════════════════════════════════════
let _etStart=Date.now();
function _T(tag,extra){
  if(!_debugMode) return;
  if(!window._execTrace) window._execTrace=[];
  const ms=Date.now()-_etStart;
  const s='sR='+(_stepResolve?'T':'F')+' rAI='+(_replayingAI?'T':'F')+' sM='+(_stepMode?'T':'F');
  const line='[+'+ms+'ms] '+tag+' | '+s+(extra?' | '+extra:'');
  window._execTrace.push(line);
  if(window._execTrace.length>2000) window._execTrace.shift();
}
function downloadExecTrace(){
  if(!window._execTrace||!window._execTrace.length){setStatus('Exec trace vide');return;}
  // BOM UTF-8 pour que Windows ouvre correctement le fichier
  const bom='\uFEFF';
  const verHdr='[versions] game:'+_VER_GAME+' ai:'+_VER_AI+' ui:'+_VER_UI+' app:'+_VER_APP;
  const txt=bom+verHdr+'\n'+window._execTrace.join('\n');
  const blob=new Blob([txt],{type:'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='exec_'+_localTs()+'.txt';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  setStatus('Exec trace téléchargée ('+window._execTrace.length+' lignes)');
}

// ══════════════════════════════════════════════
// TRACE MODE
// ══════════════════════════════════════════════
let _traceMode=false;

function toggleTrace(){
  _traceMode=!_traceMode;
  if(_traceMode){window._traceLog=[];window._traceSeq=0;}
  const btn=document.getElementById('btn-trace');
  if(btn){btn.style.background=_traceMode?'var(--accent)':'var(--bg3)';btn.textContent=_traceMode?'🔍ON':'🔍';}
  _updateStepUI();
  setStatus(_traceMode?'Trace activée — jouez puis téléchargez ⬇':'Trace désactivée');
}

function downloadTrace(){
  if(!window._traceLog||!window._traceLog.length){setStatus('Trace vide');return;}
  const bom='\uFEFF';
  const verHdr='[versions] game:'+_VER_GAME+' ai:'+_VER_AI+' ui:'+_VER_UI+' app:'+_VER_APP;
  const txt=bom+verHdr+'\n'+window._traceLog.join('\n');
  const blob=new Blob([txt],{type:'text/plain;charset=utf-8'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.download='trace_'+_localTs()+'.txt';
  a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  setStatus('Trace téléchargée ('+window._traceLog.length+' lignes)');
}

// Ajoute une ligne au log trace — écrit dans exec trace ET _traceLog (si _traceMode)
function _tlog(line){
  if(_debugMode){
    if(!window._execTrace) window._execTrace=[];
    window._execTrace.push(line);
    if(window._execTrace.length>2000) window._execTrace.shift();
  }
  if(!_traceMode) return;
  if(!window._traceLog) window._traceLog=[];
  window._traceLog.push(line);
  if(window._traceLog.length>5000) window._traceLog.splice(0,500);
}

// Trace l'état courant du jeu — actif dès que _debugMode (pas besoin de 🔍)
function _traceState(label){
  if(!_debugMode||!G) return;
  if(!window._traceSeq) window._traceSeq=0;
  const seq=++window._traceSeq;
  const ai=G.players[UI.aiIdx],hu=G.players[1-UI.aiIdx];
  const crAI=ai.crapette.length?ai.crapette[ai.crapette.length-1]:null;
  const crHU=hu.crapette.length?hu.crapette[hu.crapette.length-1]:null;
  const piles=G.commons.map((p,i)=>{
    if(!p.length) return 'P'+(i+1)+':∅';
    const t=p[p.length-1];
    const kv=UI.pileKingVal[i];
    return 'P'+(i+1)+':'+(kv!==null?'R('+kv+')':t.value+t.suit)+'['+p.length+']';
  }).join(' ');
  _tlog('');
  _tlog('══ #'+seq+' '+label+' ══ cur='+G.cur+'('+G.players[G.cur].name+') phase='+G.phase+' sR='+(_stepResolve?'T':'F')+' rAI='+(_replayingAI?'T':'F'));
  _tlog('  Piles: '+piles);
  _tlog('  AI  Cr:'+(crAI?crAI.value+crAI.suit+'('+ai.crapette.length+')'  :'∅')+' Main:['+ai.hand.map(c=>c.value+c.suit).join(' ')+'] Def:['+ai.defausse.map(d=>{const t=d.length?d[d.length-1]:null;return t?t.value+t.suit:'_';}).join(' ')+']');
  _tlog('  HU  Cr:'+(crHU?crHU.value+crHU.suit+'('+hu.crapette.length+')'  :'∅')+' Main:['+hu.hand.map(c=>c.value+c.suit).join(' ')+'] Def:['+hu.defausse.map(d=>{const t=d.length?d[d.length-1]:null;return t?t.value+t.suit:'_';}).join(' ')+']');
  _tlog('  Pioche:'+G.pioche.length+' Recyclage:'+G.futurePioche.length);
  if(G.startDefSnap) _tlog('  StartDef:'+G.startDefSnap.map((p,i)=>{const t=p.length?p[p.length-1]:null;return 'D'+(i+1)+':'+(t?t.value+t.suit:'_');}).join(' '));
}

// Trace les résultats BF (top séquences)
function _traceBF(sequences,best,aiIdx){
  if(!_debugMode) return;
  _tlog('  BF: '+sequences.length+' séquences terminées');
  const top=sequences.slice(0,8);
  for(const s of top){
    const flag=s.isBest?'★ ':'  ';
    const moves=s.moves.map((m,idx)=>{
      const meta=(s.moveMeta&&s.moveMeta[idx])||{};
      const isPost=(s.triggerIdx??-1)!==-1&&idx>s.triggerIdx;
      const txt=_fmtMove(m);
      if(isPost) return '*'+txt+'*';
      if(meta.isOnPath) return '>>>'+txt+'<<<';
      if(meta.handEmptied||meta.isCrapettePlay||meta.isClear) return '_'+txt+'_';
      return txt;
    }).join(' | ')||'(fin)';
    _tlog('  '+flag+s.score.toFixed(1)+'[M:'+(s.handScore||0).toFixed(0)+'] '+moves);
  }
  if(sequences.length>8) _tlog('  ... ('+(sequences.length-8)+' autres)');
  if(!best) _tlog('  !! AUCUNE séquence choisie');
}

// Trace un move appliqué
function _traceMove(label,mv){
  if(!_debugMode) return;
  _tlog('  >> '+label+': '+_fmtMove(mv));
}

function stepOrPlay(){
  _T('stepOrPlay',_stepResolve?'has-resolve':'no-resolve rAI='+_replayingAI);
  if(_stepResolve) stepNext();
  // Ne pas relancer aiPlayTurn pendant un replay en cours (animation entre deux étapes)
  else if(!_replayingAI&&UI.vsAI&&G&&G.cur===UI.aiIdx) aiPlayTurn();
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

let _startPanel=null;

function showStartModal(first, reason){
  _waitingToStart=true;
  // Supprimer un éventuel panneau résiduel
  if(_startPanel){_startPanel.remove();_startPanel=null;}
  const old=document.getElementById('start-panel');if(old)old.remove();

  const name=G.players[first].name;
  const panel=document.createElement('div');
  panel.id='start-panel';
  panel.style.cssText=
    'position:absolute;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;'
    +'background:rgba(0,0,0,0.55);pointer-events:auto;';

  const box=document.createElement('div');
  box.style.cssText=
    'background:var(--bg2);border:1px solid var(--bg3);border-radius:8px;'
    +'padding:22px 28px;display:flex;flex-direction:column;align-items:center;gap:12px;'
    +'max-width:320px;text-align:center;';

  const verBadge=_buildVerBadge();
  box.innerHTML=
    '<div style="font-size:1.4rem">🃏</div>'
    +'<div><b style="font-size:1.05em;color:var(--gold)">'+name+'</b> commence'
    +'<br><span style="color:var(--text2);font-size:0.82em">'+reason+'</span></div>'
    +'<div style="font-size:0.68em;font-family:monospace;margin-top:2px;">'+verBadge+'</div>';

  const btn=document.createElement('button');
  btn.className='btn red';
  btn.style.cssText='padding:10px 32px;font-size:1rem;margin-top:4px;';
  btn.textContent='▶ Lancer la partie';
  btn.onclick=()=>{
    panel.remove();_startPanel=null;
    _waitingToStart=false;
    if(UI.vsAI&&G.cur===UI.aiIdx){
      if(_stepMode&&_debugMode) setStatus('[PàP] Tour de '+G.players[G.cur].name+' — ▶ pour lancer');
      else setTimeout(aiPlayTurn,300);
    }
  };

  box.appendChild(btn);
  panel.appendChild(box);
  _startPanel=panel;

  // S'insère dans #game (pas #game-col) pour ne pas couvrir le header
  const gameDiv=document.getElementById('game');
  if(gameDiv){gameDiv.style.position='relative';gameDiv.appendChild(panel);}
  else document.body.appendChild(panel);
}

function showMenu(){
  closeModal();
  const ov=document.getElementById('victory-overlay');if(ov)ov.remove();
  if(_startPanel){_startPanel.remove();_startPanel=null;}
  _waitingToStart=false;
  if(UI.netMode) netDisconnect();
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
    versions:{game:_VER_GAME,ai:_VER_AI,ui:_VER_UI,app:_VER_APP},
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
  const isMobilePortrait=window.innerWidth<window.innerHeight&&window.innerWidth<900;

  const totalW=window.innerWidth;
  const totalH=window.innerHeight;
  const hdrH=document.getElementById('hdr').offsetHeight||32;
  const statusH=document.getElementById('status').offsetHeight||22;

  let gameW,gameH;
  if(isMobilePortrait){
    // Portrait mobile : sidebar en bas, pleine largeur
    const logH=document.getElementById('sidebar').offsetHeight||72;
    gameW=totalW;
    gameH=totalH-hdrH-statusH-logH;
  } else {
    // Desktop / paysage : sidebar à droite
    const sideW=parseInt(getComputedStyle(root).getPropertyValue('--log-w'))||115;
    const abarH=document.getElementById('abar').offsetHeight||32;
    gameW=totalW-sideW-5; // 5px resizer
    gameH=totalH-hdrH-statusH-abarH;
    // Font log adaptative à la largeur du sidebar
    root.style.setProperty('--log-fs',Math.max(8,Math.min(11,Math.round(sideW/12)))+'px');
  }

  // Taille des cartes déterminée par la hauteur disponible.
  // Layout : pzone(top) + mid(1 ligne) + pzone(bot)
  // pzone ≈ label(18px) + prow(ch) + hand(ch) + gaps ≈ 2*ch + 50px  (×2)
  // mid   ≈ ch + 20px
  // Total ≈ 5*ch + 120px  → ch = (gameH - 120) / 5  → cw = ch / 1.41
  const cwFromH=Math.floor((gameH-120)/5/1.41);

  // Contrainte horizontale : right-col empile défausses et main → max = 5 cols (main)
  // pzone = cr(1) + gap + right-col(5) = 6 cols + marges (~40px)
  // → cw = (gameW - 40) / 6
  const cwFromW=Math.floor((gameW-40)/6);

  // La hauteur fixe la taille idéale ; la largeur la réduit si elle manque.
  let cw=Math.min(62,cwFromH);
  if(cw>cwFromW) cw=cwFromW;
  cw=Math.max(20,cw); // plancher absolu pour rester lisible
  let ch=Math.round(cw*1.41); // ratio carte standard

  root.style.setProperty('--cw',cw+'px');
  root.style.setProperty('--ch',ch+'px');
  root.style.setProperty('--cf',Math.max(8,Math.round(cw*0.22))+'px');
  root.style.setProperty('--cs',Math.max(10,Math.round(cw*0.38))+'px');

  // Décale la zone adverse pour aligner cr-col sur la colonne Recyclage.
  // Mesure les positions réelles dans le DOM pour être indépendant du navigateur.
  root.style.setProperty('--prow-top-pr','0px'); // reset → getBoundingClientRect force un reflow avec les nouvelles vars
  const fpioche = document.querySelector('.fpioche-col');
  const prowTop = document.querySelector('.prow-top');
  if (fpioche && prowTop) {
    const pr = Math.max(0, prowTop.getBoundingClientRect().right - fpioche.getBoundingClientRect().right);
    root.style.setProperty('--prow-top-pr', pr + 'px');
  }
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
    const newW=Math.max(50,Math.min(window.innerWidth*0.75,startW+dx));
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
window.addEventListener('orientationchange',()=>{setTimeout(computeLayout,50);});

// ══════════════════════════════════════════════
// ANIMATION VICTOIRE (D8)
// ══════════════════════════════════════════════
async function showStats(){
  const title=document.getElementById('mtitle');
  const body=document.getElementById('mbody');
  const btns=document.getElementById('mbtns');
  title.textContent='📊 Statistiques';
  body.innerHTML='<p style="color:var(--text2);text-align:center">Chargement…</p>';
  btns.innerHTML='';
  const btn=document.createElement('button');btn.className='btn';btn.textContent='Fermer';btn.onclick=closeModal;btns.appendChild(btn);
  document.getElementById('movl').classList.add('on');

  let data;
  try {
    const resp=await fetch(_NET_HTTP+'/stats');
    if(!resp.ok) throw new Error('HTTP '+resp.status);
    data=await resp.json();
  } catch(e) {
    body.innerHTML='<p style="color:var(--text2);text-align:center">Erreur : '+e.message+'</p>';
    return;
  }

  const players=Object.entries(data).sort((a,b)=>b[1].games-a[1].games);
  if(!players.length){
    body.innerHTML='<p style="color:var(--text2);text-align:center">Aucune partie enregistrée.</p>';
    return;
  }

  const pct=(w,g)=>g>0?Math.round(w/g*100)+'%':'—';
  let html='<table style="width:100%;border-collapse:collapse;font-size:0.82rem;">';
  html+='<thead><tr style="color:var(--text2);border-bottom:1px solid var(--bg3);">'
       +'<th style="text-align:left;padding:4px 6px;">Joueur</th>'
       +'<th style="padding:4px 4px;">P</th>'
       +'<th style="padding:4px 4px;color:var(--gold);">V</th>'
       +'<th style="padding:4px 4px;">D</th>'
       +'<th style="padding:4px 4px;">%</th>'
       +'</tr></thead><tbody>';

  for(const [name,st] of players){
    html+=`<tr style="border-bottom:1px solid var(--bg3);">
      <td style="padding:5px 6px;font-weight:bold;color:var(--gold)">${_esc(name)}</td>
      <td style="text-align:center;padding:5px 4px;">${st.games}</td>
      <td style="text-align:center;padding:5px 4px;color:var(--gold)">${st.wins}</td>
      <td style="text-align:center;padding:5px 4px;">${st.losses}</td>
      <td style="text-align:center;padding:5px 4px;">${pct(st.wins,st.games)}</td>
    </tr>`;
    for(const [opp,vs] of Object.entries(st.vs).sort((a,b)=>b[1].games-a[1].games)){
      html+=`<tr style="background:var(--bg2);">
        <td style="padding:3px 6px 3px 18px;color:var(--text2);font-style:italic;">↳ vs ${_esc(opp)}</td>
        <td style="text-align:center;padding:3px 4px;color:var(--text2);">${vs.games}</td>
        <td style="text-align:center;padding:3px 4px;color:var(--text2);">${vs.wins}</td>
        <td style="text-align:center;padding:3px 4px;color:var(--text2);">${vs.losses}</td>
        <td style="text-align:center;padding:3px 4px;color:var(--text2);">${pct(vs.wins,vs.games)}</td>
      </tr>`;
    }
  }
  html+='</tbody></table>';
  body.innerHTML=html;
}

function _esc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function loadServerSaves(){
  try{
    const saves=await fetch('/saves').then(r=>r.json());
    if(!saves.length){setStatus('Aucun save serveur disponible');return;}
    const btns=saves.map(s=>({
      label:(s.name||s.id).slice(0,34)+(s.ai_name?' ['+s.ai_name+']':''),
      fn:async()=>{
        closeModal();
        try{
          const data=await fetch('/saves/'+s.id).then(r=>r.json());
          if(!data||!data.snap){setStatus('Erreur chargement save');return;}
          _restoreFromSnap(data.snap);
          setStatus('📂 Srv: '+s.name);
          addMoveLog('📂 Srv load: '+s.name,'sys');
          if(UI.vsAI&&G&&G.cur===UI.aiIdx&&G.phase==='play'&&!(_stepMode&&_debugMode))
            setTimeout(aiPlayTurn,300);
        }catch(e){setStatus('Erreur chargement: '+e.message);}
      }
    }));
    btns.push({label:'← Fermer',fn:()=>closeModal()});
    showModal('Saves serveur','',btns);
  }catch(e){setStatus('Erreur: '+e.message);}
}

async function saveToServer(){
  if(!G){setStatus('Pas de partie en cours');return;}
  const name=prompt('Nom du save:','save-'+_localTs());
  if(name===null)return;
  const snap=_buildUndoSnap();
  const aiName=UI.vsAI?G.players[UI.aiIdx].name:'';
  try{
    const r=await fetch('/saves',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({snap,ai_name:aiName,name:(name.trim()||('save-'+_localTs()))})}).then(r=>r.json());
    if(r.ok){setStatus('💾 Srv: '+r.name);addMoveLog('💾 Srv: '+r.name,'sys');}
    else setStatus('Erreur save serveur');
  }catch(e){setStatus('Erreur: '+e.message);}
}

function showVictory(winnerIdx){
  if(!G) return;
  const existing=document.getElementById('victory-overlay');
  if(existing) existing.remove();
  if(!UI.netMode && G.winner !== null){
    const w=G.players[G.winner].name;
    const l=G.players[1-G.winner].name;
    fetch('/solo/end',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({uuid:getUUID(),winner:w,loser:l,
        ai_name:UI.vsAI?G.players[UI.aiIdx].name:null})}).catch(()=>{});
    if(UI.vsAI&&UI.serverSaveId){
      fetch('/saves/'+UI.serverSaveId,{method:'DELETE'}).catch(()=>{});
      UI.serverSaveId=null;
    }
    try{localStorage.removeItem('crapka_debug');}catch(e){}
  }
  const humanWon=UI.netMode?(winnerIdx===UI.pidx):(!UI.vsAI||winnerIdx!==UI.aiIdx);
  const name=G.players[winnerIdx].name;
  const ov=document.createElement('div');
  ov.id='victory-overlay';
  ov.className=humanWon?'win':'lose';
  ov.onclick=()=>showMenu();
  if(humanWon){
    const suits=['♠','♥','♦','♣','♠','♥','♦','♣'];
    const flyCards=Array.from({length:20},(_,i)=>{
      const angle=(i/20)*2*Math.PI;
      const r=280+Math.floor(Math.random()*180);
      const dx=(Math.cos(angle)*r).toFixed(0);
      const dy=(Math.sin(angle)*r).toFixed(0);
      const rot=(Math.floor(Math.random()*1440)-720);
      const delay=(i*0.04).toFixed(2);
      return `<div class="fly-card" style="--dx:${dx}px;--dy:${dy}px;--rot:${rot}deg;--delay:${delay}s">${suits[i%suits.length]}</div>`;
    }).join('');
    const sub=UI.vsAI?'Tu as vidé ta crapette !':name+' a vidé sa crapette !';
    ov.innerHTML=`
      <div class="fly-cards-bg">${flyCards}</div>
      <div id="victory-box">
        <div class="victory-icon">🏆</div>
        <div id="victory-name">Victoire !</div>
        <div id="victory-sub">${sub}</div>
        <div class="victory-click">— cliquer pour continuer —</div>
      </div>`;
  } else {
    ov.innerHTML=`
      <div id="victory-box">
        <div class="victory-icon">😞</div>
        <div id="victory-name">Défaite...</div>
        <div id="victory-sub">${name} a vidé sa crapette.</div>
        <div class="victory-click">— cliquer pour continuer —</div>
      </div>`;
  }
  document.body.appendChild(ov);
  ov.getBoundingClientRect();
  ov.classList.add('visible');
}

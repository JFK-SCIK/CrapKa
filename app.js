// ══════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════
const _VER_APP='1.2.2';
if (location.port === '8001') {
  const b = document.createElement('span');
  b.id = 'preprod-badge';
  b.textContent = 'PRÉPROD';
  document.querySelector('#hdr h1').append(b);
}
computeLayout();
renderMenu();

// Récupère la config IA (profils activés/désactivés) puis enregistre les profils connus
(async()=>{
  try{
    const cfg=await fetch('/ai/config').then(r=>r.json()).catch(()=>({profiles:[]}));
    window._AI_CONFIG={};
    for(const p of (cfg.profiles||[])) _AI_CONFIG[p.key]=p.enabled!==false;
  }catch(e){}
  try{
    const profiles=Object.entries(_AI_REGISTRY).map(([key,p])=>({key,name:p.name}));
    fetch('/ai/register',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({profiles})}).catch(()=>{});
  }catch(e){}
})();

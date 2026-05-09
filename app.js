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

// Récupère la config IA (profils activés/désactivés)
fetch('/ai/config').then(r=>r.json()).then(cfg=>{
  window._AI_CONFIG={};
  for(const p of (cfg.profiles||[])) _AI_CONFIG[p.key]=p.enabled!==false;
}).catch(()=>{});

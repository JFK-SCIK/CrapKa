// ══════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════
const _VER_APP='1.2.1';
if (location.port === '8001') {
  const b = document.createElement('div');
  b.id = 'preprod-badge';
  b.textContent = 'PRÉPROD';
  document.body.appendChild(b);
}
computeLayout();
renderMenu();

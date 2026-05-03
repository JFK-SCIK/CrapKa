// ══════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════
const _VER_APP='1.2.1';
if (location.port === '8001') {
  const b = document.createElement('span');
  b.id = 'preprod-badge';
  b.textContent = 'PRÉPROD';
  document.querySelector('#hdr h1').append(b);
}
computeLayout();
renderMenu();

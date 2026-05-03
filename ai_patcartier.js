// ══════════════════════════════════════════════
// IA — PROFIL PATCARTIER (stub)
// ══════════════════════════════════════════════
const _VER_AI_PATCARTIER='0.1.0';

// Profil PatCartier : heuristique réécrite centrée sur la "route vers la crapette".
// Pour l'instant, délègue vers Tibolos le temps que la vraie heuristique soit développée.
const AI_PATCARTIER={...AI_TIBOLOS, name:'PatCartier'};

_AI_REGISTRY['patcartier']=AI_PATCARTIER;

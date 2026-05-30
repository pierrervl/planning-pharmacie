/* Jours de garde de la pharmacie */
'use strict';

/* Renvoie le libellé du jour de garde ou null --------------------------- */
function getGardeLabel(dateIso) {
  const g = (STATE.gardes || []).find(x => x.date === dateIso);
  return g ? (g.label || 'Garde') : null;
}

/* Version courte pour affichage en en-tête de colonne ------------------- */
function shortGardeLabel(label) {
  if (!label || label === 'Garde') return 'Garde';
  return label.length > 10 ? label.slice(0, 9) + '…' : label;
}

/* Liste triée des gardes pour une année --------------------------------- */
function collectGardesForYear(year) {
  return (STATE.gardes || [])
    .filter(g => g.date.startsWith(String(year)))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/* Jours fériés français */
'use strict';

/* Calcul de Pâques par l'algorithme de Gauss ---------------------------- */
function easterDate(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19*a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2*e + 2*i - h - k) % 7;
  const m = Math.floor((a + 11*h + 22*l) / 451);
  const month = Math.floor((h + l - 7*m + 114) / 31);   // 3 = mars, 4 = avril
  const day = ((h + l - 7*m + 114) % 31) + 1;
  return new Date(year, month-1, day, 12, 0, 0, 0);
}

/* Renvoie un objet { 'YYYY-MM-DD': 'libellé' } pour l'année ------------- */
function feriesForYear(year) {
  const out = {};
  // Fériés fixes
  out[`${year}-01-01`] = "Jour de l'an";
  out[`${year}-05-01`] = 'Fête du Travail';
  out[`${year}-05-08`] = 'Victoire 1945';
  out[`${year}-07-14`] = 'Fête nationale';
  out[`${year}-08-15`] = 'Assomption';
  out[`${year}-11-01`] = 'Toussaint';
  out[`${year}-11-11`] = 'Armistice 1918';
  out[`${year}-12-25`] = 'Noël';
  // Fériés mobiles (à partir de Pâques)
  const easter = easterDate(year);
  out[toISO(addDays(easter, 1))]  = 'Lundi de Pâques';
  out[toISO(addDays(easter, 39))] = 'Ascension';
  out[toISO(addDays(easter, 50))] = 'Lundi de Pentecôte';
  return out;
}

/* Renvoie le libellé du jour férié ou null. Tient compte des ajouts/retraits. */
function getFerieLabel(dateIso) {
  // retirés
  if (STATE.feriesRemove.includes(dateIso)) return null;
  // ajoutés (personnalisés)
  const custom = STATE.feriesAdd.find(f => f.date === dateIso);
  if (custom) return custom.label;
  // auto
  const y = parseInt(dateIso.slice(0,4), 10);
  const map = feriesForYear(y);
  return map[dateIso] || null;
}

/* Version courte pour affichage (3-7 caractères) ------------------------ */
function shortFerieLabel(label) {
  const map = {
    "Jour de l'an":'F-Nouv.an',
    'Fête du Travail':'F-Travail',
    'Victoire 1945':'F-V1945',
    'Fête nationale':'F-14Juil',
    'Assomption':'F-Assomp',
    'Toussaint':'F-Touss',
    'Armistice 1918':'F-Arm.',
    'Noël':'F-Noël',
    'Lundi de Pâques':'F-Pâques',
    'Ascension':'F-Ascens',
    'Lundi de Pentecôte':'F-Pent.'
  };
  return map[label] || ('F-' + label.slice(0, 6));
}

/* Utilitaires dates (fuseau local) */
'use strict';

const DAY_NAMES_LONG  = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const DAY_NAMES_SHORT = ['Di','Lu','Ma','Me','Je','Ve','Sa'];
const DAY_NAMES_ABBR  = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
const MONTH_NAMES = [
  'Janvier','Février','Mars','Avril','Mai','Juin',
  'Juillet','Août','Septembre','Octobre','Novembre','Décembre'
];

/* Date d'aujourd'hui en ISO YYYY-MM-DD (heure locale) ------------------- */
function todayISO() {
  return toISO(new Date());
}

/* Date → 'YYYY-MM-DD' en heure locale (PAS d'UTC) ----------------------- */
function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

/* Parse 'YYYY-MM-DD' en Date locale (midi pour éviter glissements) ------ */
function fromISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m-1, d, 12, 0, 0, 0);
}

/* Ajoute N jours à une Date (retourne une nouvelle Date) ---------------- */
function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/* Différence en jours entre deux dates ISO (b - a) ---------------------- */
function diffDays(aIso, bIso) {
  const a = fromISO(aIso);
  const b = fromISO(bIso);
  return Math.round((b - a) / 86400000);
}

/* Numéro de semaine ISO ------------------------------------------------- */
function getISOWeek(d) {
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7; // 0 = lundi
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - target) / 604800000);
}

/* Année ISO (pour Mw-W01 etc.) ------------------------------------------ */
function getISOWeekYear(d) {
  const target = new Date(d.valueOf());
  target.setDate(target.getDate() + 3 - ((d.getDay() + 6) % 7));
  return target.getFullYear();
}

/* Lundi de la semaine contenant la date donnée -------------------------- */
function mondayOf(d) {
  const r = new Date(d);
  const day = (r.getDay() + 6) % 7; // 0 = lundi
  r.setDate(r.getDate() - day);
  r.setHours(12,0,0,0);
  return r;
}

/* Lundi de la semaine ISO (année ISO + numéro 1–53) --------------------- */
function mondayOfISOWeek(isoYear, isoWeek) {
  const jan4 = new Date(isoYear, 0, 4, 12, 0, 0, 0);
  const week1Mon = mondayOf(jan4);
  return addDays(week1Mon, (isoWeek - 1) * 7);
}

/* Index 0=lundi..6=dimanche -------------------------------------------- */
function weekDayIndex(d) {
  return (d.getDay() + 6) % 7;
}

/* Format français court : '24 mai 2026' --------------------------------- */
function frFormat(d) {
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()].toLowerCase()} ${d.getFullYear()}`;
}

/* Format numérique français JJ/MM/AAAA ---------------------------------- */
function frFormatNumeric(d) {
  if (typeof d === 'string') d = fromISO(d);
  const day = String(d.getDate()).padStart(2, '0');
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${m}/${d.getFullYear()}`;
}

/* Parse JJ/MM/AAAA → ISO ou null si invalide ----------------------------- */
function frParseNumeric(str) {
  if (!str || !str.trim()) return null;
  const m = str.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return toISO(d);
}

/* Lit un champ date français → ISO (null si vide ou invalide) ----------- */
function readFrDateInput(el) {
  if (!el) return null;
  const raw = el.value.trim();
  if (!raw) return null;
  return frParseNumeric(raw);
}

function setFrDateInputValue(el, iso) {
  if (!el) return;
  if (iso) {
    el.value = frFormatNumeric(iso);
    el.dataset.iso = iso;
    el.classList.remove('invalid');
  } else {
    el.value = '';
    el.dataset.iso = '';
    el.classList.remove('invalid');
  }
}

function syncFrDateInputFromValue(el) {
  const raw = el.value.trim();
  if (!raw) {
    setFrDateInputValue(el, null);
    return null;
  }
  const iso = frParseNumeric(raw);
  if (iso) {
    setFrDateInputValue(el, iso);
    return iso;
  }
  el.classList.add('invalid');
  return null;
}

/* Calendrier popup français (lundi = 1er jour) ------------------------- */
const CAL_WEEKDAYS = ['Lu', 'Ma', 'Me', 'Je', 'Ve', 'Sa', 'Di'];
let frCalendarDocListener = false;

const frCalendar = {
  popup: null,
  viewMonth: null,
  anchorInput: null
};

function ensureFrCalendarPopup() {
  if (frCalendar.popup) return frCalendar.popup;

  const pop = document.createElement('div');
  pop.className = 'fr-calendar-popup no-print';
  pop.hidden = true;
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Calendrier');
  pop.innerHTML = `
    <div class="fr-cal-header">
      <button type="button" class="fr-cal-nav" data-cal-nav="prev" aria-label="Mois précédent">‹</button>
      <span class="fr-cal-title"></span>
      <button type="button" class="fr-cal-nav" data-cal-nav="next" aria-label="Mois suivant">›</button>
    </div>
    <div class="fr-cal-weekdays"></div>
    <div class="fr-cal-grid"></div>
    <div class="fr-cal-footer">
      <button type="button" class="fr-cal-today">Aujourd'hui</button>
    </div>`;

  const wd = pop.querySelector('.fr-cal-weekdays');
  wd.innerHTML = CAL_WEEKDAYS.map(d => `<span>${d}</span>`).join('');

  pop.querySelector('[data-cal-nav="prev"]').onclick = (e) => {
    e.stopPropagation();
    const vm = frCalendar.viewMonth;
    frCalendar.viewMonth = new Date(vm.getFullYear(), vm.getMonth() - 1, 1, 12, 0, 0, 0);
    renderFrCalendarBody();
  };
  pop.querySelector('[data-cal-nav="next"]').onclick = (e) => {
    e.stopPropagation();
    const vm = frCalendar.viewMonth;
    frCalendar.viewMonth = new Date(vm.getFullYear(), vm.getMonth() + 1, 1, 12, 0, 0, 0);
    renderFrCalendarBody();
  };
  pop.querySelector('.fr-cal-today').onclick = (e) => {
    e.stopPropagation();
    selectFrCalendarDate(todayISO());
  };

  pop.addEventListener('mousedown', (e) => e.preventDefault());

  document.body.appendChild(pop);
  frCalendar.popup = pop;

  if (!frCalendarDocListener) {
    frCalendarDocListener = true;
    document.addEventListener('mousedown', (e) => {
      if (!frCalendar.popup || frCalendar.popup.hidden) return;
      if (e.target.closest('.fr-calendar-popup') || e.target.closest('.fr-date-picker-btn')) return;
      closeFrCalendar();
    });
    window.addEventListener('resize', closeFrCalendar);
    window.addEventListener('scroll', closeFrCalendar, true);
  }

  return pop;
}

function renderFrCalendarBody() {
  const pop = frCalendar.popup;
  if (!pop || !frCalendar.viewMonth) return;

  const vm = frCalendar.viewMonth;
  const y = vm.getFullYear();
  const m = vm.getMonth();
  pop.querySelector('.fr-cal-title').textContent =
    `${MONTH_NAMES[m]} ${y}`;

  const selectedIso = frCalendar.anchorInput
    ? (readFrDateInput(frCalendar.anchorInput) || frCalendar.anchorInput.dataset.iso || null)
    : null;
  const today = todayISO();

  const first = new Date(y, m, 1, 12, 0, 0, 0);
  const startPad = weekDayIndex(first);
  const gridStart = addDays(first, -startPad);

  const grid = pop.querySelector('.fr-cal-grid');
  grid.innerHTML = '';

  for (let i = 0; i < 42; i++) {
    const d = addDays(gridStart, i);
    const iso = toISO(d);
    const inMonth = d.getMonth() === m;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fr-cal-day';
    if (!inMonth) btn.classList.add('other-month');
    if (iso === today) btn.classList.add('is-today');
    if (iso === selectedIso) btn.classList.add('is-selected');
    btn.textContent = String(d.getDate());
    btn.dataset.iso = iso;
    btn.onclick = (e) => {
      e.stopPropagation();
      selectFrCalendarDate(iso);
    };
    grid.appendChild(btn);
  }
}

function positionFrCalendar(anchorEl) {
  const pop = frCalendar.popup;
  const wrap = anchorEl.closest('.fr-date-wrap') || anchorEl;
  const rect = wrap.getBoundingClientRect();
  pop.hidden = false;
  pop.style.visibility = 'hidden';
  pop.style.left = '0';
  pop.style.top = '0';

  requestAnimationFrame(() => {
    const pw = pop.offsetWidth;
    const ph = pop.offsetHeight;
    let left = rect.left;
    let top = rect.bottom + 4;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    if (left < 8) left = 8;
    if (top + ph > window.innerHeight - 8) top = rect.top - ph - 4;
    if (top < 8) top = 8;
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
    pop.style.visibility = '';
  });
}

function openFrCalendar(input) {
  const pop = ensureFrCalendarPopup();
  const iso = readFrDateInput(input) || input.dataset.iso || todayISO();
  frCalendar.anchorInput = input;
  frCalendar.viewMonth = fromISO(iso);
  frCalendar.viewMonth = new Date(
    frCalendar.viewMonth.getFullYear(),
    frCalendar.viewMonth.getMonth(),
    1, 12, 0, 0, 0
  );
  renderFrCalendarBody();
  pop.hidden = false;
  positionFrCalendar(input);
}

function closeFrCalendar() {
  if (!frCalendar.popup) return;
  frCalendar.popup.hidden = true;
  frCalendar.anchorInput = null;
}

function toggleFrCalendar(input) {
  if (frCalendar.anchorInput === input && frCalendar.popup && !frCalendar.popup.hidden) {
    closeFrCalendar();
    return;
  }
  openFrCalendar(input);
}

function selectFrCalendarDate(iso) {
  const input = frCalendar.anchorInput;
  if (!input) return;
  setFrDateInputValue(input, iso);
  closeFrCalendar();
  input.dispatchEvent(new CustomEvent('frdate-select', { bubbles: true, detail: { iso } }));
}

function wrapFrDateInput(el) {
  if (el.parentElement?.classList.contains('fr-date-wrap')) return;
  const wrap = document.createElement('div');
  wrap.className = 'fr-date-wrap';
  el.parentNode.insertBefore(wrap, el);
  wrap.appendChild(el);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'fr-date-picker-btn no-print';
  btn.title = 'Choisir dans le calendrier';
  btn.setAttribute('aria-label', 'Ouvrir le calendrier');
  btn.textContent = '📅';
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFrCalendar(el);
  });
  wrap.appendChild(btn);
}

/* Initialise les champs .fr-date (saisie + calendrier) ---------------- */
function initFrDateInputs(root) {
  if (!root) return;
  root.querySelectorAll('input.fr-date').forEach(el => {
    if (el.dataset.frDateInit) return;
    el.dataset.frDateInit = '1';
    el.placeholder = 'jj/mm/aaaa';
    el.setAttribute('inputmode', 'numeric');
    el.setAttribute('autocomplete', 'off');
    el.setAttribute('lang', 'fr');
    if (el.dataset.iso && !el.value) el.value = frFormatNumeric(el.dataset.iso);
    wrapFrDateInput(el);
    el.addEventListener('blur', () => {
      syncFrDateInputFromValue(el);
    });
  });
}

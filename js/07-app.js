/* Initialisation, export/import, persistance UI */
'use strict';

/* ===========================================================================
   15. UTILITAIRES UI & PERSISTANCE
   ========================================================================= */

let sessionInitialized = false;
let suppressDirtyTracking = false;
let sessionNeedsExport = false;
let exitExportDialogOpen = false;
let allowPageLeave = false;

function markSessionDirty() {
  if (!suppressDirtyTracking) sessionNeedsExport = true;
  updateExportButtonState();
}

function markSessionExported() {
  sessionNeedsExport = false;
  updateExportButtonState();
}

function updateExportButtonState() {
  const btn = $('#btn-export-json');
  if (!btn) return;
  btn.classList.toggle('needs-export', sessionNeedsExport);
  btn.title = sessionNeedsExport
    ? 'Exporter JSON — modifications non sauvegardées'
    : `Enregistrer planning_AAAA-MM-JJ_HH-MM.json dans ${JSON_BACKUP_DIR_NAME}/`;
}

function persistAndRender() {
  saveState();
  if (sessionInitialized) markSessionDirty();
  render();
}

function showPlanningImportDialog({ title, message, onChoose }) {
  const old = document.querySelector('.import-dialog-overlay');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.className = 'import-dialog-overlay';
  overlay.innerHTML = `
    <div class="import-dialog" role="dialog" aria-labelledby="import-dlg-title">
      <h3 id="import-dlg-title">${title}</h3>
      <p>${message}</p>
      <div class="import-dialog-btns">
        <button type="button" class="primary" data-mode="overwrite">Tout écraser</button>
        <button type="button" class="nav" data-mode="fillEmpty">Cellules vides seulement</button>
        <button type="button" class="nav muted-btn" data-mode="cancel">Annuler</button>
      </div>
    </div>`;

  overlay.querySelectorAll('[data-mode]').forEach(b => {
    b.onclick = () => {
      overlay.remove();
      const mode = b.dataset.mode;
      if (mode !== 'cancel') onChoose(mode);
    };
  });
  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };

  document.body.appendChild(overlay);
}

function toast(msg, isError = false) {
  // supprime un éventuel toast précédent
  const old = document.querySelector('.toast');
  if (old) old.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  if (isError) t.style.background = 'var(--warn)';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2500);
}

/* ===========================================================================
   16. EXPORT / IMPORT JSON
   ========================================================================= */

const FS_DB_NAME = 'planning_personnel_fs';
const FS_DIR_KEY = 'jsonImportDir';
const JSON_BACKUP_DIR_NAME = 'sauvegardes';
const PLANNING_JSON_RE = /^planning_.+\.json$/i;
/* planning_2026-05-27.json | planning_2026-05-27_14-30.json | planning_2026-05-27_14-30_2.json */
const PLANNING_JSON_STAMP_RE = /^planning_(\d{4}-\d{2}-\d{2})(?:_(\d{2})-(\d{2})(?:_(\d+))?)?\.json$/i;

function nowTimeHM() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}`;
}

function planningExportBasename(dateIso, timeHm, suffix) {
  const base = `planning_${dateIso}_${timeHm}`;
  return suffix ? `${base}_${suffix}.json` : `${base}.json`;
}

function planningExportFilename() {
  return planningExportBasename(todayISO(), nowTimeHM());
}

function isPlanningJsonFilename(name) {
  return PLANNING_JSON_RE.test(String(name || ''));
}

function parsePlanningJsonSortKey(name) {
  const m = PLANNING_JSON_STAMP_RE.exec(String(name || ''));
  if (!m) return null;
  const [, date, hh, mm, seq] = m;
  if (!hh) return { stamp: `${date}T00:00`, seq: 0 };
  return { stamp: `${date}T${hh}:${mm}`, seq: seq ? parseInt(seq, 10) : 0 };
}

async function fileExistsInDir(dirHandle, filename) {
  try {
    await dirHandle.getFileHandle(filename);
    return true;
  } catch (err) {
    if (err && err.name === 'NotFoundError') return false;
    throw err;
  }
}

async function resolveUniqueExportFilename(dirHandle) {
  const dateIso = todayISO();
  const timeHm = nowTimeHM();
  let filename = planningExportBasename(dateIso, timeHm);
  let n = 2;
  while (await fileExistsInDir(dirHandle, filename)) {
    filename = planningExportBasename(dateIso, timeHm, String(n));
    n++;
  }
  return filename;
}

function openFsDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FS_DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore('kv');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadStoredDirHandle() {
  try {
    const db = await openFsDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readonly');
      const req = tx.objectStore('kv').get(FS_DIR_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

async function storeDirHandle(handle) {
  const db = await openFsDB();
  const tx = db.transaction('kv', 'readwrite');
  tx.objectStore('kv').put(handle, FS_DIR_KEY);
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function verifyDirPermission(dirHandle, mode = 'read') {
  const opts = { mode };
  if ((await dirHandle.queryPermission(opts)) === 'granted') return true;
  if ((await dirHandle.requestPermission(opts)) === 'granted') return true;
  return false;
}

async function pickJsonDirectoryHandle() {
  if (!window.showDirectoryPicker) return null;
  try {
    return await window.showDirectoryPicker({ mode: 'readwrite' });
  } catch (err) {
    if (err && err.name === 'AbortError') return null;
    throw err;
  }
}

async function ensureJsonDirectoryHandle() {
  let handle = await loadStoredDirHandle();
  if (handle && (await verifyDirPermission(handle, 'readwrite'))) return handle;

  toast(`Choisissez le dossier « ${JSON_BACKUP_DIR_NAME}/ » du projet`);
  handle = await pickJsonDirectoryHandle();
  if (!handle) return null;
  if (!(await verifyDirPermission(handle, 'readwrite'))) {
    toast('Écriture refusée dans ce dossier', true);
    return null;
  }
  await storeDirHandle(handle);
  return handle;
}

async function writeJsonToDirHandle(dirHandle, filename, text) {
  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(text);
  await writable.close();
}

function downloadJsonFile(filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function rankPlanningJsonFiles(entries) {
  return entries
    .filter(e => isPlanningJsonFilename(e.name))
    .sort((a, b) => {
      const ka = parsePlanningJsonSortKey(a.name);
      const kb = parsePlanningJsonSortKey(b.name);
      if (ka && kb) {
        if (ka.stamp !== kb.stamp) return kb.stamp.localeCompare(ka.stamp);
        if (ka.seq !== kb.seq) return kb.seq - ka.seq;
      } else if (ka && !kb) return -1;
      else if (!ka && kb) return 1;
      return (b.mtime || 0) - (a.mtime || 0);
    });
}

async function collectPlanningJsonFromDirHandle(dirHandle) {
  const entries = [];
  for await (const [name, handle] of dirHandle.entries()) {
    if (handle.kind !== 'file' || !isPlanningJsonFilename(name)) continue;
    const file = await handle.getFile();
    entries.push({ name, file, mtime: file.lastModified, fileHandle: handle });
  }
  return rankPlanningJsonFiles(entries);
}

function collectPlanningJsonFromFileList(fileList) {
  const entries = [];
  for (const file of fileList) {
    const name = file.name;
    if (!isPlanningJsonFilename(name)) continue;
    entries.push({ name, file, mtime: file.lastModified, fileHandle: null });
  }
  return rankPlanningJsonFiles(entries);
}

function showJsonImportPickerDialog({ newest, total, onChoose }) {
  const old = document.querySelector('.import-dialog-overlay');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.className = 'import-dialog-overlay';
  overlay.innerHTML = `
    <div class="import-dialog" role="dialog" aria-labelledby="json-import-dlg-title">
      <h3 id="json-import-dlg-title">Importer une sauvegarde</h3>
      <p>
        ${total > 1
          ? `${total} fichiers <code>planning_*.json</code> trouvés dans le dossier.`
          : `1 fichier <code>planning_*.json</code> trouvé dans le dossier.`}
        <br><br>
        <strong>Sauvegarde la plus récente :</strong> ${newest.name}
        <br><br>
        L'import <strong>remplacera toutes les données actuelles</strong> de cette page.
      </p>
      <div class="import-dialog-btns">
        <button type="button" class="primary" data-action="import">Importer ce fichier</button>
        <button type="button" class="nav" data-action="pickFile">Choisir un autre fichier…</button>
        <button type="button" class="nav" data-action="pickFolder">Choisir un autre dossier…</button>
        <button type="button" class="nav muted-btn" data-action="cancel">Annuler</button>
      </div>
    </div>`;

  overlay.querySelectorAll('[data-action]').forEach(b => {
    b.onclick = () => {
      overlay.remove();
      onChoose(b.dataset.action);
    };
  });
  overlay.onclick = (e) => {
    if (e.target === overlay) {
      overlay.remove();
      onChoose('cancel');
    }
  };

  document.body.appendChild(overlay);
}

function applyImportedJSON(obj, filename) {
  if (!obj.employees || !obj.patterns || !obj.affectations) {
    throw new Error('Format JSON inattendu (manque employees / patterns / affectations).');
  }
  STATE = obj;
  if (!STATE.conges) STATE.conges = [];
  if (!STATE.feriesAdd) STATE.feriesAdd = [];
  if (!STATE.feriesRemove) STATE.feriesRemove = [];
  if (!STATE.gardes) STATE.gardes = [];
  if (!STATE.employeeTypes) STATE.employeeTypes = {};
  if (!STATE.employeeInfo) STATE.employeeInfo = {};
  if (!STATE.contractDays) STATE.contractDays = {};
  if (!STATE.contractDescriptions) STATE.contractDescriptions = {};
  if (!STATE.cdiWeeks) STATE.cdiWeeks = {};
  if (!STATE.cdiDescriptions) STATE.cdiDescriptions = {};
  if (!STATE.pharmacyInfo) STATE.pharmacyInfo = {};
  if (!STATE.employerInfo) STATE.employerInfo = {};
  if (!STATE.ui) STATE.ui = buildDefaultState().ui;
  migrateState(STATE);
  suppressDirtyTracking = true;
  persistAndRender();
  suppressDirtyTracking = false;
  markSessionExported();
  toast(`Données importées (${filename})`);
}

function readFileAndApplyImport(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      applyImportedJSON(JSON.parse(e.target.result), file.name);
    } catch (err) {
      console.error(err);
      toast('Échec import : ' + err.message, true);
    }
  };
  reader.onerror = () => toast('Erreur de lecture du fichier', true);
  reader.readAsText(file);
}

function exportJSON() {
  void exportJSONAsync();
}

async function exportJSONAsync({ silent = false } = {}) {
  const text = JSON.stringify(STATE, null, 2);

  if (window.showDirectoryPicker) {
    try {
      const dirHandle = await ensureJsonDirectoryHandle();
      if (dirHandle) {
        const filename = await resolveUniqueExportFilename(dirHandle);
        await writeJsonToDirHandle(dirHandle, filename, text);
        markSessionExported();
        if (!silent) toast(`Enregistré : ${JSON_BACKUP_DIR_NAME}/${filename}`);
        return true;
      }
    } catch (err) {
      console.warn('Export direct impossible, repli téléchargement.', err);
    }
  }

  const filename = planningExportFilename();
  downloadJsonFile(filename, text);
  markSessionExported();
  if (!silent) toast(`Téléchargé — placez le fichier dans ${JSON_BACKUP_DIR_NAME}/`);
  return true;
}

function importJSON(file) {
  readFileAndApplyImport(file);
}

async function pickImportJsonFile(startInDir) {
  if (window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{
          description: 'Sauvegarde planning',
          accept: { 'application/json': ['.json'] }
        }],
        multiple: false,
        startIn: startInDir || 'documents'
      });
      return await handle.getFile();
    } catch (err) {
      if (err && err.name === 'AbortError') return null;
      throw err;
    }
  }
  return await new Promise((resolve) => {
    const input = $('#file-import');
    input.onchange = (e) => {
      const f = e.target.files[0] || null;
      e.target.value = '';
      input.onchange = null;
      resolve(f);
    };
    input.click();
  });
}

async function importFromDirectoryHandle(dirHandle, { forcePickFolder = false, startup = false } = {}) {
  if (!dirHandle) return false;
  if (!(await verifyDirPermission(dirHandle))) {
    if (!startup) toast('Accès au dossier refusé — choisissez-le à nouveau', true);
    return false;
  }

  await storeDirHandle(dirHandle);

  const ranked = await collectPlanningJsonFromDirHandle(dirHandle);
  if (!ranked.length) {
    if (!startup) toast('Aucun fichier planning_*.json dans ce dossier', true);
    return false;
  }

  const newest = ranked[0];
  return await new Promise((resolve) => {
    showJsonImportPickerDialog({
      newest,
      total: ranked.length,
      onChoose: async (action) => {
        if (action === 'cancel') {
          resolve(false);
          return;
        }
        if (action === 'pickFolder') {
          resolve(await startImportJSON({ forcePickFolder: true, startup }));
          return;
        }
        if (action === 'pickFile') {
          const file = await pickImportJsonFile(dirHandle);
          if (file) readFileAndApplyImport(file);
          resolve(!!file);
          return;
        }
        readFileAndApplyImport(newest.file);
        resolve(true);
      }
    });
  });
}

function importFromFileList(fileList) {
  const ranked = collectPlanningJsonFromFileList(fileList);
  if (!ranked.length) {
    toast('Aucun fichier planning_*.json dans ce dossier', true);
    return;
  }

  const newest = ranked[0];
  showJsonImportPickerDialog({
    newest,
    total: ranked.length,
    onChoose: (action) => {
      if (action === 'cancel') return;
      if (action === 'pickFolder') {
        startImportJSON({ forcePickFolder: true });
        return;
      }
      if (action === 'pickFile') {
        pickImportJsonFile().then(f => { if (f) readFileAndApplyImport(f); });
        return;
      }
      readFileAndApplyImport(newest.file);
    }
  });
}

async function startImportJSON({ forcePickFolder = false, startup = false } = {}) {
  if (window.showDirectoryPicker) {
    try {
      if (!forcePickFolder) {
        const stored = await loadStoredDirHandle();
        if (stored && (await importFromDirectoryHandle(stored, { startup }))) return true;
      }

      if (!startup) toast(`Choisissez le dossier « ${JSON_BACKUP_DIR_NAME}/ » du projet`);
      const dirHandle = await pickJsonDirectoryHandle();
      if (!dirHandle) return false;
      return !!(await importFromDirectoryHandle(dirHandle, { startup }));
    } catch (err) {
      console.warn('Import dossier (API fichiers) indisponible, repli sélecteur classique.', err);
    }
  }

  if (!startup) toast(`Choisissez le dossier « ${JSON_BACKUP_DIR_NAME}/ » du projet`);
  const folderInput = $('#folder-import');
  if (folderInput) {
    return await new Promise((resolve) => {
      folderInput.onchange = (e) => {
        const files = e.target.files;
        e.target.value = '';
        folderInput.onchange = null;
        if (files && files.length) {
          importFromFileList(files);
          resolve(true);
        } else {
          resolve(false);
        }
      };
      folderInput.click();
    });
  }

  const file = await pickImportJsonFile();
  if (file) readFileAndApplyImport(file);
  return !!file;
}

function showStartupImportDialog({ onChoose }) {
  const old = document.querySelector('.import-dialog-overlay');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.className = 'import-dialog-overlay';
  overlay.innerHTML = `
    <div class="import-dialog" role="dialog" aria-labelledby="startup-import-dlg-title">
      <h3 id="startup-import-dlg-title">Ouverture — charger la sauvegarde</h3>
      <p>
        À chaque ouverture, importez la dernière sauvegarde JSON depuis le dossier
        <code>${JSON_BACKUP_DIR_NAME}/</code> pour travailler sur les données à jour.
        <br><br>
        À la fermeture, une exportation sera demandée si des modifications ont été faites.
      </p>
      <div class="import-dialog-btns">
        <button type="button" class="primary" data-action="import">Importer la dernière sauvegarde</button>
        <button type="button" class="nav muted-btn" data-action="skip">Continuer sans importer</button>
      </div>
    </div>`;

  overlay.querySelectorAll('[data-action]').forEach(b => {
    b.onclick = () => {
      overlay.remove();
      onChoose(b.dataset.action);
    };
  });

  document.body.appendChild(overlay);
}

function showExitExportDialog({ onChoose }) {
  const old = document.querySelector('.import-dialog-overlay');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.className = 'import-dialog-overlay';
  overlay.innerHTML = `
    <div class="import-dialog" role="dialog" aria-labelledby="exit-export-dlg-title">
      <h3 id="exit-export-dlg-title">Fermeture — exporter les modifications</h3>
      <p>
        Des modifications n'ont pas encore été exportées en JSON.
        Exportez maintenant avant de quitter pour ne rien perdre.
      </p>
      <div class="import-dialog-btns">
        <button type="button" class="primary" data-action="export">Exporter JSON</button>
        <button type="button" class="nav muted-btn" data-action="leave">Quitter sans exporter</button>
        <button type="button" class="nav" data-action="stay">Rester sur la page</button>
      </div>
    </div>`;

  overlay.querySelectorAll('[data-action]').forEach(b => {
    b.onclick = () => {
      overlay.remove();
      onChoose(b.dataset.action);
    };
  });

  document.body.appendChild(overlay);
}

async function promptStartupImport() {
  return new Promise((resolve) => {
    showStartupImportDialog({
      onChoose: async (action) => {
        if (action === 'skip') {
          markSessionDirty();
          toast('Session locale — pensez à exporter à la fermeture');
          resolve(false);
          return;
        }
        const imported = await startImportJSON({ startup: true });
        if (!imported) markSessionDirty();
        resolve(imported);
      }
    });
  });
}

function setupSessionLifecycle() {
  window.addEventListener('beforeunload', (e) => {
    if (!sessionNeedsExport || allowPageLeave || exitExportDialogOpen) return;
    e.preventDefault();
    e.returnValue = '';
  });

  window.addEventListener('pagehide', () => {
    if (!sessionNeedsExport || allowPageLeave) return;
    void exportJSONAsync({ silent: true });
  });
}

function promptExitExport() {
  if (!sessionNeedsExport || exitExportDialogOpen) return;
  exitExportDialogOpen = true;
  showExitExportDialog({
    onChoose: async (action) => {
      exitExportDialogOpen = false;
      if (action === 'stay') return;
      if (action === 'export') {
        await exportJSONAsync();
        if (!sessionNeedsExport) {
          allowPageLeave = true;
          toast('Export terminé — vous pouvez fermer la page');
        }
        return;
      }
      if (action === 'leave') {
        allowPageLeave = true;
        window.close();
      }
    }
  });
}

/* ===========================================================================
   17. EXPORT PNG (canvas html2canvas-like simplifié)
   On rasterise la zone .content en SVG → image → canvas → PNG.
   Note : on n'a PAS de CDN, donc on construit une image en SVG foreignObject,
   ce qui fonctionne dans la plupart des navigateurs modernes.
   ========================================================================= */

function exportPNG() {
  const node = $('#content');
  if (!node) return;

  // dimensions
  const rect = node.getBoundingClientRect();
  const w = Math.ceil(rect.width);
  const h = Math.ceil(node.scrollHeight);

  // on clone le noeud, on inline les styles via getComputedStyle
  // (méthode simplifiée : on prend les styles tels que rendus dans le DOM)
  const clone = node.cloneNode(true);
  // applique les styles calculés au clone (récursif limité aux propriétés clés)
  inlineComputedStyles(node, clone);

  const xml = new XMLSerializer().serializeToString(clone);
  const svgHtml = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <foreignObject width="100%" height="100%">
        <div xmlns="http://www.w3.org/1999/xhtml" style="background:#f5f3ee;width:${w}px">
          ${xml}
        </div>
      </foreignObject>
    </svg>
  `;
  const blob = new Blob([svgHtml], { type: 'image/svg+xml;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const img  = new Image();
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f5f3ee';
    ctx.fillRect(0,0,w,h);
    try {
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob2) => {
        if (!blob2) { toast("Échec de la conversion en image", true); return; }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob2);
        a.download = `planning_${STATE.ui.currentTab}_${todayISO()}.png`;
        a.click();
        URL.revokeObjectURL(a.href);
        toast('Image téléchargée');
      }, 'image/png');
    } catch (err) {
      console.error(err);
      toast("Export PNG impossible (taint canvas). Essaie l'impression PDF.", true);
    }
    URL.revokeObjectURL(url);
  };
  img.onerror = () => {
    toast("Export PNG non supporté ici. Utilise plutôt 'Imprimer' (PDF).", true);
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

/* Copie quelques propriétés CSS calculées de src vers dst, récursivement */
function inlineComputedStyles(src, dst) {
  const props = [
    'color','background','background-color','font-family','font-size','font-weight',
    'line-height','text-align','padding','margin','border','border-collapse',
    'border-color','border-width','border-style','border-radius',
    'display','grid-template-columns','grid-template-rows','gap',
    'width','height','min-width','min-height','box-shadow','opacity',
    'text-transform','letter-spacing','white-space','position'
  ];
  const cs = getComputedStyle(src);
  let style = '';
  for (const p of props) {
    const v = cs.getPropertyValue(p);
    if (v) style += `${p}:${v};`;
  }
  if (dst.setAttribute) {
    dst.setAttribute('style', (dst.getAttribute('style')||'') + style);
  }
  const sc = src.children, dc = dst.children;
  for (let i = 0; i < sc.length && i < dc.length; i++) {
    inlineComputedStyles(sc[i], dc[i]);
  }
}

/* ===========================================================================
   18. RÉINITIALISATION
   ========================================================================= */

function resetAll() {
  if (!confirm('⚠ Réinitialiser TOUTES les données ?\nLa sauvegarde locale sera effacée.\n(Exporte d\'abord en JSON si tu veux garder ton travail.)')) return;
  if (!confirm('Confirmer une seconde fois : tout sera perdu.')) return;
  localStorage.removeItem(STORAGE_KEY);
  STATE = buildDefaultState();
  suppressDirtyTracking = true;
  persistAndRender();
  suppressDirtyTracking = false;
  markSessionDirty();
  toast('Données réinitialisées');
}

/* ===========================================================================
   19. INITIALISATION GLOBALE
   ========================================================================= */

function initApp() {
  applyEmployeeTypeColorStyles();
  applyCongeTypeColorStyles();
  $$('#nav-groups button').forEach(b => {
    b.onclick = () => {
      const tabs = TAB_GROUPS[b.dataset.group];
      if (!tabs) return;
      if (!tabs.includes(STATE.ui.currentTab)) {
        STATE.ui.currentTab = tabs[0];
      }
      persistAndRender();
    };
  });
  $$('#tabs button').forEach(b => {
    b.onclick = () => {
      STATE.ui.currentTab = b.dataset.tab;
      persistAndRender();
    };
  });

  // boutons top
  $('#btn-export-json').onclick = exportJSON;
  $('#btn-import-json').onclick = () => startImportJSON();
  updateExportButtonState();
  $('#btn-print').onclick = () => {
    if (STATE.ui.currentTab === 'week') printWeekPeriod();
    else if (STATE.ui.currentTab === 'contract') printContractPdf();
    else if (STATE.ui.currentTab === 'cdi') printCdiPdf();
    else window.print();
  };
  $('#btn-export-png').onclick = exportPNG;
  $('#btn-reset').onclick = resetAll;

  // raccourcis clavier : ←/→ pour naviguer dans semaine/mois/année
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const sign = (e.key === 'ArrowLeft') ? -1 : 1;
      const curr = fromISO(STATE.ui.currentDate);
      if (STATE.ui.currentTab !== 'week') return;
      STATE.ui.currentDate = toISO(addDays(curr, 7 * sign));
      persistAndRender();
    }
  });

  // rendu initial
  render();
  sessionInitialized = true;
  setupSessionLifecycle();
  void promptStartupImport();

  // tentative d'export à la fermeture (Ctrl+W / fermeture onglet)
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'w' || !(e.ctrlKey || e.metaKey)) return;
    if (!sessionNeedsExport) return;
    e.preventDefault();
    promptExitExport();
  });
}

// Lance dès que le DOM est prêt
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

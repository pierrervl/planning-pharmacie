/* Demandes de modification de planning (employés → admin) */
'use strict';

function isEmployeeRequestMode() {
  return typeof isEmployee === 'function' && isEmployee()
    && typeof getLinkedEmployeeName === 'function' && !!getLinkedEmployeeName();
}

function makePlanningRequestId() {
  return 'preq_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function ensurePlanningChangeRequests(state = STATE) {
  if (!state.planningChangeRequests) state.planningChangeRequests = [];
  return state.planningChangeRequests;
}

function normalizePlanningChangeRequest(raw) {
  if (!raw || !raw.emp || !raw.dateIso || !raw.shift) return null;
  const present = !!raw.present;
  let start = present ? normalizeTimeInput(raw.start) : null;
  let end = present ? normalizeTimeInput(raw.end) : null;
  let hours = 0;
  if (present && start && end) {
    hours = hoursBetweenTimes(start, end);
    if (hours == null) return null;
  } else if (present) {
    return null;
  }
  return {
    id: raw.id || makePlanningRequestId(),
    emp: raw.emp,
    dateIso: raw.dateIso,
    shift: raw.shift,
    present,
    start: present ? start : null,
    end: present ? end : null,
    hours: present ? hours : 0,
    status: raw.status || 'pending',
    comment: String(raw.comment || '').trim(),
    createdAt: raw.createdAt || new Date().toISOString(),
    resolvedAt: raw.resolvedAt || null,
  };
}

function getPendingPlanningChangeRequest(emp, dateIso, shift, state = STATE) {
  return ensurePlanningChangeRequests(state).find(r =>
    r.status === 'pending' && r.emp === emp && r.dateIso === dateIso && r.shift === shift
  ) || null;
}

function upsertPlanningChangeRequest(payload, state = STATE) {
  const req = normalizePlanningChangeRequest({ ...payload, status: 'pending' });
  if (!req) return { ok: false, error: 'Données invalides.' };
  const list = ensurePlanningChangeRequests(state);
  const idx = list.findIndex(r =>
    r.status === 'pending' && r.emp === req.emp && r.dateIso === req.dateIso && r.shift === req.shift
  );
  if (idx >= 0) {
    req.id = list[idx].id;
    req.createdAt = list[idx].createdAt;
    list[idx] = req;
  } else {
    list.push(req);
  }
  return { ok: true, request: req };
}

function findPlanningChangeRequest(id, state = STATE) {
  return ensurePlanningChangeRequests(state).find(r => r.id === id) || null;
}

function applyPlanningChangeRequestToPlanning(req, state = STATE) {
  if (!req.present) {
    setPlanningValue(req.emp, req.dateIso, req.shift, PLANNING_REST, state);
    clearPlanningCellSlot(req.emp, req.dateIso, req.shift, state);
    return;
  }
  setPlanningValue(req.emp, req.dateIso, req.shift, PLANNING_PRESENT, state);
  if (req.start && req.end) {
    setPlanningCellSlot(req.emp, req.dateIso, req.shift, req.start, req.end, state);
  }
}

function approvePlanningChangeRequest(id, state = STATE) {
  const req = findPlanningChangeRequest(id, state);
  if (!req || req.status !== 'pending') return { ok: false, error: 'Demande introuvable.' };
  applyPlanningChangeRequestToPlanning(req, state);
  req.status = 'approved';
  req.resolvedAt = new Date().toISOString();
  return { ok: true, request: req };
}

function rejectPlanningChangeRequest(id, state = STATE) {
  const req = findPlanningChangeRequest(id, state);
  if (!req || req.status !== 'pending') return { ok: false, error: 'Demande introuvable.' };
  req.status = 'rejected';
  req.resolvedAt = new Date().toISOString();
  return { ok: true, request: req };
}

function deletePlanningChangeRequest(id, state = STATE) {
  const list = ensurePlanningChangeRequests(state);
  const idx = list.findIndex(r => r.id === id);
  if (idx < 0) return { ok: false, error: 'Demande introuvable.' };
  list.splice(idx, 1);
  return { ok: true };
}

function countPendingPlanningRequests(state = STATE) {
  return ensurePlanningChangeRequests(state).filter(r => r.status === 'pending').length;
}

function promptPlanningChangeRequestDialog({ emp, iso, shift, onDone }) {
  const old = document.querySelector('.import-dialog-overlay');
  if (old) old.remove();

  const shiftLabel = shift === 'matin' ? 'Matin' : 'Après-midi';
  const d = fromISO(iso);
  const dayLabel = DAY_NAMES_ABBR[d.getDay()];
  const existing = getPendingPlanningChangeRequest(emp, iso, shift);
  const curVal = getPlanningValue(emp, iso, shift);
  const slot = getPlanningCellSlot(emp, iso, shift);
  const def = getPatternShiftDefaultSlot(shift);

  let present = true;
  let startVal = formatPatternTime(slot.start);
  let endVal = formatPatternTime(slot.end);
  let commentVal = '';

  if (existing) {
    present = existing.present;
    commentVal = existing.comment || '';
    if (existing.present && existing.start && existing.end) {
      startVal = formatPatternTime(existing.start);
      endVal = formatPatternTime(existing.end);
    }
  } else if (!isPlanningPresent(curVal)) {
    present = false;
  }

  const overlay = document.createElement('div');
  overlay.className = 'import-dialog-overlay';
  overlay.innerHTML = `
    <div class="import-dialog pattern-hours-dialog planning-request-dialog" role="dialog">
      <h3>Demande de modification</h3>
      <p class="muted">${patternEscapeAttr(emp)} · ${dayLabel} ${frFormat(d)} · ${shiftLabel}</p>
      <div class="planning-request-presence">
        <label class="planning-request-check">
          <input type="checkbox" id="req-present" ${present ? 'checked' : ''}> Présent
        </label>
        <label class="planning-request-check">
          <input type="checkbox" id="req-absent" ${!present ? 'checked' : ''}> Non présent
        </label>
      </div>
      <div class="pattern-hours-grid pattern-hours-dialog-grid" id="req-times-wrap">
        <label class="pattern-hours-field">Début
          <input type="text" id="req-start" placeholder="14h00" value="${startVal}">
        </label>
        <label class="pattern-hours-field">Fin
          <input type="text" id="req-end" placeholder="19h30" value="${endVal}">
        </label>
      </div>
      <p class="pattern-hours-hint" id="req-hours-preview">Durée : — h</p>
      <label class="pattern-hours-field">Commentaire (facultatif)
        <input type="text" id="req-comment" maxlength="200" value="${patternEscapeAttr(commentVal)}">
      </label>
      <div class="import-dialog-btns">
        <button type="button" class="primary" data-act="ok">Envoyer la demande</button>
        <button type="button" class="nav muted-btn" data-act="cancel">Annuler</button>
      </div>
    </div>`;

  const close = () => overlay.remove();
  const finish = () => {
    close();
    if (onDone) onDone();
  };

  const presentEl = overlay.querySelector('#req-present');
  const absentEl = overlay.querySelector('#req-absent');
  const timesWrap = overlay.querySelector('#req-times-wrap');
  const startEl = overlay.querySelector('#req-start');
  const endEl = overlay.querySelector('#req-end');
  const previewEl = overlay.querySelector('#req-hours-preview');

  function isPresent() {
    return presentEl.checked && !absentEl.checked;
  }

  function syncPresenceFromTimes() {
    if (!isPresent()) return;
    const h = hoursBetweenTimes(startEl.value, endEl.value);
    if (h != null && h > 0) {
      presentEl.checked = true;
      absentEl.checked = false;
    }
  }

  function updatePresenceUi() {
    const on = isPresent();
    timesWrap.style.opacity = on ? '1' : '0.45';
    startEl.disabled = !on;
    endEl.disabled = !on;
    if (!on) {
      previewEl.textContent = 'Durée : 0 h (non présent)';
      previewEl.classList.remove('invalid');
    } else {
      updatePreview();
    }
  }

  function updatePreview() {
    if (!isPresent()) return;
    const h = hoursBetweenTimes(startEl.value, endEl.value);
    previewEl.textContent = h != null ? `Durée : ${formatContractHours(h)} h` : 'Durée invalide (fin après début)';
    previewEl.classList.toggle('invalid', h == null);
    if (h != null && h > 0) {
      presentEl.checked = true;
      absentEl.checked = false;
    }
  }

  presentEl.onchange = () => {
    if (presentEl.checked) absentEl.checked = false;
    else if (!absentEl.checked) absentEl.checked = true;
    updatePresenceUi();
  };
  absentEl.onchange = () => {
    if (absentEl.checked) presentEl.checked = false;
    else if (!presentEl.checked) presentEl.checked = true;
    updatePresenceUi();
  };
  startEl.addEventListener('input', () => { syncPresenceFromTimes(); updatePreview(); });
  endEl.addEventListener('input', () => { syncPresenceFromTimes(); updatePreview(); });

  updatePresenceUi();

  overlay.querySelector('[data-act="ok"]').onclick = () => {
    const on = isPresent();
    let start = null;
    let end = null;
    if (on) {
      start = startEl.value;
      end = endEl.value;
      const h = hoursBetweenTimes(start, end);
      if (h == null) {
        toast('Horaires invalides.', true);
        return;
      }
    }
    const r = upsertPlanningChangeRequest({
      emp,
      dateIso: iso,
      shift,
      present: on,
      start,
      end,
      comment: overlay.querySelector('#req-comment').value,
    });
    if (!r.ok) {
      toast(r.error || 'Demande invalide.', true);
      return;
    }
    saveState();
    if (typeof markSessionDirty === 'function') markSessionDirty();
    toast('Demande enregistrée — en attente de validation');
    close();
    if (onDone) onDone();
  };

  overlay.querySelector('[data-act="cancel"]').onclick = finish;
  overlay.onclick = (e) => {
    if (e.target === overlay) finish();
  };

  document.body.appendChild(overlay);
  if (isPresent()) startEl.focus();
  else absentEl.focus();
}

function renderPlanningRequestsEditor(root) {
  const pending = countPendingPlanningRequests();
  const ctrl = document.createElement('div');
  ctrl.className = 'controls';
  ctrl.innerHTML = `
    <div class="label">Demandes de modification de planning</div>
    <div class="help-text">
      Les employés proposent des changements depuis la vue Semaine (cases violettes).
      Approuver applique la modification au planning ; rejeter conserve le planning actuel.
      ${pending ? `<strong>${pending} en attente</strong>.` : 'Aucune demande en attente.'}
    </div>`;
  root.appendChild(ctrl);

  const list = ensurePlanningChangeRequests().slice().sort((a, b) => {
    const rank = { pending: 0, approved: 1, rejected: 2 };
    const dr = (rank[a.status] ?? 9) - (rank[b.status] ?? 9);
    if (dr !== 0) return dr;
    return (b.createdAt || '').localeCompare(a.createdAt || '');
  });

  const card = document.createElement('div');
  card.className = 'form-card';
  if (list.length === 0) {
    card.innerHTML = '<p class="muted">Aucune demande enregistrée.</p>';
    root.appendChild(card);
    return;
  }

  const statusLabel = { pending: 'En attente', approved: 'Approuvée', rejected: 'Rejetée' };
  let rows = '';
  for (const r of list) {
    const shiftLabel = r.shift === 'matin' ? 'Matin' : 'Après-midi';
    const d = fromISO(r.dateIso);
    const dayLabel = DAY_NAMES_ABBR[d.getDay()];
    const hoursTxt = r.present ? `${formatContractHours(r.hours)} h` : '0 h (absent)';
    const slotTxt = r.present && r.start && r.end
      ? `${formatPatternTime(r.start)} → ${formatPatternTime(r.end)}`
      : '—';
    const curVal = getPlanningValue(r.emp, r.dateIso, r.shift);
    const curHours = isPlanningPresent(curVal) ? formatContractHours(getPlanningCellHours(r.emp, r.dateIso, r.shift)) + ' h' : 'repos / vide';
    rows += `<tr class="planning-req-row planning-req-${r.status}">
      <td>${escapeHtml(r.emp)}</td>
      <td>${dayLabel} ${frFormatNumeric(r.dateIso)}</td>
      <td>${shiftLabel}</td>
      <td><span class="planning-req-badge ${r.status}">${statusLabel[r.status] || r.status}</span></td>
      <td>${r.present ? 'Oui' : 'Non'}</td>
      <td>${slotTxt}</td>
      <td><strong>${hoursTxt}</strong></td>
      <td class="muted">${curHours}</td>
      <td>${escapeHtml(r.comment || '')}</td>
      <td class="planning-req-actions">`;
    if (r.status === 'pending') {
      rows += `<button type="button" class="primary planning-req-approve" data-id="${escapeHtml(r.id)}">Approuver</button>
               <button type="button" class="nav planning-req-reject" data-id="${escapeHtml(r.id)}">Rejeter</button>`;
    } else {
      rows += `<button type="button" class="nav muted-btn planning-req-del" data-id="${escapeHtml(r.id)}">Supprimer</button>`;
    }
    rows += `</td></tr>`;
  }

  card.innerHTML = `
    <table class="list planning-requests-table">
      <thead>
        <tr>
          <th>Salarié</th>
          <th>Date</th>
          <th>Demi-j.</th>
          <th>Statut</th>
          <th>Présent</th>
          <th>Horaires demandés</th>
          <th>Heures</th>
          <th>Planning actuel</th>
          <th>Commentaire</th>
          <th></th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
  root.appendChild(card);

  card.querySelectorAll('.planning-req-approve').forEach(btn => {
    btn.onclick = () => {
      const r = approvePlanningChangeRequest(btn.dataset.id);
      if (!r.ok) { toast(r.error, true); return; }
      saveState();
      if (typeof markSessionDirty === 'function') markSessionDirty();
      persistAndRender();
      toast('Demande approuvée et appliquée au planning');
    };
  });
  card.querySelectorAll('.planning-req-reject').forEach(btn => {
    btn.onclick = () => {
      if (!confirm('Rejeter cette demande ?')) return;
      const r = rejectPlanningChangeRequest(btn.dataset.id);
      if (!r.ok) { toast(r.error, true); return; }
      saveState();
      persistAndRender();
      toast('Demande rejetée');
    };
  });
  card.querySelectorAll('.planning-req-del').forEach(btn => {
    btn.onclick = () => {
      deletePlanningChangeRequest(btn.dataset.id);
      saveState();
      persistAndRender();
    };
  });
}

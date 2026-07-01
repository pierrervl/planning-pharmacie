/* Suggestions d'amélioration — ampoule topbar, inbox réservée au propriétaire */
'use strict';

const FEEDBACK_STATUS_LABELS = {
  open: 'Nouveau',
  read: 'Lu',
  done: 'Traité',
  wontfix: 'Non retenu',
};

let feedbackOwnerResolved = null;
let feedbackOwnerOpenCount = 0;

function getFeedbackUserEmail() {
  const u = AUTH?.session?.user;
  return String(
    u?.email
    || AUTH?.profile?.email
    || u?.user_metadata?.email
    || ''
  ).trim().toLowerCase();
}

function getFeedbackOwnerEmails() {
  const fromConfig = window.SUPABASE_CONFIG?.feedbackOwnerEmails;
  if (Array.isArray(fromConfig)) {
    return fromConfig.map(e => String(e || '').trim().toLowerCase()).filter(Boolean);
  }
  return [];
}

async function loadFeedbackOwnerEmailsFromCloud() {
  if (!canUseFeedback()) return [];
  try {
    await ensureAuthClient();
    const { data, error } = await AUTH.client
      .from('app_config')
      .select('value')
      .eq('key', 'feedback_owner_emails')
      .maybeSingle();
    if (error) throw error;
    if (data?.value && Array.isArray(data.value)) {
      return data.value.map(e => String(e || '').trim().toLowerCase()).filter(Boolean);
    }
  } catch (_e) { /* table absente ou RLS */ }
  return [];
}

async function refreshFeedbackOwnerCache() {
  feedbackOwnerResolved = false;
  if (!isAuthenticated()) return false;
  const email = getFeedbackUserEmail();
  if (!email) return false;
  const emails = new Set(getFeedbackOwnerEmails());
  const cloud = await loadFeedbackOwnerEmailsFromCloud();
  cloud.forEach(e => emails.add(e));
  feedbackOwnerResolved = emails.has(email);
  return feedbackOwnerResolved;
}

function isFeedbackOwner() {
  if (feedbackOwnerResolved === true) return true;
  if (!isAuthenticated()) return false;
  const email = getFeedbackUserEmail();
  return email && getFeedbackOwnerEmails().includes(email);
}

function canUseFeedback() {
  return typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()
    && typeof isAuthenticated === 'function' && isAuthenticated();
}

async function submitAppFeedback({ title, body }) {
  if (!canUseFeedback()) throw new Error('Connexion cloud requise');
  const t = String(title || '').trim();
  const b = String(body || '').trim();
  if (t.length < 3) throw new Error('Titre trop court (3 caractères minimum)');
  if (b.length < 10) throw new Error('Description trop courte (10 caractères minimum)');

  await ensureAuthClient();
  const row = {
    user_id: AUTH.session.user.id,
    user_email: getFeedbackUserEmail() || AUTH.profile?.email || '',
    user_name: AUTH.profile?.full_name || '',
    pharmacy_id: typeof getCurrentPharmacyId === 'function' ? getCurrentPharmacyId() : null,
    pharmacy_name: AUTH.pharmacy?.name || (typeof getPharmacyInfo === 'function' ? getPharmacyInfo().name : '') || null,
    user_role: typeof getAuthRoleLabel === 'function' ? getAuthRoleLabel() : '',
    title: t,
    body: b,
    status: 'open',
  };

  const { error } = await AUTH.client.from('app_feedback').insert(row);
  if (error) throw error;
}

async function fetchOwnFeedback() {
  if (!canUseFeedback()) return [];
  await ensureAuthClient();
  const { data, error } = await AUTH.client
    .from('app_feedback')
    .select('id, title, body, status, created_at, pharmacy_name, user_id')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return data || [];
}

async function fetchAllFeedbackForOwner() {
  await ensureAuthClient();
  const { data, error } = await AUTH.client
    .from('app_feedback')
    .select('id, title, body, status, created_at, updated_at, user_email, user_name, pharmacy_name, user_role, user_id')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return data || [];
}

async function updateFeedbackStatus(id, status) {
  if (!isFeedbackOwner()) throw new Error('Accès réservé');
  await ensureAuthClient();
  const { error } = await AUTH.client
    .from('app_feedback')
    .update({ status })
    .eq('id', id);
  if (error) throw error;
}

function formatFeedbackDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('fr-FR');
  } catch (_e) {
    return iso;
  }
}

function closeFeedbackOverlay() {
  document.querySelector('.feedback-overlay')?.remove();
  document.body.classList.remove('feedback-open');
}

function openFeedbackOverlay() {
  if (!isSupabaseConfigured()) {
    if (typeof toast === 'function') toast('Cloud non configuré', true);
    return;
  }
  if (!isAuthenticated()) {
    if (typeof showAuthOverlay === 'function') showAuthOverlay({ mode: 'login' });
    return;
  }

  closeFeedbackOverlay();
  const overlay = document.createElement('div');
  overlay.className = 'feedback-overlay import-dialog-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-labelledby', 'feedback-overlay-title');
  overlay.innerHTML = `
    <div class="feedback-overlay-panel">
      <div class="feedback-overlay-head">
        <h2 id="feedback-overlay-title">💡 Suggestions</h2>
        <button type="button" class="feedback-overlay-close" aria-label="Fermer">×</button>
      </div>
      <div class="feedback-overlay-body"></div>
    </div>`;

  overlay.querySelector('.feedback-overlay-close').onclick = () => closeFeedbackOverlay();
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeFeedbackOverlay();
  });

  document.body.classList.add('feedback-open');
  document.body.appendChild(overlay);
  void renderFeedbackEditor(overlay.querySelector('.feedback-overlay-body'));
  window.requestAnimationFrame(() => overlay.classList.add('is-visible'));
}

async function renderFeedbackEditor(root) {
  await refreshFeedbackOwnerCache();
  const owner = isFeedbackOwner();
  const canSend = canUseFeedback();
  root.innerHTML = '';

  if (!canSend) {
    root.innerHTML = `
      <p><strong>Connexion cloud requise</strong> pour envoyer une suggestion.</p>
      <div class="help-step-actions">
        <button type="button" class="help-action-btn primary" data-feedback-action="login">Se connecter</button>
      </div>`;
    root.querySelector('[data-feedback-action="login"]')?.addEventListener('click', () => {
      closeFeedbackOverlay();
      if (typeof showAuthOverlay === 'function') showAuthOverlay({ mode: 'login' });
    });
    return;
  }

  const lists = document.createElement('div');
  lists.className = 'feedback-lists';
  root.appendChild(lists);
  await refreshFeedbackLists(root, { owner });

  const form = document.createElement('div');
  form.className = 'form-card feedback-form-card';
  form.innerHTML = `
    <h3>${owner ? 'Envoyer une suggestion' : 'Nouvelle suggestion'}</h3>
    <label class="feedback-field">
      Titre (résumé)
      <input type="text" class="feedback-title-input" maxlength="120" placeholder="Ex. Export PDF des congés">
    </label>
    <label class="feedback-field">
      Description
      <textarea class="feedback-body-input" rows="4" maxlength="4000"
        placeholder="Décrivez le besoin, le contexte ou le problème rencontré…"></textarea>
    </label>
    <div class="help-step-actions">
      <button type="button" class="help-action-btn primary feedback-submit-btn">Envoyer</button>
    </div>
    <p class="muted feedback-footnote">Connecté en tant que <strong>${escapeHtml(getFeedbackUserEmail())}</strong>.
    ${owner ? ' Vous voyez la boîte de réception globale ci-dessus.' : ''}</p>`;
  root.appendChild(form);

  form.querySelector('.feedback-submit-btn').onclick = async () => {
    const btn = form.querySelector('.feedback-submit-btn');
    btn.disabled = true;
    try {
      await submitAppFeedback({
        title: form.querySelector('.feedback-title-input')?.value,
        body: form.querySelector('.feedback-body-input')?.value,
      });
      form.querySelector('.feedback-title-input').value = '';
      form.querySelector('.feedback-body-input').value = '';
      if (typeof toast === 'function') toast('Suggestion envoyée — merci !');
      await refreshFeedbackLists(root, { owner: isFeedbackOwner() });
      void updateFeedbackTopbarButton();
    } catch (e) {
      if (typeof toast === 'function') toast(e.message || 'Envoi impossible', true);
    } finally {
      btn.disabled = false;
    }
  };
}

async function refreshFeedbackLists(root, { owner = false } = {}) {
  const lists = root.querySelector('.feedback-lists');
  if (!lists) return;
  lists.innerHTML = '<p class="muted">Chargement…</p>';

  try {
    let items;
    if (owner) {
      items = await fetchAllFeedbackForOwner();
      const myId = AUTH.session?.user?.id;
      const hasForeign = items.some(i => i.user_id && i.user_id !== myId);
      if (!hasForeign && items.length > 0 && !feedbackOwnerResolved) {
        feedbackOwnerResolved = false;
      }
    } else {
      items = await fetchOwnFeedback();
    }

    feedbackOwnerOpenCount = owner ? items.filter(i => i.status === 'open').length : 0;
    lists.innerHTML = '';

    if (owner) {
      const openCount = feedbackOwnerOpenCount;
      const inbox = document.createElement('div');
      inbox.className = 'form-card feedback-inbox-card';
      inbox.innerHTML = `
        <h3>Boîte de réception (${items.length}${openCount ? ` · ${openCount} nouveau${openCount > 1 ? 'x' : ''}` : ''})</h3>
        <p class="muted">Toutes les pharmacies — réservé au propriétaire de l'application.</p>`;
      if (!items.length) {
        inbox.innerHTML += '<p class="muted">Aucune suggestion pour le moment.</p>';
      } else {
        inbox.appendChild(buildFeedbackListEl(items, { owner: true }));
      }
      lists.appendChild(inbox);
    } else {
      const mine = document.createElement('div');
      mine.className = 'form-card feedback-mine-card';
      mine.innerHTML = '<h3>Vos suggestions envoyées</h3>';
      if (!items.length) {
        mine.innerHTML += '<p class="muted">Vous n\'avez encore rien envoyé.</p>';
      } else {
        mine.appendChild(buildFeedbackListEl(items, { owner: false }));
      }
      lists.appendChild(mine);
    }
    void updateFeedbackTopbarButton();
  } catch (e) {
    lists.innerHTML = `<p class="help-warn">${escapeHtml(e.message || 'Impossible de charger les suggestions')}</p>`;
  }
}

function buildFeedbackListEl(items, { owner = false } = {}) {
  const ul = document.createElement('ul');
  ul.className = 'feedback-list';
  for (const item of items) {
    const li = document.createElement('li');
    li.className = `feedback-item feedback-item--${item.status || 'open'}`;
    const meta = owner
      ? `${escapeHtml(item.pharmacy_name || 'Pharmacie ?')} · ${escapeHtml(item.user_name || item.user_email || '')} (${escapeHtml(item.user_role || '')}) · ${formatFeedbackDate(item.created_at)}`
      : `${escapeHtml(item.pharmacy_name || '')} · ${formatFeedbackDate(item.created_at)}`;
    li.innerHTML = `
      <div class="feedback-item-head">
        <strong class="feedback-item-title">${escapeHtml(item.title)}</strong>
        <span class="feedback-status-badge status-${escapeHtml(item.status)}">${escapeHtml(FEEDBACK_STATUS_LABELS[item.status] || item.status)}</span>
      </div>
      <p class="feedback-item-meta muted">${meta}</p>
      <p class="feedback-item-body">${escapeHtml(item.body).replace(/\n/g, '<br>')}</p>`;

    if (owner) {
      const actions = document.createElement('div');
      actions.className = 'feedback-item-actions';
      actions.innerHTML = `
        <select class="feedback-status-select" aria-label="Statut">
          ${Object.entries(FEEDBACK_STATUS_LABELS).map(([k, label]) =>
            `<option value="${k}" ${item.status === k ? 'selected' : ''}>${label}</option>`).join('')}
        </select>`;
      actions.querySelector('select').onchange = async (e) => {
        try {
          await updateFeedbackStatus(item.id, e.target.value);
          if (typeof toast === 'function') toast('Statut mis à jour');
          li.className = `feedback-item feedback-item--${e.target.value}`;
          const badge = li.querySelector('.feedback-status-badge');
          badge.textContent = FEEDBACK_STATUS_LABELS[e.target.value];
          badge.className = `feedback-status-badge status-${e.target.value}`;
          void updateFeedbackTopbarButton();
        } catch (err) {
          if (typeof toast === 'function') toast(err.message || 'Erreur', true);
          e.target.value = item.status;
        }
      };
      li.appendChild(actions);
    }
    ul.appendChild(li);
  }
  return ul;
}

function bindFeedbackButton() {
  const btn = document.getElementById('btn-feedback');
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.onclick = () => openFeedbackOverlay();
}

async function updateFeedbackTopbarButton() {
  const btn = document.getElementById('btn-feedback');
  if (!btn) return;
  const configured = typeof isSupabaseConfigured === 'function' && isSupabaseConfigured();
  const connected = typeof isAuthenticated === 'function' && isAuthenticated();
  btn.classList.toggle('hidden', !configured);
  if (!configured) return;

  if (connected) {
    await refreshFeedbackOwnerCache();
    const owner = isFeedbackOwner();
    btn.title = owner
      ? 'Suggestions — boîte de réception et envoi'
      : 'Proposer une amélioration';
    btn.classList.toggle('feedback-owner', owner);
    btn.classList.toggle('has-feedback-open', owner && feedbackOwnerOpenCount > 0);
    if (owner && feedbackOwnerOpenCount > 0) {
      btn.dataset.badge = String(feedbackOwnerOpenCount);
    } else {
      delete btn.dataset.badge;
    }
  } else {
    btn.title = 'Proposer une amélioration (connexion cloud requise)';
    btn.classList.remove('feedback-owner', 'has-feedback-open');
    delete btn.dataset.badge;
  }
}

function updateFeedbackTabVisibility() {
  void updateFeedbackTopbarButton();
}

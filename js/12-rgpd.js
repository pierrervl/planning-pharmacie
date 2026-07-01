/* Notice RGPD — information et accusé de lecture (pas un consentement art. 6-1-a) */
'use strict';

const RGPD_POLICY_VERSION = '2.0';
const RGPD_POLICY_DATE = '2026-07-01';

function rgpdStorageKey(userId) {
  return `rgpd_consent_v1_${userId || 'anonymous'}`;
}

function getPharmacyControllerName() {
  const local = typeof getPharmacyInfo === 'function' ? getPharmacyInfo().name : '';
  if (String(local || '').trim()) return String(local).trim();
  if (typeof AUTH !== 'undefined' && AUTH.pharmacy?.name) return AUTH.pharmacy.name;
  return 'La pharmacie employeur';
}

function readLocalRgpdConsent(userId) {
  try {
    const raw = localStorage.getItem(rgpdStorageKey(userId));
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (_e) {
    return null;
  }
}

function getRgpdConsentRecord() {
  if (typeof isAuthenticated !== 'function' || !isAuthenticated()) return null;
  const userId = AUTH.session?.user?.id;
  if (!userId) return null;

  const fromProfile = AUTH.profile?.personal_data?.rgpdConsent;
  if (fromProfile?.version === RGPD_POLICY_VERSION && fromProfile?.acceptedAt) {
    return fromProfile;
  }
  const local = readLocalRgpdConsent(userId);
  if (local?.version === RGPD_POLICY_VERSION && local?.acceptedAt) return local;
  return null;
}

function isRgpdConsentRequired() {
  return typeof isSupabaseConfigured === 'function' && isSupabaseConfigured()
    && typeof isAuthenticated === 'function' && isAuthenticated();
}

function needsRgpdAcceptance() {
  if (!isRgpdConsentRequired()) return false;
  return !getRgpdConsentRecord();
}

function shouldShowRgpdTab() {
  return needsRgpdAcceptance();
}

function updateRgpdTabVisibility() {
  const show = shouldShowRgpdTab();
  const rgpdBtn = document.querySelector('#tabs button[data-tab="rgpd"]');
  if (rgpdBtn) {
    rgpdBtn.hidden = !show;
    if (!show) rgpdBtn.style.display = '';
  }
  if (!show && typeof STATE !== 'undefined' && STATE?.ui?.currentTab === 'rgpd') {
    STATE.ui.currentTab = 'week';
  }
}

function buildRgpdNoticeHtml() {
  const pharmacy = escapeHtml(getPharmacyControllerName());
  const cloudHost = typeof window.SUPABASE_CONFIG !== 'undefined' && window.SUPABASE_CONFIG?.url
    ? escapeHtml(window.SUPABASE_CONFIG.url.replace(/^https:\/\//, ''))
    : 'Supabase (hébergeur cloud)';

  const contactRgpd = pharmacy;

  return `
    <section class="rgpd-section">
      <h3>1. Rôles et responsabilités</h3>
      <p><strong>${pharmacy}</strong>, en qualité d'employeur, est le <strong>responsable de traitement</strong>
      au sens du RGPD. Elle détermine les finalités, la base légale, l'exactitude des données saisies, les accès
      accordés et les durées de conservation appliquées dans l'établissement.</p>
      <p>L'éditeur technique fournit uniquement la solution logicielle. Selon le contrat conclu avec la pharmacie,
      il intervient soit comme simple <strong>fournisseur de logiciel</strong> (déploiement et hébergement gérés
      par la pharmacie elle-même), soit comme <strong>sous-traitant</strong> au sens de l'article 28 du RGPD
      lorsqu'il exploite l'hébergement pour le compte de la pharmacie. Dans ce dernier cas, un contrat de
      sous-traitance (DPA) encadre ses obligations et ses limites. L'éditeur n'utilise jamais les données du
      personnel pour ses propres finalités.</p>
    </section>

    <section class="rgpd-section">
      <h3>2. Données traitées</h3>
      <ul>
        <li><strong>Identité et contact&nbsp;:</strong> nom, prénom, e-mail, téléphone, adresse, matricule.</li>
        <li><strong>Données d'état civil&nbsp;:</strong> date et lieu de naissance, année de diplôme.</li>
        <li><strong>Numéro de sécurité sociale</strong> (donnée identifiante à accès restreint).</li>
        <li><strong>Données RH&nbsp;:</strong> planning, horaires, congés (CP, RTT, formation, sans solde,
        récupération), gardes, journées de solidarité, type et dates de contrat.</li>
        <li><strong>Données de santé&nbsp;:</strong> les absences pour maladie sont, au sens du RGPD, des
        <strong>données de santé</strong> (article 9). Elles ne sont saisies que dans la mesure nécessaire à la
        gestion des absences et font l'objet d'un accès restreint.</li>
        <li><strong>Données de compte et de connexion&nbsp;:</strong> identifiant, rôle, journaux techniques.</li>
      </ul>
    </section>

    <section class="rgpd-section">
      <h3>3. Finalités et base légale</h3>
      <p>Le traitement des données RH ne repose <strong>pas sur votre consentement</strong> mais sur&nbsp;:</p>
      <ul>
        <li>l'<strong>exécution du contrat de travail</strong> (art. 6-1-b) — gestion des plannings, des horaires
        et de l'organisation du travail&nbsp;;</li>
        <li>le respect des <strong>obligations légales de l'employeur</strong> (art. 6-1-c) — congés, documents RH,
        relevés d'heures&nbsp;;</li>
        <li>pour les absences maladie, les <strong>obligations en droit du travail et de la sécurité sociale</strong>
        (art. 9-2-b).</li>
      </ul>
      <p class="muted">Parce que ces traitements ne reposent pas sur le consentement, vous ne pouvez pas vous y
      opposer par un simple retrait&nbsp;; vous conservez en revanche l'ensemble des droits décrits au § 6.</p>
    </section>

    <section class="rgpd-section">
      <h3>4. Hébergement, sous-traitants et transferts</h3>
      <p>Les données synchronisées dans le cloud sont hébergées via <strong>${cloudHost}</strong> (Supabase),
      qui agit comme <strong>sous-traitant technique</strong>. Un contrat de sous-traitance (DPA) au sens de
      l'article 28 encadre cette relation.</p>
      <p>La région d'hébergement détermine l'existence éventuelle de transferts hors Union européenne&nbsp;; le
      responsable de traitement s'assure des garanties applicables (clauses contractuelles types, etc.).</p>
      <p>Des copies locales peuvent exister dans le navigateur (<em>localStorage</em>) et dans les exports JSON
      téléchargés par les utilisateurs autorisés (voir § 7).</p>
    </section>

    <section class="rgpd-section">
      <h3>5. Durées de conservation</h3>
      <p>Les données sont conservées pendant la durée de la relation de travail, puis archivées ou supprimées selon
      les obligations légales applicables. À titre indicatif, certains documents sociaux et de paie sont conservés
      plusieurs années après la fin du contrat. Les durées précises sont fixées par le responsable de traitement.</p>
      <p>La preuve de lecture de la présente notice (horodatage et identifiant de compte) est conservée le temps
      nécessaire à sa finalité, puis supprimée.</p>
    </section>

    <section class="rgpd-section">
      <h3>6. Vos droits</h3>
      <p>Conformément au RGPD, vous disposez des droits d'accès, de rectification, d'effacement, de limitation,
      d'opposition et de portabilité, dans les limites prévues par la loi. Pour les exercer, adressez-vous au
      responsable de traitement&nbsp;: <strong>${contactRgpd}</strong>.</p>
      <p>Vous pouvez introduire une réclamation auprès de la CNIL
      (<a href="https://www.cnil.fr" target="_blank" rel="noopener">cnil.fr</a>).</p>
    </section>

    <section class="rgpd-section">
      <h3>7. Sécurité, accès et exports</h3>
      <p>Des mesures techniques et organisationnelles (authentification, chiffrement des mots de passe côté
      hébergeur, cloisonnement des accès par rôle et par pharmacie) protègent les données, conformément à
      l'article 32.</p>
      <p>Selon leur rôle, certains utilisateurs consultent les plannings de leurs collègues et peuvent générer des
      <strong>exports JSON</strong> ou des impressions PDF. Ces fichiers, une fois téléchargés, sortent du périmètre
      de l'application&nbsp;: leur sécurisation relève de l'utilisateur et du responsable de traitement.</p>
      <p>Aucun système n'étant infaillible, un incident de sécurité ne peut être totalement exclu.</p>
    </section>

    <section class="rgpd-section rgpd-section--ack">
      <h3>8. Prise de connaissance et engagement de confidentialité</h3>
      <p>En validant ci-dessous, je déclare&nbsp;:</p>
      <ul>
        <li>avoir pris connaissance de la présente notice (version ${RGPD_POLICY_VERSION} du ${RGPD_POLICY_DATE})&nbsp;;</li>
        <li>être informé(e) que mes données sont traitées par <strong>${pharmacy}</strong> pour les finalités et
        sur les bases légales décrites ci-dessus&nbsp;;</li>
        <li>m'engager à préserver la <strong>confidentialité</strong> des informations auxquelles j'accède,
        notamment les plannings et données de mes collègues, et à ne pas les divulguer ni les exploiter à d'autres
        fins&nbsp;;</li>
        <li>veiller à la <strong>sécurité de mon compte</strong> (mot de passe personnel, non partagé) et à ne pas
        diffuser d'export non sécurisé.</li>
      </ul>
      <p class="rgpd-legal-hint muted">Ce document est une notice d'information et un accusé de lecture. Il ne
      constitue pas un consentement au sens de l'article 6-1-a et n'emporte renonciation à aucun droit. En cas
      d'incident de sécurité, la responsabilité éventuelle se répartit entre le responsable de traitement et son
      ou ses sous-traitants conformément à l'article 82 du RGPD et aux contrats applicables. La présente notice ne
      remplace pas un avis juridique&nbsp;; le responsable de traitement peut la compléter par sa propre politique
      de confidentialité.</p>
    </section>`;
}

async function saveRgpdConsentRecord(record) {
  const userId = AUTH.session?.user?.id;
  if (!userId) throw new Error('Session invalide');

  localStorage.setItem(rgpdStorageKey(userId), JSON.stringify(record));

  await ensureAuthClient();
  const personal_data = {
    ...(AUTH.profile?.personal_data || {}),
    rgpdConsent: record,
  };
  const { error } = await AUTH.client
    .from('profiles')
    .update({ personal_data })
    .eq('id', userId);
  if (error) throw error;
  if (AUTH.profile) AUTH.profile.personal_data = personal_data;
}

async function acceptRgpdConsent({ fullNameInput = '' } = {}) {
  const userId = AUTH.session?.user?.id;
  const email = AUTH.profile?.email || AUTH.session?.user?.email || '';
  const record = {
    version: RGPD_POLICY_VERSION,
    policyDate: RGPD_POLICY_DATE,
    acceptedAt: new Date().toISOString(),
    userId,
    email,
    fullName: String(fullNameInput || AUTH.profile?.full_name || '').trim(),
    pharmacyId: typeof getCurrentPharmacyId === 'function' ? getCurrentPharmacyId() : null,
    pharmacyName: getPharmacyControllerName(),
    role: typeof getAuthRoleLabel === 'function' ? getAuthRoleLabel() : (AUTH.profile?.role || ''),
  };

  await saveRgpdConsentRecord(record);
  if (typeof toast === 'function') toast('Accusé de lecture RGPD enregistré');
}

function restoreNavVisibilityAfterRgpd() {
  document.querySelectorAll('#nav-groups button, #tabs button').forEach(btn => {
    btn.style.display = '';
  });
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.style.display = '';
  ['btn-export-json', 'btn-import-json', 'btn-reset'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  });
  if (typeof applyEmployeeViewRestrictions === 'function') applyEmployeeViewRestrictions();
  updateRgpdTabVisibility();
}

function removeRgpdOverlay() {
  document.querySelector('.rgpd-overlay')?.remove();
  document.body.classList.remove('rgpd-locked');
}

function ensureRgpdOverlay() {
  if (!needsRgpdAcceptance()) {
    removeRgpdOverlay();
    return false;
  }

  let overlay = document.querySelector('.rgpd-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'rgpd-overlay import-dialog-overlay';
    overlay.innerHTML = `
      <div class="rgpd-overlay-panel import-dialog" role="dialog" aria-labelledby="rgpd-overlay-title">
        <h2 id="rgpd-overlay-title">Prise de connaissance RGPD requise</h2>
        <p class="muted">Vous êtes connecté au cloud — lisez la notice et validez votre accusé de lecture pour continuer.</p>
        <div class="rgpd-overlay-body"></div>
      </div>`;
    document.body.appendChild(overlay);
  }

  const body = overlay.querySelector('.rgpd-overlay-body');
  if (body && !body.dataset.mounted) {
    body.innerHTML = '';
    renderRgpdEditor(body, { compact: true });
    body.dataset.mounted = '1';
  }

  document.body.classList.add('rgpd-locked');
  return true;
}

function applyRgpdGate() {
  const pending = needsRgpdAcceptance();
  document.body.classList.toggle('rgpd-pending', pending);

  if (!pending) {
    removeRgpdOverlay();
    if (STATE.ui.currentTab === 'rgpd') STATE.ui.currentTab = 'week';
    restoreNavVisibilityAfterRgpd();
    return;
  }

  if (STATE.ui.currentTab !== 'rgpd') STATE.ui.currentTab = 'rgpd';
  ensureRgpdOverlay();

  document.querySelectorAll('#nav-groups button').forEach(btn => {
    btn.style.display = btn.dataset.group === 'config' ? '' : 'none';
  });
  document.querySelectorAll('#tabs button').forEach(btn => {
    btn.style.display = btn.dataset.tab === 'rgpd' ? '' : 'none';
  });

  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.style.display = 'none';

  ['btn-export-json', 'btn-import-json', 'btn-reset'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function bindRgpdAcceptForm(root) {
  const form = root.querySelector('.rgpd-accept-card');
  if (!form) return;

  const checks = form.querySelectorAll('.rgpd-check-input');
  const nameInput = form.querySelector('.rgpd-fullname-input');
  const acceptBtn = form.querySelector('.rgpd-accept-btn');

  function validateForm() {
    const allChecked = Array.from(checks).every(c => c.checked);
    const nameOk = String(nameInput?.value || '').trim().length >= 2;
    if (acceptBtn) acceptBtn.disabled = !(allChecked && nameOk);
  }

  checks.forEach(c => { c.onchange = validateForm; });
  if (nameInput) nameInput.oninput = validateForm;
  validateForm();

  if (!acceptBtn) return;
  acceptBtn.onclick = async () => {
    acceptBtn.disabled = true;
    try {
      await acceptRgpdConsent({ fullNameInput: nameInput?.value || '' });
      removeRgpdOverlay();
      document.body.classList.remove('rgpd-pending', 'rgpd-locked');
      if (typeof persistAndRender === 'function') persistAndRender();
      else if (typeof render === 'function') render();
      if (typeof goToTab === 'function') goToTab('week');
    } catch (e) {
      acceptBtn.disabled = false;
      if (typeof toast === 'function') toast(e.message || 'Enregistrement impossible', true);
    }
  };
}

function renderRgpdEditor(root, { compact = false } = {}) {
  const consent = getRgpdConsentRecord();
  const pending = needsRgpdAcceptance();
  const notConnected = !isRgpdConsentRequired();

  if (!compact) {
    const header = document.createElement('div');
    header.className = 'controls rgpd-header';
    header.innerHTML = `
      <div class="label">Protection des données (RGPD)</div>
      <div class="help-text">
        Notice d'information — version ${RGPD_POLICY_VERSION}
        (${typeof frFormatNumeric === 'function' ? frFormatNumeric(RGPD_POLICY_DATE) : RGPD_POLICY_DATE}).
        ${notConnected ? ' Connexion cloud requise pour enregistrer votre accusé de lecture.' : ''}
      </div>`;
    root.appendChild(header);
  }

  if (notConnected) {
    const info = document.createElement('div');
    info.className = 'form-card rgpd-required-card';
    info.innerHTML = `
      <p><strong>Connexion cloud requise</strong> — l'accusé de lecture RGPD est demandé à chaque utilisateur
      connecté via <strong>☁ Connexion cloud</strong>. Sans connexion, vous utilisez l'application en mode local uniquement.</p>`;
    root.appendChild(info);
  } else if (consent && !pending) {
    const ok = document.createElement('div');
    ok.className = 'form-card rgpd-accepted-card rgpd-accepted-card--compact';
    ok.innerHTML = `
      <p class="rgpd-accepted-msg">✓ Accusé de lecture enregistré le
        <strong>${escapeHtml(new Date(consent.acceptedAt).toLocaleString('fr-FR'))}</strong>
        (version ${escapeHtml(consent.version)}).</p>`;
    root.appendChild(ok);

    const details = document.createElement('details');
    details.className = 'form-card rgpd-document-card rgpd-readonly-details';
    details.innerHTML = `
      <summary>Consulter la notice complète</summary>
      <div class="rgpd-document">${buildRgpdNoticeHtml()}</div>`;
    root.appendChild(details);
  } else if (pending) {
    const warn = document.createElement('div');
    warn.className = 'form-card rgpd-required-card';
    warn.innerHTML = compact
      ? '<p><strong>Accusé de lecture obligatoire</strong> avant d\'accéder au planning.</p>'
      : `<p><strong>Prise de connaissance requise</strong> — veuillez lire la notice ci-dessous et valider
      les cases pour accéder à l'application.</p>`;
    root.appendChild(warn);
  }

  const doc = document.createElement('div');
  doc.className = 'form-card rgpd-document-card';
  doc.innerHTML = `
    <h3>Notice d'information</h3>
    <div class="rgpd-document">${buildRgpdNoticeHtml()}</div>`;
  if (pending || notConnected) root.appendChild(doc);

  if (pending) {
    const form = document.createElement('div');
    form.className = 'form-card rgpd-accept-card';
    form.innerHTML = `
      <h3>Accusé de lecture</h3>
      <label class="rgpd-check">
        <input type="checkbox" class="rgpd-check-input">
        J'ai lu et compris la notice d'information ci-dessus.
      </label>
      <label class="rgpd-check">
        <input type="checkbox" class="rgpd-check-input">
        Je suis informé(e) que mes données sont traitées par <strong>${escapeHtml(getPharmacyControllerName())}</strong>
        sur les bases légales décrites (contrat de travail et obligations légales).
      </label>
      <label class="rgpd-check">
        <input type="checkbox" class="rgpd-check-input">
        Je m'engage à préserver la confidentialité des données de l'équipe auxquelles j'ai accès
        et à sécuriser mon compte.
      </label>
      <label class="rgpd-field">
        Nom et prénom (signature électronique)
        <input type="text" class="rgpd-fullname-input" value="${escapeHtml(AUTH.profile?.full_name || '')}" placeholder="Prénom Nom">
      </label>
      <div class="help-step-actions">
        <button type="button" class="help-action-btn primary rgpd-accept-btn" disabled>
          Je valide et accède à l'application
        </button>
      </div>
      <p class="muted rgpd-footnote">Horodatage et identifiant de compte enregistrés à des fins de preuve.</p>`;
    root.appendChild(form);
    bindRgpdAcceptForm(root);
  }
}

function refreshRgpdUi() {
  if (typeof applyRgpdGate === 'function') applyRgpdGate();
  updateRgpdTabVisibility();
  if (typeof renderAuthBar === 'function') renderAuthBar();
  if (typeof syncNavTabs === 'function') syncNavTabs();
}

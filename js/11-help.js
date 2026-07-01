/* Onglet Aide — procédure de démarrage pour les pharmacies */
'use strict';

const WELCOME_SEEN_KEY = 'planning_welcome_seen_v1';
let helpStartupSpotlight = false;

function hasSeenWelcome() {
  try { return localStorage.getItem(WELCOME_SEEN_KEY) === '1'; } catch (_e) { return false; }
}

function markWelcomeSeen() {
  try { localStorage.setItem(WELCOME_SEEN_KEY, '1'); } catch (_e) { /* ignore */ }
}

function shouldShowWelcomeOverlay() {
  if (hasSeenWelcome()) return false;
  if (typeof needsRgpdAcceptance === 'function' && needsRgpdAcceptance()) return false;
  if (typeof isStaff === 'function' && isStaff()
    && typeof isAdmin === 'function' && !isAdmin()) return false;
  return true;
}

function getWelcomePharmacyLabel() {
  const local = typeof getPharmacyInfo === 'function' ? getPharmacyInfo().name : '';
  if (String(local || '').trim()) return String(local).trim();
  if (typeof AUTH !== 'undefined' && AUTH.pharmacy?.name) return AUTH.pharmacy.name;
  return 'votre pharmacie';
}

function dismissWelcomeOverlay() {
  document.querySelector('.welcome-overlay')?.remove();
  document.body.classList.remove('welcome-active');
}

function pulseHelpNavTab() {
  const helpBtn = document.querySelector('#tabs button[data-tab="help"]');
  if (!helpBtn) return;
  helpBtn.classList.add('nav-tab-pulse');
  window.setTimeout(() => helpBtn.classList.remove('nav-tab-pulse'), 4500);
}

function startWelcomeTutorial() {
  markWelcomeSeen();
  dismissWelcomeOverlay();
  helpStartupSpotlight = true;
  if (typeof STATE !== 'undefined') STATE.ui.currentTab = 'help';
  if (typeof persistAndRender === 'function') persistAndRender();
  else if (typeof render === 'function') render();
  pulseHelpNavTab();
}

function showWelcomeOverlayIfNeeded() {
  if (!shouldShowWelcomeOverlay()) return;
  if (document.querySelector('.welcome-overlay')) return;

  const pharmacy = escapeHtml(getWelcomePharmacyLabel());
  const overlay = document.createElement('div');
  overlay.className = 'welcome-overlay import-dialog-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-labelledby', 'welcome-title');
  overlay.innerHTML = `
    <div class="welcome-panel">
      <div class="welcome-icon-wrap" aria-hidden="true">
        <span class="welcome-icon welcome-icon--calendar">📅</span>
        <span class="welcome-icon welcome-icon--pharmacy">💊</span>
      </div>
      <h2 id="welcome-title" class="welcome-title">Planning de ${pharmacy}</h2>
      <p class="welcome-lead">
        Bienvenue sur l'outil de gestion du planning de votre officine.
        Vous allez pouvoir créer votre environnement&nbsp;: équipe, horaires, congés et synchronisation cloud.
      </p>
      <p class="welcome-hint muted">
        Suivez le tutoriel pas à pas dans l'onglet <strong>Aide</strong> pour démarrer.
      </p>
      <div class="welcome-actions">
        <button type="button" class="help-action-btn primary welcome-start-btn">Commencer le tutoriel</button>
        <button type="button" class="help-action-btn welcome-skip-btn">Plus tard</button>
      </div>
    </div>`;

  overlay.querySelector('.welcome-start-btn').onclick = () => startWelcomeTutorial();
  overlay.querySelector('.welcome-skip-btn').onclick = () => {
    markWelcomeSeen();
    dismissWelcomeOverlay();
  };
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      markWelcomeSeen();
      dismissWelcomeOverlay();
    }
  });

  document.body.classList.add('welcome-active');
  document.body.appendChild(overlay);
  window.requestAnimationFrame(() => overlay.classList.add('is-visible'));
}

function applyHelpStartupSpotlight(root) {
  if (!helpStartupSpotlight) return;
  helpStartupSpotlight = false;
  const accordion = root.querySelector('#help-startup-admin');
  if (!accordion) return;
  accordion.open = true;
  accordion.classList.add('help-accordion--spotlight');
  accordion.scrollIntoView({ behavior: 'smooth', block: 'start' });
  window.setTimeout(() => accordion.classList.remove('help-accordion--spotlight'), 6000);
}

function helpStepClass(done) {
  return done ? 'help-step is-done' : 'help-step';
}

function hasPharmacyInfoConfigured(state = STATE) {
  const info = state.pharmacyInfo || {};
  return !!(String(info.name || '').trim() || String(info.siret || '').trim());
}

function hasPatternContent(state = STATE) {
  for (const emp of state.employees || []) {
    const weeks = (state.patterns || {})[emp];
    if (!weeks) continue;
    for (const pname of Object.keys(weeks)) {
      const week = weeks[pname];
      if (!Array.isArray(week)) continue;
      for (const day of week) {
        if (day && (day.matin === 1 || day.aprem === 1)) return true;
      }
    }
  }
  return false;
}

function hasPlanningContent(state = STATE) {
  for (const emp of state.employees || []) {
    const days = (state.planning || {})[emp];
    if (!days) continue;
    for (const iso of Object.keys(days)) {
      const d = days[iso];
      if (d && (d.matin === 1 || d.aprem === 1)) return true;
    }
  }
  return false;
}

function getStartupProgress(state = STATE) {
  const cloudOk = typeof isAuthenticated === 'function' && isAuthenticated()
    && typeof getCurrentPharmacyId === 'function' && !!getCurrentPharmacyId();
  const steps = [
    { id: 'cloud', done: cloudOk },
    { id: 'pharmacy-info', done: hasPharmacyInfoConfigured(state) },
    { id: 'employees', done: (state.employees || []).length > 0 },
    { id: 'patterns', done: hasPatternContent(state) },
    { id: 'planning', done: hasPlanningContent(state) },
    { id: 'sync', done: cloudOk && hasPlanningContent(state) },
  ];
  const doneCount = steps.filter(s => s.done).length;
  return { steps, doneCount, total: steps.length };
}

function createHelpAccordion({ id, title, hint, open = false, bodyHtml }) {
  const details = document.createElement('details');
  details.className = 'help-accordion';
  details.id = id;
  if (open) details.open = true;
  details.innerHTML = `
    <summary class="help-accordion-summary">
      <span class="help-accordion-chevron" aria-hidden="true"></span>
      <span class="help-accordion-title">${title}</span>
      ${hint ? `<span class="help-accordion-hint">${hint}</span>` : ''}
    </summary>
    <div class="help-accordion-body">${bodyHtml}</div>`;
  return details;
}

function renderHelpEditor(root) {
  const progress = getStartupProgress();
  const pct = progress.total ? Math.round((progress.doneCount / progress.total) * 100) : 0;
  const isAdminUser = typeof isAdmin === 'function' ? isAdmin() : (typeof canEditPlanning === 'function' ? canEditPlanning() : true);
  const isStaffUser = typeof isStaff === 'function' && isStaff();
  const isTeamLeaderUser = typeof isTeamLeader === 'function' && isTeamLeader();
  const cloudConfigured = typeof isSupabaseConfigured === 'function' && isSupabaseConfigured();
  const pharmacyName = typeof AUTH !== 'undefined' && AUTH.pharmacy?.name ? AUTH.pharmacy.name : null;
  const inviteCode = typeof AUTH !== 'undefined' && AUTH.pharmacy?.invite_code ? AUTH.pharmacy.invite_code : null;

  const header = document.createElement('div');
  header.className = 'controls help-header';
  const headerIntro = isAdminUser && progress.doneCount < progress.total
    ? 'Commencez par <strong>Mise en route — titulaire</strong> ci-dessous pour créer l\'environnement de votre pharmacie.'
    : 'Guides et procédures — ouvrez les sections ci-dessous selon vos besoins.';
  header.innerHTML = `
    <div class="label">Aide</div>
    <div class="help-text">${headerIntro}</div>`;
  root.appendChild(header);

  const accordions = document.createElement('div');
  accordions.className = 'help-accordions';

  if (isAdminUser) {
    accordions.appendChild(createHelpAccordion({
      id: 'help-startup-admin',
      title: 'Mise en route — titulaire / administrateur',
      hint: `${progress.doneCount}/${progress.total} étapes · à lire en premier`,
      open: progress.doneCount < progress.total,
      bodyHtml: buildAdminStartupHtml({ progress, cloudConfigured, pharmacyName, inviteCode, pct }),
    }));
  }

  if (isStaffUser) {
    accordions.appendChild(createHelpAccordion({
      id: 'help-employee-guide',
      title: isTeamLeaderUser ? 'Vue salarié / chef d\'équipe' : 'Vue salarié',
      hint: 'Planning · demandes · congés',
      open: !isAdminUser,
      bodyHtml: buildEmployeeGuideHtml({ isTeamLeader: isTeamLeaderUser, cloudConfigured }),
    }));
  }

  accordions.appendChild(createHelpAccordion({
    id: 'help-planning-tuto',
    title: 'Utiliser le planning (vue Semaine)',
    hint: isAdminUser ? 'Clics, couleurs, heures' : 'Administrateurs',
    open: false,
    bodyHtml: buildPlanningTutorialHtml({ forAdmin: isAdminUser || !isStaffUser }),
  }));

  accordions.appendChild(createHelpAccordion({
    id: 'help-startup-join',
    title: 'Rejoindre une pharmacie existante',
    hint: 'Salariés invités',
    open: false,
    bodyHtml: buildJoinStartupHtml({ cloudConfigured }),
  }));

  accordions.appendChild(createHelpAccordion({
    id: 'help-saving',
    title: 'Enregistrement et sauvegarde',
    hint: 'Local · Cloud auto · JSON',
    open: false,
    bodyHtml: buildSavingHtml({ cloudConfigured }),
  }));

  accordions.appendChild(createHelpAccordion({
    id: 'help-tips',
    title: 'Bonnes pratiques',
    hint: '',
    open: false,
    bodyHtml: `
      <ul class="help-tips-list">
        <li>Utilisez l'application via <strong>http://localhost:8080</strong> ou votre hébergement web — pas en ouvrant le fichier HTML directement.</li>
        <li>Le cloud se synchronise automatiquement une fois connecté — exportez quand même en JSON de temps en temps.</li>
        <li>Le code d'invitation est visible dans <strong>Paramètres → Comptes utilisateurs</strong> (réservé aux administrateurs).</li>
        <li>Les comptes employés ne voient que leur propre planning et peuvent proposer des congés ou des modifications.</li>
      </ul>`,
  }));

  root.appendChild(accordions);
  applyHelpStartupSpotlight(root);
  bindHelpActions(root);
}

function buildEmployeeGuideHtml({ isTeamLeader = false, cloudConfigured = false } = {}) {
  const linkedName = typeof getLinkedEmployeeName === 'function' ? getLinkedEmployeeName() : null;
  const linkedNote = linkedName
    ? `<p class="help-current">Votre compte est lié à : <strong>${escapeHtml(linkedName)}</strong></p>`
    : `<p class="help-warn">Votre compte n'est pas encore lié à une fiche salarié — contactez l'administrateur.</p>`;

  const planningClickScope = isTeamLeader
    ? 'Cliquez sur une demi-journée de <strong>n\'importe quel salarié</strong> pour proposer une modification.'
    : 'Cliquez uniquement sur <strong>votre ligne</strong> (mise en évidence dans le tableau).';

  const congesScope = isTeamLeader
    ? 'En tant que chef d\'équipe, vous pouvez saisir un congé pour <strong>tout salarié</strong> de l\'équipe.'
    : 'Vous ne pouvez saisir un congé que <strong>pour vous-même</strong>.';

  const teamLeaderBlock = isTeamLeader ? `
    <h3 class="help-subtitle">Rôle chef d'équipe</h3>
    <ul class="help-tips-list">
      <li>Vous consultez le planning de <strong>toute l'équipe</strong>, pas seulement la vôtre.</li>
      <li>Vous pouvez proposer des modifications de planning pour <strong>chaque salarié</strong>.</li>
      <li>Vous pouvez enregistrer des congés au nom de vos collègues.</li>
      <li>Comme pour un salarié, vos propositions restent en <strong>violet</strong> jusqu'à validation par l'administrateur.</li>
    </ul>` : '';

  return `
    <p class="help-section-intro">
      Compte salarié connecté au cloud : vous consultez le planning, proposez des changements
      et déclarez vos congés. Vous ne modifiez pas le planning directement — l'administrateur valide vos demandes.
    </p>
    ${linkedNote}
    <div class="help-step-actions" style="margin-bottom:14px">
      <button type="button" class="help-action-btn primary settings-goto" data-tab="week">→ Vue Semaine</button>
      <button type="button" class="help-action-btn settings-goto" data-tab="conges">→ Congés</button>
      ${cloudConfigured ? '<button type="button" class="help-action-btn" data-help-action="sync">☁ Synchroniser</button>' : ''}
    </div>

    <h3 class="help-subtitle">Onglets disponibles</h3>
    <ul class="help-tips-list">
      <li><strong>Semaine</strong> — planning de l'équipe sur 3 semaines (navigation, filtres latéraux).</li>
      <li><strong>Congés</strong> — demander une absence (CP, RTT, maladie…).</li>
      <li><strong>Aide</strong> — ce guide.</li>
    </ul>

    <h3 class="help-subtitle">Consulter le planning</h3>
    <ul class="help-tips-list">
      <li>Chaque jour = deux demi-journées <strong>M</strong> (matin) et <strong>A</strong> (après-midi).</li>
      <li>Basculez l'affichage <strong>Croix</strong> / <strong>Heures</strong> au-dessus du tableau.</li>
      <li>Utilisez le panneau latéral pour filtrer les types de cellules (travail, repos, congés…).</li>
      ${isTeamLeader ? '' : '<li>Votre ligne est identifiable dans le tableau (surbrillance).</li>'}
    </ul>

    <h3 class="help-subtitle">Proposer une modification de planning</h3>
    <p>${planningClickScope}</p>
    <ol class="help-tips-list help-steps-inline">
      <li>Un clic ouvre la fenêtre <strong>Demande de modification</strong>.</li>
      <li>Cochez <strong>Présent</strong> ou <strong>Non présent</strong>, renseignez début / fin si présent, ajoutez un commentaire si besoin.</li>
      <li>Validez avec <strong>Enregistrer la demande</strong> — la cellule passe en <span class="help-swatch request-pending"></span> <strong>violet</strong>.</li>
      <li>Le planning réel <strong>ne change pas</strong> tant que l'administrateur n'a pas approuvé la demande.</li>
      <li>Recliquez sur une case violette pour <strong>modifier</strong> ou <strong>Retirer la demande</strong>.</li>
    </ol>
    <p class="muted">Les cases violettes indiquent une proposition en attente, pas le planning définitif.</p>

    <h3 class="help-subtitle">Demander un congé ou une absence</h3>
    <p>Dans l'onglet <strong>Congés</strong> :</p>
    <ul class="help-tips-list">
      <li>${congesScope}</li>
      <li>Choisissez le <strong>type</strong> (CP, RTT, maladie, formation…), les dates de début et fin, un commentaire facultatif.</li>
      <li>À l'ajout, les demi-journées de travail sur la période sont automatiquement retirées du planning.</li>
      <li>Vous pouvez <strong>supprimer</strong> vos propres congés depuis la liste (bouton Supprimer).</li>
    </ul>

    <h3 class="help-subtitle">Synchronisation cloud</h3>
    <p>
      ${cloudConfigured
        ? `Une fois connecté, vos demandes violettes et vos congés sont <strong>envoyés automatiquement</strong> sur le serveur (environ 4 s après la dernière modification). Le planning est aussi <strong>actualisé toutes les 45 s</strong> et au retour sur l'onglet.`
        : 'La synchronisation cloud n\'est pas configurée sur cette instance.'}
    </p>
    <ul class="help-tips-list">
      <li>Le bouton <strong>☁ Synchroniser</strong> clignote tant qu'un envoi est en attente ; il sert surtout à <strong>forcer</strong> une sync immédiate.</li>
      <li>L'administrateur reçoit vos congés et demandes sans action de votre part dans la plupart des cas.</li>
      <li>L'administrateur valide ou rejette vos propositions violettes depuis son compte.</li>
    </ul>

    <h3 class="help-subtitle">Couleurs utiles</h3>
    <ul class="help-legend-list">
      <li><span class="help-swatch plein"></span> Travail (planning validé)</li>
      <li><span class="help-swatch vide rest"></span> Repos</li>
      <li><span class="help-swatch vide cp"></span> Congé / absence enregistré</li>
      <li><span class="help-swatch request-pending"></span> <strong>Votre demande en attente</strong></li>
    </ul>
    ${teamLeaderBlock}`;
}

function buildPlanningTutorialHtml({ forAdmin = true } = {}) {
  const staffNote = forAdmin ? '' : `
    <p class="help-warn">Cette section décrit la manipulation <strong>directe</strong> réservée aux administrateurs.
    Si vous êtes salarié, consultez plutôt la section <strong>Vue salarié</strong> ci-dessus.</p>`;
  return `
    ${staffNote}
    <p class="help-section-intro">
      L'onglet <strong>Semaine</strong> affiche le calendrier réel de l'équipe.
      Chaque jour est découpé en deux demi-journées : <strong>M</strong> (matin) et <strong>A</strong> (après-midi).
    </p>
    <div class="help-step-actions" style="margin-bottom:14px">
      <button type="button" class="help-action-btn primary settings-goto" data-tab="week">→ Ouvrir la vue Semaine</button>
    </div>

    <h3 class="help-subtitle">Les clics sur une cellule</h3>
    <div class="help-clicks-grid">
      <div class="help-click-card">
        <strong>Clic gauche</strong>
        <p>Fait tourner la cellule : <em>vide → travail (✕ bleu) → repos (beige) → travail…</em></p>
      </div>
      <div class="help-click-card">
        <strong>Clic droit</strong>
        <p>Cycle des horaires spéciaux : <em>orange → rouge → travail standard</em>.</p>
        <p class="muted">Au passage en orange ou rouge, la saisie des horaires s'ouvre (début, fin, durée).
        Raccourci : <kbd>Ctrl</kbd> + clic gauche = même effet.</p>
      </div>
    </div>

    <h3 class="help-subtitle">Couleurs des cellules</h3>
    <ul class="help-legend-list">
      <li><span class="help-swatch plein"></span> <strong>Travail</strong> — présence habituelle (croix bleue en mode « Croix »)</li>
      <li><span class="help-swatch plein special"></span> <strong>Orange</strong> — travail avec horaire modifié (1<sup>re</sup> étape clic droit)</li>
      <li><span class="help-swatch plein special-red"></span> <strong>Rouge</strong> — horaire modifié (2<sup>e</sup> étape clic droit)</li>
      <li><span class="help-swatch vide rest"></span> <strong>Repos</strong> — demi-journée off</li>
      <li><span class="help-swatch vide empty"></span> <strong>Vide</strong> — non renseigné</li>
      <li><span class="help-swatch vide cp"></span> <strong>Congés</strong> — CP, RTT, maladie, formation… (couleur selon le type)</li>
      <li><span class="help-swatch ferie"></span> <strong>Férié</strong> — jour férié (hachures)</li>
      <li><span class="help-swatch request-pending"></span> <strong>Violet</strong> — demande de modification en attente (validation admin)</li>
    </ul>

    <h3 class="help-subtitle">Affichage Croix / Heures</h3>
    <p>Au-dessus du tableau, basculez entre <strong>Croix</strong> (✕ sur fond bleu) et <strong>Heures</strong>
    (durée calculée, ex. 5,5 h). En mode Heures, les cellules orange/rouge affichent la durée saisie ;
    survolez une cellule pour voir le détail des horaires.</p>

    <h3 class="help-subtitle">Colonne H./sem. et formatage conditionnel</h3>
    <p>À droite de chaque semaine, la colonne <strong>H./sem.</strong> totalise les heures travaillées du salarié
    sur cette semaine (matin + après-midi).</p>
    <ul class="help-tips-list">
      <li>Fond <strong>normal</strong> : le total correspond au <strong>pattern</strong> attendu pour cette semaine du cycle (S1, S2…).</li>
      <li>Fond <span class="help-inline-mismatch">rouge</span> : <strong>écart avec le pattern</strong> — le réalisé ne correspond pas aux heures prévues. Survolez la cellule pour le détail (réalisé vs attendu).</li>
      <li>La colonne <strong>H./mois.</strong> cumule les heures travaillées sur le mois calendaire (sans comparaison au pattern).</li>
    </ul>
    <p class="help-legend-demo">
      <span class="help-demo-hours ok">35</span> conforme au pattern
      <span class="help-demo-hours bad">32</span> écart détecté
    </p>

    <h3 class="help-subtitle">Ligne d'effectif (bas du tableau)</h3>
    <p>La dernière ligne indique combien de personnes sont présentes par demi-journée. Couleur conditionnelle :</p>
    <ul class="help-tips-list">
      <li><span class="help-effectif-swatch low"></span> <strong>Rouge</strong> — 2 personnes ou moins</li>
      <li><span class="help-effectif-swatch mid"></span> <strong>Jaune</strong> — 3 personnes</li>
      <li><span class="help-effectif-swatch high"></span> <strong>Vert</strong> — 4 personnes ou plus</li>
    </ul>

    <h3 class="help-subtitle">Filtres (panneau latéral)</h3>
    <p>Cochez les salariés, le créneau (matin / après-midi / les deux) et les types de cellules à afficher
    (travail, repos, vide, congés…) pour simplifier la lecture.</p>`;
}

function buildAdminStartupHtml({ progress, cloudConfigured, pharmacyName, inviteCode, pct }) {
  const steps = buildAdminStartupSteps({ progress, cloudConfigured, pharmacyName, inviteCode });
  return `
    <p class="help-section-intro">Créez l'espace cloud de la pharmacie puis construisez le planning pour toute l'équipe.</p>
    <div class="help-progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
      <div class="help-progress-bar" style="width:${pct}%"></div>
      <span class="help-progress-label">${progress.doneCount} / ${progress.total} étapes complétées</span>
    </div>
    ${renderStepsListHtml(steps)}`;
}

function buildJoinStartupHtml({ cloudConfigured }) {
  return `
    <p class="help-section-intro">Pour un salarié invité par le titulaire :</p>
    ${renderStepsListHtml(buildJoinStartupSteps({ cloudConfigured }))}`;
}

function buildSavingHtml({ cloudConfigured }) {
  return `
    <p class="help-section-intro">
      Quatre niveaux de persistance — navigateur local, cloud automatique pour l'équipe, JSON en archive, et sync manuelle si besoin.
    </p>
    <div class="help-save-tiers">
      <article class="help-save-tier">
        <div class="help-save-tier-head"><span class="help-save-tier-icon">💾</span><h3>1. Navigateur — automatique</h3></div>
        <p>Chaque modification est enregistrée dans le navigateur (<em>localStorage</em>). Même appareil, même navigateur = reprise automatique, même hors ligne.</p>
        <ul class="help-save-proscons"><li><strong>Limite :</strong> lié à cet ordinateur ; perdu si vous videz les données du site.</li></ul>
      </article>
      <article class="help-save-tier help-save-tier--recommended-cloud">
        <div class="help-save-tier-head"><span class="help-save-tier-icon">☁</span><h3>2. Cloud — automatique (connecté)</h3></div>
        ${cloudConfigured ? `
        <p>Connecté à Supabase, le cloud se synchronise <strong>sans clic</strong> :</p>
        <ul class="help-save-proscons">
          <li><strong>Envoi</strong> — environ <strong>4 secondes</strong> après la dernière modification (planning admin, congés et demandes salariés).</li>
          <li><strong>Réception</strong> — toutes les <strong>45 secondes</strong> si l'onglet est ouvert ; aussi au retour sur l'onglet.</li>
          <li><strong>Fermeture</strong> — envoi immédiat des changements en attente.</li>
        </ul>
        <p class="muted">Le bouton <strong>☁ Synchroniser</strong> (en haut) clignote tant qu'un envoi est en attente. Cliquez dessus pour forcer une sync immédiate.</p>
        <ul class="help-save-proscons">
          <li><strong>Administrateur :</strong> envoie le planning ; reçoit congés et demandes violettes des salariés sans écraser ses modifications en cours.</li>
          <li><strong>Salarié :</strong> envoie congés et demandes ; reçoit le planning à jour.</li>
        </ul>
        <div class="help-step-actions">
          <button type="button" class="help-action-btn" data-help-action="login">Se connecter</button>
          <button type="button" class="help-action-btn" data-help-action="sync">Forcer la sync</button>
        </div>` : '<p class="help-warn">Cloud non configuré — seuls le navigateur et le JSON sont disponibles.</p>'}
      </article>
      <article class="help-save-tier help-save-tier--recommended-local">
        <div class="help-save-tier-head"><span class="help-save-tier-icon">⬇</span><h3>3. Fichier JSON — archive locale</h3></div>
        <p>Copie de secours indépendante du cloud : <strong>⬇ JSON</strong> → dossier <code>sauvegardes/</code>, <strong>⬆ JSON</strong> pour restaurer.</p>
        <p class="muted">Recommandé avant une grosse modification ou en complément du cloud.</p>
        <div class="help-step-actions"><button type="button" class="help-action-btn primary" data-help-action="export-json">Exporter JSON</button></div>
      </article>
    </div>
    <p class="help-save-summary muted">Navigateur en continu · cloud auto si connecté · JSON en secours.</p>`;
}

function renderStepsListHtml(steps) {
  let html = '<ol class="help-steps-list">';
  for (const step of steps) {
    let actionsHtml = '';
    if (step.actions?.length) {
      actionsHtml = `<div class="help-step-actions">${step.actions.map(a => renderStepActionBtn(a)).join('')}</div>`;
    }
    html += `
      <li class="${helpStepClass(step.done)}${step.optional ? ' is-optional' : ''}">
        <div class="help-step-head">
          <span class="help-step-status" aria-hidden="true">${step.done ? '✓' : '○'}</span>
          <h3>${escapeHtml(step.title)}</h3>
        </div>
        <div class="help-step-body">${step.body}${actionsHtml}</div>
      </li>`;
  }
  html += '</ol>';
  return html;
}

function renderStepActionBtn(a) {
  if (a.action === 'login') return `<button type="button" class="help-action-btn" data-help-action="login">${escapeHtml(a.label)}</button>`;
  if (a.action === 'signup') return `<button type="button" class="help-action-btn" data-help-action="signup">${escapeHtml(a.label)}</button>`;
  if (a.action === 'sync') return `<button type="button" class="help-action-btn primary" data-help-action="sync">${escapeHtml(a.label)}</button>`;
  return `<button type="button" class="help-action-btn settings-goto" data-tab="${escapeHtml(a.tab)}"${a.hash ? ` data-hash="${escapeHtml(a.hash)}"` : ''}>${escapeHtml(a.label)}</button>`;
}

function buildAdminStartupSteps({ progress, cloudConfigured, pharmacyName, inviteCode }) {
  const stepDone = (id) => progress.steps.find(s => s.id === id)?.done;
  return [
    {
      id: 'cloud', done: stepDone('cloud'),
      title: '1. Créer votre compte et votre pharmacie cloud',
      body: `<p>Inscrivez-vous via <strong>☁ Connexion cloud</strong>, choisissez <em>Créer une nouvelle pharmacie</em>.</p>
        ${pharmacyName ? `<p class="help-current">Pharmacie active : <strong>${escapeHtml(pharmacyName)}</strong></p>` : ''}
        ${cloudConfigured ? '' : '<p class="help-warn">Supabase non configuré.</p>'}`,
      actions: cloudConfigured ? [{ label: 'Se connecter / S\'inscrire', action: 'login' }] : [],
    },
    {
      id: 'pharmacy-info', done: stepDone('pharmacy-info'),
      title: '2. Renseigner les informations de la pharmacie',
      body: `<p>Nom, adresse, SIRET, FINESS — pour les contrats PDF.</p>`,
      actions: [{ label: '→ Pharmacie & employeur', tab: 'settings', hash: 'cfg-contract-party' }],
    },
    {
      id: 'employees', done: stepDone('employees'),
      title: '3. Ajouter les salariés',
      body: `<p>Créez l'équipe avec types et couleurs.</p>`,
      actions: [{ label: '→ Équipe', tab: 'employees' }],
    },
    {
      id: 'patterns', done: stepDone('patterns'),
      title: '4. Définir les patterns (semaines-types)',
      body: `${typeof PATTERN_CONCEPT_NOTE !== 'undefined' ? `<div class="pattern-concept-note pattern-concept-note--compact">${PATTERN_CONCEPT_NOTE}</div>` : ''}
        <p>Durée du cycle, horaires par défaut, semaines-types, ancrage calendaire.</p>`,
      actions: [
        { label: '→ Patterns', tab: 'patterns' },
        { label: '→ Ancrage cycle', tab: 'settings', hash: 'cfg-pattern-anchor' },
      ],
    },
    {
      id: 'planning', done: stepDone('planning'),
      title: '5. Importer le cycle dans le planning',
      body: `<p><strong>Importer le cycle vers le planning</strong> — le tampon est appliqué sur le calendrier.</p>`,
      actions: [{ label: '→ Patterns → Import', tab: 'patterns' }, { label: '→ Vue Semaine', tab: 'week' }],
    },
    {
      id: 'invite', done: false,
      title: '6. Inviter les collègues',
      body: `<p>Partagez le code d'invitation. Associez chaque compte au salarié.</p>
        ${inviteCode ? `<p class="help-current">Code : <code class="auth-invite-code">${escapeHtml(inviteCode)}</code></p>` : '<p class="muted">Connectez-vous en admin pour voir le code.</p>'}`,
      actions: [{ label: '→ Comptes utilisateurs', tab: 'settings', hash: 'cfg-users' }],
    },
    {
      id: 'sync', done: stepDone('sync'),
      title: '7. Cloud synchronisé',
      body: `<p>Le cloud se synchronise <strong>automatiquement</strong> une fois connecté (envoi ~4 s après modification, réception ~45 s). Le bouton <strong>☁ Synchroniser</strong> permet de forcer une sync.</p>`,
      actions: [{ label: 'Forcer la sync', action: 'sync' }, { label: '→ Vue Semaine', tab: 'week' }],
    },
    {
      id: 'optional', done: false, optional: true,
      title: '8. (Optionnel) Journées spéciales',
      body: `<p>Fériés, gardes, journées de solidarité.</p>`,
      actions: [
        { label: '→ Jours fériés', tab: 'feries' },
        { label: '→ Jours de garde', tab: 'gardes' },
        { label: '→ Journées de solidarité', tab: 'pantecotes' },
      ],
    },
  ];
}

function buildJoinStartupSteps({ cloudConfigured }) {
  return [
    {
      id: 'join-cloud',
      done: typeof isAuthenticated === 'function' && isAuthenticated(),
      title: '1. Créer votre compte',
      body: `<p>Inscription avec le <strong>code d'invitation</strong> du titulaire.</p>`,
      actions: cloudConfigured ? [{ label: 'S\'inscrire', action: 'signup' }] : [],
    },
    {
      id: 'join-link',
      done: !!(typeof getLinkedEmployeeName === 'function' && getLinkedEmployeeName()),
      title: '2. Être lié à votre fiche salarié',
      body: `<p>L'administrateur associe votre compte au nom exact dans le planning.</p>`,
    },
    {
      id: 'join-use', done: false,
      title: '3. Consulter et proposer',
      body: `<p>Planning dans <strong>Semaine</strong> (propositions violettes), congés dans <strong>Congés</strong>.
        Détail dans la section <strong>Vue salarié</strong> de l'aide.</p>`,
      actions: [{ label: '→ Semaine', tab: 'week' }, { label: '→ Congés', tab: 'conges' }, { label: '→ Aide salarié', tab: 'help' }],
    },
  ];
}

function bindHelpActions(root) {
  if (typeof bindSettingsNavLinks === 'function') bindSettingsNavLinks(root);

  root.querySelectorAll('[data-help-action="login"]').forEach(btn => {
    btn.onclick = () => { if (typeof showAuthOverlay === 'function') showAuthOverlay({ mode: 'login' }); };
  });
  root.querySelectorAll('[data-help-action="signup"]').forEach(btn => {
    btn.onclick = () => { if (typeof showAuthOverlay === 'function') showAuthOverlay({ mode: 'signup' }); };
  });
  root.querySelectorAll('[data-help-action="sync"]').forEach(btn => {
    btn.onclick = async () => {
      if (typeof isAuthenticated === 'function' && !isAuthenticated()) {
        if (typeof showAuthOverlay === 'function') showAuthOverlay({ mode: 'login' });
        return;
      }
      if (typeof forceCloudSync === 'function') {
        try { await forceCloudSync(); } catch (_e) { /* toast */ }
      } else document.getElementById('btn-cloud-sync')?.click();
    };
  });
  root.querySelectorAll('[data-help-action="export-json"]').forEach(btn => {
    btn.onclick = () => {
      if (typeof exportJSON === 'function') exportJSON();
      else document.getElementById('btn-export-json')?.click();
    };
  });
}

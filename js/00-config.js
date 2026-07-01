/* Configuration Supabase — projet Planning pharmacie */
'use strict';

window.SUPABASE_CONFIG = {
  url: 'https://jzlkqizzgmnlmaagijrv.supabase.co',
  anonKey: 'sb_publishable_vrKp9iv5TJYgHL_rnRWJOA_04OkxLEm',
  feedbackOwnerEmails: ['p.raveleau@enthalpie.fr'],
  /* Support technique : seul(s) compte(s) pouvant changer de pharmacie / en rejoindre plusieurs.
     Doit aussi être dans Supabase :
     update app_config set value = '["p.raveleau@enthalpie.fr"]'::jsonb where key = 'super_admin_emails'; */
  superAdminEmails: ['p.raveleau@enthalpie.fr'],
};

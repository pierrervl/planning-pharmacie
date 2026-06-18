-- Rôle chef d'équipe : vue planning complète, demandes pour l'équipe
alter type public.user_role add value if not exists 'team_leader';

-- Suggestions d'amélioration : envoi par tout utilisateur connecté,
-- lecture globale réservée au propriétaire de l'application (emails dans app_config).

create table if not exists public.app_config (
  key text primary key,
  value jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.app_config (key, value)
values ('feedback_owner_emails', '[]'::jsonb)
on conflict (key) do nothing;

comment on table public.app_config is
  'Configuration applicative. Clé feedback_owner_emails : tableau JSON d''e-mails autorisés à lire toutes les suggestions.';

create table if not exists public.app_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  user_email text not null,
  user_name text,
  pharmacy_id uuid references public.pharmacies (id) on delete set null,
  pharmacy_name text,
  user_role text,
  title text not null,
  body text not null,
  status text not null default 'open' check (status in ('open', 'read', 'done', 'wontfix')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index app_feedback_created_idx on public.app_feedback (created_at desc);
create index app_feedback_status_idx on public.app_feedback (status);
create index app_feedback_user_idx on public.app_feedback (user_id);

create trigger app_feedback_updated_at
  before update on public.app_feedback
  for each row execute function public.set_updated_at();

create or replace function public.is_feedback_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_config c,
         jsonb_array_elements_text(c.value) e
    where c.key = 'feedback_owner_emails'
      and lower(trim(e)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  );
$$;

alter table public.app_config enable row level security;
alter table public.app_feedback enable row level security;

-- Config : lecture pour utilisateurs authentifiés (liste e-mails propriétaires, non sensible)
create policy "app_config_select_authenticated"
  on public.app_config for select
  using (auth.uid() is not null);

create policy "app_config_no_write"
  on public.app_config for all
  using (false)
  with check (false);

-- Feedback : insertion par tout utilisateur connecté
create policy "app_feedback_insert_own"
  on public.app_feedback for insert
  with check (auth.uid() = user_id);

-- Feedback : lecture de ses propres envois
create policy "app_feedback_select_own"
  on public.app_feedback for select
  using (auth.uid() = user_id);

-- Feedback : lecture de toutes les suggestions pour le propriétaire app
create policy "app_feedback_select_owner"
  on public.app_feedback for select
  using (public.is_feedback_owner());

-- Feedback : mise à jour statut par le propriétaire uniquement
create policy "app_feedback_update_owner"
  on public.app_feedback for update
  using (public.is_feedback_owner())
  with check (public.is_feedback_owner());

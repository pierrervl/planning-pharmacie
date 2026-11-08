-- Renforcement de la sécurité (à exécuter dans Supabase → SQL Editor, en une fois)
--
-- 1. Données personnelles des salariés (n° de sécurité sociale, adresse, date de
--    naissance, contrats…) sorties du planning partagé, lisible par tous les membres,
--    vers une table réservée aux administrateurs de la pharmacie.
-- 2. Inscription : plus de rattachement à une pharmacie via un simple `pharmacy_id`
--    (sans code d'invitation) ; le rôle demandé à l'inscription est ignoré.
-- 3. Un utilisateur ne peut plus modifier son propre rôle dans `profiles`.
-- 4. Envoi des congés / demandes par le personnel : un employé ne dépose que les
--    siens, toujours « en attente », sans écraser une demande déjà traitée.
--
-- Migration idempotente : elle peut être relancée sans effet de bord.

-- ---------------------------------------------------------------------------
-- 1. Données personnelles réservées aux administrateurs
-- ---------------------------------------------------------------------------
create table if not exists public.pharmacy_private (
  pharmacy_id uuid primary key references public.pharmacies (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

alter table public.pharmacy_private enable row level security;

drop policy if exists "pharmacy_private_select_admin" on public.pharmacy_private;
drop policy if exists "pharmacy_private_insert_admin" on public.pharmacy_private;
drop policy if exists "pharmacy_private_update_admin" on public.pharmacy_private;

create policy "pharmacy_private_select_admin"
  on public.pharmacy_private for select
  using (public.is_pharmacy_admin(pharmacy_id));

create policy "pharmacy_private_insert_admin"
  on public.pharmacy_private for insert
  with check (public.is_pharmacy_admin(pharmacy_id));

create policy "pharmacy_private_update_admin"
  on public.pharmacy_private for update
  using (public.is_pharmacy_admin(pharmacy_id))
  with check (public.is_pharmacy_admin(pharmacy_id));

drop trigger if exists pharmacy_private_updated_at on public.pharmacy_private;
create trigger pharmacy_private_updated_at
  before update on public.pharmacy_private
  for each row execute function public.set_updated_at();

-- Clés du planning considérées comme personnelles (même liste que PRIVATE_STATE_KEYS côté app)
create or replace function public.private_planning_keys()
returns text[]
language sql
immutable
as $$
  select array['employeeInfo', 'contractDays', 'contractDescriptions', 'cdiDescriptions'];
$$;

-- Filet de sécurité : quoi que l'app envoie (y compris une ancienne version en cache),
-- les clés personnelles sont retirées du planning partagé et rangées dans pharmacy_private.
create or replace function public.strip_private_planning_data()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  k text;
  extracted jsonb := '{}'::jsonb;
begin
  if new.data is null then
    return new;
  end if;
  foreach k in array public.private_planning_keys() loop
    if new.data ? k then
      extracted := extracted || jsonb_build_object(k, new.data -> k);
      new.data := new.data - k;
    end if;
  end loop;
  if extracted <> '{}'::jsonb then
    insert into public.pharmacy_private (pharmacy_id, data, updated_by)
    values (new.pharmacy_id, extracted, auth.uid())
    on conflict (pharmacy_id) do update
      set data = public.pharmacy_private.data || excluded.data,
          updated_by = excluded.updated_by;
  end if;
  return new;
end;
$$;

drop trigger if exists strip_private_planning_data on public.pharmacy_planning;
create trigger strip_private_planning_data
  before insert or update on public.pharmacy_planning
  for each row execute function public.strip_private_planning_data();

-- Déplace les données déjà présentes (le trigger fait le travail)
update public.pharmacy_planning
set data = data
where data ?| public.private_planning_keys();

-- ---------------------------------------------------------------------------
-- 2. Inscription : code d'invitation obligatoire pour rejoindre une pharmacie
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  admin_count int;
  ph_name text;
  invite text;
  new_ph_id uuid;
begin
  /* Le rôle global du profil n'est plus choisi par l'utilisateur : les droits
     réels sont portés par pharmacy_members. */
  insert into public.profiles (id, email, full_name, role, employee_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'employee',
    nullif(trim(new.raw_user_meta_data->>'employee_name'), '')
  );

  ph_name := nullif(trim(new.raw_user_meta_data->>'pharmacy_name'), '');
  invite := nullif(trim(new.raw_user_meta_data->>'invite_code'), '');

  if ph_name is not null then
    -- Création d'une nouvelle pharmacie : le créateur en est l'administrateur
    insert into public.pharmacies (name, invite_code)
    values (ph_name, public.generate_invite_code())
    returning id into new_ph_id;

    insert into public.pharmacy_members (user_id, pharmacy_id, role, employee_name)
    values (new.id, new_ph_id, 'admin', nullif(trim(new.raw_user_meta_data->>'employee_name'), ''));

    insert into public.pharmacy_planning (pharmacy_id, data, updated_by)
    values (new_ph_id, '{}'::jsonb, new.id)
    on conflict (pharmacy_id) do nothing;

  elsif invite is not null then
    -- Rejoindre une pharmacie existante : uniquement avec son code d'invitation
    select id into new_ph_id from public.pharmacies where invite_code = upper(invite);
    if new_ph_id is not null then
      select count(*) into admin_count
      from public.pharmacy_members where pharmacy_id = new_ph_id and role = 'admin';

      insert into public.pharmacy_members (user_id, pharmacy_id, role, employee_name)
      values (
        new.id,
        new_ph_id,
        case when admin_count = 0 then 'admin'::public.user_role else 'employee'::public.user_role end,
        nullif(trim(new.raw_user_meta_data->>'employee_name'), '')
      );
    end if;
  end if;
  -- L'ancien rattachement direct par `pharmacy_id` (sans code) est supprimé.

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Rôle du profil non modifiable par l'utilisateur lui-même
-- ---------------------------------------------------------------------------
create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() nul = SQL Editor / service : modification autorisée
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_super_admin() then
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role
  before update on public.profiles
  for each row execute function public.protect_profile_role();

-- ---------------------------------------------------------------------------
-- 4. Envoi des congés / demandes par le personnel : uniquement les siens
-- ---------------------------------------------------------------------------
create or replace function public.employee_name_key(n text)
returns text
language sql
immutable
as $$
  select lower(regexp_replace(trim(coalesce(n, '')), '\s+', ' ', 'g'));
$$;

create or replace function public.merge_staff_planning_shared(
  p_pharmacy_id uuid,
  conges_patch jsonb default '[]'::jsonb,
  planning_change_requests_patch jsonb default '[]'::jsonb
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  row_rec public.pharmacy_planning%rowtype;
  merged jsonb;
  cur_conges jsonb;
  cur_requests jsonb;
  member_role text;
  member_emp text;
  is_leader boolean;
  elem jsonb;
  existing jsonb;
  safe_conges jsonb := '[]'::jsonb;
  safe_requests jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié';
  end if;
  if not public.is_pharmacy_staff(p_pharmacy_id) then
    raise exception 'Accès réservé au personnel de cette pharmacie';
  end if;

  select role::text, employee_name into member_role, member_emp
  from public.pharmacy_members
  where user_id = auth.uid() and pharmacy_id = p_pharmacy_id
  limit 1;
  is_leader := member_role = 'team_leader';

  if not is_leader and public.employee_name_key(member_emp) = '' then
    raise exception 'Votre compte n''est pas lié à un salarié — contactez l''administrateur.';
  end if;

  select * into row_rec
  from public.pharmacy_planning
  where pharmacy_id = p_pharmacy_id
  for update;

  if row_rec.pharmacy_id is null then
    insert into public.pharmacy_planning (pharmacy_id, data, updated_by)
    values (p_pharmacy_id, '{}'::jsonb, auth.uid());
    select * into row_rec
    from public.pharmacy_planning
    where pharmacy_id = p_pharmacy_id;
  end if;

  merged := coalesce(row_rec.data, '{}'::jsonb);
  cur_conges := coalesce(merged->'conges', '[]'::jsonb);
  cur_requests := coalesce(merged->'planningChangeRequests', '[]'::jsonb);

  -- Congés : un employé ne dépose / modifie que les siens ; le chef d'équipe, ceux de tous.
  if jsonb_typeof(conges_patch) = 'array' then
    for elem in select value from jsonb_array_elements(conges_patch) loop
      if elem->>'id' is null then continue; end if;
      if not is_leader
         and public.employee_name_key(elem->>'emp') <> public.employee_name_key(member_emp) then
        continue;
      end if;
      select e into existing from jsonb_array_elements(cur_conges) e where e->>'id' = elem->>'id' limit 1;
      if existing is not null and not is_leader
         and public.employee_name_key(existing->>'emp') <> public.employee_name_key(member_emp) then
        continue;
      end if;
      safe_conges := safe_conges || jsonb_build_array(elem);
    end loop;
  end if;

  -- Demandes : toujours « en attente », jamais par-dessus une demande déjà traitée.
  if jsonb_typeof(planning_change_requests_patch) = 'array' then
    for elem in select value from jsonb_array_elements(planning_change_requests_patch) loop
      if elem->>'id' is null then continue; end if;
      if not is_leader
         and public.employee_name_key(elem->>'emp') <> public.employee_name_key(member_emp) then
        continue;
      end if;
      select e into existing from jsonb_array_elements(cur_requests) e where e->>'id' = elem->>'id' limit 1;
      if existing is not null and coalesce(existing->>'status', 'pending') <> 'pending' then
        continue;
      end if;
      safe_requests := safe_requests || jsonb_build_array(jsonb_set(elem, '{status}', '"pending"'::jsonb, true));
    end loop;
  end if;

  merged := jsonb_set(
    jsonb_set(merged, '{conges}', public.jsonb_merge_array_by_id(cur_conges, safe_conges), true),
    '{planningChangeRequests}', public.jsonb_merge_array_by_id(cur_requests, safe_requests), true
  );

  update public.pharmacy_planning
  set data = merged, updated_by = auth.uid()
  where pharmacy_id = p_pharmacy_id;

  return now();
end;
$$;

grant execute on function public.merge_staff_planning_shared(uuid, jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';

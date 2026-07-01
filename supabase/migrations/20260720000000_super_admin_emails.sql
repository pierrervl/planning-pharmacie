-- Super-admin : seul(s) compte(s) autorisé(s) à gérer plusieurs pharmacies (support technique).
-- Configurer l'e-mail dans app_config :
--   update app_config set value = '["p.raveleau@enthalpie.fr"]'::jsonb where key = 'super_admin_emails';

insert into public.app_config (key, value)
values ('super_admin_emails', '[]'::jsonb)
on conflict (key) do nothing;

create or replace function public.is_super_admin()
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
    where c.key = 'super_admin_emails'
      and lower(trim(e)) = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  );
$$;

-- Rejoint une pharmacie via code d'invitation
create or replace function public.join_pharmacy_by_invite(p_invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  ph_id uuid;
  admin_count int;
  assigned_role public.user_role;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié';
  end if;

  if exists (select 1 from public.pharmacy_members where user_id = auth.uid())
     and not public.is_super_admin() then
    raise exception 'Rejoindre une autre pharmacie est réservé au support technique';
  end if;

  select id into ph_id
  from public.pharmacies
  where invite_code = upper(trim(coalesce(p_invite_code, '')));

  if ph_id is null then
    raise exception 'Code d''invitation invalide';
  end if;

  if exists (
    select 1 from public.pharmacy_members
    where user_id = auth.uid() and pharmacy_id = ph_id
  ) then
    return ph_id;
  end if;

  select count(*) into admin_count
  from public.pharmacy_members
  where pharmacy_id = ph_id and role = 'admin';

  if admin_count = 0 then
    assigned_role := 'admin';
  else
    assigned_role := 'employee';
  end if;

  insert into public.pharmacy_members (user_id, pharmacy_id, role)
  values (auth.uid(), ph_id, assigned_role);

  return ph_id;
end;
$$;

-- Crée une pharmacie et rattache l'utilisateur courant comme admin
create or replace function public.create_pharmacy(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
  code text;
begin
  if auth.uid() is null then
    raise exception 'Non authentifié';
  end if;

  if exists (select 1 from public.pharmacy_members where user_id = auth.uid())
     and not public.is_super_admin() then
    raise exception 'Créer une pharmacie supplémentaire est réservé au support technique';
  end if;

  if trim(coalesce(p_name, '')) = '' then
    raise exception 'Nom de pharmacie requis';
  end if;

  code := public.generate_invite_code();
  insert into public.pharmacies (name, invite_code)
  values (trim(p_name), code)
  returning id into new_id;

  insert into public.pharmacy_members (user_id, pharmacy_id, role)
  values (auth.uid(), new_id, 'admin');

  insert into public.pharmacy_planning (pharmacy_id, data, updated_by)
  values (new_id, '{}'::jsonb, auth.uid())
  on conflict (pharmacy_id) do nothing;

  return new_id;
end;
$$;

notify pgrst, 'reload schema';

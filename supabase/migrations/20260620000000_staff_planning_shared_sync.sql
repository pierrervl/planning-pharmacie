-- Permettre aux employés / chefs d'équipe d'envoyer congés et demandes de planning
-- sans écraser le reste du planning (réservé à l'admin).

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role::text in ('employee', 'team_leader')
  );
$$;

create or replace function public.jsonb_merge_array_by_id(base jsonb, patch jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  result jsonb := coalesce(base, '[]'::jsonb);
  elem jsonb;
  elem_id text;
begin
  if patch is null or jsonb_typeof(patch) <> 'array' then
    return result;
  end if;
  for elem in select value from jsonb_array_elements(patch)
  loop
    elem_id := elem->>'id';
    if elem_id is null then
      result := result || jsonb_build_array(elem);
    else
      result := (
        select coalesce(jsonb_agg(
          case when e->>'id' = elem_id then elem else e end
        ), '[]'::jsonb)
        from jsonb_array_elements(result) e
      );
      if not exists (
        select 1 from jsonb_array_elements(result) e where e->>'id' = elem_id
      ) then
        result := result || jsonb_build_array(elem);
      end if;
    end if;
  end loop;
  return result;
end;
$$;

create or replace function public.merge_staff_planning_shared(
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
begin
  if auth.uid() is null then
    raise exception 'Non authentifié';
  end if;
  if not public.is_staff() then
    raise exception 'Accès réservé au personnel';
  end if;

  select * into row_rec from public.pharmacy_planning where id = 1 for update;
  if row_rec.id is null then
    insert into public.pharmacy_planning (id, data, updated_by)
    values (1, '{}'::jsonb, auth.uid());
    select * into row_rec from public.pharmacy_planning where id = 1;
  end if;

  merged := coalesce(row_rec.data, '{}'::jsonb);
  cur_conges := coalesce(merged->'conges', '[]'::jsonb);
  cur_requests := coalesce(merged->'planningChangeRequests', '[]'::jsonb);

  merged := jsonb_set(
    jsonb_set(
      merged,
      '{conges}',
      public.jsonb_merge_array_by_id(cur_conges, coalesce(conges_patch, '[]'::jsonb)),
      true
    ),
    '{planningChangeRequests}',
    public.jsonb_merge_array_by_id(cur_requests, coalesce(planning_change_requests_patch, '[]'::jsonb)),
    true
  );

  update public.pharmacy_planning
  set data = merged, updated_by = auth.uid()
  where id = 1;

  return now();
end;
$$;

grant execute on function public.merge_staff_planning_shared(jsonb, jsonb) to authenticated;

notify pgrst, 'reload schema';

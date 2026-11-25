-- Vários utilizadores (#247, parte 3/4): Definições → Equipa.
--
-- Decidido a 24/11/2026:
--   * cada plano tem um máximo de contas que entram na app
--     (Demo 2, Starter 3, Growth 10, Pro 25; Enterprise e Interno sem limite);
--   * cada conta da Equipa ocupa também um lugar de colaborador (max_users);
--   * o dono conta nos dois (já é membro: Administrador desde a parte 1/4);
--   * cada pessoa só está numa organização (organization_member.auth_user_id
--     já é único).

-- 1. Máximo de contas por plano. Vazio = sem limite, como os outros limites.
alter table public.plan
  add column if not exists max_team_members integer;

alter table public.plan
  drop constraint if exists plan_max_team_members_positive;
alter table public.plan
  add constraint plan_max_team_members_positive
  check (max_team_members is null or max_team_members > 0);

update public.plan
set max_team_members = case name
  when 'Demo' then 2
  when 'Starter' then 3
  when 'Growth' then 10
  when 'Pro' then 25
  else null
end;

-- 2. Lugares ocupados: colaboradores (tabela user) + contas da Equipa.
create or replace function public.org_seat_count(p_organization_id integer)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*)::integer from public."user" u
      where u.organization_id = p_organization_id)
  + (select count(*)::integer from public.organization_member m
      where m.organization_id = p_organization_id);
$$;

revoke execute on function public.org_seat_count(integer) from public, anon, authenticated;
grant execute on function public.org_seat_count(integer) to service_role;

-- 3. Criar colaborador passa a contar também as contas da Equipa.
CREATE OR REPLACE FUNCTION public.create_user_with_plan_limit(p_organization_id integer, p_phone_number text DEFAULT NULL::text, p_name text DEFAULT NULL::text, p_assistant_id integer DEFAULT NULL::integer, p_email text DEFAULT NULL::text, p_teams_aad_object_id text DEFAULT NULL::text, p_teams_from_id text DEFAULT NULL::text, p_phone_country_code text DEFAULT NULL::text, p_phone_national text DEFAULT NULL::text)
 RETURNS SETOF "user"
 LANGUAGE plpgsql
AS $$
declare
  v_plan_id integer;
  v_max_users_override integer;
  v_plan_max_users integer;
  v_effective_max_users integer;
  v_user_count integer;
begin
  perform 1
  from public.organization o
  where o.id = p_organization_id
  for update of o;

  if not found then
    raise exception 'Organization % not found', p_organization_id;
  end if;

  v_plan_id := (
    select o.plan_id
    from public.organization o
    where o.id = p_organization_id
  );

  v_max_users_override := (
    select o.max_users_override
    from public.organization o
    where o.id = p_organization_id
  );

  v_plan_max_users := (
    select p.max_users
    from public.plan p
    where p.id = v_plan_id
  );

  v_effective_max_users := coalesce(v_max_users_override, v_plan_max_users);

  -- Os colaboradores e as contas da Equipa partilham os mesmos lugares (#247).
  v_user_count := public.org_seat_count(p_organization_id);

  if v_effective_max_users is not null
     and v_user_count >= v_effective_max_users then
    raise exception 'User limit reached for organization %', p_organization_id;
  end if;

  return query
  insert into public."user" (
    organization_id,
    phone_number,
    name,
    assistant_id,
    email,
    teams_aad_object_id,
    teams_from_id,
    phone_country_code,
    phone_national
  )
  values (
    p_organization_id,
    p_phone_number,
    p_name,
    p_assistant_id,
    p_email,
    p_teams_aad_object_id,
    p_teams_from_id,
    p_phone_country_code,
    p_phone_national
  )
  returning *;
end;
$$;


-- 4. Acrescentar uma conta à Equipa, só se couber nos dois limites.
--    Bloqueia a linha da organização para dois convites ao mesmo tempo não
--    passarem os dois o último lugar.
create or replace function public.add_org_member_with_limits(
  p_organization_id integer,
  p_auth_user_id uuid,
  p_user_type_id bigint,
  p_invited_by uuid default null
)
returns public.organization_member
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max_users integer;
  v_max_members integer;
  v_members integer;
  v_row public.organization_member;
begin
  select coalesce(o.max_users_override, p.max_users), p.max_team_members
  into v_max_users, v_max_members
  from public.organization o
  left join public.plan p on p.id = o.plan_id
  where o.id = p_organization_id
  for update of o;

  if not found then
    raise exception 'Organization % not found', p_organization_id;
  end if;

  if not exists (
    select 1 from public.user_type t
    where t.id = p_user_type_id
      and (t.is_system or t.organization_id = p_organization_id)
  ) then
    raise exception 'Invalid user type for organization %', p_organization_id;
  end if;

  select count(*)::integer into v_members
  from public.organization_member m
  where m.organization_id = p_organization_id;

  if v_max_members is not null and v_members >= v_max_members then
    raise exception 'Team limit reached for organization %', p_organization_id;
  end if;

  if v_max_users is not null
     and public.org_seat_count(p_organization_id) >= v_max_users then
    raise exception 'User limit reached for organization %', p_organization_id;
  end if;

  insert into public.organization_member (
    organization_id, auth_user_id, user_type_id, invited_by
  )
  values (p_organization_id, p_auth_user_id, p_user_type_id, p_invited_by)
  returning * into v_row;

  return v_row;
end;
$$;

revoke execute on function public.add_org_member_with_limits(integer, uuid, bigint, uuid)
  from public, anon, authenticated;
grant execute on function public.add_org_member_with_limits(integer, uuid, bigint, uuid)
  to service_role;
-- 5. Encontrar a conta de um email (para não convidar duas vezes a mesma
--    pessoa). Só o servidor a usa; o auth não está exposto na API.
create or replace function public.auth_user_id_by_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id from auth.users u
  where lower(u.email) = lower(btrim(p_email))
  limit 1;
$$;

revoke execute on function public.auth_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.auth_user_id_by_email(text) to service_role;

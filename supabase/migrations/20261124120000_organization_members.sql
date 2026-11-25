-- Vários utilizadores por organização (#247, parte 1/4: base de membros).
--
-- Cria os tipos de utilizador e os membros da organização, e passa as regras
-- de leitura (RLS) e do storage de «é o dono» para «é membro».
-- Não muda nada para quem usa a app hoje: cada dono passa a ser membro
-- Administrador da sua organização, e o dono continua a ser sempre
-- Administrador mesmo sem linha de membro.
--
-- Executar manualmente no SQL Editor do Supabase ANTES de publicar o código
-- desta branch. Pode ser corrida mais de uma vez.

begin;

-- ---------------------------------------------------------------------------
-- 1. Tipos de utilizador
-- ---------------------------------------------------------------------------
-- Os 3 predefinidos (Administrador, Editor, Leitor) têm organization_id vazio
-- e são iguais para todas. Os personalizados (branch 4/4) têm organização.
-- As permissões são os textos do catálogo src/lib/auth/permissions.js.
-- O Administrador não tem lista: tem tudo, também o que vier a ser criado.

create table if not exists public.user_type (
  id bigint generated always as identity primary key,
  organization_id integer references public.organization(id) on delete cascade,
  key text,
  name text not null check (length(btrim(name)) between 1 and 80),
  permissions text[] not null default '{}',
  is_system boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint user_type_system_shape check (
    (is_system and organization_id is null and key is not null)
    or (not is_system and organization_id is not null and key is null)
  )
);

create unique index if not exists user_type_system_key_idx
  on public.user_type (key) where is_system;

create unique index if not exists user_type_org_name_idx
  on public.user_type (organization_id, lower(name)) where organization_id is not null;

insert into public.user_type (key, name, permissions, is_system)
values
  ('admin', 'Administrador', '{}', true),
  ('editor', 'Editor', array['dashboard.view', 'users.view', 'users.edit', 'users.delete', 'users.import', 'users.groups', 'teams_groups.view', 'teams_groups.edit', 'assistants.view', 'assistants.edit', 'assistants.delete', 'assistants.test', 'messages.send_whatsapp', 'messages.send_teams', 'messages.image_ai', 'messages.scheduled_view', 'messages.scheduled_edit', 'links.view', 'links.create', 'questions.view', 'questions.review', 'questions.export', 'media.view', 'media.edit', 'automations.view', 'automations.edit', 'automations.run', 'analytics.view', 'analytics.export', 'settings.audit_view'], true),
  ('viewer', 'Leitor', array['dashboard.view', 'users.view', 'teams_groups.view', 'assistants.view', 'links.view', 'questions.view', 'automations.view', 'analytics.view'], true)
on conflict (key) where is_system do update
  set name = excluded.name,
      permissions = excluded.permissions;

-- ---------------------------------------------------------------------------
-- 2. Membros da organização
-- ---------------------------------------------------------------------------
-- Uma conta pertence a uma só organização (auth_user_id único).
-- organization.owner_user_id fica onde está: continua a dizer quem paga.

create table if not exists public.organization_member (
  id bigint generated always as identity primary key,
  organization_id integer not null references public.organization(id) on delete cascade,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  user_type_id bigint not null references public.user_type(id) on delete restrict,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists organization_member_org_idx
  on public.organization_member (organization_id);

-- Cada dono que já existe passa a membro Administrador. Um dono de várias
-- organizações (não devia haver) fica membro só da mais antiga; nas outras
-- continua a entrar como dono.
insert into public.organization_member (organization_id, auth_user_id, user_type_id)
select distinct on (o.owner_user_id)
  o.id, o.owner_user_id, (select id from public.user_type where is_system and key = 'admin')
from public.organization o
order by o.owner_user_id, o.id
on conflict (auth_user_id) do nothing;

-- As organizações novas (registo na app ou criadas à mão no SQL) fazem o
-- mesmo para o dono.
create or replace function public.add_owner_as_org_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.organization_member (organization_id, auth_user_id, user_type_id)
  values (
    new.id,
    new.owner_user_id,
    (select id from public.user_type where is_system and key = 'admin')
  )
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;

revoke all on function public.add_owner_as_org_member() from public;

drop trigger if exists organization_add_owner_member on public.organization;
create trigger organization_add_owner_member
  after insert on public.organization
  for each row execute function public.add_owner_as_org_member();

-- ---------------------------------------------------------------------------
-- 3. Funções de acesso (um só sítio)
-- ---------------------------------------------------------------------------
-- Devolvem o acesso de quem tem a sessão (auth.uid()). O dono é sempre
-- Administrador ('*'). Sem sessão ou sem ser membro: null / false.

create or replace function public.org_member_permissions(p_org_id bigint)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from public.organization o
      where o.id = p_org_id and o.owner_user_id = (select auth.uid())
    ) then array['*']
    else (
      select case when t.key = 'admin' then array['*'] else t.permissions end
      from public.organization_member m
      join public.user_type t on t.id = m.user_type_id
      where m.organization_id = p_org_id
        and m.auth_user_id = (select auth.uid())
    )
  end;
$$;

create or replace function public.is_org_member(p_org_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.org_member_permissions(p_org_id) is not null;
$$;

create or replace function public.has_org_permission(p_org_id bigint, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select '*' = any(perms) or p_permission = any(perms)
     from (select public.org_member_permissions(p_org_id) as perms) x),
    false
  );
$$;

revoke all on function public.org_member_permissions(bigint) from public;
revoke all on function public.is_org_member(bigint) from public;
revoke all on function public.has_org_permission(bigint, text) from public;
grant execute on function public.org_member_permissions(bigint) to authenticated, service_role;
grant execute on function public.is_org_member(bigint) to authenticated, service_role;
grant execute on function public.has_org_permission(bigint, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. RLS das tabelas novas
-- ---------------------------------------------------------------------------
-- Leitura: o próprio e quem é da mesma organização. Escrita: só o servidor.

alter table public.user_type enable row level security;
alter table public.organization_member enable row level security;

revoke insert, update, delete on table public.user_type from anon, authenticated;
revoke insert, update, delete on table public.organization_member from anon, authenticated;
revoke all on table public.user_type from anon;
revoke all on table public.organization_member from anon;
grant select on table public.user_type to authenticated;
grant select on table public.organization_member to authenticated;
grant select, insert, update, delete on table public.user_type to service_role;
grant select, insert, update, delete on table public.organization_member to service_role;

drop policy if exists mdb_member_read on public.user_type;
create policy mdb_member_read on public.user_type
  for select to authenticated
  using (organization_id is null or public.is_org_member(organization_id));

drop policy if exists mdb_member_read on public.organization_member;
create policy mdb_member_read on public.organization_member
  for select to authenticated
  using (
    auth_user_id = (select auth.uid())
    or public.is_org_member(organization_id)
  );

-- ---------------------------------------------------------------------------
-- 5. Leituras com a sessão: «é o dono» passa a «é membro»
-- ---------------------------------------------------------------------------
-- Substitui as políticas da migração 20261009130000_owner_session_reads
-- (e 20261023140000_tracked_links_saved) com o mesmo nome. As tabelas que
-- chegam à organização através de outra (user_tag, thread, file…) não mudam:
-- já dependem das regras destas.
-- As permissões finas (Leitor não exporta, etc.) verificam-se nas rotas.

do $migration$
declare
  entry record;
begin
  for entry in
    select * from (values
      ('organization', 'public.is_org_member(id)'),
      ('user', 'public.is_org_member("user".organization_id)'),
      ('tags', 'public.is_org_member(tags.org_id)'),
      ('assistant', 'public.is_org_member(assistant.organization_id)'),
      ('audit_log', 'public.is_org_member(audit_log.organization_id)'),
      ('automation_rule', 'public.is_org_member(automation_rule.organization_id)'),
      ('automation_run', 'public.is_org_member(automation_run.organization_id)'),
      ('scheduled_broadcast', 'public.is_org_member(scheduled_broadcast.organization_id)'),
      ('organization_messaging_feature', 'public.is_org_member(organization_messaging_feature.organization_id)'),
      ('pending_outreach', 'public.is_org_member(pending_outreach.org_id)'),
      ('question', 'public.is_org_member(question.organization_id)'),
      ('question_answer', 'public.is_org_member(question_answer.organization_id)'),
      ('teams_installation', 'public.is_org_member(teams_installation.organization_id)'),
      ('tracked_link', 'public.is_org_member(tracked_link.org_id)'),
      ('tracked_link_saved', 'public.is_org_member(tracked_link_saved.org_id)'),
      ('message', 'case when organization_id is not null then public.is_org_member(message.organization_id) when thread_id is not null then exists (select 1 from public.thread t where t.id = message.thread_id) when user_id is not null then exists (select 1 from public."user" u where u.id = message.user_id) else exists (select 1 from public.assistant a where a.id = message.assistant_id) end'),
      ('whatsapp_templates', 'org_id is null or public.is_org_member(whatsapp_templates.org_id)')
    ) as policies(table_name, condition)
  loop
    if to_regclass(format('public.%I', entry.table_name)) is null then
      raise exception 'Falta a tabela public.%. Aplica primeiro as migrations anteriores.', entry.table_name;
    end if;

    execute format('alter table public.%I enable row level security', entry.table_name);
    execute format('grant select on table public.%I to authenticated', entry.table_name);

    execute format('drop policy if exists mdb_owner_session_read on public.%I', entry.table_name);
    execute format(
      'create policy mdb_owner_session_read on public.%I for select to authenticated using (%s)',
      entry.table_name, entry.condition
    );

    execute format('drop policy if exists mdb_owner_session_read_boundary on public.%I', entry.table_name);
    execute format(
      'create policy mdb_owner_session_read_boundary on public.%I as restrictive for select to authenticated using (%s)',
      entry.table_name, entry.condition
    );
  end loop;
end;
$migration$;

-- O tema da organização é a única escrita que o browser faz (coluna theme,
-- ver 20260921150000_restrict_browser_writes). Passa a quem pode editar a
-- organização; a política antiga, só do dono, fica (o dono é Administrador).
drop policy if exists mdb_member_update_theme on public.organization;
create policy mdb_member_update_theme on public.organization
  for update to authenticated
  using (public.has_org_permission(id, 'settings.organization'))
  with check (public.has_org_permission(id, 'settings.organization'));

-- ---------------------------------------------------------------------------
-- 6. Storage: os carregamentos do browser
-- ---------------------------------------------------------------------------
-- Mantêm o nome (as políticas de storage.objects chamam-nas), mas passam a
-- perguntar pela permissão em vez de «é o dono».

-- Ficheiros dos assistentes (assistant-uploads/<org>/…).
create or replace function public.storage_path_owned_by_user(object_name text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select case
    when (storage.foldername(object_name))[1] ~ '^[0-9]{1,9}$'
      then public.has_org_permission(
        ((storage.foldername(object_name))[1])::bigint,
        'assistants.edit'
      )
    else false
  end;
$$;

-- Imagens e multimédia das mensagens (broadcasts/<org>/… e broadcast-media).
create or replace function public.storage_org_owned_by_user(org_folder text)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select case
    when org_folder ~ '^[0-9]{1,9}$' then
      public.has_org_permission(org_folder::bigint, 'messages.send_whatsapp')
      or public.has_org_permission(org_folder::bigint, 'messages.send_teams')
      or public.has_org_permission(org_folder::bigint, 'media.edit')
    else false
  end;
$$;

revoke all on function public.storage_path_owned_by_user(text) from public;
grant execute on function public.storage_path_owned_by_user(text) to authenticated;
revoke all on function public.storage_org_owned_by_user(text) from public;
grant execute on function public.storage_org_owned_by_user(text) to authenticated;

commit;

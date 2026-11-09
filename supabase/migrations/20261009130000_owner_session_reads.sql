-- Leituras da interface com a sessão do proprietário e RLS.
-- Executar manualmente no SQL Editor ANTES de publicar o código desta branch.
-- Não concede INSERT/UPDATE/DELETE: as escritas continuam a passar pelo servidor.
-- Não abre contact, webhook_event ou auth_attempt_bucket a sessões de clientes.
-- As políticas restritivas impedem que uma policy antiga baseada num org_id do JWT
-- alargue a leitura a organizações que o utilizador não possui.

begin;

do $migration$
declare
  entry record;
begin
  for entry in
    select * from (values
      ('organization', 'owner_user_id = (select auth.uid())'),
      ('user', 'exists (select 1 from public.organization o where o.id = "user".organization_id and o.owner_user_id = (select auth.uid()))'),
      ('tags', 'exists (select 1 from public.organization o where o.id = tags.org_id and o.owner_user_id = (select auth.uid()))'),
      ('assistant', 'exists (select 1 from public.organization o where o.id = assistant.organization_id and o.owner_user_id = (select auth.uid()))'),
      ('audit_log', 'exists (select 1 from public.organization o where o.id = audit_log.organization_id and o.owner_user_id = (select auth.uid()))'),
      ('automation_rule', 'exists (select 1 from public.organization o where o.id = automation_rule.organization_id and o.owner_user_id = (select auth.uid()))'),
      ('automation_run', 'exists (select 1 from public.organization o where o.id = automation_run.organization_id and o.owner_user_id = (select auth.uid()))'),
      ('scheduled_broadcast', 'exists (select 1 from public.organization o where o.id = scheduled_broadcast.organization_id and o.owner_user_id = (select auth.uid()))'),
      ('organization_messaging_feature', 'exists (select 1 from public.organization o where o.id = organization_messaging_feature.organization_id and o.owner_user_id = (select auth.uid()))'),
      ('pending_outreach', 'exists (select 1 from public.organization o where o.id = pending_outreach.org_id and o.owner_user_id = (select auth.uid()))'),
      ('question', 'exists (select 1 from public.organization o where o.id = question.organization_id and o.owner_user_id = (select auth.uid()))'),
      ('question_answer', 'exists (select 1 from public.organization o where o.id = question_answer.organization_id and o.owner_user_id = (select auth.uid()))'),
      ('teams_installation', 'exists (select 1 from public.organization o where o.id = teams_installation.organization_id and o.owner_user_id = (select auth.uid()))'),
      ('tracked_link', 'exists (select 1 from public.organization o where o.id = tracked_link.org_id and o.owner_user_id = (select auth.uid()))'),
      ('tracked_link_event', 'exists (select 1 from public.tracked_link l where l.id = tracked_link_event.tracked_link_id)'),
      ('user_assistant', 'exists (select 1 from public."user" u where u.id = user_assistant.user_id) and exists (select 1 from public.assistant a where a.id = user_assistant.assistant_id)'),
      ('user_tag', 'exists (select 1 from public."user" u where u.id = user_tag.user_id) and exists (select 1 from public.tags t where t.id = user_tag.tag_id)'),
      ('user_teams_conversation', 'exists (select 1 from public."user" u where u.id = user_teams_conversation.user_id)'),
      ('thread', '(user_id is not null and exists (select 1 from public."user" u where u.id = thread.user_id) and (assistant_id is null or exists (select 1 from public.assistant a where a.id = thread.assistant_id))) or (user_id is null and exists (select 1 from public.assistant a where a.id = thread.assistant_id))'),
      ('message', 'case when organization_id is not null then exists (select 1 from public.organization o where o.id = message.organization_id and o.owner_user_id = (select auth.uid())) when thread_id is not null then exists (select 1 from public.thread t where t.id = message.thread_id) when user_id is not null then exists (select 1 from public."user" u where u.id = message.user_id) else exists (select 1 from public.assistant a where a.id = message.assistant_id) end'),
      ('vector_store', 'exists (select 1 from public.assistant a where a.vector_store_id = vector_store.id)'),
      ('file', 'exists (select 1 from public.vector_store v where v.id = file.vector_store_id)'),
      ('whatsapp_templates', 'org_id is null or exists (select 1 from public.organization o where o.id = whatsapp_templates.org_id and o.owner_user_id = (select auth.uid()))')
    ) as policies(table_name, condition)
  loop
    -- Falhar e reverter tudo se faltarem migrations anteriores; não deixar uma
    -- separação de acessos aplicada apenas a uma parte das tabelas.
    if to_regclass(format('public.%I', entry.table_name)) is null then
      raise exception 'Falta a tabela public.%. Aplica primeiro as migrations anteriores.', entry.table_name;
    end if;

    execute format('alter table public.%I enable row level security', entry.table_name);
    execute format('grant select on table public.%I to authenticated', entry.table_name);

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = entry.table_name
        and policyname = 'mdb_owner_session_read'
    ) then
      execute format(
        'create policy mdb_owner_session_read on public.%I for select to authenticated using (%s)',
        entry.table_name, entry.condition
      );
    end if;

    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = entry.table_name
        and policyname = 'mdb_owner_session_read_boundary'
    ) then
      execute format(
        'create policy mdb_owner_session_read_boundary on public.%I as restrictive for select to authenticated using (%s)',
        entry.table_name, entry.condition
      );
    end if;
  end loop;
end;
$migration$;

-- A vista aplica as políticas de tracked_link com os privilégios de quem consulta.
alter view public.tracked_link_library set (security_invoker = true);
grant select on table public.tracked_link_library to authenticated;

commit;

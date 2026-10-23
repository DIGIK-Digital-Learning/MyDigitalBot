-- Limite semanal de mensagens do colaborador: 100 por semana em cada canal
-- (WhatsApp e Teams), por colaborador. Contam as mensagens ao assistente e
-- as respostas a quizzes, sondagens e perguntas abertas. A semana começa às
-- 00:00 de segunda-feira em Lisboa (calculado no código).
--
-- Como nos envios do administrador (#188), o histórico fica: a contagem só
-- soma as linhas desde o início da semana.
-- Correr no SQL Editor do Supabase ANTES do deploy. Pode ser corrido mais de
-- uma vez.

-- O limite em cada plano (null = sem limite). Para já, 100 em todos.
alter table public.plan
  add column if not exists max_collaborator_weekly_messages integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.plan'::regclass
      and conname = 'plan_max_collaborator_weekly_messages_check'
  ) then
    alter table public.plan
      add constraint plan_max_collaborator_weekly_messages_check
      check (max_collaborator_weekly_messages is null
             or max_collaborator_weekly_messages > 0);
  end if;
end $$;

update public.plan
set max_collaborator_weekly_messages = 100
where max_collaborator_weekly_messages is null;

-- A língua da organização (a escolhida no topo do site), para os avisos que
-- o servidor manda aos colaboradores.
alter table public.organization
  add column if not exists locale text not null default 'pt';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.organization'::regclass
      and conname = 'organization_locale_check'
  ) then
    alter table public.organization
      add constraint organization_locale_check check (locale in ('pt', 'en'));
  end if;
end $$;

-- Uma linha por mensagem do colaborador que conta.
create table if not exists public.collaborator_weekly_message (
  id bigint generated always as identity primary key,
  organization_id integer not null
    references public.organization (id) on delete cascade,
  user_id integer not null
    references public."user" (id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'teams')),
  -- O que foi: mensagem ao assistente ou resposta a uma pergunta.
  kind text not null check (kind in ('assistant', 'quiz', 'survey', 'open')),
  -- O id da mensagem recebida: a mesma mensagem duas vezes só conta uma.
  source_id text,
  counted_at timestamptz not null default now()
);

create unique index if not exists collaborator_weekly_message_source_uidx
  on public.collaborator_weekly_message (channel, source_id)
  where source_id is not null;

create index if not exists collaborator_weekly_message_user_week_idx
  on public.collaborator_weekly_message (user_id, channel, counted_at);

create index if not exists collaborator_weekly_message_org_week_idx
  on public.collaborator_weekly_message (organization_id, counted_at);

alter table public.collaborator_weekly_message enable row level security;
revoke all on table public.collaborator_weekly_message
  from public, anon, authenticated;
grant select, insert, delete on table public.collaborator_weekly_message
  to service_role;

-- O aviso de limite: um por colaborador, por canal e por semana.
create table if not exists public.collaborator_limit_notice (
  user_id integer not null
    references public."user" (id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'teams')),
  week_start timestamptz not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, channel, week_start)
);

alter table public.collaborator_limit_notice enable row level security;
revoke all on table public.collaborator_limit_notice
  from public, anon, authenticated;
grant select, insert, delete on table public.collaborator_limit_notice
  to service_role;

-- Conta a mensagem e diz se cabe, numa só operação, com um cadeado por
-- colaborador e canal: duas mensagens ao mesmo tempo com 99/100 não passam
-- as duas, e o aviso nunca sai duas vezes na mesma semana.
-- p_limit null = sem limite (conta na mesma, para o contador).
-- Devolve { ok, used, limit, notify }: `notify` é true só na primeira vez que
-- a mensagem não cabe nessa semana (é quando se manda o aviso).
create or replace function public.claim_collaborator_message(
  p_organization_id integer,
  p_user_id integer,
  p_channel text,
  p_kind text,
  p_source_id text,
  p_limit integer,
  p_since timestamptz
)
returns jsonb
language plpgsql
security invoker
volatile
set search_path = ''
as $$
declare
  v_used integer;
  v_notify boolean := false;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501',
      message = 'collaborator weekly messages are restricted to service_role';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('collaborator_weekly_message:' || p_user_id || ':' || p_channel)
  );

  select count(*) into v_used
  from public.collaborator_weekly_message
  where user_id = p_user_id
    and channel = p_channel
    and counted_at >= p_since;

  -- A mesma mensagem outra vez (o webhook repetiu): já está contada.
  if p_source_id is not null and exists (
    select 1 from public.collaborator_weekly_message
    where channel = p_channel and source_id = p_source_id
  ) then
    return jsonb_build_object(
      'ok', true, 'used', v_used, 'limit', p_limit, 'notify', false
    );
  end if;

  if p_limit is not null and v_used >= p_limit then
    insert into public.collaborator_limit_notice (user_id, channel, week_start)
    values (p_user_id, p_channel, p_since)
    on conflict do nothing;

    v_notify := found;

    return jsonb_build_object(
      'ok', false, 'used', v_used, 'limit', p_limit, 'notify', v_notify
    );
  end if;

  insert into public.collaborator_weekly_message (
    organization_id, user_id, channel, kind, source_id
  ) values (
    p_organization_id, p_user_id, p_channel, p_kind, p_source_id
  );

  return jsonb_build_object(
    'ok', true, 'used', v_used + 1, 'limit', p_limit, 'notify', false
  );
end;
$$;

revoke all on function public.claim_collaborator_message(
  integer, integer, text, text, text, integer, timestamptz
) from public, anon, authenticated;
grant execute on function public.claim_collaborator_message(
  integer, integer, text, text, text, integer, timestamptz
) to service_role;

-- Uso da semana de cada colaborador de uma organização, por canal (para a
-- página de Utilizadores).
create or replace function public.collaborator_weekly_usage(
  p_organization_id integer,
  p_since timestamptz
)
returns table (user_id integer, channel text, used integer)
language sql
security invoker
stable
set search_path = ''
as $$
  select m.user_id, m.channel, count(*)::integer
  from public.collaborator_weekly_message m
  where m.organization_id = p_organization_id
    and m.counted_at >= p_since
  group by m.user_id, m.channel;
$$;

revoke all on function public.collaborator_weekly_usage(integer, timestamptz)
  from public, anon, authenticated;
grant execute on function public.collaborator_weekly_usage(integer, timestamptz)
  to service_role;

-- Limite diário de envios do administrador (#188): 10 por dia em cada canal,
-- por organização. Um envio conta 1, seja para 1 ou para 100 colaboradores;
-- uma corrente de N passos conta N. O limite vem de
-- plan.max_daily_messages_per_channel.
--
-- Uma linha por envio que conta. O dia não se "limpa": a contagem só soma as
-- linhas desde o início do dia (00:01 de Lisboa, calculado no código), por
-- isso o histórico fica e o reset funciona sem cron.
-- Correr no SQL Editor do Supabase ANTES do deploy. Pode ser corrido mais de
-- uma vez.

create table if not exists public.admin_daily_send (
  id bigint generated always as identity primary key,
  organization_id integer not null
    references public.organization (id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'teams')),
  -- De onde veio: envio imediato, agendada ou corrente.
  source_type text not null
    check (source_type in ('broadcast', 'scheduled_broadcast', 'message_chain')),
  -- O id da agendada ou da corrente (gravado depois de a criar), para
  -- devolver o envio ao cancelar.
  source_id text,
  -- Quanto gasta: 1 num envio, N numa corrente de N passos.
  units integer not null default 1 check (units between 1 and 1000),
  -- Identifica o pedido: o mesmo pedido duas vezes só conta uma.
  claim_key uuid not null unique,
  counted_at timestamptz not null default now()
);

create index if not exists admin_daily_send_org_channel_day_idx
  on public.admin_daily_send (organization_id, channel, counted_at);

create index if not exists admin_daily_send_source_idx
  on public.admin_daily_send (source_type, source_id);

alter table public.admin_daily_send enable row level security;
revoke all on table public.admin_daily_send from public, anon, authenticated;
grant select, insert, update, delete on table public.admin_daily_send to service_role;

-- Conta o que já foi gasto hoje e, se couber, grava o envio. Tudo numa só
-- operação, com um cadeado por organização e canal: dois envios ao mesmo
-- tempo com 9/10 não passam os dois.
-- p_limit null = sem limite (grava na mesma, para o contador).
-- Devolve { ok, used, limit }; `used` é o total depois de gravar (ou o
-- atual, quando não cabe).
create or replace function public.claim_admin_daily_send(
  p_organization_id integer,
  p_channel text,
  p_source_type text,
  p_source_id text,
  p_units integer,
  p_limit integer,
  p_since timestamptz,
  p_claim_key uuid
)
returns jsonb
language plpgsql
security invoker
volatile
set search_path = ''
as $$
declare
  v_used integer;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501',
      message = 'admin daily sends are restricted to service_role';
  end if;

  if p_units is null or p_units < 1 then
    raise exception using errcode = '22023', message = 'invalid units';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('admin_daily_send:' || p_organization_id || ':' || p_channel)
  );

  -- O mesmo pedido outra vez: já está contado.
  if exists (
    select 1 from public.admin_daily_send where claim_key = p_claim_key
  ) then
    select coalesce(sum(units), 0) into v_used
    from public.admin_daily_send
    where organization_id = p_organization_id
      and channel = p_channel
      and counted_at >= p_since;

    return jsonb_build_object('ok', true, 'used', v_used, 'limit', p_limit);
  end if;

  select coalesce(sum(units), 0) into v_used
  from public.admin_daily_send
  where organization_id = p_organization_id
    and channel = p_channel
    and counted_at >= p_since;

  if p_limit is not null and v_used + p_units > p_limit then
    return jsonb_build_object('ok', false, 'used', v_used, 'limit', p_limit);
  end if;

  insert into public.admin_daily_send (
    organization_id, channel, source_type, source_id, units, claim_key
  ) values (
    p_organization_id, p_channel, p_source_type, p_source_id, p_units, p_claim_key
  );

  return jsonb_build_object(
    'ok', true, 'used', v_used + p_units, 'limit', p_limit
  );
end;
$$;

revoke all on function public.claim_admin_daily_send(
  integer, text, text, text, integer, integer, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.claim_admin_daily_send(
  integer, text, text, text, integer, integer, timestamptz, uuid
) to service_role;

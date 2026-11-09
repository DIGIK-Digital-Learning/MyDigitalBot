-- Guarda um único template de abertura pendente por utilizador e organização.
-- O serviço aplica esta migração antes de publicar o código que usa a tabela.

create table if not exists public.whatsapp_opening_gate (
  org_id text not null,
  user_id text not null,
  template_message_id text,
  pending_outreach_id text,
  reply_message_id text,
  status text not null default 'sending'
    check (status in ('sending', 'pending', 'accepted', 'expired', 'failed')),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index if not exists whatsapp_opening_gate_status_expiry_idx
  on public.whatsapp_opening_gate (status, expires_at);

alter table public.whatsapp_opening_gate enable row level security;
revoke all on public.whatsapp_opening_gate from anon, authenticated;
grant all on public.whatsapp_opening_gate to service_role;

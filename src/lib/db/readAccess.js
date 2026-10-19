import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { getSupabaseAdminClient } from "@/lib/db/admin";

const sessionReads = new AsyncLocalStorage();

// A sessão vem dos guards do servidor. Nunca recorrer à service role se faltar.
export function getSessionReadClient(auth) {
  if (auth?.error || !auth?.user?.id || typeof auth?.supabase?.from !== "function") {
    throw new Error("É necessária uma sessão autenticada para consultar os dados.");
  }

  return auth.supabase;
}

// Analytics partilha vários leitores em paralelo, todos limitados à mesma sessão.
export function withSessionReadAccess(auth, read) {
  return sessionReads.run(getSessionReadClient(auth), read);
}

export function getScopedReadClient() {
  const client = sessionReads.getStore();
  if (!client) {
    throw new Error("A consulta não tem uma sessão autenticada associada.");
  }
  return client;
}

// A ausência de âmbito só é permitida nos leitores internos (bots/crons).
// Um erro de sessão ou de RLS nunca deve provocar uma repetição com service role.
export function getOptionalScopedReadClient() {
  return sessionReads.getStore() ?? null;
}

// As rotas de consulta entram obrigatoriamente num âmbito de sessão validado.
// Sem esse âmbito, este leitor pertence a uma operação interna (bot/cron).
export function getRepositoryReadClient() {
  return getOptionalScopedReadClient() ?? getSupabaseAdminClient();
}

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseAdminClient } from "@/lib/db/admin";
import {
  getOptionalScopedReadClient,
  getScopedReadClient,
  withSessionReadAccess,
} from "@/lib/db/readAccess";
import { createMessage, getMessagesInThread } from "@/lib/repos/messages.repo";
import { countRows } from "@/lib/repos/analytics/analyticsBase.repo";
import { requireOrgForThread } from "@/lib/auth/guards";
import { GET } from "@/app/api/threads/[threadId]/messages/route";

vi.mock("@/lib/db/admin", () => ({ getSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/auth/guards", () => ({
  requireOrgForThread: vi.fn(),
  handleApiError: (_error, message) => Response.json({ error: message }, { status: 500 }),
}));

function clientWithResult(data, error = null) {
  const result = { data, error, count: Array.isArray(data) ? data.length : 1 };
  const query = {};
  for (const name of ["select", "insert", "eq", "order"]) {
    query[name] = vi.fn().mockReturnValue(query);
  }
  query.single = vi.fn().mockResolvedValue(result);
  query.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return { from: vi.fn().mockReturnValue(query), query };
}

const authFor = (client, orgId = 1) => ({
  user: { id: `owner-${orgId}` },
  orgId,
  threadId: 7,
  supabase: client,
});

beforeEach(() => vi.resetAllMocks());

describe("Acessos dos repositórios com sessão e RLS", () => {
  it("usa a sessão na leitura das mensagens, sem criar um cliente privilegiado", async () => {
    const session = clientWithResult([{ id: 1, content: "Da minha organização" }]);
    const items = await withSessionReadAccess(authFor(session), () => getMessagesInThread(7));
    expect(items).toEqual([{ id: 1, content: "Da minha organização" }]);
    expect(session.from).toHaveBeenCalledWith("message");
    expect(session.query.eq).toHaveBeenCalledWith("thread_id", 7);
    expect(getSupabaseAdminClient).not.toHaveBeenCalled();
    expect(getOptionalScopedReadClient()).toBeNull();
  });

  it("não repete uma consulta recusada pelo RLS com service role", async () => {
    const session = clientWithResult(null, { code: "42501", message: "permission denied" });
    await expect(withSessionReadAccess(authFor(session), () => getMessagesInThread(7)))
      .rejects.toMatchObject({ code: "42501" });
    expect(session.from).toHaveBeenCalledTimes(1);
    expect(getSupabaseAdminClient).not.toHaveBeenCalled();
    expect(getOptionalScopedReadClient()).toBeNull();
  });

  it("não mistura as sessões de duas organizações em consultas concorrentes", async () => {
    const first = clientWithResult([{ id: 1 }]);
    const second = clientWithResult([{ id: 2 }]);
    const read = (client, id) => withSessionReadAccess(authFor(client, id), async () => {
      await Promise.resolve();
      expect(getScopedReadClient()).toBe(client);
      return getMessagesInThread(id);
    });
    expect(await Promise.all([read(first, 1), read(second, 2)]))
      .toEqual([[{ id: 1 }], [{ id: 2 }]]);
    expect(first.query.eq).toHaveBeenCalledWith("thread_id", 1);
    expect(second.query.eq).toHaveBeenCalledWith("thread_id", 2);
    expect(getSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it.each([
    {},
    { user: { id: "owner" } },
    { supabase: { from: vi.fn() } },
    { ...authFor(clientWithResult([])), error: Response.json({}, { status: 403 }) },
  ])("recusa um contexto sem sessão válida antes de executar a consulta", (auth) => {
    const read = vi.fn();
    expect(() => withSessionReadAccess(auth, read)).toThrow(/sessão autenticada/);
    expect(read).not.toHaveBeenCalled();
    expect(getSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("mantém acesso privilegiado para a leitura interna de um bot ou cron", async () => {
    const admin = clientWithResult([{ id: 3 }]);
    getSupabaseAdminClient.mockReturnValue(admin);
    expect(await getMessagesInThread(7)).toEqual([{ id: 3 }]);
    expect(admin.from).toHaveBeenCalledWith("message");
  });

  it("mantém as escritas validadas no cliente privilegiado mesmo num âmbito de leitura", async () => {
    const session = clientWithResult([]);
    const admin = clientWithResult({ id: 9 });
    getSupabaseAdminClient.mockReturnValue(admin);
    await withSessionReadAccess(authFor(session), () => createMessage({ userId: 1, content: "Olá" }));
    expect(admin.query.insert).toHaveBeenCalled();
    expect(session.from).not.toHaveBeenCalled();
  });

  it("Analytics exige um âmbito autenticado e nunca usa service role por omissão", async () => {
    await expect(countRows("message")).rejects.toThrow(/sessão autenticada/);
    expect(getSupabaseAdminClient).not.toHaveBeenCalled();
    const session = clientWithResult([{ id: 1 }]);
    expect(await withSessionReadAccess(authFor(session), () => countRows("message"))).toBe(1);
    expect(getSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("a rota de mensagens usa o cliente da sessão devolvida pelo guard", async () => {
    const session = clientWithResult([{ id: 8 }]);
    requireOrgForThread.mockResolvedValue(authFor(session));
    const response = await GET(null, { params: Promise.resolve({ threadId: "7" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ messages: [{ id: 8 }] });
    expect(getSupabaseAdminClient).not.toHaveBeenCalled();
  });

  it("a rota recusa outra organização antes de consultar o repositório", async () => {
    requireOrgForThread.mockResolvedValue({ error: Response.json({}, { status: 403 }) });
    const response = await GET(null, { params: Promise.resolve({ threadId: "99" }) });
    expect(response.status).toBe(403);
    expect(getSupabaseAdminClient).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * #187: até 1.500 caracteres (como a pessoa os vê) e 5 ficheiros por
 * mensagem, e o máximo de passos de uma corrente vindo do plano.
 */

const mocks = vi.hoisted(() => ({
  getOrganizationPlan: vi.fn(),
  sendWhatsappBroadcast: vi.fn(),
  createMessageChain: vi.fn(),
}));

vi.mock("@/lib/repos/plans.repo", () => ({
  getOrganizationPlan: mocks.getOrganizationPlan,
}));

vi.mock("@/lib/auth/guards", () => ({
  requireOwnedOrg: vi.fn(async () => ({ orgId: 1, admin: {}, user: { id: "u" } })),
  assertUsersBelongToOrg: vi.fn(),
  requireAllRecipientsToBeKnownUsers: vi.fn(() => [5]),
  handleApiError(error, fallback) {
    return Response.json({ error: error.message || fallback }, { status: 500 });
  },
}));

vi.mock("@/lib/services/broadcast/sendWhatsappBroadcast", () => ({
  sendWhatsappBroadcast: mocks.sendWhatsappBroadcast,
}));

vi.mock("@/lib/services/audit/recordAuditEvent", () => ({
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/lib/repos/organizationMessagingFeature.repo", () => ({
  isReadChainsEnabled: vi.fn(async () => true),
}));

vi.mock("@/lib/repos/messageChain.repo", () => ({
  createMessageChain: mocks.createMessageChain,
  createMessageChainRecipients: vi.fn(),
  createMessageChainSteps: vi.fn(),
}));

vi.mock("@/lib/services/broadcast/readChains/sendReadChainStep", () => ({
  sendReadChainStep: vi.fn(),
}));

import { POST as sendWhatsapp } from "@/app/api/broadcast/whatsapp/route";
import { POST as createChain } from "@/app/api/broadcast/read-chain/route";

/* Um plano como o da migration, só com os campos que interessam aqui. */
function planWith(overrides = {}) {
  return {
    id: 1,
    plan_started_at: null,
    max_users_override: null,
    plan: {
      id: 1,
      name: "Demo",
      level: 0,
      max_message_chars: 1500,
      max_files_per_message: 5,
      max_chain_messages: 10,
      ...overrides,
    },
  };
}

const json = (body) => ({ json: () => Promise.resolve(body) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOrganizationPlan.mockResolvedValue(planWith());
  mocks.sendWhatsappBroadcast.mockResolvedValue({ ok: 1, failed: 0 });
  /* Chegar a criar a corrente quer dizer que passou nos limites. */
  mocks.createMessageChain.mockRejectedValue(new Error("passou os limites"));
});

describe("POST /api/broadcast/whatsapp", () => {
  const send = (message, files = []) =>
    sendWhatsapp(json({ orgId: 1, recipients: [{ userId: 5 }], message, files }));

  it("1.500 caracteres vistos passam, mesmo com marcas de negrito", async () => {
    const response = await send(`*${"a".repeat(1500)}*`);

    expect(response.status).toBe(200);
    expect(mocks.sendWhatsappBroadcast).toHaveBeenCalled();
  });

  it("1.501 é recusado antes de enviar", async () => {
    const response = await send("a".repeat(1501));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      code: "MESSAGE_TOO_LONG",
      limit: 1500,
    });
    expect(mocks.sendWhatsappBroadcast).not.toHaveBeenCalled();
  });

  it("6 ficheiros são recusados antes de enviar", async () => {
    const response = await send("olá", [1, 2, 3, 4, 5, 6].map((n) => ({ url: `f${n}` })));

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("TOO_MANY_FILES");
    expect(mocks.sendWhatsappBroadcast).not.toHaveBeenCalled();
  });
});

describe("POST /api/broadcast/read-chain", () => {
  const steps = (n, longStep = null) =>
    Array.from({ length: n }, (_, i) => ({
      message: i + 1 === longStep ? "a".repeat(1501) : `passo ${i + 1}`,
    }));

  const create = (stepList) =>
    createChain(json({ orgId: 1, recipients: [{ userId: 5 }], steps: stepList }));

  it("10 passos passam os limites", async () => {
    await create(steps(10)).catch(() => {});
    expect(mocks.createMessageChain).toHaveBeenCalled();
  });

  it("11 passos são recusados com o máximo do plano", async () => {
    const response = await create(steps(11));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "CHAIN_TOO_LONG", limit: 10 });
    expect(mocks.createMessageChain).not.toHaveBeenCalled();
  });

  it("o máximo de passos vem do plano, não está fixo em 10", async () => {
    mocks.getOrganizationPlan.mockResolvedValue(planWith({ max_chain_messages: 3 }));

    const response = await create(steps(4));

    expect(response.status).toBe(400);
    expect((await response.json()).limit).toBe(3);
  });

  it("um passo longo demais é recusado e diz qual", async () => {
    const response = await create(steps(3, 2));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "MESSAGE_TOO_LONG", step: 2 });
    expect(mocks.createMessageChain).not.toHaveBeenCalled();
  });
});

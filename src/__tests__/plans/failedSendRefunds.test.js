import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * #188: um envio que falha para toda a gente não conta. Nas agendadas e nas
 * correntes agendadas, o cron devolve o envio ao limite do dia — só se foi
 * agendado nesse mesmo dia (o repositório filtra pelo início do dia).
 */

const mocks = vi.hoisted(() => ({
  refundScheduledSend: vi.fn(),
  refundChainSend: vi.fn(),
  getDueScheduledBroadcasts: vi.fn(),
  markScheduledBroadcastProcessing: vi.fn(),
  finishScheduledBroadcast: vi.fn(),
  sendWhatsappBroadcast: vi.fn(),
  claimDueScheduledMessageChains: vi.fn(),
  getMessageChainStep: vi.fn(),
  getMessageChainRecipientsByChainId: vi.fn(),
  markMessageChainActive: vi.fn(),
  markMessageChainFailed: vi.fn(),
  sendReadChainStep: vi.fn(),
}));

vi.mock("@/lib/repos/adminDailySends.repo", () => ({
  refundScheduledSend: mocks.refundScheduledSend,
  refundChainSend: mocks.refundChainSend,
}));

vi.mock("@/lib/repos/scheduledBroadcasts.repo", () => ({
  getDueScheduledBroadcasts: mocks.getDueScheduledBroadcasts,
  markScheduledBroadcastProcessing: mocks.markScheduledBroadcastProcessing,
  finishScheduledBroadcast: mocks.finishScheduledBroadcast,
}));

vi.mock("@/lib/repos/automationRuns.repo", () => ({
  getAutomationRunForScheduledBroadcast: vi.fn(),
  markAutomationRunFailed: vi.fn(),
  markAutomationRunProcessing: vi.fn(),
  markAutomationRunSent: vi.fn(),
}));

vi.mock("@/lib/services/broadcast/sendWhatsappBroadcast", () => ({
  sendWhatsappBroadcast: mocks.sendWhatsappBroadcast,
}));
vi.mock("@/lib/services/broadcast/sendTeamsBroadcast", () => ({
  sendTeamsBroadcast: vi.fn(),
}));
vi.mock("@/lib/services/broadcast/sendTeamsGroupBroadcast", () => ({
  sendTeamsGroupBroadcast: vi.fn(),
}));
vi.mock("@/lib/services/audit/recordAuditEvent", () => ({
  recordSystemAuditEvent: vi.fn(),
}));

vi.mock("@/lib/repos/messageChain.repo", () => ({
  claimDueScheduledMessageChains: mocks.claimDueScheduledMessageChains,
  getMessageChainDelivery: vi.fn(async () => null),
  getMessageChainRecipientsByChainId: mocks.getMessageChainRecipientsByChainId,
  getMessageChainStep: mocks.getMessageChainStep,
  markMessageChainActive: mocks.markMessageChainActive,
  markMessageChainFailed: mocks.markMessageChainFailed,
}));

vi.mock("@/lib/services/broadcast/readChains/sendReadChainStep", () => ({
  sendReadChainStep: mocks.sendReadChainStep,
}));

import { GET as processScheduled } from "@/app/api/cron/process-scheduled-broadcasts/route";
import { GET as processChains } from "@/app/api/cron/read-chains/route";

const cronRequest = (path) =>
  new Request(`http://localhost${path}`, {
    headers: { authorization: "Bearer segredo" },
  });

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "segredo";

  mocks.getDueScheduledBroadcasts.mockResolvedValue([
    {
      id: "b1",
      organization_id: 7,
      channel: "whatsapp",
      payload: { message: "olá", recipients: [{ userId: 5 }] },
    },
  ]);
  mocks.markScheduledBroadcastProcessing.mockResolvedValue(true);

  mocks.claimDueScheduledMessageChains.mockResolvedValue([
    { id: "c1", organization_id: 7, channel: "whatsapp" },
  ]);
  mocks.getMessageChainStep.mockResolvedValue({ id: "s1", chain_id: "c1" });
  mocks.getMessageChainRecipientsByChainId.mockResolvedValue([
    { id: "r1", chain_id: "c1", user_id: 5, status: "active" },
  ]);
});

describe("cron das agendadas", () => {
  it("falhou para toda a gente: devolve o envio, desde o início do dia", async () => {
    mocks.sendWhatsappBroadcast.mockResolvedValue({ ok: 0, failed: 1 });

    await processScheduled(
      cronRequest("/api/cron/process-scheduled-broadcasts"),
    );

    expect(mocks.finishScheduledBroadcast).toHaveBeenCalledWith("b1", {
      status: "failed",
    });
    expect(mocks.refundScheduledSend).toHaveBeenCalledWith(
      "b1",
      expect.any(Date),
    );
  });

  it("deu erro a enviar: também devolve", async () => {
    mocks.sendWhatsappBroadcast.mockRejectedValue(new Error("Bird em baixo"));

    await processScheduled(
      cronRequest("/api/cron/process-scheduled-broadcasts"),
    );

    expect(mocks.refundScheduledSend).toHaveBeenCalledWith(
      "b1",
      expect.any(Date),
    );
  });

  it("chegou a alguém (mesmo que não a todos): conta", async () => {
    mocks.sendWhatsappBroadcast.mockResolvedValue({ ok: 1, failed: 1 });

    await processScheduled(
      cronRequest("/api/cron/process-scheduled-broadcasts"),
    );

    expect(mocks.finishScheduledBroadcast).toHaveBeenCalledWith("b1", {
      status: "partial",
    });
    expect(mocks.refundScheduledSend).not.toHaveBeenCalled();
  });

  it("se devolver falhar, a agendada fica na mesma como falhada", async () => {
    mocks.sendWhatsappBroadcast.mockResolvedValue({ ok: 0, failed: 1 });
    mocks.refundScheduledSend.mockRejectedValue(new Error("base em baixo"));

    const response = await processScheduled(
      cronRequest("/api/cron/process-scheduled-broadcasts"),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).failed).toBe(1);
  });
});

describe("cron das correntes agendadas", () => {
  it("a 1.ª mensagem falhou para toda a gente: devolve os envios todos", async () => {
    mocks.sendReadChainStep.mockResolvedValue({ ok: false, error: "x" });

    await processChains(cronRequest("/api/cron/read-chains"));

    expect(mocks.markMessageChainFailed).toHaveBeenCalled();
    expect(mocks.refundChainSend).toHaveBeenCalledWith("c1", expect.any(Date));
  });

  it("a corrente nem chegou a começar (sem destinatários): devolve", async () => {
    mocks.getMessageChainRecipientsByChainId.mockResolvedValue([]);

    await processChains(cronRequest("/api/cron/read-chains"));

    expect(mocks.refundChainSend).toHaveBeenCalledWith("c1", expect.any(Date));
  });

  it("chegou a alguém: começa e conta", async () => {
    mocks.sendReadChainStep.mockResolvedValue({ ok: true, sent: true });

    await processChains(cronRequest("/api/cron/read-chains"));

    expect(mocks.markMessageChainActive).toHaveBeenCalledWith("c1");
    expect(mocks.refundChainSend).not.toHaveBeenCalled();
  });
});

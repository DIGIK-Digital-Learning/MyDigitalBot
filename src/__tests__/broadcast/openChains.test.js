import { describe, expect, it, vi } from "vitest";

/*
 * Correntes nas Mensagens agendadas: a lista (agendadas e a decorrer) e o
 * cancelar/parar, com a devolução dos envios do dia só no cancelar.
 */

vi.mock("@/lib/repos/messageChain.repo", () => ({}));
vi.mock("@/lib/repos/adminDailySends.repo", () => ({}));

import {
  closeChain,
  listOpenChains,
  previewText,
} from "@/lib/services/broadcast/readChains/openChains";

function row(overrides = {}) {
  return {
    id: "c1",
    organization_id: 7,
    channel: "whatsapp",
    status: "scheduled",
    scheduled_for: "2026-10-28T09:00:00Z",
    recipient_count: 3,
    created_at: "2026-10-27T10:00:00Z",
    message_chain_step: [
      { step_index: 2, payload: { message: "Segunda", files: [{}] } },
      { step_index: 1, payload: { message: "*Olá* <b>equipa</b>" } },
    ],
    message_chain_recipient: [
      { status: "active", current_step_index: 0 },
      { status: "active", current_step_index: 0 },
      { status: "active", current_step_index: 0 },
    ],
    ...overrides,
  };
}

describe("listOpenChains", () => {
  it("resume cada corrente com os passos por ordem e o texto sem formatação", async () => {
    const [chain] = await listOpenChains(7, {
      deps: { listOpenMessageChains: async () => [row()] },
    });

    expect(chain).toMatchObject({
      id: "c1",
      kind: "chain",
      status: "scheduled",
      stepCount: 2,
      recipientCount: 3,
      preview: "Olá equipa",
    });
    expect(chain.steps.map((s) => [s.index, s.fileCount, s.reached])).toEqual([
      [1, 0, 0],
      [2, 1, 0],
    ]);
  });

  it("a decorrer: mostra quantos receberam cada mensagem", async () => {
    const [chain] = await listOpenChains(7, {
      deps: {
        listOpenMessageChains: async () => [
          row({
            status: "active",
            message_chain_recipient: [
              { status: "completed", current_step_index: 2 },
              { status: "active", current_step_index: 1 },
              { status: "active", current_step_index: 1 },
            ],
          }),
        ],
      },
    });

    expect(chain.status).toBe("running");
    expect(chain.steps.map((s) => s.reached)).toEqual([3, 1]);
    expect(chain.recipientsWaiting).toBe(2);
    expect(chain.recipientsDone).toBe(1);
  });

  it("uma corrente a decorrer sem ninguém à espera já terminou e não aparece", async () => {
    const items = await listOpenChains(7, {
      deps: {
        listOpenMessageChains: async () => [
          row({
            status: "active",
            message_chain_recipient: [
              { status: "completed", current_step_index: 2 },
            ],
          }),
        ],
      },
    });

    expect(items).toEqual([]);
  });

  it("encurta textos longos", () => {
    expect(previewText("a".repeat(200))).toHaveLength(140);
  });
});

describe("closeChain", () => {
  const now = new Date("2026-10-27T15:00:00Z");

  function setup(chain, closed = { ...chain, status: "x" }) {
    const deps = {
      getMessageChainById: vi.fn(async () => chain),
      closeMessageChain: vi.fn(async () => closed),
      refundChainSend: vi.fn(async () => {}),
    };
    return deps;
  }

  it("cancela uma agendada e devolve os envios contados hoje", async () => {
    const deps = setup(row());

    const result = await closeChain(7, "c1", { now, deps });

    expect(result.action).toBe("cancelled");
    expect(deps.closeMessageChain).toHaveBeenCalledWith(
      expect.objectContaining({
        fromStatus: "scheduled",
        toStatus: "cancelled",
      }),
    );
    /* Desde as 00:01 de Lisboa de hoje (23:01 UTC de ontem no inverno). */
    expect(deps.refundChainSend).toHaveBeenCalledWith(
      "c1",
      new Date("2026-10-27T00:01:00Z"),
    );
  });

  it("para uma corrente a decorrer, sem devolver envios", async () => {
    const deps = setup(row({ status: "active" }));

    const result = await closeChain(7, "c1", { now, deps });

    expect(result.action).toBe("stopped");
    expect(deps.closeMessageChain).toHaveBeenCalledWith(
      expect.objectContaining({ fromStatus: "active", toStatus: "stopped" }),
    );
    expect(deps.refundChainSend).not.toHaveBeenCalled();
  });

  it("se o envio começou entretanto, não cancela nem devolve", async () => {
    const deps = setup(row(), null);

    const result = await closeChain(7, "c1", { now, deps });

    expect(result).toEqual({ code: "CHAIN_SENDING", status: 409 });
    expect(deps.refundChainSend).not.toHaveBeenCalled();
  });

  it("a sair agora: pede para tentar depois", async () => {
    const deps = setup(row({ status: "processing" }));

    expect(await closeChain(7, "c1", { now, deps })).toEqual({
      code: "CHAIN_SENDING",
      status: 409,
    });
    expect(deps.closeMessageChain).not.toHaveBeenCalled();
  });

  it("uma corrente de outra organização não existe para quem pede", async () => {
    const deps = setup(row({ organization_id: 8 }));

    expect(await closeChain(7, "c1", { now, deps })).toEqual({
      code: "CHAIN_NOT_FOUND",
      status: 404,
    });
    expect(deps.closeMessageChain).not.toHaveBeenCalled();
  });

  it("uma corrente já terminada não se cancela", async () => {
    const deps = setup(row({ status: "cancelled" }));

    expect(await closeChain(7, "c1", { now, deps })).toEqual({
      code: "CHAIN_NOT_OPEN",
      status: 409,
    });
  });
});

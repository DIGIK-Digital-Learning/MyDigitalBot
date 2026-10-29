import { describe, expect, it, vi } from "vitest";

/*
 * Correntes nas Mensagens agendadas: a lista (agendadas e a decorrer) e o
 * cancelar/parar, com a devolução dos envios do dia só no cancelar.
 */

vi.mock("@/lib/repos/messageChain.repo", () => ({}));
vi.mock("@/lib/repos/adminDailySends.repo", () => ({}));

import {
  closeChain,
  editChainStep,
  listOpenChains,
  removeChainStep,
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

describe("tirar uma mensagem da corrente", () => {
  const now = new Date("2026-10-27T15:00:00Z");
  const steps = [
    { id: "s1", step_index: 1, payload: {} },
    { id: "s2", step_index: 2, payload: { questionId: 42 } },
    { id: "s3", step_index: 3, payload: {} },
  ];

  function setup({ chain = row(), list = steps, touched = false } = {}) {
    return {
      getMessageChainById: vi.fn(async () => chain),
      listMessageChainSteps: vi.fn(async () => list),
      messageChainStepTouched: vi.fn(async () => touched),
      removeMessageChainStep: vi.fn(async () => {}),
      deleteUnsentChainQuestion: vi.fn(async () => {}),
      refundOneChainSend: vi.fn(async () => {}),
    };
  }

  it("agendada: tira, apaga a pergunta e devolve 1 envio de hoje", async () => {
    const deps = setup();

    const result = await removeChainStep(7, "c1", 2, { now, deps });

    expect(result.stepCount).toBe(2);
    expect(deps.removeMessageChainStep).toHaveBeenCalledWith(
      expect.objectContaining({ stepId: "s2", stepIndex: 2, steps }),
    );
    expect(deps.deleteUnsentChainQuestion).toHaveBeenCalledWith({
      questionId: 42,
      organizationId: 7,
    });
    expect(deps.refundOneChainSend).toHaveBeenCalledWith(
      "c1",
      new Date("2026-10-27T00:01:00Z"),
    );
  });

  it("a decorrer: tira uma mensagem a que ninguém chegou, sem devolver envios", async () => {
    const deps = setup({ chain: row({ status: "active" }) });

    const result = await removeChainStep(7, "c1", 3, { now, deps });

    expect(result.stepCount).toBe(2);
    expect(deps.refundOneChainSend).not.toHaveBeenCalled();
  });

  it("não tira uma mensagem que alguém já recebeu ou tem marcada", async () => {
    const deps = setup({ chain: row({ status: "active" }), touched: true });

    expect(await removeChainStep(7, "c1", 2, { now, deps })).toEqual({
      code: "STEP_ALREADY_SENT",
      status: 409,
    });
    expect(deps.removeMessageChainStep).not.toHaveBeenCalled();
  });

  it("fica sempre com pelo menos 2 mensagens", async () => {
    const deps = setup({ list: steps.slice(0, 2) });

    expect(await removeChainStep(7, "c1", 1, { now, deps })).toEqual({
      code: "CHAIN_MIN_STEPS",
      status: 409,
    });
    expect(deps.removeMessageChainStep).not.toHaveBeenCalled();
  });

  it("não mexe numa corrente que está a sair, de outra organização ou sem esse passo", async () => {
    expect(
      await removeChainStep(7, "c1", 2, {
        now,
        deps: setup({ chain: row({ status: "processing" }) }),
      }),
    ).toEqual({ code: "CHAIN_SENDING", status: 409 });

    expect(
      await removeChainStep(7, "c1", 2, {
        now,
        deps: setup({ chain: row({ organization_id: 8 }) }),
      }),
    ).toEqual({ code: "CHAIN_NOT_FOUND", status: 404 });

    expect(await removeChainStep(7, "c1", 9, { now, deps: setup() })).toEqual({
      code: "STEP_NOT_FOUND",
      status: 404,
    });
  });

  it("na lista, a mensagem fica bloqueada se alguém lá chegou ou a tem marcada", async () => {
    const [chain] = await listOpenChains(7, {
      deps: {
        listOpenMessageChains: async () => [
          row({
            status: "active",
            message_chain_step: [
              { step_index: 1, payload: {} },
              { step_index: 2, payload: {} },
              { step_index: 3, payload: {} },
            ],
            message_chain_recipient: [
              { status: "active", current_step_index: 1 },
            ],
            message_chain_delivery: [{ step_index: 1 }, { step_index: 2 }],
          }),
        ],
      },
    });

    expect(chain.steps.map((s) => s.locked)).toEqual([true, true, false]);
  });
});

describe("editar o texto de uma mensagem da corrente", () => {
  const steps = [
    { id: "s1", step_index: 1, payload: { message: "Olá", files: ["a.pdf"] } },
    { id: "s2", step_index: 2, payload: { questionId: 42, question: {} } },
    { id: "s3", step_index: 3, payload: { message: "Fim" } },
  ];

  function setup({ chain = row(), touched = false, content = {} } = {}) {
    return {
      getMessageChainById: vi.fn(async () => chain),
      listMessageChainSteps: vi.fn(async () => steps),
      messageChainStepTouched: vi.fn(async () => touched),
      updateMessageChainStepPayload: vi.fn(async () => {}),
      checkMessageContent: vi.fn(async () => content),
    };
  }

  it("grava só o texto e mantém o resto do payload", async () => {
    const deps = setup({ chain: row({ status: "active" }) });

    const result = await editChainStep(7, "c1", 1, "Olá a todos", { deps });

    expect(result.changed).toBe(true);
    expect(deps.checkMessageContent).toHaveBeenCalledWith(7, {
      message: "Olá a todos",
      files: ["a.pdf"],
    });
    expect(deps.updateMessageChainStepPayload).toHaveBeenCalledWith({
      chainId: "c1",
      stepId: "s1",
      payload: { message: "Olá a todos", files: ["a.pdf"] },
    });
  });

  it("o mesmo texto não grava nada", async () => {
    const deps = setup();

    expect((await editChainStep(7, "c1", 3, "Fim", { deps })).changed).toBe(
      false,
    );
    expect(deps.updateMessageChainStepPayload).not.toHaveBeenCalled();
  });

  it("recusa perguntas, texto vazio sem ficheiros e o que alguém já recebeu", async () => {
    expect(await editChainStep(7, "c1", 2, "x", { deps: setup() })).toEqual({
      code: "STEP_HAS_QUESTION",
      status: 409,
    });
    expect(await editChainStep(7, "c1", 3, "  ", { deps: setup() })).toEqual({
      code: "STEP_EMPTY",
      status: 400,
    });
    expect(
      await editChainStep(7, "c1", 3, "Novo", {
        deps: setup({ chain: row({ status: "active" }), touched: true }),
      }),
    ).toEqual({ code: "STEP_ALREADY_SENT", status: 409 });
  });

  it("respeita o limite de caracteres do plano", async () => {
    const body = { code: "MESSAGE_TOO_LONG", limit: 10 };
    const deps = setup({ content: { body } });

    expect(await editChainStep(7, "c1", 3, "Muito comprido", { deps })).toEqual(
      { code: "MESSAGE_TOO_LONG", status: 400, body },
    );
    expect(deps.updateMessageChainStepPayload).not.toHaveBeenCalled();
  });

  it("não mexe numa corrente a sair ou de outra organização", async () => {
    expect(
      await editChainStep(7, "c1", 3, "x", {
        deps: setup({ chain: row({ status: "processing" }) }),
      }),
    ).toEqual({ code: "CHAIN_SENDING", status: 409 });
    expect(
      await editChainStep(7, "c1", 3, "x", {
        deps: setup({ chain: row({ organization_id: 8 }) }),
      }),
    ).toEqual({ code: "CHAIN_NOT_FOUND", status: 404 });
  });
});

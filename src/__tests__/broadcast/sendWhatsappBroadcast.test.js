import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  org: null,
  getUserById: vi.fn(),
  isWindowOpenForUser: vi.fn(),
  createPendingOutreach: vi.fn(),
  getAllPendingOutreachByUser: vi.fn(),
  updatePendingOutreachTemplateMessageId: vi.fn(),
  deletePendingOutreach: vi.fn(),
  claimWhatsappOpeningGate: vi.fn(),
  getWhatsappOpeningGate: vi.fn(),
  attachWhatsappOpeningGateOutreach: vi.fn(),
  markWhatsappOpeningGateSent: vi.fn(),
  failWhatsappOpeningGate: vi.fn(),
  createMessage: vi.fn(),
  createQuestion: vi.fn(),
  resolveTrackedLinks: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: mocks.org, error: null }),
        }),
      }),
    }),
  }),
}));

vi.mock("@/lib/repos/user.repo", () => ({
  getUserById: (...args) => mocks.getUserById(...args),
}));

vi.mock("@/lib/repos/messages.repo", () => ({
  isWindowOpenForUser: (...args) => mocks.isWindowOpenForUser(...args),
  createMessage: (...args) => mocks.createMessage(...args),
}));

vi.mock("@/lib/repos/pendingOutreach.repo", () => ({
  createPendingOutreach: (...args) => mocks.createPendingOutreach(...args),
  deletePendingOutreach: (...args) => mocks.deletePendingOutreach(...args),
  getAllPendingOutreachByUser: (...args) =>
    mocks.getAllPendingOutreachByUser(...args),
  updatePendingOutreachTemplateMessageId: (...args) =>
    mocks.updatePendingOutreachTemplateMessageId(...args),
}));

vi.mock("@/lib/repos/whatsappOpeningGate.repo", () => ({
  attachWhatsappOpeningGateOutreach: (...args) =>
    mocks.attachWhatsappOpeningGateOutreach(...args),
  claimWhatsappOpeningGate: (...args) =>
    mocks.claimWhatsappOpeningGate(...args),
  failWhatsappOpeningGate: (...args) => mocks.failWhatsappOpeningGate(...args),
  getWhatsappOpeningGate: (...args) => mocks.getWhatsappOpeningGate(...args),
  markWhatsappOpeningGateSent: (...args) =>
    mocks.markWhatsappOpeningGateSent(...args),
}));

vi.mock("@/lib/repos/questions.repo", () => ({
  createQuestion: (...args) => mocks.createQuestion(...args),
}));

/* Só a criação dos links é simulada; a troca no texto é a verdadeira. */
vi.mock("@/lib/services/broadcast/trackedLinks", async (importOriginal) => ({
  ...(await importOriginal()),
  resolveTrackedLinksForRecipient: (...args) =>
    mocks.resolveTrackedLinks(...args),
}));

vi.mock("@/lib/whatsapp/E164", () => ({
  toE164: async (value) => value,
}));

import { sendWhatsappBroadcast } from "@/lib/services/broadcast/sendWhatsappBroadcast";

const ORG = {
  id: 1,
  name: "DIGIK",
  channel_id: "channel-1",
  waba_namespace: null,
  default_phone_country_code: "+351",
  whatsapp_opening_body: "Corpo guardado na organização",
};

const USER = {
  id: 42,
  organization_id: 1,
  name: "Pedro",
  phone_number: "+351910000000",
};

function birdCall(index = 0) {
  const [url, init] = mocks.fetch.mock.calls[index];
  return { url, body: JSON.parse(init.body) };
}

function templateParams(body) {
  return Object.fromEntries(
    body.template.parameters.map((p) => [p.key, p.value]),
  );
}

describe("sendWhatsappBroadcast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.org = { ...ORG };
    mocks.getUserById.mockResolvedValue({ ...USER });
    mocks.isWindowOpenForUser.mockResolvedValue(false);
    mocks.createPendingOutreach.mockResolvedValue({ id: "po-1" });
    mocks.getAllPendingOutreachByUser.mockResolvedValue([]);
    mocks.getWhatsappOpeningGate.mockResolvedValue(null);
    mocks.claimWhatsappOpeningGate.mockImplementation(({ expiresAt }) => ({
      claimed: true,
      gate: {
        status: "sending",
        expires_at:
          expiresAt instanceof Date ? expiresAt.toISOString() : expiresAt,
      },
    }));
    mocks.attachWhatsappOpeningGateOutreach.mockResolvedValue(undefined);
    mocks.markWhatsappOpeningGateSent.mockResolvedValue(undefined);
    mocks.updatePendingOutreachTemplateMessageId.mockResolvedValue(undefined);
    mocks.deletePendingOutreach.mockResolvedValue(undefined);
    mocks.failWhatsappOpeningGate.mockResolvedValue(undefined);
    mocks.createMessage.mockResolvedValue({ id: 900 });
    mocks.createQuestion.mockResolvedValue({ id: 10 });
    mocks.resolveTrackedLinks.mockResolvedValue([]);
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "bird-msg-1" }),
    });

    vi.stubGlobal("fetch", mocks.fetch);
    vi.stubEnv("WORKSPACE_ID", "ws-1");
    vi.stubEnv("BIRD_API_KEY", "key-1");
    vi.stubEnv("BIRD_OPENING_TEMPLATE_PROJECT_ID", "project-opening");
    vi.stubEnv("BIRD_OPENING_TEMPLATE_LOCALE", "pt-PT");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each([true, false])(
    "envia pergunta aberta sem botões ou guarda-a em espera (janela=%s)",
    async (windowOpen) => {
      mocks.isWindowOpenForUser.mockResolvedValue(windowOpen);
      const result = await sendWhatsappBroadcast({
        orgId: 1,
        recipients: [{ userId: 42 }],
        scheduledBroadcastId: "schedule-1",
        question: {
          kind: "open",
          body: "Como verificas os pneus?",
          expectedAnswer: "A frio.",
          aiEvaluation: false,
        },
      });
      expect(result.questionId).toBe(10);
      expect(mocks.createQuestion).toHaveBeenCalledWith(
        expect.objectContaining({
          kind: "open",
          expectedAnswer: "A frio.",
          options: null,
          aiEvaluation: false,
          scheduledBroadcastId: "schedule-1",
        }),
      );
      if (windowOpen) {
        expect(birdCall().body.body).toEqual({
          type: "text",
          text: { text: "Como verificas os pneus?" },
        });
        expect(mocks.createMessage).toHaveBeenCalledWith(
          expect.objectContaining({ questionId: 10 }),
        );
      } else {
        expect(mocks.createPendingOutreach).toHaveBeenCalledWith(
          expect.objectContaining({
            payload: {
              type: "open",
              questionId: 10,
              message: "Como verificas os pneus?",
              imageUrls: [],
              actions: null,
              openingGate: true,
            },
          }),
        );
      }
    },
  );

  it("no WhatsApp, a formatação segue com os marcadores do WhatsApp", async () => {
    mocks.isWindowOpenForUser.mockResolvedValue(true);

    await sendWhatsappBroadcast({
      orgId: 1,
      message: "*Olá* {{nome}}, ~não~ te esqueças",
      recipients: [{ userId: 42 }],
    });

    expect(birdCall().body.body.text.text).toBe(
      "*Olá* Pedro, ~não~ te esqueças",
    );
  });

  it("sends the message directly when the 24h window is open", async () => {
    mocks.isWindowOpenForUser.mockResolvedValue(true);

    const result = await sendWhatsappBroadcast({
      orgId: 1,
      message: "Olá {{nome}}",
      recipients: [{ userId: 42 }],
    });

    expect(result.ok).toBe(1);
    expect(result.queued).toBe(0);
    expect(result.results[0].kind).toBe("freeform");

    const { body } = birdCall();
    expect(body.body).toEqual({ type: "text", text: { text: "Olá Pedro" } });
    expect(mocks.createPendingOutreach).not.toHaveBeenCalled();
  });

  it("sends the opening template with name and company and queues the message when the window is closed", async () => {
    const result = await sendWhatsappBroadcast({
      orgId: 1,
      message: "Dica de hoje",
      recipients: [{ userId: 42 }],
    });

    expect(result.ok).toBe(1);
    expect(result.queued).toBe(1);
    expect(result.note).toMatch(/Quick Reply/);
    expect(result.results[0].kind).toBe("template");

    const { body } = birdCall();
    expect(body.template.projectId).toBe("project-opening");
    expect(body.template.version).toBe("latest");
    expect(body.template.locale).toBe("pt-PT");
    expect(templateParams(body)).toEqual({
      nome: "Pedro",
      empresa: "DIGIK",
    });

    expect(mocks.createPendingOutreach).toHaveBeenCalledTimes(1);
    expect(mocks.createPendingOutreach.mock.calls[0][0]).toMatchObject({
      orgId: 1,
      userId: 42,
      payload: { message: "Dica de hoje", imageUrls: [] },
      templateMessageId: null,
    });
    expect(mocks.updatePendingOutreachTemplateMessageId).toHaveBeenCalledWith(
      "po-1",
      "bird-msg-1",
    );
  });

  it("queues later broadcasts behind the active opening template without sending another one", async () => {
    const expiresAt = new Date(
      Date.now() + 13 * 24 * 60 * 60 * 1000,
    ).toISOString();
    mocks.getWhatsappOpeningGate.mockResolvedValue({
      status: "pending",
      template_message_id: "bird-opening-1",
      expires_at: expiresAt,
    });

    const first = await sendWhatsappBroadcast({
      orgId: 1,
      message: "Primeira mensagem da campanha",
      recipients: [{ userId: 42 }],
    });
    const second = await sendWhatsappBroadcast({
      orgId: 1,
      message: "Segunda mensagem da campanha",
      recipients: [{ userId: 42 }],
    });

    expect(first.results[0].kind).toBe("queued");
    expect(second.results[0].kind).toBe("queued");
    expect(first.queued + second.queued).toBe(2);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.claimWhatsappOpeningGate).not.toHaveBeenCalled();
    expect(mocks.isWindowOpenForUser).not.toHaveBeenCalled();
    expect(mocks.createPendingOutreach).toHaveBeenCalledTimes(2);
    expect(
      mocks.createPendingOutreach.mock.calls.map(([row]) => row.expiresAt),
    ).toEqual([expiresAt, expiresAt]);
  });

  /*
   * O template utility não tem corpo: nem o guardado na organização nem o
   * escolhido para um envio chegam ao Bird.
   */
  it("does not duplicate an opening-only request while its template is pending", async () => {
    mocks.getWhatsappOpeningGate.mockResolvedValue({
      status: "pending",
      template_message_id: "opening-1",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    });
    const result = await sendWhatsappBroadcast({
      orgId: 1,
      openingOnly: true,
      recipients: [{ userId: 42 }],
    });
    expect(result).toMatchObject({ suppressed: 1, queued: 0, failed: 0 });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.createPendingOutreach).not.toHaveBeenCalled();
  });

  it("queues a competing send when another worker claims the opening first", async () => {
    const expiresAt = new Date(Date.now() + 86400000).toISOString();
    mocks.claimWhatsappOpeningGate.mockResolvedValue({
      claimed: false,
      gate: { status: "sending", expires_at: expiresAt },
    });
    const result = await sendWhatsappBroadcast({
      orgId: 1,
      message: "Dica",
      recipients: [{ userId: 42 }],
    });
    expect(result).toMatchObject({ queued: 1, failed: 0 });
    expect(result.results[0].kind).toBe("queued");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.createPendingOutreach).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt }),
    );
  });

  it.each([
    ["accepted", true, "freeform"],
    ["accepted", false, "template"],
    ["expired", false, "template"],
  ])(
    "respects the 24h window after a gate is %s (window=%s)",
    async (status, windowOpen, kind) => {
      mocks.getWhatsappOpeningGate.mockResolvedValue({ status });
      mocks.isWindowOpenForUser.mockResolvedValue(windowOpen);
      const result = await sendWhatsappBroadcast({
        orgId: 1,
        message: "Dica",
        recipients: [{ userId: 42 }],
      });
      expect(result.results[0]).toMatchObject({ ok: true, kind });
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      expect(Boolean(birdCall().body.template)).toBe(kind === "template");
    },
  );

  it("releases the gate and queue row when Bird rejects the opening", async () => {
    mocks.fetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: async () => ({ error: "invalid-template" }),
    });
    const result = await sendWhatsappBroadcast({
      orgId: 1,
      message: "Dica",
      recipients: [{ userId: 42 }],
    });
    expect(result.failed).toBe(1);
    expect(mocks.failWhatsappOpeningGate).toHaveBeenCalledWith({
      orgId: 1,
      userId: 42,
    });
    expect(mocks.deletePendingOutreach).toHaveBeenCalledWith("po-1");
    expect(mocks.markWhatsappOpeningGateSent).not.toHaveBeenCalled();
  });

  it("keeps the gate reserved after an uncertain network result to prevent a duplicate opening", async () => {
    mocks.fetch.mockRejectedValueOnce(new Error("network timeout"));
    const result = await sendWhatsappBroadcast({
      orgId: 1,
      message: "Dica",
      recipients: [{ userId: 42 }],
    });
    expect(result.failed).toBe(1);
    expect(mocks.failWhatsappOpeningGate).not.toHaveBeenCalled();
    expect(mocks.deletePendingOutreach).not.toHaveBeenCalled();
  });

  it("never sends a body in the opening template, even one chosen for the send", async () => {
    await sendWhatsappBroadcast({
      orgId: 1,
      message: "Dica",
      openingBody: "Corpo só para este envio",
      recipients: [{ userId: 42 }],
    });

    expect(templateParams(birdCall().body)).not.toHaveProperty("mensagem");
  });

  it("sends only the opening template when openingOnly is set, even inside the window", async () => {
    mocks.isWindowOpenForUser.mockResolvedValue(true);

    const result = await sendWhatsappBroadcast({
      orgId: 1,
      openingOnly: true,
      recipients: [{ userId: 42 }],
    });

    expect(result.ok).toBe(1);
    expect(result.queued).toBe(0);
    expect(result.note).toBeNull();
    expect(result.results[0].kind).toBe("template");
    expect(birdCall().body.template).toBeTruthy();
    expect(mocks.isWindowOpenForUser).not.toHaveBeenCalled();
    expect(mocks.createPendingOutreach).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: 1,
        userId: 42,
        payload: { openingGate: true },
        templateMessageId: null,
      }),
    );
  });

  it("rejects a send with nothing to deliver", async () => {
    await expect(
      sendWhatsappBroadcast({ orgId: 1, recipients: [{ userId: 42 }] }),
    ).rejects.toThrow(/Missing message\/images/);
  });

  it("fails the recipient with a clear error when the template is not configured", async () => {
    vi.stubEnv("BIRD_OPENING_TEMPLATE_PROJECT_ID", "");

    const result = await sendWhatsappBroadcast({
      orgId: 1,
      message: "Dica",
      recipients: [{ userId: 42 }],
    });

    expect(result.ok).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.results[0].data.error).toMatch(
      /BIRD_OPENING_TEMPLATE_PROJECT_ID/,
    );
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("does not need the template when every recipient is inside the window", async () => {
    vi.stubEnv("BIRD_OPENING_TEMPLATE_PROJECT_ID", "");
    mocks.isWindowOpenForUser.mockResolvedValue(true);

    const result = await sendWhatsappBroadcast({
      orgId: 1,
      message: "Dica",
      recipients: [{ userId: 42 }],
    });

    expect(result.ok).toBe(1);
  });

  describe("quiz", () => {
    const QUIZ = {
      kind: "quiz",
      body: "Olá {{nome}}, qual é a pressão certa?",
      options: [
        { label: "2,2 bar", correct: false },
        { label: "2,8 bar", correct: true },
      ],
      feedbackCorrect: "Boa!",
      feedbackIncorrect: "",
    };

    it("creates the question once and sends it with reply buttons inside the window", async () => {
      mocks.isWindowOpenForUser.mockResolvedValue(true);

      const result = await sendWhatsappBroadcast({
        orgId: 1,
        recipients: [{ userId: 42 }],
        question: QUIZ,
        scheduledBroadcastId: "sb-1",
      });

      expect(result.ok).toBe(1);
      expect(result.questionId).toBe(10);
      expect(result.results[0]).toMatchObject({
        kind: "freeform",
        questionId: 10,
      });

      expect(mocks.createQuestion).toHaveBeenCalledTimes(1);
      expect(mocks.createQuestion.mock.calls[0][0]).toMatchObject({
        organizationId: 1,
        kind: "quiz",
        body: QUIZ.body,
        options: QUIZ.options,
        feedbackCorrect: "Boa!",
        scheduledBroadcastId: "sb-1",
        sendGroupId: result.sendGroupId,
      });
      expect(
        mocks.createQuestion.mock.calls[0][0].expiresAt.getTime(),
      ).toBeGreaterThan(Date.now());

      const { body } = birdCall();
      expect(body.body).toEqual({
        type: "text",
        text: {
          text: "Olá Pedro, qual é a pressão certa?",
          actions: [
            { type: "reply", reply: { text: "2,2 bar" } },
            { type: "reply", reply: { text: "2,8 bar" } },
          ],
        },
      });

      /* A mensagem entregue fica ligada à pergunta pelo id do Bird. */
      expect(mocks.createMessage).toHaveBeenCalledTimes(1);
      expect(mocks.createMessage.mock.calls[0][0]).toMatchObject({
        userId: 42,
        organizationId: 1,
        channel: "whatsapp",
        messageId: "bird-msg-1",
        content: "Olá Pedro, qual é a pressão certa?",
        role: "assistant",
        questionId: 10,
        scheduledBroadcastId: "sb-1",
      });
      expect(mocks.createPendingOutreach).not.toHaveBeenCalled();
    });

    it("queues the quiz with its buttons behind the opening template when the window is closed", async () => {
      const result = await sendWhatsappBroadcast({
        orgId: 1,
        recipients: [{ userId: 42 }],
        question: QUIZ,
      });

      expect(result.queued).toBe(1);
      expect(birdCall().body.template).toBeTruthy();
      expect(mocks.createMessage).not.toHaveBeenCalled();

      expect(mocks.createPendingOutreach).toHaveBeenCalledTimes(1);
      expect(mocks.createPendingOutreach.mock.calls[0][0].payload).toEqual({
        message: "Olá Pedro, qual é a pressão certa?",
        imageUrls: [],
        type: "quiz",
        questionId: 10,
        actions: [
          { type: "reply", reply: { text: "2,2 bar" } },
          { type: "reply", reply: { text: "2,8 bar" } },
        ],
        openingGate: true,
      });
    });

    it("sends the image, the question and the buttons in one message", async () => {
      mocks.isWindowOpenForUser.mockResolvedValue(true);

      const result = await sendWhatsappBroadcast({
        orgId: 1,
        recipients: [{ userId: 42 }],
        question: QUIZ,
        imageUrls: ["https://x/img.png"],
      });

      expect(result.ok).toBe(1);
      expect(mocks.fetch).toHaveBeenCalledTimes(1);

      /* Formato verificado com o Bird a 15-09-2026. */
      expect(birdCall().body.body).toEqual({
        type: "image",
        image: {
          images: [{ mediaUrl: "https://x/img.png" }],
          text: "Olá Pedro, qual é a pressão certa?",
          actions: [
            { type: "reply", reply: { text: "2,2 bar" } },
            { type: "reply", reply: { text: "2,8 bar" } },
          ],
        },
      });

      expect(mocks.createMessage).toHaveBeenCalledTimes(1);
      expect(mocks.createMessage.mock.calls[0][0]).toMatchObject({
        messageId: "bird-msg-1",
        questionId: 10,
      });
    });

    it("queues the attachment with the quiz when the window is closed", async () => {
      await sendWhatsappBroadcast({
        orgId: 1,
        recipients: [{ userId: 42 }],
        question: QUIZ,
        files: [{ url: "https://x/img.png", contentType: "image/png" }],
      });

      expect(
        mocks.createPendingOutreach.mock.calls[0][0].payload,
      ).toMatchObject({
        type: "quiz",
        questionId: 10,
        imageUrls: ["https://x/img.png"],
      });
    });

    it("rejects unknown question kinds", async () => {
      await expect(
        sendWhatsappBroadcast({
          orgId: 1,
          recipients: [{ userId: 42 }],
          question: { kind: "unsupported", body: "?" },
        }),
      ).rejects.toThrow(/Unsupported question kind/);

      expect(mocks.createQuestion).not.toHaveBeenCalled();
    });
  });

  describe("link rastreado como botão", () => {
    const GUIA = {
      key: "guia",
      label: "Guia passo a passo",
      destinationUrl: "https://exemplo.pt/mfa",
      trackedUrl: "https://www.mydigitalbot.com/r/abc",
    };

    const MESSAGE = "Olá {{nome}}, ativa hoje a MFA.\nGuia: {{link.guia}}";

    const LINK_ACTIONS = [
      {
        type: "link",
        link: { text: "Guia passo a passo", url: GUIA.trackedUrl },
      },
    ];

    beforeEach(() => {
      mocks.resolveTrackedLinks.mockResolvedValue([GUIA]);
    });

    it("tira o link do texto e envia-o num botão com a janela aberta", async () => {
      mocks.isWindowOpenForUser.mockResolvedValue(true);

      const result = await sendWhatsappBroadcast({
        orgId: 1,
        message: MESSAGE,
        trackedLinks: [GUIA],
        recipients: [{ userId: 42 }],
      });

      expect(result.ok).toBe(1);
      expect(birdCall().body.body).toEqual({
        type: "text",
        text: {
          text: "Olá Pedro, ativa hoje a MFA.\nGuia:",
          actions: LINK_ACTIONS,
        },
      });
    });

    it("guarda o botão com a mensagem em espera quando a janela está fechada", async () => {
      await sendWhatsappBroadcast({
        orgId: 1,
        message: MESSAGE,
        trackedLinks: [GUIA],
        recipients: [{ userId: 42 }],
      });

      expect(birdCall().body.template).toBeTruthy();
      expect(mocks.createPendingOutreach.mock.calls[0][0].payload).toEqual({
        message: "Olá Pedro, ativa hoje a MFA.\nGuia:",
        imageUrls: [],
        actions: LINK_ACTIONS,
        openingGate: true,
      });
    });

    it("deixa o link no texto de um quiz, que já tem botões de resposta", async () => {
      mocks.isWindowOpenForUser.mockResolvedValue(true);

      await sendWhatsappBroadcast({
        orgId: 1,
        trackedLinks: [GUIA],
        recipients: [{ userId: 42 }],
        question: {
          kind: "quiz",
          body: "Leste o guia? {{link.guia}}",
          options: [
            { label: "Sim", correct: true },
            { label: "Não", correct: false },
          ],
          feedbackCorrect: "",
          feedbackIncorrect: "",
        },
      });

      expect(birdCall().body.body.text).toEqual({
        text: `Leste o guia? ${GUIA.trackedUrl}`,
        actions: [
          { type: "reply", reply: { text: "Sim" } },
          { type: "reply", reply: { text: "Não" } },
        ],
      });
    });

    it("deixa o link no texto de uma mensagem com imagem", async () => {
      mocks.isWindowOpenForUser.mockResolvedValue(true);

      await sendWhatsappBroadcast({
        orgId: 1,
        message: "Guia: {{link.guia}}",
        imageUrls: ["https://x/img.png"],
        trackedLinks: [GUIA],
        recipients: [{ userId: 42 }],
      });

      expect(birdCall().body.body).toEqual({
        type: "image",
        image: {
          images: [{ mediaUrl: "https://x/img.png" }],
          text: `Guia: ${GUIA.trackedUrl}`,
        },
      });
    });

    describe("link marcado como botão, fora do texto", () => {
      const BOTAO = { ...GUIA, button: true };

      beforeEach(() => {
        mocks.resolveTrackedLinks.mockResolvedValue([BOTAO]);
      });

      it("vai no botão e o texto fica como está", async () => {
        mocks.isWindowOpenForUser.mockResolvedValue(true);

        await sendWhatsappBroadcast({
          orgId: 1,
          message: "Olá {{nome}}, ativa hoje a MFA.",
          trackedLinks: [BOTAO],
          recipients: [{ userId: 42 }],
        });

        expect(birdCall().body.body).toEqual({
          type: "text",
          text: {
            text: "Olá Pedro, ativa hoje a MFA.",
            actions: LINK_ACTIONS,
          },
        });
      });

      it("guarda o botão na mensagem em espera", async () => {
        await sendWhatsappBroadcast({
          orgId: 1,
          message: "Ativa hoje a MFA.",
          trackedLinks: [BOTAO],
          recipients: [{ userId: 42 }],
        });

        expect(mocks.createPendingOutreach.mock.calls[0][0].payload).toEqual({
          message: "Ativa hoje a MFA.",
          imageUrls: [],
          actions: LINK_ACTIONS,
          openingGate: true,
        });
      });

      it("numa mensagem com imagem, segue num balão à parte", async () => {
        mocks.isWindowOpenForUser.mockResolvedValue(true);

        await sendWhatsappBroadcast({
          orgId: 1,
          message: "Vê a imagem.",
          imageUrls: ["https://x/img.png"],
          trackedLinks: [BOTAO],
          recipients: [{ userId: 42 }],
        });

        expect(mocks.fetch).toHaveBeenCalledTimes(2);
        expect(birdCall(0).body.body.image).toEqual({
          images: [{ mediaUrl: "https://x/img.png" }],
          text: "Vê a imagem.",
        });
        expect(birdCall(1).body.body).toEqual({
          type: "text",
          text: { text: "Guia passo a passo", actions: LINK_ACTIONS },
        });
      });

      it("num quiz, segue num balão à parte depois da pergunta", async () => {
        mocks.isWindowOpenForUser.mockResolvedValue(true);

        await sendWhatsappBroadcast({
          orgId: 1,
          trackedLinks: [BOTAO],
          recipients: [{ userId: 42 }],
          question: {
            kind: "quiz",
            body: "Leste o guia?",
            options: [
              { label: "Sim", correct: true },
              { label: "Não", correct: false },
            ],
            feedbackCorrect: "",
            feedbackIncorrect: "",
          },
        });

        expect(birdCall(0).body.body.text.text).toBe("Leste o guia?");
        expect(birdCall(1).body.body).toEqual({
          type: "text",
          text: { text: "Guia passo a passo", actions: LINK_ACTIONS },
        });
      });
    });

    describe("mais do que um link", () => {
      const CURSO = {
        key: "curso",
        label: "Curso Excel",
        destinationUrl: "https://exemplo.pt/excel",
        trackedUrl: "https://www.mydigitalbot.com/r/def",
        button: true,
        buttonMessage: "Já viste a formação de {{nome}}?",
      };
      const CURSO_ACTIONS = [
        { type: "link", link: { text: "Curso Excel", url: CURSO.trackedUrl } },
      ];

      beforeEach(() => {
        mocks.resolveTrackedLinks.mockResolvedValue([
          { ...GUIA, button: true },
          CURSO,
        ]);
      });

      it("com a janela aberta, envia a mensagem e a seguir um balão por link", async () => {
        mocks.isWindowOpenForUser.mockResolvedValue(true);

        const result = await sendWhatsappBroadcast({
          orgId: 1,
          message: "Boas {{nome}}, tudo bem?",
          trackedLinks: [{ ...GUIA, button: true }, CURSO],
          recipients: [{ userId: 42 }],
        });

        expect(result.ok).toBe(1);
        expect(mocks.fetch).toHaveBeenCalledTimes(2);
        expect(birdCall(0).body.body).toEqual({
          type: "text",
          text: { text: "Boas Pedro, tudo bem?", actions: LINK_ACTIONS },
        });
        expect(birdCall(1).body.body).toEqual({
          type: "text",
          text: {
            text: "Já viste a formação de Pedro?",
            actions: CURSO_ACTIONS,
          },
        });
      });

      it("com a janela fechada, guarda os balões com a mensagem em espera", async () => {
        await sendWhatsappBroadcast({
          orgId: 1,
          message: "Boas {{nome}}, tudo bem?",
          trackedLinks: [{ ...GUIA, button: true }, CURSO],
          recipients: [{ userId: 42 }],
        });

        /* Só o template sai agora; os balões esperam pela resposta. */
        expect(mocks.fetch).toHaveBeenCalledTimes(1);
        expect(mocks.createPendingOutreach.mock.calls[0][0].payload).toEqual({
          message: "Boas Pedro, tudo bem?",
          imageUrls: [],
          actions: LINK_ACTIONS,
          followUps: [
            {
              message: "Já viste a formação de Pedro?",
              actions: CURSO_ACTIONS,
            },
          ],
          openingGate: true,
        });
      });

      it("não envia os balões quando a mensagem principal falha", async () => {
        mocks.isWindowOpenForUser.mockResolvedValue(true);
        mocks.fetch.mockResolvedValueOnce({
          ok: false,
          status: 422,
          json: async () => ({ error: "invalid" }),
        });

        const result = await sendWhatsappBroadcast({
          orgId: 1,
          message: "Boas!",
          trackedLinks: [{ ...GUIA, button: true }, CURSO],
          recipients: [{ userId: 42 }],
        });

        expect(result.ok).toBe(0);
        expect(mocks.fetch).toHaveBeenCalledTimes(1);
      });
    });

    it("deixa o link no texto quando o corpo passa o limite de uma mensagem com botão", async () => {
      mocks.isWindowOpenForUser.mockResolvedValue(true);

      await sendWhatsappBroadcast({
        orgId: 1,
        message: `${"a".repeat(1100)}\n{{link.guia}}`,
        trackedLinks: [GUIA],
        recipients: [{ userId: 42 }],
      });

      const { text } = birdCall().body.body;
      expect(text.actions).toBeUndefined();
      expect(text.text.endsWith(GUIA.trackedUrl)).toBe(true);
    });

    it("um link do botão com o corpo acima do limite segue num balão à parte", async () => {
      mocks.isWindowOpenForUser.mockResolvedValue(true);
      mocks.resolveTrackedLinks.mockResolvedValue([{ ...GUIA, button: true }]);

      await sendWhatsappBroadcast({
        orgId: 1,
        message: "a".repeat(1100),
        trackedLinks: [{ ...GUIA, button: true }],
        recipients: [{ userId: 42 }],
      });

      expect(birdCall(0).body.body).toEqual({
        type: "text",
        text: { text: "a".repeat(1100) },
      });
      expect(birdCall(1).body.body).toEqual({
        type: "text",
        text: { text: "Guia passo a passo", actions: LINK_ACTIONS },
      });
    });
  });
});

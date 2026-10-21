import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  appMocks,
  registerAppModulePacks,
  setDefaultAppMockReturns,
  resetAppMocks,
} from "../utils/mocks";

registerAppModulePacks();

const alertMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock("@/app/components/Alert/AlertProvider", () => ({
  useAlert: () => alertMock,
}));

/* Carregamento de ficheiros: devolve um URL público sem tocar no Supabase. */
const storageMock = vi.hoisted(() => ({
  upload: vi.fn(() => Promise.resolve({ error: null })),
  getPublicUrl: vi.fn((key) => ({
    data: { publicUrl: `https://cdn.test/${key}` },
  })),
}));

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => storageMock } }),
}));

import BroadcastPage from "@/app/[locale]/(app)/broadcast/page.jsx";

const ORG_ID = 7;

const USERS = [
  { id: 1, name: "Pedro Silva", phone_number: "+351910000001", tags: [] },
  { id: 2, name: "Ana Costa", phone_number: "+351910000002", tags: [] },
];

const OPENING = {
  body: "Corpo guardado da organização",
  isDefault: false,
  defaultBody: "Texto por omissão",
  intro: "Olá {{nome}}!\n\nDesejas receber comunicações da {{empresa}}?",
  outro: "Confirma a tua escolha clicando no botão abaixo.",
  button: "Aceito",
  maxLength: 600,
};

function makeResponse(data, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

describe("BroadcastPage", () => {
  const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));

  beforeEach(() => {
    resetAppMocks();
    setDefaultAppMockReturns({
      org: { org: { id: ORG_ID, name: "Digik" }, loading: false },
    });

    mocks.fetch.mockImplementation((input, init = {}) => {
      const url = typeof input === "string" ? input : input.url;
      const method = (init.method || "GET").toUpperCase();

      if (url.startsWith("/api/users")) return makeResponse({ items: USERS });
      if (url.startsWith("/api/assistants")) return makeResponse({ items: [] });
      if (url.startsWith("/api/tags")) return makeResponse({ items: [] });
      if (url.startsWith("/api/organizations/messaging-feature")) {
        return makeResponse({ item: { read_chains_enabled: false } });
      }
      if (url.startsWith("/api/organizations/opening-message")) {
        return makeResponse({ item: OPENING });
      }
      if (url === "/api/broadcast/whatsapp" && method === "POST") {
        return makeResponse({ ok: 1, failed: 0, results: [], note: null });
      }
      if (url === "/api/broadcast/teams" && method === "POST") {
        return makeResponse({ ok: 1, failed: 0, results: [] });
      }

      return makeResponse({});
    });

    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function lastPostTo(path) {
    const call = [...mocks.fetch.mock.calls]
      .reverse()
      .find(
        ([url, init]) =>
          url === path && (init?.method || "GET").toUpperCase() === "POST",
      );
    return call ? JSON.parse(call[1].body) : null;
  }

  async function openWhatsapp() {
    render(<BroadcastPage />);
    await screen.findByText("Pedro Silva");
    fireEvent.click(screen.getByRole("button", { name: "WhatsApp" }));
  }

  /* O corpo escreve-se num editor contenteditable, não num textarea. */
  function typeInEditor(editor, text) {
    editor.appendChild(document.createTextNode(text));
    fireEvent.input(editor);
  }

  function pickFromPlusMenu(name) {
    fireEvent.click(
      screen.getByRole("button", { name: "Broadcast.composer.add" }),
    );
    fireEvent.click(screen.getByRole("menuitem", { name }));
  }

  describe("limites da mensagem do plano (#187)", () => {
    function withPlanLimits(limits) {
      const baseFetch = mocks.fetch.getMockImplementation();
      mocks.fetch.mockImplementation((input, init = {}) => {
        const url = typeof input === "string" ? input : input.url;
        if (url.startsWith("/api/plans/limits")) {
          return makeResponse({ plan: { name: "Demo" }, limits, usage: {} });
        }
        return baseFetch(input, init);
      });
    }

    it("mostra os caracteres como se veem e desativa Enviar acima do limite", async () => {
      withPlanLimits({ messageChars: 10, filesPerMessage: 5 });
      await openWhatsapp();
      fireEvent.click(screen.getByText("Broadcast.start.blank"));
      fireEvent.click(screen.getByText("Pedro Silva"));

      const editor = screen.getByRole("textbox", { name: "Broadcast.message" });
      typeInEditor(editor, "*aaaaaaaaaa*");

      /* As marcas do negrito não contam: 10 / 10 e ainda se pode enviar. */
      expect(await screen.findByText("10 / 10")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Broadcast.send" })).not.toBeDisabled();

      /*
       * Com espaço: "*aaaaaaaaaa* b" continua em negrito e vale 10 + 2 = 12.
       * (Colado, "*aaaaaaaaaa*b", o WhatsApp não fecha o negrito e os
       * asteriscos passam a contar: 13.)
       */
      typeInEditor(editor, " b");

      expect(await screen.findByText("12 / 10")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Broadcast.send" })).toBeDisabled();
    });

    it("se o servidor recusar o tamanho, mostra um aviso simples", async () => {
      const baseFetch = mocks.fetch.getMockImplementation();
      mocks.fetch.mockImplementation((input, init = {}) => {
        const url = typeof input === "string" ? input : input.url;
        if (url === "/api/broadcast/whatsapp") {
          return makeResponse({ code: "MESSAGE_TOO_LONG", limit: 1500 }, false);
        }
        return baseFetch(input, init);
      });

      await openWhatsapp();
      fireEvent.click(screen.getByText("Broadcast.start.blank"));
      typeInEditor(
        screen.getByRole("textbox", { name: "Broadcast.message" }),
        "Olá",
      );
      fireEvent.click(screen.getByText("Pedro Silva"));
      fireEvent.click(screen.getByRole("button", { name: "Broadcast.send" }));

      await waitFor(() =>
        expect(appMocks.alert).toHaveBeenCalledWith(
          expect.objectContaining({ title: "Plans.limits.messageTooLongTitle" }),
        ),
      );
    });
  });

  it("mostra o envio em curso e bloqueia o ecrã até o servidor responder", async () => {
    let respond;
    const baseFetch = mocks.fetch.getMockImplementation();
    mocks.fetch.mockImplementation((input, init = {}) => {
      const url = typeof input === "string" ? input : input.url;
      const method = (init.method || "GET").toUpperCase();

      if (url === "/api/broadcast/whatsapp" && method === "POST") {
        return new Promise((resolve) => {
          respond = () =>
            resolve(
              makeResponse({ ok: 1, failed: 0, results: [], note: null }),
            );
        });
      }

      return baseFetch(input, init);
    });

    await openWhatsapp();
    fireEvent.click(screen.getByText("Broadcast.start.blank"));
    typeInEditor(
      screen.getByRole("textbox", { name: "Broadcast.message" }),
      "Olá",
    );
    fireEvent.click(screen.getByText("Pedro Silva"));
    fireEvent.click(screen.getByRole("button", { name: "Broadcast.send" }));

    /* À espera do servidor: faixa visível e ecrã bloqueado. */
    expect(
      await screen.findByText("Broadcast.sendingBanner"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("broadcast-columns")).toHaveAttribute("inert");

    /*
     * O alerta que a página recebe é o appMocks.alert: o
     * registerAppModulePacks() simula o AlertProvider depois deste ficheiro.
     */
    expect(appMocks.alert).not.toHaveBeenCalled();

    /* Sem act à volta: o waitFor já trata disso no React 19. */
    respond();

    await waitFor(() =>
      expect(
        screen.queryByText("Broadcast.sendingBanner"),
      ).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId("broadcast-columns")).not.toHaveAttribute(
      "inert",
    );
    await waitFor(() =>
      expect(appMocks.alert).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Broadcast sent" }),
      ),
    );
  });

  it("shows the start menu on Teams and on WhatsApp", async () => {
    render(<BroadcastPage />);
    await screen.findByText("Pedro Silva");

    expect(screen.getByTestId("start-menu")).toBeInTheDocument();
    expect(screen.getByText("Broadcast.start.quiz")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "WhatsApp" }));

    expect(screen.getByTestId("start-menu")).toBeInTheDocument();
    expect(
      screen.queryByText("Broadcast.start.opening"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Broadcast.start.blank")).toBeInTheDocument();
    expect(screen.getByText("Broadcast.start.survey")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Broadcast.send" }),
    ).toBeDisabled();
  });

  it("disponibiliza a pergunta aberta e o quiz", async () => {
    await openWhatsapp();

    const quiz = screen.getByTestId("start-card-quiz");
    const question = screen.getByTestId("start-card-question");
    expect(quiz).toBeEnabled();
    expect(quiz).not.toHaveTextContent("Broadcast.start.soon");
    expect(question).toBeEnabled();
    expect(question).not.toHaveTextContent("Broadcast.start.soon");

    fireEvent.click(question);
    expect(
      screen.getByLabelText("Broadcast.composer.openQuestionBody"),
    ).toBeInTheDocument();
  });

  it("exige resposta esperada e envia a pergunta com avaliação por omissão", async () => {
    await openWhatsapp();
    fireEvent.click(screen.getByTestId("start-card-question"));
    fireEvent.click(screen.getByText("Pedro Silva"));
    const send = screen.getByRole("button", { name: "Broadcast.send" });
    typeInEditor(
      screen.getByLabelText("Broadcast.composer.openQuestionBody"),
      "Como verificas os pneus?",
    );
    expect(send).toBeDisabled();
    expect(
      screen.getByLabelText("Broadcast.composer.aiEvaluation"),
    ).toBeChecked();
    fireEvent.change(
      screen.getByLabelText("Broadcast.composer.expectedAnswer"),
      { target: { value: "Com os pneus frios." } },
    );
    expect(send).toBeEnabled();
    fireEvent.click(send);
    await waitFor(() =>
      expect(lastPostTo("/api/broadcast/whatsapp")).not.toBeNull(),
    );
    expect(lastPostTo("/api/broadcast/whatsapp").question).toEqual({
      kind: "open",
      body: "Como verificas os pneus?",
      expectedAnswer: "Com os pneus frios.",
      aiEvaluation: true,
    });
  });

  it("sends a quiz with its options, the correct one and the feedback", async () => {
    await openWhatsapp();

    fireEvent.click(screen.getByTestId("start-card-quiz"));

    const body = await screen.findByLabelText("Broadcast.composer.quizBody");
    typeInEditor(body, "Qual é a pressão certa dos pneus?");

    const optionInputs = screen.getAllByRole("textbox", {
      name: "Broadcast.composer.quizOption",
    });
    expect(optionInputs).toHaveLength(3);

    fireEvent.change(optionInputs[0], { target: { value: "2,2 bar" } });
    fireEvent.change(optionInputs[1], { target: { value: "2,8 bar" } });

    /* A terceira opção fica vazia: sai. */
    fireEvent.click(
      screen.getAllByRole("button", {
        name: "Broadcast.composer.quizRemoveOption",
      })[2],
    );

    /* A certa é a segunda. */
    fireEvent.click(
      screen.getAllByRole("radio", {
        name: "Broadcast.composer.quizMarkCorrect",
      })[1],
    );

    fireEvent.change(
      screen.getByLabelText("Broadcast.composer.quizFeedbackIncorrect"),
      { target: { value: "Quase. A certa é {{certa}}." } },
    );

    fireEvent.click(screen.getByText("Pedro Silva"));

    const send = screen.getByRole("button", { name: "Broadcast.send" });
    expect(send).toBeEnabled();
    fireEvent.click(send);

    await waitFor(() => {
      expect(lastPostTo("/api/broadcast/whatsapp")).not.toBeNull();
    });

    expect(lastPostTo("/api/broadcast/whatsapp")).toMatchObject({
      orgId: ORG_ID,
      message: "",
      recipients: [{ userId: 1 }],
      question: {
        kind: "quiz",
        body: "Qual é a pressão certa dos pneus?",
        options: [
          { label: "2,2 bar", correct: false },
          { label: "2,8 bar", correct: true },
        ],
        feedbackCorrect: "",
        feedbackIncorrect: "Quase. A certa é {{certa}}.",
      },
    });
  });

  it("keeps the send button disabled while the quiz is incomplete", async () => {
    await openWhatsapp();

    fireEvent.click(screen.getByTestId("start-card-quiz"));
    fireEvent.click(screen.getByText("Pedro Silva"));

    const send = screen.getByRole("button", { name: "Broadcast.send" });
    expect(send).toBeDisabled();

    typeInEditor(
      await screen.findByLabelText("Broadcast.composer.quizBody"),
      "Pergunta",
    );

    /* Falta preencher as opções. */
    expect(send).toBeDisabled();
  });

  it("offers the + menu in the quiz, with only the name and company variables", async () => {
    await openWhatsapp();
    fireEvent.click(screen.getByTestId("start-card-quiz"));

    fireEvent.click(
      screen.getByRole("button", { name: "Broadcast.composer.add" }),
    );

    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual([
      "Broadcast.composer.addImage",
      "Broadcast.composer.addVideo",
      "Broadcast.composer.addDocument",
      "Broadcast.composer.addLink",
      "Broadcast.suggest.title",
      "Broadcast.image.title",
      "Broadcast.composer.variableName",
      "Broadcast.composer.variableCompany",
    ]);
  });

  it("creates an image with AI inside the phone and only uploads it when used", async () => {
    const baseFetch = mocks.fetch.getMockImplementation();
    mocks.fetch.mockImplementation((input, init = {}) => {
      const url = typeof input === "string" ? input : input.url;
      if (url === "/api/broadcast/image") {
        return makeResponse({ image: "QUJD", contentType: "image/jpeg" });
      }
      return baseFetch(input, init);
    });
    storageMock.upload.mockClear();

    await openWhatsapp();
    fireEvent.click(screen.getByTestId("start-card-quiz"));

    fireEvent.click(
      screen.getByRole("button", { name: "Broadcast.composer.add" }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Broadcast.image.title" }),
    );

    /* O pedido escreve-se na barra do telemóvel, como na sugestão de texto. */
    fireEvent.change(
      screen.getByRole("textbox", { name: "Broadcast.image.promptLabel" }),
      { target: { value: "equipa a celebrar" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Broadcast.image.ask" }),
    );

    const preview = await screen.findByRole("img", {
      name: "equipa a celebrar",
    });
    expect(preview.getAttribute("src")).toBe("data:image/jpeg;base64,QUJD");
    expect(lastPostTo("/api/broadcast/image")).toEqual({
      orgId: ORG_ID,
      prompt: "equipa a celebrar",
    });

    /* Enquanto é só uma proposta, nada fica guardado. */
    expect(storageMock.upload).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("button", { name: "Broadcast.image.use" }),
    );

    /* "Usar" guarda-a pelo mesmo upload das imagens escolhidas no computador. */
    await waitFor(() => expect(storageMock.upload).toHaveBeenCalledTimes(1));
    const [key, file, options] = storageMock.upload.mock.calls[0];
    expect(key).toMatch(
      new RegExp(`^broadcasts/${ORG_ID}/.+-imagem-ia-\\d+\\.jpg$`),
    );
    expect(file.type).toBe("image/jpeg");
    expect(options).toMatchObject({ contentType: "image/jpeg" });

    /* E entra no balão como uma imagem carregada; a proposta desaparece. */
    expect(
      await screen.findByRole("img", { name: /^imagem-ia-\d+\.jpg$/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: "equipa a celebrar" }),
    ).not.toBeInTheDocument();
  });

  it("suggests a text inside the phone and only applies it when accepted", async () => {
    const baseFetch = mocks.fetch.getMockImplementation();
    mocks.fetch.mockImplementation((input, init = {}) => {
      const url = typeof input === "string" ? input : input.url;
      if (url === "/api/broadcast/suggest") {
        return makeResponse({ text: "Qual é a pressão certa dos pneus?" });
      }
      return baseFetch(input, init);
    });

    await openWhatsapp();
    fireEvent.click(screen.getByTestId("start-card-quiz"));

    fireEvent.click(
      screen.getByRole("button", { name: "Broadcast.composer.add" }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", { name: "Broadcast.suggest.title" }),
    );

    /* O pedido escreve-se na barra do telemóvel. */
    fireEvent.change(
      screen.getByRole("textbox", { name: "Broadcast.suggest.promptLabel" }),
      { target: { value: "pergunta sobre pneus" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Broadcast.suggest.ask" }),
    );

    expect(await screen.findByTestId("suggest-result")).toHaveTextContent(
      "Qual é a pressão certa dos pneus?",
    );
    expect(lastPostTo("/api/broadcast/suggest")).toEqual({
      orgId: ORG_ID,
      kind: "quiz",
      prompt: "pergunta sobre pneus",
      currentText: "",
    });

    /* Só "Usar" põe a proposta no balão e fecha a sugestão. */
    fireEvent.click(
      screen.getByRole("button", { name: "Broadcast.suggest.use" }),
    );

    expect(screen.queryByTestId("suggest-result")).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("Broadcast.composer.quizBody"),
    ).toHaveTextContent("Qual é a pressão certa dos pneus?");
  });

  it("sends a quiz with a variable chip, a tracked link and an image", async () => {
    await openWhatsapp();
    fireEvent.click(screen.getByTestId("start-card-quiz"));

    const body = await screen.findByLabelText("Broadcast.composer.quizBody");
    typeInEditor(body, "Olá ");
    pickFromPlusMenu("Broadcast.composer.variableName");

    /* O link rastreado abre o painel; depois entra no balão como pastilha. */
    pickFromPlusMenu("Broadcast.composer.addLink");
    fireEvent.click(screen.getByRole("button", { name: "Broadcast.addLink" }));
    fireEvent.change(screen.getByPlaceholderText("training"), {
      target: { value: "curso" },
    });
    fireEvent.change(screen.getByPlaceholderText("Aceder à formação"), {
      target: { value: "Curso" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("https://example.com/course/123"),
      { target: { value: "https://x.test/curso" } },
    );
    pickFromPlusMenu("Link: Curso");

    /* A imagem aparece no topo do balão da pergunta. */
    fireEvent.change(screen.getByTestId("file-input"), {
      target: {
        files: [new File(["x"], "foto.png", { type: "image/png" })],
      },
    });
    await screen.findByAltText("foto.png");

    const optionInputs = screen.getAllByRole("textbox", {
      name: "Broadcast.composer.quizOption",
    });
    fireEvent.change(optionInputs[0], { target: { value: "2,2 bar" } });
    fireEvent.change(optionInputs[1], { target: { value: "2,8 bar" } });
    fireEvent.change(optionInputs[2], { target: { value: "3,5 bar" } });

    fireEvent.click(screen.getByText("Pedro Silva"));
    fireEvent.click(screen.getByRole("button", { name: "Broadcast.send" }));

    await waitFor(() => {
      expect(lastPostTo("/api/broadcast/whatsapp")).not.toBeNull();
    });

    const payload = lastPostTo("/api/broadcast/whatsapp");
    expect(payload.question.body).toBe("Olá {{nome}} {{link.curso}} ");
    expect(payload.trackedLinks).toEqual([
      { key: "curso", label: "Curso", destinationUrl: "https://x.test/curso" },
    ]);
    expect(payload.files).toEqual([
      expect.objectContaining({ name: "foto.png", contentType: "image/png" }),
    ]);
    expect(payload.imageUrls).toEqual([payload.files[0].url]);
  });

  it("sends a survey with its options and thanks text, without a correct option", async () => {
    await openWhatsapp();

    fireEvent.click(screen.getByTestId("start-card-survey"));

    const body = await screen.findByLabelText("Broadcast.composer.surveyBody");
    typeInEditor(body, "Qual o melhor horário para a formação?");

    const optionInputs = screen.getAllByRole("textbox", {
      name: "Broadcast.composer.surveyOption",
    });
    expect(optionInputs).toHaveLength(3);
    fireEvent.change(optionInputs[0], { target: { value: "Manhã" } });
    fireEvent.change(optionInputs[1], { target: { value: "Tarde" } });
    fireEvent.change(optionInputs[2], { target: { value: "Noite" } });

    /* Não há resposta certa a marcar. */
    expect(screen.queryAllByRole("radio")).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("Broadcast.composer.surveyThanks"), {
      target: { value: "Obrigado, {{nome}}!" },
    });

    fireEvent.click(screen.getByText("Pedro Silva"));

    const send = screen.getByRole("button", { name: "Broadcast.send" });
    expect(send).toBeEnabled();
    fireEvent.click(send);

    await waitFor(() => {
      expect(lastPostTo("/api/broadcast/whatsapp")).not.toBeNull();
    });

    expect(lastPostTo("/api/broadcast/whatsapp")).toMatchObject({
      orgId: ORG_ID,
      message: "",
      recipients: [{ userId: 1 }],
      question: {
        kind: "survey",
        body: "Qual o melhor horário para a formação?",
        options: [{ label: "Manhã" }, { label: "Tarde" }, { label: "Noite" }],
        thanksText: "Obrigado, {{nome}}!",
      },
    });
    expect(lastPostTo("/api/broadcast/whatsapp").openingOnly).toBeUndefined();
  });

  it("sends a blank message written in the bubble with a variable chip", async () => {
    await openWhatsapp();

    fireEvent.click(screen.getByText("Broadcast.start.blank"));

    const editor = screen.getByRole("textbox", { name: "Broadcast.message" });
    typeInEditor(editor, "Olá ");
    pickFromPlusMenu("Broadcast.composer.variableName");

    fireEvent.click(screen.getByText("Ana Costa"));
    fireEvent.click(screen.getByRole("button", { name: "Broadcast.send" }));

    await waitFor(() => {
      expect(lastPostTo("/api/broadcast/whatsapp")).not.toBeNull();
    });

    expect(lastPostTo("/api/broadcast/whatsapp")).toMatchObject({
      message: "Olá {{nome}} ",
      recipients: [{ userId: 2 }],
    });
    expect(lastPostTo("/api/broadcast/whatsapp").openingOnly).toBeUndefined();
  });

  describe("link como botão", () => {
    const OLA = {
      key: "ola",
      label: "ola",
      destinationUrl: "https://www.digik.pt/pt/",
      lastUsedAt: "2026-10-02T16:58:59Z",
    };
    const GUIA = {
      key: "guia",
      label: "guia",
      destinationUrl: "https://www.digik.pt/guia/",
      lastUsedAt: "2026-10-01T10:00:00Z",
    };

    function mockLibrary(items) {
      const baseFetch = mocks.fetch.getMockImplementation();
      mocks.fetch.mockImplementation((input, init = {}) => {
        const url = typeof input === "string" ? input : input.url;
        if (url.startsWith("/api/tracked-links/library")) {
          return makeResponse({ items });
        }
        return baseFetch(input, init);
      });
    }

    it("Usar põe o link no botão e não deixa juntar outro até o tirar", async () => {
      mockLibrary([OLA, GUIA]);

      await openWhatsapp();
      fireEvent.click(screen.getByText("Broadcast.start.blank"));

      const editor = screen.getByRole("textbox", {
        name: "Broadcast.message",
      });
      typeInEditor(editor, "Boas, tudo bem?");

      pickFromPlusMenu("Broadcast.composer.addLink");
      const [useOla] = await screen.findAllByRole("button", {
        name: "Broadcast.linkLibrary.use",
      });
      fireEvent.click(useOla);

      /* O link vai no botão; o texto não muda. */
      expect(editor.querySelector("[data-token]")).toBeNull();
      expect(screen.getByTestId("link-button-preview")).toHaveTextContent(
        "ola",
      );

      /* Um só link por mensagem: o resto fica desativado, com o porquê. */
      expect(
        screen.getByRole("button", { name: "Broadcast.linkLibrary.use" }),
      ).toBeDisabled();
      expect(
        screen.getByRole("button", { name: "Broadcast.addLink" }),
      ).toBeDisabled();
      expect(screen.getByText("Broadcast.linkLimitHint")).toBeInTheDocument();

      fireEvent.click(screen.getByText("Pedro Silva"));
      fireEvent.click(screen.getByRole("button", { name: "Broadcast.send" }));

      await waitFor(() => {
        expect(lastPostTo("/api/broadcast/whatsapp")).not.toBeNull();
      });

      expect(lastPostTo("/api/broadcast/whatsapp")).toMatchObject({
        message: "Boas, tudo bem?",
        trackedLinks: [
          {
            key: "ola",
            label: "ola",
            destinationUrl: OLA.destinationUrl,
            button: true,
          },
        ],
      });
      expect(lastPostTo("/api/broadcast/whatsapp").trackedLinks).toHaveLength(
        1,
      );
    });

    it("o x no botão tira o link da mensagem", async () => {
      mockLibrary([OLA]);

      await openWhatsapp();
      fireEvent.click(screen.getByText("Broadcast.start.blank"));
      pickFromPlusMenu("Broadcast.composer.addLink");
      fireEvent.click(
        await screen.findByRole("button", {
          name: "Broadcast.linkLibrary.use",
        }),
      );

      fireEvent.click(
        screen.getByRole("button", {
          name: "Broadcast.composer.linkButtonRemove",
        }),
      );

      expect(screen.queryByTestId("link-button-preview")).toBeNull();

      /* Sem link na mensagem, volta a dar para escolher ou criar um. */
      expect(
        screen.getByRole("button", { name: "Broadcast.linkLibrary.use" }),
      ).toBeEnabled();
      expect(
        screen.getByRole("button", { name: "Broadcast.addLink" }),
      ).toBeEnabled();
    });

    it("no quiz, Usar põe o link no texto", async () => {
      mockLibrary([OLA]);

      await openWhatsapp();
      fireEvent.click(screen.getByTestId("start-card-quiz"));
      const body = await screen.findByLabelText("Broadcast.composer.quizBody");

      pickFromPlusMenu("Broadcast.composer.addLink");
      fireEvent.click(
        await screen.findByRole("button", {
          name: "Broadcast.linkLibrary.use",
        }),
      );

      expect(body.querySelector("[data-token]")).toHaveTextContent(
        "Link: ola",
      );
      expect(screen.queryByTestId("link-button-preview")).toBeNull();
    });
  });

  describe("mensagem só com link", () => {
    /* Cria um link novo no painel; no WhatsApp passa a ser o botão. */
    function createTrackedLink() {
      pickFromPlusMenu("Broadcast.composer.addLink");
      fireEvent.click(
        screen.getByRole("button", { name: "Broadcast.addLink" }),
      );
      fireEvent.change(screen.getByPlaceholderText("training"), {
        target: { value: "guia" },
      });
      fireEvent.change(screen.getByPlaceholderText("Aceder à formação"), {
        target: { value: "Guia" },
      });
      fireEvent.change(
        screen.getByPlaceholderText("https://example.com/course/123"),
        { target: { value: "https://x.test/guia" } },
      );
    }

    it("no WhatsApp, um link novo vai no botão e pede texto", async () => {
      await openWhatsapp();
      fireEvent.click(screen.getByText("Broadcast.start.blank"));
      fireEvent.click(screen.getByText("Pedro Silva"));

      createTrackedLink();

      expect(screen.getByTestId("link-button-preview")).toHaveTextContent(
        "Guia",
      );

      const send = screen.getByRole("button", { name: "Broadcast.send" });
      expect(send).toBeDisabled();
      expect(
        screen.getByText("Broadcast.composer.linkNeedsText"),
      ).toBeInTheDocument();

      typeInEditor(
        screen.getByRole("textbox", { name: "Broadcast.message" }),
        "Vê o guia",
      );

      expect(send).toBeEnabled();
      expect(
        screen.queryByText("Broadcast.composer.linkNeedsText"),
      ).not.toBeInTheDocument();
    });

    it("no WhatsApp, com uma imagem deixa enviar e o link segue num balão à parte", async () => {
      await openWhatsapp();
      fireEvent.click(screen.getByText("Broadcast.start.blank"));
      fireEvent.click(screen.getByText("Pedro Silva"));

      createTrackedLink();
      fireEvent.change(screen.getByTestId("file-input"), {
        target: {
          files: [new File(["x"], "foto.png", { type: "image/png" })],
        },
      });
      await screen.findByAltText("foto.png");

      expect(
        screen.getByRole("button", { name: "Broadcast.send" }),
      ).toBeEnabled();
      expect(screen.queryByTestId("link-button-preview")).toBeNull();
      expect(screen.getByTestId("link-bubble-preview")).toHaveTextContent(
        "Guia",
      );
    });

    it("numa corrente, diz qual é o passo que só tem o link", async () => {
      const baseFetch = mocks.fetch.getMockImplementation();
      mocks.fetch.mockImplementation((input, init = {}) => {
        const url = typeof input === "string" ? input : input.url;
        if (url.startsWith("/api/organizations/messaging-feature")) {
          return makeResponse({ item: { read_chains_enabled: true } });
        }
        return baseFetch(input, init);
      });

      await openWhatsapp();
      fireEvent.click(screen.getByText("Broadcast.start.blank"));
      fireEvent.click(screen.getByText("Pedro Silva"));
      fireEvent.click(
        await screen.findByRole("button", {
          name: "Broadcast.broadcastChain.createChain",
        }),
      );

      typeInEditor(
        screen.getByRole("textbox", { name: "Broadcast.message" }),
        "Primeira mensagem",
      );

      fireEvent.click(
        screen.getByRole("button", {
          name: "Broadcast.broadcastChain.chainMessage 2",
        }),
      );
      createTrackedLink();

      const send = screen.getByRole("button", { name: "Broadcast.send" });
      expect(send).toBeDisabled();

      /* O aviso continua visível noutro passo e aponta para o certo. */
      fireEvent.click(
        screen.getByRole("button", {
          name: "Broadcast.broadcastChain.chainMessage 1",
        }),
      );
      expect(
        screen.getByText("Broadcast.composer.chainStepNeedsText"),
      ).toBeInTheDocument();

      fireEvent.click(
        screen.getByRole("button", {
          name: "Broadcast.broadcastChain.chainMessage 2",
        }),
      );
      typeInEditor(
        screen.getByRole("textbox", { name: "Broadcast.message" }),
        "Vê o guia",
      );

      expect(
        screen.queryByText("Broadcast.composer.chainStepNeedsText"),
      ).not.toBeInTheDocument();
      expect(send).toBeEnabled();
    });

    it("ao trocar do Teams para o WhatsApp, o link sai do texto e vai no botão", async () => {
      render(<BroadcastPage />);
      await screen.findByText("Pedro Silva");

      /* No staging, o Teams também abre com o menu inicial. */
      const blank = screen.queryByText("Broadcast.start.blank");
      if (blank) fireEvent.click(blank);

      typeInEditor(
        screen.getByRole("textbox", { name: "Broadcast.message" }),
        "Olá ",
      );
      createTrackedLink();
      pickFromPlusMenu("Link: Guia");

      fireEvent.click(screen.getByRole("button", { name: "WhatsApp" }));

      /* No staging, a mensagem aberta continua aberta ao trocar de canal. */
      const blankOnWhatsapp = screen.queryByText("Broadcast.start.blank");
      if (blankOnWhatsapp) fireEvent.click(blankOnWhatsapp);

      const editor = screen.getByRole("textbox", { name: "Broadcast.message" });
      expect(editor.querySelector("[data-token]")).toBeNull();
      expect(editor).toHaveTextContent("Olá");
      expect(screen.getByTestId("link-button-preview")).toHaveTextContent(
        "Guia",
      );
    });

    it("ao trocar do WhatsApp para o Teams, o link volta ao texto", async () => {
      await openWhatsapp();
      fireEvent.click(screen.getByText("Broadcast.start.blank"));
      typeInEditor(
        screen.getByRole("textbox", { name: "Broadcast.message" }),
        "Olá",
      );
      createTrackedLink();
      expect(screen.getByTestId("link-button-preview")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Teams" }));

      const blank = screen.queryByText("Broadcast.start.blank");
      if (blank) fireEvent.click(blank);

      const editor = screen.getByRole("textbox", { name: "Broadcast.message" });
      expect(editor.querySelector("[data-token]")).toHaveTextContent(
        "Link: Guia",
      );
      expect(screen.queryByTestId("link-button-preview")).toBeNull();
    });

    it("no Teams, o link entra no texto e deixa enviar só o link", async () => {
      render(<BroadcastPage />);
      await screen.findByText("Pedro Silva");

      /* No staging, o Teams também abre com o menu inicial. */
      const blank = screen.queryByText("Broadcast.start.blank");
      if (blank) fireEvent.click(blank);

      fireEvent.click(screen.getByText("Pedro Silva"));

      createTrackedLink();
      pickFromPlusMenu("Link: Guia");

      expect(screen.queryByTestId("link-button-preview")).toBeNull();

      expect(
        screen.getByRole("button", { name: "Broadcast.send" }),
      ).toBeEnabled();
      expect(
        screen.queryByText("Broadcast.composer.linkNeedsText"),
      ).not.toBeInTheDocument();
    });
  });

  it("goes back to the start menu from the editor", async () => {
    await openWhatsapp();

    fireEvent.click(screen.getByText("Broadcast.start.blank"));
    fireEvent.click(
      screen.getByRole("button", { name: "Broadcast.composer.back" }),
    );

    expect(screen.getByTestId("start-menu")).toBeInTheDocument();
  });
});

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import CreateAssistantModal from "@/app/[locale]/(app)/assistants/CreateAssistantModal";

vi.mock("@/app/components/PillSelect/PillSelect", () => ({
  default: ({ value, options = [], onChange, placeholder }) =>
    React.createElement(
      "select",
      {
        "aria-label": placeholder || "pillselect",
        value: value ?? "",
        onChange: (e) => onChange?.(e.target.value),
      },
      options.map((o) =>
        React.createElement(
          "option",
          { key: o.value, value: o.value },
          o.label,
        ),
      ),
    ),
}));

const alertMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const confirmMock = vi.hoisted(() => vi.fn(() => Promise.resolve(false)));
const pushMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/components/Alert/AlertProvider", () => ({
  useAlert: () => alertMock,
}));

vi.mock("@/app/components/Confirm/ConfirmProvider", () => ({
  useConfirm: () => confirmMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

vi.mock("@/app/components/Slider/Slider", () => ({
  default: ({ value, onChange, min = 0, max = 1, step = 0.01 }) =>
    React.createElement("input", {
      type: "range",
      "aria-label": "slider",
      value: value ?? 0,
      min,
      max,
      step,
      onChange,
    }),
}));

function makeResponse(data, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(data),
    text: () =>
      Promise.resolve(typeof data === "string" ? data : JSON.stringify(data)),
  });
}

describe("CreateAssistantModal", () => {
  const mocks = vi.hoisted(() => ({
    fetch: vi.fn(),
    onClose: vi.fn(),
    onCreated: vi.fn(),
  }));

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.fetch.mockImplementation((url, init = {}) => {
      const method = (init.method || "GET").toUpperCase();

      if (url === "/api/assistants" && method === "POST") {
        return makeResponse({ id: "asst_new" }, true);
      }

      return makeResponse({});
    });

    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderModal(props = {}) {
    const base = {
      orgId: "org_1",
      isOpen: true,
      onClose: mocks.onClose,
      onCreated: mocks.onCreated,
    };

    return render(
      React.createElement(CreateAssistantModal, { ...base, ...props }),
    );
  }

  it("renders when open", () => {
    renderModal();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("CreateAssistant.title")).toBeInTheDocument();
  });

  it("closes on Escape", () => {
    renderModal();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(mocks.onClose).toHaveBeenCalled();
  });

  it("closes when clicking overlay", async () => {
    renderModal();

    const overlay = screen.getByRole("dialog");
    expect(overlay).toBeTruthy();

    fireEvent.mouseDown(overlay);
    fireEvent.click(overlay);

    await waitFor(() => {
      expect(mocks.onClose).toHaveBeenCalled();
    });
  });

  it("submits POST and calls onCreated on success", async () => {
    const user = userEvent.setup();
    renderModal();

    const [nameInput, descInput, instructionsInput] =
      screen.getAllByRole("textbox");

    await user.type(nameInput, "My Assistant");
    await user.type(descInput, "Desc");
    await user.type(instructionsInput, "Instr");

    await user.click(
      screen.getByRole("button", { name: "CreateAssistant.create" }),
    );

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledWith(
        "/api/assistants",
        expect.objectContaining({ method: "POST" }),
      );
    });

    const body = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({
      organizationId: "org_1",
      name: "My Assistant",
      description: "Desc",
      instructions: "Instr",
      model: "gpt-5.6-luna",
    });

    expect(mocks.onCreated).toHaveBeenCalled();
  });

  it("no limite do plano, \"Atualizar plano\" leva à página de preços", async () => {
    confirmMock.mockResolvedValueOnce(true);
    mocks.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 409,
        json: () =>
          Promise.resolve({
            error: "Plan limit reached: assistants",
            code: "ASSISTANT_LIMIT_REACHED",
            plan: "Demo",
            limit: 1,
          }),
      }),
    );
    const user = userEvent.setup();
    renderModal();

    const [nameInput] = screen.getAllByRole("textbox");
    await user.type(nameInput, "Segundo");
    await user.click(
      screen.getByRole("button", { name: "CreateAssistant.create" }),
    );

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/pt/pricing"));

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "assistantsTitle",
        message: "assistants",
        confirmText: "upgrade",
        cancelText: "later",
      }),
    );
    expect(alertMock).not.toHaveBeenCalled();
    expect(mocks.onCreated).not.toHaveBeenCalled();
  });

  it("no limite do plano, \"Agora não\" fecha sem sair da página", async () => {
    confirmMock.mockResolvedValueOnce(false);
    mocks.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 409,
        json: () =>
          Promise.resolve({ code: "ASSISTANT_LIMIT_REACHED", plan: "Demo", limit: 1 }),
      }),
    );
    const user = userEvent.setup();
    renderModal();

    const [nameInput] = screen.getAllByRole("textbox");
    await user.type(nameInput, "Segundo");
    await user.click(
      screen.getByRole("button", { name: "CreateAssistant.create" }),
    );

    await waitFor(() => expect(confirmMock).toHaveBeenCalled());
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("outro erro mostra a mensagem do servidor, sem falar em limite", async () => {
    mocks.fetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: "Assistant name is required" }),
      }),
    );
    const user = userEvent.setup();
    renderModal();

    const [nameInput] = screen.getAllByRole("textbox");
    await user.type(nameInput, "x");
    await user.click(
      screen.getByRole("button", { name: "CreateAssistant.create" }),
    );

    await waitFor(() => expect(alertMock).toHaveBeenCalled());

    expect(alertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "CreateAssistant.createFailed",
        message: "Assistant name is required",
      }),
    );
  });

  it("cria com a predefinicao Normal quando nenhuma e escolhida", async () => {
    const user = userEvent.setup();
    renderModal();

    const [nameInput] = screen.getAllByRole("textbox");
    await user.type(nameInput, "My Assistant");

    await user.click(
      screen.getByRole("button", { name: "CreateAssistant.create" }),
    );

    await waitFor(() => expect(mocks.fetch).toHaveBeenCalled());

    const body = JSON.parse(mocks.fetch.mock.calls[0][1].body);

    expect(body.temperature).toBe(0.7);
    expect(body.top_p).toBe(1);
  });

  it("envia a temperatura da predefinicao escolhida", async () => {
    const user = userEvent.setup();
    renderModal();

    const [nameInput] = screen.getAllByRole("textbox");
    await user.type(nameInput, "My Assistant");

    // Formal e Criativo tem de dar valores diferentes, senao a escolha
    // do utilizador nao muda nada.
    await user.click(screen.getByRole("radio", { name: /Formal/i }));
    await user.click(
      screen.getByRole("button", { name: "CreateAssistant.create" }),
    );

    await waitFor(() => expect(mocks.fetch).toHaveBeenCalled());

    const body = JSON.parse(mocks.fetch.mock.calls[0][1].body);

    expect(body.temperature).toBe(0.2);

    // O top_p fica no valor por omissao em todas: a OpenAI recomenda
    // alterar a temperature OU o top_p, nunca os dois.
    expect(body.top_p).toBe(1);
  });

  it("mostra as tres predefinicoes e nenhum controlo numerico", async () => {
    renderModal();

    expect(screen.getAllByRole("radio")).toHaveLength(3);

    // Os deslizadores de criatividade e variedade sairam da criacao.
    // Quem cria um assistente pela primeira vez nao sabe o que sao.
    expect(screen.queryAllByRole("slider")).toHaveLength(0);
  });

  it("mostra a descricao da predefinicao ao carregar no icone", async () => {
    const user = userEvent.setup();
    renderModal();

    // Fechada de origem: sao tres linhas em vez de nove, e e por isso
    // que as instrucoes ganharam espaco.
    expect(screen.queryByText("AssistantPresets.formal.description")).toBeNull();

    await user.click(
      screen.getByRole("button", { name: "AssistantPresets.formal.name" }),
    );

    expect(
      screen.getByText("AssistantPresets.formal.description"),
    ).toBeInTheDocument();
  });

  it("abrir uma descricao fecha a anterior", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(
      screen.getByRole("button", { name: "AssistantPresets.formal.name" }),
    );
    await user.click(
      screen.getByRole("button", { name: "AssistantPresets.creative.name" }),
    );

    // Duas bolhas abertas ao mesmo tempo deixavam de dizer a qual das
    // predefinicoes pertence cada explicacao.
    expect(screen.queryByText("AssistantPresets.formal.description")).toBeNull();
    expect(
      screen.getByText("AssistantPresets.creative.description"),
    ).toBeInTheDocument();
  });

  it("carregar no mesmo icone fecha a descricao", async () => {
    const user = userEvent.setup();
    renderModal();

    const botao = screen.getByRole("button", {
      name: "AssistantPresets.normal.name",
    });

    await user.click(botao);
    await user.click(botao);

    expect(screen.queryByText("AssistantPresets.normal.description")).toBeNull();
  });

  it("escolher uma predefinicao fecha a descricao aberta", async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(
      screen.getByRole("button", { name: "AssistantPresets.formal.name" }),
    );
    await user.click(screen.getByRole("radio", { name: /formal/i }));

    expect(screen.queryByText("AssistantPresets.formal.description")).toBeNull();
  });

  it("cria um so assistente quando se carrega varias vezes em criar", async () => {
    const user = userEvent.setup();

    // O pedido fica pendente, como numa rede lenta.
    let finish;
    mocks.fetch.mockImplementationOnce(
      () => new Promise((resolve) => (finish = resolve)),
    );
    renderModal();

    await user.type(screen.getAllByRole("textbox")[0], "My Assistant");

    const create = screen.getByRole("button", {
      name: "CreateAssistant.create",
    });
    const form = create.closest("form");
    fireEvent.submit(form);
    fireEvent.submit(form);
    fireEvent.submit(form);

    await waitFor(() => expect(create).toBeDisabled());
    expect(mocks.fetch).toHaveBeenCalledTimes(1);

    finish({ ok: true, json: async () => ({ id: "asst_new" }) });
    await waitFor(() => expect(mocks.onCreated).toHaveBeenCalledTimes(1));
  });
});

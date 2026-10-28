import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  appMocks,
  registerAppModulePacks,
  setDefaultAppMockReturns,
  resetAppMocks,
} from "../utils/mocks";

registerAppModulePacks();

import AssistantsHub from "@/app/[locale]/(app)/assistants/page.jsx";

vi.mock("@/app/[locale]/(app)/assistants/CreateAssistantModal", () => ({
  default: ({ isOpen, onClose, onCreated }) =>
    isOpen
      ? React.createElement(
          "div",
          { role: "dialog", "aria-label": "CreateAssistantModal" },
          React.createElement(
            "button",
            { onClick: onCreated, type: "button" },
            "mock-create-done",
          ),
          React.createElement(
            "button",
            { onClick: onClose, type: "button" },
            "mock-close",
          ),
        )
      : null,
}));

vi.mock("@/app/[locale]/(app)/assistants/Chatbox/Chatbox.jsx", () => ({
  default: ({ assistant }) =>
    React.createElement(
      "div",
      { "aria-label": "ChatSandbox" },
      assistant?.name || "no-assistant",
    ),
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

const ORG_ID = "org_1";

const LIST = [
  { id: "asst_1", name: "Alpha" },
  { id: "asst_2", name: "Beta" },
];

const DETAILS_1 = {
  id: "asst_1",
  open_ai_id: "oa_1",
  name: "Alpha",
  description: "Alpha desc",
  instructions: "Alpha instructions",
  model: "gpt-4.1",
  top_p: 0.2,
  temperature: 0.7,
  created_at: new Date("2025-01-01T10:00:00Z").toISOString(),
  vectorStoreId: null,
};

const DETAILS_2 = {
  id: "asst_2",
  open_ai_id: "oa_2",
  name: "Beta",
  description: "Beta desc",
  instructions: "Beta instructions",
  model: "gpt-4.1",
  top_p: 1,
  temperature: 1.1,
  created_at: new Date("2025-01-02T10:00:00Z").toISOString(),
  vectorStoreId: null,
};

const VECTOR_STORE = {
  id: 42,
  storeName: "Knowledge base",
  files: [{ id: 7, name: "old.pdf", size: 12 }],
};

describe("AssistantsHub Page", () => {
  const mocks = vi.hoisted(() => ({
    fetch: vi.fn(),
  }));

  beforeEach(() => {
    resetAppMocks();

    setDefaultAppMockReturns({
      auth: {
        user: { id: "auth_user_1" },
        loading: false,
        supabase: {
          storage: {
            from: () => ({
              upload: vi.fn().mockResolvedValue({ error: null }),
            }),
          },
        },
      },
      org: { org: { id: ORG_ID }, loading: false },
      confirm: true,
    });

    mocks.fetch.mockImplementation((input, init = {}) => {
      const url = typeof input === "string" ? input : input.url;
      const method = (init.method || "GET").toUpperCase();

      if (url === `/api/assistants?orgId=${ORG_ID}` && method === "GET") {
        return makeResponse(LIST);
      }
      if (url === `/api/assistants/asst_1` && method === "GET") {
        return makeResponse(DETAILS_1);
      }

      if (url === `/api/assistants/asst_2` && method === "GET") {
        return makeResponse(DETAILS_2);
      }

      if (url === `/api/assistants/asst_1` && method === "PATCH") {
        return makeResponse({ ok: true });
      }

      if (url === `/api/assistants/asst_1` && method === "DELETE") {
        return makeResponse({ ok: true });
      }

      return makeResponse();
    });

    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderPage() {
    return render(React.createElement(AssistantsHub));
  }

  it("loads assistants list on mount and selects the first item, then loads its details", async () => {
    renderPage();

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledWith(
        `/api/assistants?orgId=${ORG_ID}`,
      );
    });

    expect(
      await screen.findByRole("heading", { name: "Alpha" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Beta")).toBeInTheDocument();

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledWith(`/api/assistants/asst_1`);
    });

    expect(
      await screen.findByRole("heading", { name: "Alpha" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Alpha desc")).toBeInTheDocument();
    expect(await screen.findByText("Alpha instructions")).toBeInTheDocument();

    expect(await screen.getByLabelText("ChatSandbox")).toHaveTextContent(
      "Alpha",
    );
  });

  it("switches selection when clicking another assistant in the left list", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Alpha");
    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(`/api/assistants/asst_1`),
    );

    await user.click(await screen.findByText("Beta"));

    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(`/api/assistants/asst_2`),
    );

    expect(await screen.findByText("Beta desc")).toBeInTheDocument();
    expect(await screen.getByLabelText("ChatSandbox")).toHaveTextContent(
      "Beta",
    );
  });

  it("enter edit mode, edits fields, and saves (PATCH)", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(`/api/assistants/asst_1`),
    );
    expect(await screen.findByText("Alpha instructions")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Assistants.details.edit" }),
    );

    const titleInput = screen.getByDisplayValue("Alpha");
    await user.clear(titleInput);
    await user.type(titleInput, "Alpha renamed");

    const descriptionInput = screen.getByDisplayValue("Alpha desc");
    await user.clear(descriptionInput);
    await user.type(descriptionInput, "New description");

    const instructions = screen.getByDisplayValue("Alpha instructions");
    await user.clear(instructions);
    await user.type(instructions, "New instructions");

    await user.click(
      screen.getByRole("button", { name: "Assistants.details.save" }),
    );

    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        `/api/assistants/asst_1`,
        expect.objectContaining({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const patchCall = mocks.fetch.mock.calls.find(
      (c) => c[0] === `/api/assistants/asst_1` && c[1]?.method === "PATCH",
    );

    const sent = JSON.parse(patchCall[1].body);

    expect(sent).toMatchObject({
      name: "Alpha renamed",
      description: "New description",
      instructions: "New instructions",
      model: "gpt-4.1",
    });

    /*
     * O `id` e o `open_ai_id` nao vao no corpo, e nao e um esquecimento.
     *
     * A route identifica o assistente pelo `assistantId` do URL e passa
     * o corpo por `cleanPatch`, que so deixa passar os campos de
     * ALLOWED_ASSISTANT_PATCH_FIELDS. Nenhum desses dois esta la: aceitar
     * um `open_ai_id` vindo do cliente deixaria uma organizacao apontar
     * o seu assistente para o de outra.
     *
     * Este teste exigia-os e estava vermelho desde a migracao para a API
     * de Responses. Era o teste que estava errado.
     */
    expect(sent).not.toHaveProperty("id");
    expect(sent).not.toHaveProperty("open_ai_id");

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledWith(`/api/assistants/asst_1`);
    });
  });

  it("deletes assistant after confirmation (DELETE) and selects the remaining one", async () => {
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(`/api/assistants/asst_1`),
    );

    await user.click(
      screen.getByRole("button", { name: "Assistants.details.delete" }),
    );

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledWith(`/api/assistants/asst_1`, {
        method: "DELETE",
      });
    });

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledWith(`/api/assistants/asst_2`);
    });

    expect(await screen.findByText("Beta desc")).toBeInTheDocument();
  });

  it("se eliminar falhar, mostra um aviso traduzido da app (e não o alert do browser)", async () => {
    const user = userEvent.setup();
    const nativeAlert = vi.spyOn(window, "alert").mockImplementation(() => {});
    const baseFetch = mocks.fetch.getMockImplementation();
    mocks.fetch.mockImplementation((input, init = {}) => {
      const url = typeof input === "string" ? input : input.url;
      if (url === `/api/assistants/asst_1` && init.method === "DELETE") {
        return makeResponse({ error: "Em uso" }, false);
      }
      return baseFetch(input, init);
    });

    renderPage();

    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(`/api/assistants/asst_1`),
    );

    await user.click(
      screen.getByRole("button", { name: "Assistants.details.delete" }),
    );

    await waitFor(() =>
      expect(appMocks.alert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Common.error",
          message: expect.stringContaining("Assistants.errors.delete"),
          tone: "danger",
        }),
      ),
    );
    expect(nativeAlert).not.toHaveBeenCalled();
    nativeAlert.mockRestore();
  });

  it("opens create modal, then onCreated refreshes list and selects newest", async () => {
    const user = userEvent.setup();

    let listCallCount = 0;

    mocks.fetch.mockImplementation((input, init = {}) => {
      const url = typeof input === "string" ? input : input.url;
      const method = (init.method || "GET").toUpperCase();

      if (url === `/api/assistants?orgId=${ORG_ID}` && method === "GET") {
        listCallCount += 1;
        if (listCallCount === 1) return makeResponse(LIST);
        return makeResponse([...LIST, { id: "asst_3", name: "Gamma" }]);
      }

      if (url === `/api/assistants/asst_1` && method === "GET")
        return makeResponse(DETAILS_1);
      if (url === `/api/assistants/asst_2` && method === "GET")
        return makeResponse(DETAILS_2);
      if (url === `/api/assistants/asst_3` && method === "GET") {
        return makeResponse({
          ...DETAILS_2,
          id: "asst_3",
          name: "Gamma",
          description: "Gamma desc",
          open_ai_id: "oa_3",
        });
      }

      return makeResponse({});
    });

    renderPage();

    await user.click(
      screen.getByRole("button", { name: "Assistants.createAssistant" }),
    );

    expect(
      screen.getByRole("dialog", { name: "CreateAssistantModal" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "mock-create-done" }));

    expect(
      await screen.findByRole("heading", { name: "Gamma" }),
    ).toBeInTheDocument();

    expect(await screen.findByText("Gamma desc")).toBeInTheDocument();
  });

  it("mostra o nome da predefinicao em vez dos dois numeros", async () => {
    const user = userEvent.setup();
    renderPage();

    // O Beta nasceu com a predefinicao Criativo (1.1 / 1).
    await user.click(await screen.findByText("Beta"));

    expect(
      await screen.findByText("AssistantPresets.creative.name"),
    ).toBeInTheDocument();

    // "Criativo" diz ao cliente o que o assistente faz; "1.10" nao diz.
    expect(screen.queryByText("Assistants.details.creativity")).toBeNull();
    expect(screen.queryByText("Assistants.details.variety")).toBeNull();

    // O modelo tambem saiu do ecra: nao se escolhe nem se mostra. O id
    // cru ("gpt-4.1") nunca foi para os olhos do cliente.
    expect(screen.queryByText(/gpt-/i)).toBeNull();
    expect(screen.queryByText("Assistants.details.model")).toBeNull();
  });

  it("assinala como personalizado um assistente afinado a mao", async () => {
    renderPage();

    // O Alpha tem temperatura 0.7 (a do Normal) mas top_p 0.2. Nao se
    // comporta como o Normal, e chamar-lhe Normal seria mentir.
    expect(
      await screen.findByText("Assistants.details.customBehavior"),
    ).toBeInTheDocument();

    expect(screen.queryByText("AssistantPresets.normal.name")).toBeNull();
  });

  it("em edicao oferece as tres predefinicoes e nenhum deslizador", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("Alpha instructions")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Assistants.details.edit" }),
    );

    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(screen.queryAllByRole("slider")).toHaveLength(0);

    // O comportamento e a unica coisa que se escolhe: o seletor de
    // modelo saiu daqui como ja tinha saido da criacao.
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
  });

  it("guarda os valores da predefinicao escolhida", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("Alpha instructions")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Assistants.details.edit" }),
    );

    await user.click(screen.getByRole("radio", { name: /formal/i }));
    await user.click(
      screen.getByRole("button", { name: "Assistants.details.save" }),
    );

    const patch = await waitFor(() => {
      const call = mocks.fetch.mock.calls.find(
        (c) => c[0] === "/api/assistants/asst_1" && c[1]?.method === "PATCH",
      );
      expect(call).toBeTruthy();
      return JSON.parse(call[1].body);
    });

    expect(patch.temperature).toBe(0.2);

    // Sem seletor, o modelo do assistente tem de sobreviver a gravacao.
    expect(patch.model).toBe("gpt-4.1");

    // O top_p tem de vir corrigido para 1: o assistente tinha 0.2, e
    // escolher uma predefinicao escreve os dois parametros.
    expect(patch.top_p).toBe(1);
  });
  
  it("edits an attached vector store and removes an existing file", async () => {
    const user = userEvent.setup();
    const details = { ...DETAILS_1, vectorStoreId: 42 };

    mocks.fetch.mockImplementation((input, init = {}) => {
      const url = typeof input === "string" ? input : input.url;
      const method = (init.method || "GET").toUpperCase();

      if (url === `/api/assistants?orgId=${ORG_ID}` && method === "GET") {
        return makeResponse(LIST);
      }

      if (url === `/api/assistants/asst_1` && method === "GET") {
        return makeResponse(details);
      }

      if (
        url === `/api/assistants/asst_1/vector-store/42` &&
        method === "GET"
      ) {
        return makeResponse(VECTOR_STORE);
      }

      if (
        url === `/api/assistants/asst_1/vector-store/42` &&
        method === "PATCH"
      ) {
        return makeResponse(VECTOR_STORE);
      }

      return makeResponse({});
    });

    renderPage();

    expect(await screen.findByText("old.pdf")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Assistants.vector.edit" }),
    );
    expect(screen.getByDisplayValue("Knowledge base")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Assistants.vector.remove" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Assistants.vector.save" }),
    );

    await waitFor(() =>
      expect(mocks.fetch).toHaveBeenCalledWith(
        "/api/assistants/asst_1/vector-store/42",
        expect.objectContaining({
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );

    const patchCall = mocks.fetch.mock.calls.find(
      (call) =>
        call[0] === "/api/assistants/asst_1/vector-store/42" &&
        call[1]?.method === "PATCH",
    );
    const body = JSON.parse(patchCall[1].body);

    expect(body).toMatchObject({
      storeName: "Knowledge base",
      files: [],
      removedFileIds: [7],
    });
  });

  describe("limites do plano (#185)", () => {
    const LIMITS = {
      plan: { id: 1, name: "Demo", level: 0 },
      limits: { assistantInstructionChars: 5000, filesPerAssistant: 5 },
    };

    function mockWith(details) {
      mocks.fetch.mockImplementation((input, init = {}) => {
        const url = typeof input === "string" ? input : input.url;
        const method = (init.method || "GET").toUpperCase();

        if (url === `/api/plans/limits?orgId=${ORG_ID}`) return makeResponse(LIMITS);
        if (url === `/api/assistants?orgId=${ORG_ID}`) return makeResponse(LIST);
        if (url === `/api/assistants/asst_1` && method === "GET") {
          return makeResponse(details);
        }
        if (url === `/api/assistants/asst_1/vector-store/42` && method === "GET") {
          return makeResponse(VECTOR_STORE);
        }
        return makeResponse({});
      });
    }

    const pdf = (name) => new File(["x"], name, { type: "application/pdf" });

    it("um assistente criado antes do limite mostra o tamanho dele e não pode crescer", async () => {
      const user = userEvent.setup();
      mockWith({ ...DETAILS_1, instructions: "a".repeat(7405) });
      renderPage();

      await screen.findByRole("heading", { name: "Alpha" });
      await user.click(
        screen.getByRole("button", { name: "Assistants.details.edit" }),
      );

      expect(await screen.findByText(/7\.?405 \/ 7\.?405/)).toBeInTheDocument();
      expect(screen.getByText("olderThanLimit")).toBeInTheDocument();

      const save = screen.getByRole("button", { name: "Assistants.details.save" });
      expect(save).not.toBeDisabled();

      const textarea = screen.getByDisplayValue("a".repeat(7405));
      fireEvent.change(textarea, { target: { value: "a".repeat(7406) } });

      expect(save).toBeDisabled();
    });

    it("ao editar a coleção, escolher ficheiros a mais é recusado antes de enviar", async () => {
      const user = userEvent.setup({ applyAccept: false });
      mockWith({ ...DETAILS_1, vectorStoreId: 42 });
      renderPage();

      await screen.findByText("old.pdf");
      await user.click(
        screen.getByRole("button", { name: "Assistants.vector.edit" }),
      );

      /* Tem 1; 5 novos dariam 6. */
      const input = document.getElementById("vector-store-edit-files");
      await user.upload(input, ["a", "b", "c", "d", "e"].map((n) => pdf(`${n}.pdf`)));

      await waitFor(() =>
        expect(appMocks.alert).toHaveBeenCalledWith(
          expect.objectContaining({
            title: "Plans.limits.filesTitle",
            message: "Plans.limits.filesRemaining",
          }),
        ),
      );
      expect(screen.queryByText("a.pdf")).not.toBeInTheDocument();
    });

    it("mostra o contador de assistentes e, no limite, não deixa criar", async () => {
      LIMITS.limits.assistants = 2;
      LIMITS.usage = { assistants: 2 };
      try {
        mockWith(DETAILS_1);
        renderPage();

        expect(await screen.findByText("2 / 2")).toBeInTheDocument();
        expect(
          screen.getByRole("button", { name: "Assistants.createAssistant" }),
        ).toBeDisabled();
      } finally {
        delete LIMITS.limits.assistants;
        delete LIMITS.usage;
      }
    });

    it("mostra os ficheiros da coleção sobre o limite, e na edição o resultado antes de guardar", async () => {
      const user = userEvent.setup();
      mockWith({ ...DETAILS_1, vectorStoreId: 42 });
      renderPage();

      /* Leitura: a coleção tem 1 ficheiro. */
      expect(await screen.findByText("1 / 5")).toBeInTheDocument();

      await user.click(
        screen.getByRole("button", { name: "Assistants.vector.edit" }),
      );

      /* Edição: marcar o único ficheiro para tirar mostra logo 0 / 5. */
      await user.click(
        screen.getByRole("button", { name: "Assistants.vector.remove" }),
      );
      expect(await screen.findByText("0 / 5")).toBeInTheDocument();
    });

    it("ao editar a coleção, escolher até ao limite é aceite", async () => {
      const user = userEvent.setup({ applyAccept: false });
      mockWith({ ...DETAILS_1, vectorStoreId: 42 });
      renderPage();

      await screen.findByText("old.pdf");
      await user.click(
        screen.getByRole("button", { name: "Assistants.vector.edit" }),
      );

      const input = document.getElementById("vector-store-edit-files");
      await user.upload(input, ["a", "b", "c", "d"].map((n) => pdf(`${n}.pdf`)));

      expect(await screen.findByText("a.pdf")).toBeInTheDocument();
      expect(appMocks.alert).not.toHaveBeenCalled();
    });
  });
});

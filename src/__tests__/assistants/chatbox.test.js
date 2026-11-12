import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { registerAppModulePacks, resetAppMocks } from "../utils/mocks";

/**
 * O ChatSandbox chama `useAlert` logo no corpo do componente, e esse
 * hook rebenta sem um AlertProvider acima. O pack partilhado fornece-o,
 * como já fornecia o de confirmação.
 */
registerAppModulePacks();

import ChatSandbox from "@/app/[locale]/(app)/assistants/Chatbox/Chatbox.jsx";

function makeResponse(data, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(data),
    text: () =>
      Promise.resolve(typeof data === "string" ? data : JSON.stringify(data)),
  });
}

describe("Chatbox", () => {
  const mocks = vi.hoisted(() => ({
    fetch: vi.fn(),
  }));

  beforeEach(() => {
    resetAppMocks();

    mocks.fetch.mockImplementation((url, init = {}) => {
      if (String(url).includes("/messages")) {
        return makeResponse({ reply: "Hello back", threadId: "th_1" }, true);
      }
      return makeResponse({});
    });

    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a message and renders the assistant reply", async () => {
    const user = userEvent.setup();

    render(
      React.createElement(ChatSandbox, {
        assistant: { id: "asst_1", open_ai_id: "oa_1", name: "Alpha" },
      }),
    );

    await user.type(screen.getByPlaceholderText("Chatbox.placeholder"), "Hi!");
    await user.click(screen.getByRole("button", { name: "Chatbox.send" }));

    expect(await screen.findByText("Hi!")).toBeInTheDocument();

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledWith(
        "/api/assistants/asst_1/messages",
        expect.objectContaining({ method: "POST" }),
      );
    });

    expect(await screen.findByText("Hello back")).toBeInTheDocument();

    /* Os códigos técnicos da conversa já não aparecem no ecrã. */
    expect(screen.queryByText(/Thread\s*ID/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Conversation\s*ID/i)).not.toBeInTheDocument();
  });

  it("diz com que assistente se está a falar", () => {
    render(
      React.createElement(ChatSandbox, {
        assistant: { id: "asst_1", name: "Alpha" },
      }),
    );

    expect(screen.getByText("Chatbox.talkingTo:Alpha")).toBeInTheDocument();
  });

  it("sem mensagens mostra exemplos, e um clique envia o exemplo", async () => {
    const user = userEvent.setup();

    render(
      React.createElement(ChatSandbox, {
        assistant: { id: "asst_1", name: "Alpha" },
      }),
    );

    expect(screen.getByText("Chatbox.empty")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Chatbox.example1" }));

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
    });
    const body = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(body.message).toBe("Chatbox.example1");

    expect(await screen.findByText("Hello back")).toBeInTheDocument();
    expect(screen.queryByText("Chatbox.empty")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Chatbox.example2" }),
    ).not.toBeInTheDocument();
  });

  it("a segunda mensagem continua a mesma conversa", async () => {
    const user = userEvent.setup();
    mocks.fetch.mockImplementation(() =>
      makeResponse({ reply: "Ok", conversationId: "conv_1" }),
    );

    render(
      React.createElement(ChatSandbox, {
        assistant: { id: "asst_1", name: "Alpha" },
      }),
    );

    const input = screen.getByPlaceholderText("Chatbox.placeholder");
    await user.type(input, "Um");
    await user.click(screen.getByRole("button", { name: "Chatbox.send" }));
    await screen.findByText("Ok");

    await user.type(input, "Dois");
    await user.click(screen.getByRole("button", { name: "Chatbox.send" }));

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledTimes(2);
    });
    const second = JSON.parse(mocks.fetch.mock.calls[1][1].body);
    expect(second).toEqual({ message: "Dois", conversationId: "conv_1" });
  });
});

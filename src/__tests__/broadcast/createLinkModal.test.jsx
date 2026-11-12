import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  appMocks,
  registerAppModulePacks,
  resetAppMocks,
} from "../utils/mocks";

registerAppModulePacks();

import CreateLinkModal from "@/app/[locale]/(app)/broadcast/tracked-links/components/CreateLinkModal.jsx";

/*
 * Janela "Criar link" da página dos links: nome e destino, gravados sem
 * enviar uma mensagem.
 */

function respond(status, body) {
  return Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  });
}

function renderModal(props = {}) {
  const onClose = vi.fn();
  const onCreated = vi.fn();

  render(
    <CreateLinkModal
      orgId={7}
      open
      onClose={onClose}
      onCreated={onCreated}
      {...props}
    />,
  );

  return { onClose, onCreated };
}

async function fill(user, label, url) {
  await user.type(
    screen.getByLabelText("TrackedLinks.create.labelField"),
    label,
  );
  await user.type(screen.getByLabelText("TrackedLinks.create.urlField"), url);
}

const saveButton = () =>
  screen.getByRole("button", { name: "TrackedLinks.create.save" });

describe("CreateLinkModal", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    resetAppMocks();
    appMocks.alert.mockResolvedValue(undefined);
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fechada não mostra nada", () => {
    renderModal({ open: false });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("um destino sem http:// não deixa criar e diz porquê", async () => {
    const user = userEvent.setup();
    renderModal();

    await fill(user, "Guia", "www.x.pt");
    await user.tab();

    expect(saveButton()).toBeDisabled();
    expect(
      screen.getByText("TrackedLinks.create.invalidUrl"),
    ).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cria o link, fecha e avisa a página", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValue(respond(201, { ok: true, created: true }));
    const { onClose, onCreated } = renderModal();

    await fill(user, " Guia MFA ", "https://x.pt/guia");
    await user.click(saveButton());

    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith({ created: true }),
    );
    expect(onClose).toHaveBeenCalled();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/tracked-links/library");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      orgId: 7,
      label: "Guia MFA",
      destinationUrl: "https://x.pt/guia",
    });
    expect(appMocks.alert).not.toHaveBeenCalled();
  });

  it("se o link já existia, diz que continua na lista", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValue(respond(200, { ok: true, created: false }));
    const { onCreated } = renderModal();

    await fill(user, "Guia", "https://x.pt");
    await user.click(saveButton());

    await waitFor(() =>
      expect(appMocks.alert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "TrackedLinks.create.existsTitle",
        }),
      ),
    );
    expect(onCreated).toHaveBeenCalledWith({ created: false });
  });

  it("no limite do plano mostra o aviso e não fecha", async () => {
    const user = userEvent.setup();
    fetchMock.mockReturnValue(
      respond(409, { code: "TRACKED_LINKS_LIMIT_REACHED", limit: 100 }),
    );
    const { onClose, onCreated } = renderModal();

    await fill(user, "Guia", "https://x.pt");
    await user.click(saveButton());

    await waitFor(() =>
      expect(appMocks.alert).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Plans.limits.trackedLinksTitle",
        }),
      ),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });
});

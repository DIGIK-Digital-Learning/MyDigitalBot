import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

/*
 * #189: até 100 links rastreados por organização. Um link é um par nome +
 * destino; reutilizar um guardado não conta. Eliminar só o esconde, e não se
 * elimina um link que ainda vai sair numa agendada ou numa corrente.
 */

const mocks = vi.hoisted(() => ({
  getOrganizationPlan: vi.fn(),
  saveTrackedLinks: vi.fn(),
  deleteSavedTrackedLink: vi.fn(),
  claimAdminDailySend: vi.fn(),
  sendWhatsappBroadcast: vi.fn(),
  createMessageChain: vi.fn(),
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/lib/repos/plans.repo", () => ({
  getOrganizationPlan: mocks.getOrganizationPlan,
}));

vi.mock("@/lib/repos/trackedLinkSaved.repo", () => ({
  saveTrackedLinks: mocks.saveTrackedLinks,
  deleteSavedTrackedLink: mocks.deleteSavedTrackedLink,
  listSavedTrackedLinks: vi.fn(async () => []),
  countSavedTrackedLinks: vi.fn(async () => 0),
}));

vi.mock("@/lib/repos/adminDailySends.repo", () => ({
  claimAdminDailySend: mocks.claimAdminDailySend,
  releaseAdminDailySend: vi.fn(),
  setAdminDailySendSource: vi.fn(),
  refundScheduledSend: vi.fn(),
  countAdminDailySends: vi.fn(async () => ({ whatsapp: 0, teams: 0 })),
}));

vi.mock("@/lib/auth/guards", () => ({
  requireOwnedOrg: vi.fn(async () => ({ orgId: 1, admin: {}, user: { id: "u" } })),
  parsePositiveInt: (value) => {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
  },
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
  recordAuditEvent: mocks.recordAuditEvent,
}));

vi.mock("@/lib/repos/organizationMessagingFeature.repo", () => ({
  isReadChainsEnabled: vi.fn(async () => true),
}));

vi.mock("@/lib/repos/messageChain.repo", () => ({
  createMessageChain: mocks.createMessageChain,
  createMessageChainRecipients: vi.fn(async () => []),
  createMessageChainSteps: vi.fn(async () => []),
}));

vi.mock("@/lib/services/broadcast/readChains/sendReadChainStep", () => ({
  sendReadChainStep: vi.fn(),
}));

vi.mock("next-intl", () => ({ useLocale: () => "pt" }));

import { saveTrackedLinksWithinPlan } from "@/lib/services/plans/planLimits";
import { POST as sendWhatsapp } from "@/app/api/broadcast/whatsapp/route";
import { POST as createChain } from "@/app/api/broadcast/read-chain/route";
import { DELETE as deleteLink } from "@/app/api/tracked-links/library/route";
import TrackedLinksPanel from "@/app/[locale]/(app)/broadcast/components/panels/TrackedLinksPanel";

const json = (body) => ({ json: () => Promise.resolve(body) });
const GUIA = { key: "guia", label: "Guia", destinationUrl: "https://ex.pt/guia" };
const LINK_ID = "5f0c4a3e-1d2b-4c5d-8e9f-0a1b2c3d4e5f";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOrganizationPlan.mockResolvedValue({
    id: 1,
    plan_started_at: null,
    max_users_override: null,
    plan: {
      id: 2,
      name: "Starter",
      level: 1,
      max_tracked_links: 100,
      max_daily_messages_per_channel: 10,
      max_message_chars: 1500,
      max_files_per_message: 5,
      max_chain_messages: 10,
    },
  });
  mocks.saveTrackedLinks.mockResolvedValue({ ok: true, used: 37, limit: 100, added: 1 });
  mocks.claimAdminDailySend.mockResolvedValue({ ok: true, used: 1, limit: 10 });
  mocks.sendWhatsappBroadcast.mockResolvedValue({ ok: 1, failed: 0 });
  mocks.createMessageChain.mockResolvedValue({ id: "chain-1" });
});

describe("saveTrackedLinksWithinPlan", () => {
  it("sem links não toca na biblioteca", async () => {
    expect(await saveTrackedLinksWithinPlan(1, [])).toEqual({});
    expect(mocks.saveTrackedLinks).not.toHaveBeenCalled();
  });

  it("grava os links com o limite do plano", async () => {
    expect(await saveTrackedLinksWithinPlan(1, [GUIA, { label: "", destinationUrl: "x" }])).toEqual({});
    expect(mocks.saveTrackedLinks).toHaveBeenCalledWith(1, [GUIA], 100);
  });

  it("no limite devolve o 409 para eliminar links", async () => {
    mocks.saveTrackedLinks.mockResolvedValue({ ok: false, used: 100, limit: 100, added: 1 });

    const result = await saveTrackedLinksWithinPlan(1, [GUIA]);

    expect(result.body).toEqual({
      error: "Plan limit reached: trackedLinks",
      code: "TRACKED_LINKS_LIMIT_REACHED",
      plan: "Starter",
      limit: 100,
      used: 100,
      added: 1,
    });
  });
});

describe("rotas de envio", () => {
  it("no WhatsApp, um link novo no 100/100 é recusado antes de gastar um envio do dia", async () => {
    mocks.saveTrackedLinks.mockResolvedValue({ ok: false, used: 100, limit: 100, added: 1 });

    const response = await sendWhatsapp(
      json({ orgId: 1, recipients: [{ userId: 5 }], message: "Vê {{link.guia}}", trackedLinks: [GUIA] }),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("TRACKED_LINKS_LIMIT_REACHED");
    expect(mocks.claimAdminDailySend).not.toHaveBeenCalled();
    expect(mocks.sendWhatsappBroadcast).not.toHaveBeenCalled();
  });

  it("numa corrente, junta os links de todos os passos", async () => {
    const OUTRO = { key: "site", label: "Site", destinationUrl: "https://ex.pt" };

    await createChain(
      json({
        orgId: 1,
        channel: "teams",
        recipients: [{ userId: 5 }],
        steps: [
          { message: "1 {{link.guia}}", trackedLinks: [GUIA] },
          { message: "2 {{link.site}}", trackedLinks: [OUTRO] },
        ],
      }),
    ).catch(() => {});

    expect(mocks.saveTrackedLinks).toHaveBeenCalledWith(1, [GUIA, OUTRO], 100);
  });
});

describe("DELETE /api/tracked-links/library", () => {
  const remove = (query) =>
    deleteLink({
      nextUrl: new URL(`http://localhost/api/tracked-links/library${query}`),
    });

  it("elimina o link e regista no histórico", async () => {
    mocks.deleteSavedTrackedLink.mockResolvedValue({ ok: true, reason: null });

    const response = await remove(`?orgId=1&id=${LINK_ID}`);

    expect(response.status).toBe(200);
    expect(mocks.deleteSavedTrackedLink).toHaveBeenCalledWith(1, LINK_ID);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "tracked_link.deleted", entityId: LINK_ID }),
    );
  });

  it("não elimina um link que está numa agendada à espera", async () => {
    mocks.deleteSavedTrackedLink.mockResolvedValue({ ok: false, reason: "scheduled" });

    const response = await remove(`?orgId=1&id=${LINK_ID}`);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "TRACKED_LINK_IN_USE",
      reason: "scheduled",
    });
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("um link que não existe dá 404", async () => {
    mocks.deleteSavedTrackedLink.mockResolvedValue({ ok: false, reason: "not_found" });

    expect((await remove(`?orgId=1&id=${LINK_ID}`)).status).toBe(404);
  });

  it("recusa um id inválido sem ir à base de dados", async () => {
    expect((await remove("?orgId=1&id=abc")).status).toBe(400);
    expect(mocks.deleteSavedTrackedLink).not.toHaveBeenCalled();
  });
});

describe("painel dos links", () => {
  const t = (key) => key;
  const library = {
    items: [{ id: LINK_ID, key: "guia", label: "Guia", destinationUrl: GUIA.destinationUrl }],
    loading: false,
    failed: false,
    reload: vi.fn(),
  };

  const renderPanel = (savedLinks, onDeleteLibraryLink = vi.fn()) =>
    render(
      <TrackedLinksPanel
        trackedLinks={[]}
        trackedLinksValid
        addTrackedLink={vi.fn()}
        updateTrackedLink={vi.fn()}
        removeTrackedLink={vi.fn()}
        library={library}
        onUseLibraryLink={vi.fn()}
        onDeleteLibraryLink={onDeleteLibraryLink}
        savedLinks={savedLinks}
        translation={t}
      />,
    );

  it("mostra os links guardados e deixa criar abaixo do limite", () => {
    renderPanel({ used: 37, limit: 100 });

    expect(screen.getByText("37 / 100")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Broadcast.addLink" })).toBeEnabled();
    expect(screen.queryByText("Plans.limits.trackedLinksFull")).toBeNull();
  });

  it("no 100/100 não deixa criar e diz para eliminar um", () => {
    renderPanel({ used: 100, limit: 100 });

    expect(screen.getByRole("button", { name: "Broadcast.addLink" })).toBeDisabled();
    expect(screen.getByText("Plans.limits.trackedLinksFull")).toBeInTheDocument();
    /* Reutilizar um link guardado continua a poder. */
    expect(screen.getByRole("button", { name: "Broadcast.linkLibrary.use" })).toBeEnabled();
  });

  it("o ✕ de um link pede para o eliminar", () => {
    const onDelete = vi.fn();
    renderPanel({ used: 37, limit: 100 }, onDelete);

    fireEvent.click(screen.getByRole("button", { name: "Broadcast.linkLibrary.delete" }));

    expect(onDelete).toHaveBeenCalledWith(library.items[0]);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveTrackedLinks: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/teams/auth", () => ({
  getBotToken: async () => "token-1",
}));

vi.mock("@/lib/repos/organizations.repo", () => ({
  getOrganization: async () => ({ id: 1, name: "DIGIK" }),
}));

vi.mock("@/lib/repos/teamsInstallations.repo", () => ({
  getTeamsUserInstallation: async () => ({
    tenant_id: "tenant-1",
    service_url: "https://smba.trafficmanager.net/emea/",
    conversation_id: "conv-1",
  }),
}));

vi.mock("@/lib/repos/user.repo", () => ({
  getUserById: async () => ({ id: 42, name: "Pedro" }),
}));

vi.mock("@/lib/repos/trackedLinks.repo", () => ({
  createTrackedLink: vi.fn(),
}));

vi.mock("@/lib/repos/trackedLinkLibrary.repo", () => ({
  getTrackedLinkLibraryByOrg: vi.fn(),
}));

/*
 * No staging, o envio do Teams também regista a mensagem e as perguntas.
 * Simular já estes repositórios deixa o teste a passar dos dois lados.
 */
vi.mock("@/lib/repos/messages.repo", () => ({
  createMessage: vi.fn(async () => ({ id: 1 })),
}));

vi.mock("@/lib/repos/questions.repo", () => ({
  createQuestion: vi.fn(),
  getQuestionById: vi.fn(),
}));

vi.mock("@/lib/repos/threads.repo", () => ({
  getUserThreadForChannel: vi.fn(async () => null),
}));

/* Só a criação dos links é simulada; a troca no texto é a verdadeira. */
vi.mock("@/lib/services/broadcast/trackedLinks", async (importOriginal) => ({
  ...(await importOriginal()),
  resolveTrackedLinksForRecipient: (...args) =>
    mocks.resolveTrackedLinks(...args),
}));

import { sendTeamsBroadcast } from "@/lib/services/broadcast/sendTeamsBroadcast";

const GUIA = {
  key: "guia",
  label: "Guia",
  destinationUrl: "https://exemplo.pt/guia",
  trackedUrl: "https://app.test/r/abc",
};

function sentText() {
  const [, init] = mocks.fetch.mock.calls[0];
  return JSON.parse(init.body).text;
}

describe("sendTeamsBroadcast: link marcado como botão", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: "activity-1" }),
      text: async () => "",
    });
    vi.stubGlobal("fetch", mocks.fetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("no Teams não há botões: os links vão no fim do texto, com o nome", async () => {
    const CURSO = {
      key: "curso",
      label: "Curso",
      destinationUrl: "https://exemplo.pt/curso",
      trackedUrl: "https://app.test/r/def",
      button: true,
    };
    mocks.resolveTrackedLinks.mockResolvedValue([
      { ...GUIA, button: true },
      CURSO,
    ]);

    await sendTeamsBroadcast({
      orgId: 1,
      userIds: [42],
      message: "Ativa hoje a MFA.",
      trackedLinks: [{ ...GUIA, button: true }, CURSO],
    });

    expect(sentText()).toBe(
      `Ativa hoje a MFA.\n\n[Guia](${GUIA.trackedUrl})\n[Curso](${CURSO.trackedUrl})`,
    );
  });

  it("converte a formatação do WhatsApp para o Markdown do Teams", async () => {
    mocks.resolveTrackedLinks.mockResolvedValue([]);

    await sendTeamsBroadcast({
      orgId: 1,
      userIds: [42],
      message: "*Olá* _tu_ ~não~ ```código```",
    });

    expect(sentText()).toBe("**Olá** <i>tu</i> <s>não</s> `código`");
  });

  it("um link no texto fica onde está", async () => {
    mocks.resolveTrackedLinks.mockResolvedValue([GUIA]);

    await sendTeamsBroadcast({
      orgId: 1,
      userIds: [42],
      message: "Guia: {{link.guia}}",
      trackedLinks: [GUIA],
    });

    expect(sentText()).toBe(`Guia: ${GUIA.trackedUrl}`);
  });
});

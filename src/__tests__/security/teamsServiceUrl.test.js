// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isTrustedTeamsServiceUrl } from "@/lib/teams/serviceUrl";
import { sendReply } from "@/lib/teams/sendReply";
import { getTeamName, getTeamsMember, listTeamsConversationMembers } from "@/lib/teams/members";
import { getBotToken } from "@/lib/teams/auth";
import { getGroupInstallationsByIds, getTeamsUserInstallation } from "@/lib/repos/teamsInstallations.repo";
import { sendTeamsBroadcast } from "@/lib/services/broadcast/sendTeamsBroadcast";
import { sendTeamsGroupBroadcast } from "@/lib/services/broadcast/sendTeamsGroupBroadcast";

vi.mock("@/lib/teams/auth", () => ({ getBotToken: vi.fn() }));
vi.mock("@/lib/repos/organizations.repo", () => ({ getOrganization: async () => ({ id: 1, name: "Empresa" }) }));
vi.mock("@/lib/repos/teamsInstallations.repo", () => ({ getTeamsUserInstallation: vi.fn(), getGroupInstallationsByIds: vi.fn() }));
vi.mock("@/lib/repos/user.repo", () => ({ getUserById: async () => ({ id: 1, name: "João" }) }));
vi.mock("@/lib/repos/messages.repo", () => ({ createMessage: vi.fn() }));
vi.mock("@/lib/repos/questions.repo", () => ({ createQuestion: vi.fn(), getQuestionById: vi.fn() }));
vi.mock("@/lib/repos/threads.repo", () => ({
  getUserThreadForChannel: async () => null,
  getGroupThreadForConversation: async () => ({ id: 1 }),
  createThread: vi.fn(),
}));
vi.mock("@/lib/openai/client", () => ({ openai: {} }));
vi.mock("@/lib/services/openaiResponses.service", () => ({ createConversation: vi.fn() }));
vi.mock("@/lib/services/broadcast/trackedLinks", () => ({
  replaceTrackedPlaceholders: (text) => text,
  resolveTrackedLinksForRecipient: async () => [],
}));

const trusted = "https://smba.trafficmanager.net/emea/";
const untrusted = "https://attacker.example/";
const fetchMock = vi.fn();
const activity = (serviceUrl) => ({ id: "activity", serviceUrl, conversation: { id: "19:conv/segment?key=value" } });

beforeEach(() => {
  vi.clearAllMocks();
  getBotToken.mockResolvedValue("bot-token-test");
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ id: "sent", members: [] }), text: async () => '{"id":"sent"}' });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("Destinos das chamadas Teams", () => {
  it.each([
    trusted, "https://smba.trafficmanager.net:443/teams/",
    "https://smba.infra.teams.microsoft.com/teams/", "https://api.botframework.com/",
  ])("aceita o endereço Microsoft %s", (url) => {
    expect(isTrustedTeamsServiceUrl(url)).toBe(true);
  });

  it.each([
    null, {}, "", untrusted, "http://smba.trafficmanager.net/",
    "https://attacker.trafficmanager.net/", "https://smba.trafficmanager.net.attacker.example/",
    "https://evilteams.microsoft.com/", "https://teams.microsoft.com.attacker.example/",
    "https://user:secret@smba.trafficmanager.net/", "https://smba.trafficmanager.net:444/",
    "https://smba.trafficmanager.net/teams/?next=evil", "https://smba.trafficmanager.net/#evil",
    " https://smba.trafficmanager.net/",
  ])("recusa um destino inválido ou com componentes adicionais: %s", (url) => {
    expect(isTrustedTeamsServiceUrl(url)).toBe(false);
  });

  it("uma resposta do bot recusa o destino antes de obter ou enviar o token", async () => {
    expect(await sendReply(activity(untrusted), "Olá")).toMatchObject({ ok: false });
    expect(getBotToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("as consultas de membros e de equipa também recusam o destino antes do token", async () => {
    const input = { serviceUrl: untrusted, conversationId: "conv", memberId: "member", teamId: "team" };
    expect(await getTeamsMember(input)).toBeNull();
    expect(await getTeamName(input)).toBeNull();
    await expect(listTeamsConversationMembers(input)).rejects.toThrow(/Untrusted/);
    expect(getBotToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("o envio individual recusa um endereço adulterado na instalação guardada", async () => {
    getTeamsUserInstallation.mockResolvedValue({ tenant_id: "tenant", service_url: untrusted, conversation_id: "conv" });
    expect(await sendTeamsBroadcast({ orgId: 1, userIds: [1], message: "Olá" }))
      .toMatchObject({ ok: 0, failed: 1 });
    expect(getBotToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("o envio para grupos recusa um endereço adulterado na instalação guardada", async () => {
    getGroupInstallationsByIds.mockResolvedValue([{ id: 1, tenant_id: "tenant", service_url: untrusted, conversation_id: "conv" }]);
    expect(await sendTeamsGroupBroadcast({ orgId: 1, groupIds: [1], message: "Olá" }))
      .toMatchObject({ ok: 0, failed: 1 });
    expect(getBotToken).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("as respostas não seguem redirects e codificam o identificador da conversa", async () => {
    expect(await sendReply(activity(trusted), "Olá")).toMatchObject({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("19%3Aconv%2Fsegment%3Fkey%3Dvalue"),
      expect.objectContaining({ redirect: "error", headers: expect.objectContaining({ Authorization: "Bearer bot-token-test" }) }),
    );
  });

  it.each(["individual", "grupo"])("o envio %s também bloqueia redirects", async (kind) => {
    const installation = {
      id: 1, tenant_id: "tenant", service_url: trusted,
      conversation_id: "19:conv/segment?key=value", assistant_id: 1,
    };
    getTeamsUserInstallation.mockResolvedValue(installation);
    getGroupInstallationsByIds.mockResolvedValue([installation]);
    const result = kind === "individual"
      ? await sendTeamsBroadcast({ orgId: 1, userIds: [1], message: "Olá" })
      : await sendTeamsGroupBroadcast({ orgId: 1, groupIds: [1], message: "Olá" });
    expect(result).toMatchObject({ ok: 1, failed: 0 });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("19%3Aconv%2Fsegment%3Fkey%3Dvalue"),
      expect.objectContaining({ redirect: "error" }),
    );
  });

  it.each([getTeamsMember, listTeamsConversationMembers, getTeamName])
    ("as consultas Microsoft não seguem redirects", async (read) => {
      await read({ serviceUrl: trusted, conversationId: "conv", memberId: "member", teamId: "team" });
      expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ redirect: "error" }));
    });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getTrackedLinkLibraryByOrg: vi.fn(),
}));

vi.mock("@/lib/repos/trackedLinks.repo", () => ({
  createTrackedLink: vi.fn(async (row) => row),
}));

/* A biblioteca passou a ser a tabela dos links guardados (#189). */
vi.mock("@/lib/repos/trackedLinkSaved.repo", () => ({
  listSavedTrackedLinks: (...args) => mocks.getTrackedLinkLibraryByOrg(...args),
}));

import {
  listReusableTrackedLinks,
  replaceTrackedLinksInText,
  replaceTrackedPlaceholders,
  resolveTrackedLinksForRecipient,
} from "@/lib/services/broadcast/trackedLinks";

describe("texto para o Teams e para o WhatsApp", () => {
  const GUIA = {
    key: "guia",
    label: "Guia",
    trackedUrl: "https://app.test/r/abc",
  };

  it("no Teams, a formatação do WhatsApp passa a Markdown", () => {
    expect(
      replaceTrackedPlaceholders("*Olá* ~não~ {{link.guia}}", [GUIA]),
    ).toBe("**Olá** <s>não</s> https://app.test/r/abc");
  });

  it("no WhatsApp, os marcadores ficam e só os links são trocados", () => {
    expect(
      replaceTrackedLinksInText("*Olá* {{link.guia}}", [
        { ...GUIA, button: true },
      ]),
    ).toBe("*Olá* https://app.test/r/abc");
  });

  it("no WhatsApp, o link do botão não vai para o fim do texto", () => {
    expect(
      replaceTrackedLinksInText("*Olá*", [{ ...GUIA, button: true }]),
    ).toBe("*Olá*");
  });
});

describe("replaceTrackedPlaceholders", () => {
  const GUIA = {
    key: "guia",
    label: "Guia",
    trackedUrl: "https://app.test/r/abc",
  };

  it("troca o placeholder pelo URL rastreado", () => {
    expect(replaceTrackedPlaceholders("Vê: {{link.guia}}", [GUIA])).toBe(
      "Vê: https://app.test/r/abc",
    );
  });

  it("põe no fim, com o nome, o link do botão que não está no texto (Teams)", () => {
    expect(
      replaceTrackedPlaceholders("Ativa a MFA.", [{ ...GUIA, button: true }]),
    ).toBe("Ativa a MFA.\n\n[Guia](https://app.test/r/abc)");
  });

  it("não repete o link do botão quando já está no texto", () => {
    expect(
      replaceTrackedPlaceholders("Vê: {{link.guia}}", [
        { ...GUIA, button: true },
      ]),
    ).toBe("Vê: https://app.test/r/abc");
  });
});

describe("resolveTrackedLinksForRecipient", () => {
  it("mantém a marca de botão no link resolvido", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.test");

    const [botao, texto] = await resolveTrackedLinksForRecipient({
      orgId: 7,
      channel: "whatsapp",
      trackedLinks: [
        {
          key: "guia",
          label: "Guia",
          destinationUrl: "https://x.pt/guia",
          button: true,
          buttonMessage: "  Já leste o guia?  ",
        },
        { key: "curso", label: "Curso", destinationUrl: "https://x.pt/curso" },
      ],
    });

    expect(botao).toMatchObject({
      key: "guia",
      button: true,
      buttonMessage: "Já leste o guia?",
    });
    expect(botao.trackedUrl).toMatch(/^https:\/\/app\.test\/r\//);
    expect(texto.button).toBeUndefined();
    expect(texto.buttonMessage).toBeUndefined();

    vi.unstubAllEnvs();
  });
});

function row(overrides = {}) {
  return {
    link_key: "guia",
    link_label: "Guia MFA",
    destination_url: "https://exemplo.pt/mfa",
    last_used_at: "2026-10-01T10:00:00Z",
    ...overrides,
  };
}

describe("listReusableTrackedLinks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("devolve os links da organização no formato do composer", async () => {
    mocks.getTrackedLinkLibraryByOrg.mockResolvedValue([row()]);

    const items = await listReusableTrackedLinks(7);

    expect(mocks.getTrackedLinkLibraryByOrg).toHaveBeenCalledWith(7);
    expect(items).toEqual([
      {
        key: "guia",
        label: "Guia MFA",
        destinationUrl: "https://exemplo.pt/mfa",
        lastUsedAt: "2026-10-01T10:00:00Z",
      },
    ]);
  });

  it("junta links que só diferem em espaços, ficando com o mais recente", async () => {
    mocks.getTrackedLinkLibraryByOrg.mockResolvedValue([
      row({ link_key: "novo" }),
      row({
        link_key: "antigo",
        link_label: " Guia MFA ",
        last_used_at: "2026-09-01T10:00:00Z",
      }),
    ]);

    const items = await listReusableTrackedLinks(7);

    expect(items).toHaveLength(1);
    expect(items[0].key).toBe("novo");
  });

  it("esconde links sem nome ou com um destino que o envio recusaria", async () => {
    mocks.getTrackedLinkLibraryByOrg.mockResolvedValue([
      row({ link_label: "" }),
      row({ destination_url: "javascript:alert(1)" }),
      row({ link_label: "Válido", destination_url: "http://ok.pt" }),
    ]);

    const items = await listReusableTrackedLinks(7);

    expect(items.map((item) => item.label)).toEqual(["Válido"]);
  });
});

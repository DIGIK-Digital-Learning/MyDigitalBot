import { describe, expect, it } from "vitest";
import {
  broadcastMediaRejection,
  isWhatsappImageTooLarge,
  buildBroadcastMediaKey,
} from "@/lib/uploads/broadcastMedia";

describe("buildBroadcastMediaKey", () => {
  it("põe a organização na segunda pasta e limpa o nome do ficheiro", () => {
    const key = buildBroadcastMediaKey(12, "relatório final.png");
    expect(key).toMatch(/^broadcasts\/12\/\d+-[a-z0-9]+-relatorio_final\.png$/);
  });

  it("recusa gerar caminho sem organização", () => {
    expect(() => buildBroadcastMediaKey(undefined, "a.png")).toThrow();
  });

  it("recusa uma organização que tente sair da pasta", () => {
    expect(() => buildBroadcastMediaKey("12/../13", "a.png")).toThrow();
  });
});

describe("broadcastMediaRejection", () => {
  it("aceita PDF e MP4 até 50 MB e recusa o resto", () => {
    expect(broadcastMediaRejection("application/pdf", 1024)).toBeNull();
    expect(broadcastMediaRejection("video/mp4", 50 * 1024 * 1024)).toBeNull();
    expect(broadcastMediaRejection("video/mp4", 50 * 1024 * 1024 + 1)).toBe(
      "size",
    );
    expect(broadcastMediaRejection("video/quicktime", 1024)).toBe("type");
  });
});

describe("isWhatsappImageTooLarge", () => {
  const MB = 1024 * 1024;

  it("recusa imagens acima de 5 MB e deixa os vídeos e PDF", () => {
    expect(
      isWhatsappImageTooLarge({ contentType: "image/png", size: 5 * MB }),
    ).toBe(false);
    expect(
      isWhatsappImageTooLarge({ contentType: "image/png", size: 5 * MB + 1 }),
    ).toBe(true);
    expect(
      isWhatsappImageTooLarge({ contentType: "video/mp4", size: 40 * MB }),
    ).toBe(false);
    expect(
      isWhatsappImageTooLarge({
        contentType: "application/pdf",
        size: 40 * MB,
      }),
    ).toBe(false);
  });

  it("sem tamanho conhecido não bloqueia", () => {
    expect(isWhatsappImageTooLarge({ contentType: "image/png" })).toBe(false);
  });
});

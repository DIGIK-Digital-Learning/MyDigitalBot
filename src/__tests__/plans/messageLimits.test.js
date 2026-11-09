import { describe, expect, it } from "vitest";

import {
  effectiveFileSizeMb,
  messageContentProblem,
  visibleMessageLength,
} from "@/lib/plans/messageLimits";

/* #187: a mensagem conta como a pessoa a vê (1b). */
describe("visibleMessageLength", () => {
  it.each([
    ["olá", 3, "texto simples"],
    ["*olá*", 3, "o negrito não conta as marcas"],
    ["_a_ ~b~ ```c```", 5, "itálico, riscado e monoespaçado sem marcas"],
    ["{{nome}}", 20, "uma variável vale 20"],
    ["*olá* {{nome}}", 24, "negrito + espaço + variável"],
    ["Vê {{link.curso}} e {{empresa}}", 46, "links também são variáveis"],
    ["5*3*2", 5, "asteriscos que não são negrito contam"],
    ["", 0, "vazio"],
  ])("%j vale %i (%s)", (text, expected) => {
    expect(visibleMessageLength(text)).toBe(expected);
  });
});

describe("messageContentProblem", () => {
  const limits = { messageChars: 1500, filesPerMessage: 5 };

  it("dentro dos limites não há problema", () => {
    expect(
      messageContentProblem({ message: "a".repeat(1500), files: [1, 2, 3, 4, 5] }, limits),
    ).toBeNull();
  });

  it("1.501 caracteres é MESSAGE_TOO_LONG", () => {
    expect(messageContentProblem({ message: "a".repeat(1501) }, limits)).toEqual({
      code: "MESSAGE_TOO_LONG",
      limit: 1500,
    });
  });

  it("as marcas de formatação não empurram para fora do limite", () => {
    expect(messageContentProblem({ message: `*${"a".repeat(1500)}*` }, limits)).toBeNull();
  });

  it("6 ficheiros é TOO_MANY_FILES", () => {
    expect(messageContentProblem({ files: [1, 2, 3, 4, 5, 6] }, limits)).toEqual({
      code: "TOO_MANY_FILES",
      limit: 5,
    });
  });

  it("sem limites no plano, aceita tudo", () => {
    expect(
      messageContentProblem({ message: "a".repeat(9999), files: Array(50).fill(1) }, {}),
    ).toBeNull();
  });
});

describe("effectiveFileSizeMb (4b)", () => {
  it.each([
    [50, 50, "o plano diz 50, valem os 50"],
    [10, 10, "um plano mais baixo manda"],
    [null, 50, "sem valor no plano, valem os 50 técnicos"],
    [80, 50, "um plano acima do bucket fica nos 50 técnicos"],
  ])("plano %s → %i MB (%s)", (plan, expected) => {
    expect(effectiveFileSizeMb(plan)).toBe(expected);
  });
});

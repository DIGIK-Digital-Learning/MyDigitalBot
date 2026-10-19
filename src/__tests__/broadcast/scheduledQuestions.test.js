import { describe, expect, it } from "vitest";

import {
  canEditItem,
  getPayloadQuestion,
  normalizeBroadcast,
} from "@/app/[locale]/(app)/broadcast/scheduled/helpers/scheduled.helpers";

function row(payload, extra = {}) {
  return {
    id: "b-1",
    channel: "whatsapp",
    status: "queued",
    scheduled_for: "2099-01-01T12:00:00Z",
    payload,
    ...extra,
  };
}

describe("normalizeBroadcast com perguntas", () => {
  it("quiz: a mensagem passa a ser o corpo da pergunta", () => {
    const item = normalizeBroadcast(
      row({
        message: "",
        question: {
          kind: "quiz",
          body: "Qual é a capital?",
          options: [
            { label: "Lisboa", correct: true },
            { label: "Porto", correct: false },
          ],
        },
      }),
    );

    expect(item.message).toBe("Qual é a capital?");
    expect(item.questionKind).toBe("quiz");
  });

  it.each([
    ["survey", { kind: "survey", body: "Gostaste?", options: [] }],
    [
      "open",
      { kind: "open", body: "Explica", expectedAnswer: "X", aiEvaluation: true },
    ],
  ])("%s: usa o corpo da pergunta", (kind, question) => {
    const item = normalizeBroadcast(row({ message: "", question }));

    expect(item.message).toBe(question.body);
    expect(item.questionKind).toBe(kind);
  });

  it("mensagem em branco continua a usar o texto da mensagem", () => {
    const item = normalizeBroadcast(row({ message: "Olá equipa" }));

    expect(item.message).toBe("Olá equipa");
    expect(item.questionKind).toBeNull();
  });

  it("ignora uma pergunta de tipo desconhecido", () => {
    expect(getPayloadQuestion({ question: { kind: "outro", body: "x" } })).toBe(
      null,
    );
  });
});

describe("canEditItem", () => {
  it("só edita mensagens ainda na fila", () => {
    expect(canEditItem({ status: "scheduled" })).toBe(true);
    expect(canEditItem({ status: "sending" })).toBe(false);
    expect(canEditItem({ status: "sent" })).toBe(false);
    expect(canEditItem({ status: "failed" })).toBe(false);
    expect(canEditItem({ status: "cancelled" })).toBe(false);
  });
});

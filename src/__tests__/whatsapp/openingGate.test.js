import { describe, expect, it } from "vitest";
import {
  OPENING_GATE_VALIDITY_DAYS,
  extractWhatsappQuickReply,
  findPendingOpeningGate,
  isReplyToOpeningGate,
  openingGateExpiresAt,
} from "@/lib/whatsapp/openingGate";

describe("WhatsApp opening gate", () => {
  it("keeps one opening request for 14 days", () => {
    const now = new Date("2026-10-14T12:00:00.000Z").getTime();

    expect(OPENING_GATE_VALIDITY_DAYS).toBe(14);
    expect(openingGateExpiresAt(now).getTime() - now).toBe(
      14 * 24 * 60 * 60 * 1000,
    );
  });

  it("recognizes both a marked opening row and a legacy template row", () => {
    const markedRow = { payload: { openingGate: true } };
    const legacyRow = { template_message_id: "bird-opening-1", payload: {} };

    expect(findPendingOpeningGate([markedRow])).toBe(markedRow);
    expect(findPendingOpeningGate([legacyRow])).toBe(legacyRow);
    expect(findPendingOpeningGate([{ payload: { message: "queued" } }])).toBe(
      null,
    );
  });

  it("unlocks only for a quick reply tied to the active opening template", () => {
    const gate = { template_message_id: "bird-opening-1" };
    const payload = {
      body: {
        interactive: {
          type: "button_reply",
          reply: { text: "Aceitar" },
        },
      },
      replyTo: { id: "bird-opening-1" },
    };
    const reply = extractWhatsappQuickReply(payload);

    expect(reply).toMatchObject({
      isQuickReply: true,
      text: "Aceitar",
      replyToMessageId: "bird-opening-1",
    });
    expect(isReplyToOpeningGate(reply, gate)).toBe(true);
  });

  it("does not unlock for free text, an unrelated button, or a missing reply reference", () => {
    const gate = { template_message_id: "bird-opening-1" };
    const freeText = extractWhatsappQuickReply({
      body: { type: "text", text: { text: "Olá" } },
      replyTo: { id: "bird-opening-1" },
    });
    const unrelatedButton = extractWhatsappQuickReply({
      body: {
        interactive: {
          type: "button_reply",
          reply: { text: "Sim" },
        },
      },
      replyTo: { id: "some-other-message" },
    });
    const buttonWithoutReference = extractWhatsappQuickReply({
      body: {
        interactive: {
          type: "button_reply",
          reply: { text: "Sim" },
        },
      },
    });

    expect(isReplyToOpeningGate(freeText, gate)).toBe(false);
    expect(isReplyToOpeningGate(unrelatedButton, gate)).toBe(false);
    expect(isReplyToOpeningGate(buttonWithoutReference, gate)).toBe(false);
  });
});

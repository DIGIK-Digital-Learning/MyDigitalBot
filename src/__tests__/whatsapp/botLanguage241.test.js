import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * #241: o bot começa na língua da organização e passa à do colaborador
 * quando ele escreve claramente noutra.
 */

const mocks = vi.hoisted(() => ({
  responsesCreate: vi.fn(),
}));

vi.mock("@/lib/openai/client", () => ({
  openai: { responses: { create: mocks.responsesCreate } },
}));
vi.mock("@/lib/db/admin", () => ({
  getSupabaseAdminClient: vi.fn(() => ({})),
}));

import {
  assistantLanguageRule,
  botLocale,
  detectMessageLanguage,
  localeFromTeams,
} from "@/lib/bot/botLanguage";
import { BOT_TEXTS, botText } from "@/lib/bot/botTexts";
import { withConversationLanguage } from "@/lib/services/bot/conversationLanguage";
import { quizFeedbackText, surveyThanksText } from "@/lib/whatsapp/question";
import {
  buildSwitchMenu,
  isSwitchKeyword,
  switchConfirmationText,
} from "@/lib/whatsapp/assistantSwitch";
import {
  buildAssistantSwitchCard,
  isSwitchCommand,
} from "@/lib/services/teams/teamsAssistantSwitch";
import { generateAssistantResponse } from "@/lib/services/openaiResponses.service";
import {
  getOpeningTemplateConfig,
  openingTemplateLocale,
  openingTemplatePreviewFor,
  renderOpeningTemplatePreview,
} from "@/lib/whatsapp/openingTemplate";

describe("detectMessageLanguage", () => {
  it.each([
    ["Olá, preciso de ajuda com o meu horário", "pt"],
    ["Não percebi a pergunta", "pt"],
    ["Hi, I need help with my schedule", "en"],
    ["What is the vacation policy?", "en"],
  ])("%s → %s", (text, expected) => {
    expect(detectMessageLanguage(text)).toBe(expected);
  });

  it.each([[""], ["ok"], ["👍"], ["1"], ["Teams"], [null]])(
    "does not decide on %s",
    (text) => {
      expect(detectMessageLanguage(text)).toBeNull();
    },
  );
});

describe("botLocale", () => {
  it("prefers the collaborator's language over the organization's", () => {
    expect(
      botLocale({ organization: { locale: "pt" }, user: { locale: "en" } }),
    ).toBe("en");
  });

  it("falls back to the organization and then to Portuguese", () => {
    expect(botLocale({ organization: { locale: "en" }, user: {} })).toBe("en");
    expect(botLocale({ organization: { locale: "fr" } })).toBe("pt");
    expect(botLocale()).toBe("pt");
  });

  it("reads the Teams client locale", () => {
    expect(localeFromTeams("en-US")).toBe("en");
    expect(localeFromTeams("pt-PT")).toBe("pt");
    expect(localeFromTeams("de-DE")).toBe("pt");
  });
});

describe("botText", () => {
  it("has the same keys in both languages", () => {
    expect(Object.keys(BOT_TEXTS.en).sort()).toEqual(
      Object.keys(BOT_TEXTS.pt).sort(),
    );
  });

  it("fills single-brace values and leaves {{certa}} for the quiz", () => {
    expect(botText("en", "switchSwitched", { name: "RH" })).toBe(
      "You're now talking to RH.",
    );
    expect(botText("en", "quizIncorrect")).toContain("{{certa}}");
  });

  it("uses Portuguese for an unknown language and throws on an unknown key", () => {
    expect(botText("fr", "surveyThanks")).toBe(BOT_TEXTS.pt.surveyThanks);
    expect(() => botText("pt", "nope")).toThrow();
  });
});

describe("withConversationLanguage", () => {
  const user = { id: 7, name: "Rita" };

  it("switches and saves when the collaborator writes in another language", async () => {
    const setUserLocale = vi.fn();
    const result = await withConversationLanguage(
      user,
      "Hi, how do I book my holidays?",
      { getUserLocale: async () => null, setUserLocale },
    );

    expect(result.locale).toBe("en");
    expect(setUserLocale).toHaveBeenCalledWith(7, "en");
  });

  it("keeps the stored language when the message is unclear", async () => {
    const setUserLocale = vi.fn();
    const result = await withConversationLanguage(user, "ok", {
      getUserLocale: async () => "en",
      setUserLocale,
    });

    expect(result.locale).toBe("en");
    expect(setUserLocale).not.toHaveBeenCalled();
  });

  it("does not save again when the language did not change", async () => {
    const setUserLocale = vi.fn();
    await withConversationLanguage(user, "What is the policy for sick days?", {
      getUserLocale: async () => "en",
      setUserLocale,
    });

    expect(setUserLocale).not.toHaveBeenCalled();
  });

  it("still answers in the new language when saving fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await withConversationLanguage(
      user,
      "Hi, where can I find the handbook?",
      {
        getUserLocale: async () => "pt",
        setUserLocale: async () => {
          throw new Error("column locale does not exist");
        },
      },
    );

    expect(result.locale).toBe("en");
    warn.mockRestore();
  });

  it("leaves the language empty (organization's) with nothing stored", async () => {
    const result = await withConversationLanguage(user, "", {
      getUserLocale: async () => null,
      setUserLocale: vi.fn(),
    });

    expect(result.locale).toBeNull();
  });
});

describe("question feedback in English", () => {
  const quiz = {
    options: [
      { label: "Lisboa", correct: true },
      { label: "Porto", correct: false },
    ],
  };

  it("uses the English default texts", () => {
    expect(quizFeedbackText(quiz, true, "en")).toBe(BOT_TEXTS.en.quizCorrect);
    expect(quizFeedbackText(quiz, false, "en")).toBe(
      "That's not it. The right answer is: Lisboa",
    );
    expect(surveyThanksText({}, "en")).toBe(BOT_TEXTS.en.surveyThanks);
  });

  it("keeps the administrator's own feedback as written", () => {
    expect(surveyThanksText({ feedback_correct: "Obrigada!" }, "en")).toBe(
      "Obrigada!",
    );
  });

  it("stays in Portuguese by default", () => {
    expect(quizFeedbackText(quiz, true)).toBe(BOT_TEXTS.pt.quizCorrect);
  });
});

describe("assistant switch in English", () => {
  const assistants = [
    { id: 1, name: "RH" },
    { id: 2, name: "IT" },
  ];

  it("accepts the English keyword", () => {
    expect(isSwitchKeyword("assistants")).toBe(true);
    expect(isSwitchKeyword("assistentes")).toBe(true);
    expect(isSwitchCommand("assistants")).toBe(true);
  });

  it("builds the WhatsApp menu and confirmation in English", () => {
    const menu = buildSwitchMenu({ assistants, activeId: 1, locale: "en" });
    expect(menu.text).toBe(
      "Which assistant would you like to talk to? You're currently with RH.",
    );
    expect(switchConfirmationText(assistants[1], { locale: "en" })).toBe(
      'You\'re now talking to IT. To switch, type "assistants".',
    );
  });

  it("builds the Teams card in English", () => {
    const card = buildAssistantSwitchCard({ assistants, locale: "en" });
    expect(JSON.stringify(card)).toContain(
      "Which assistant would you like to talk to?",
    );
  });
});

describe("AI replies follow the conversation language", () => {
  beforeEach(() => {
    mocks.responsesCreate.mockReset();
    mocks.responsesCreate.mockResolvedValue({ id: "r1", output_text: "ok" });
  });

  const assistant = { id: 3, model: "gpt-4.1", instructions: "Sê simpático." };

  it("adds the language rule after the administrator's instructions", async () => {
    await generateAssistantResponse({
      assistant,
      conversationId: "c1",
      message: "Hi",
      locale: "en",
    });

    const { instructions } = mocks.responsesCreate.mock.calls[0][0];
    expect(instructions.startsWith("Sê simpático.\n\n")).toBe(true);
    expect(instructions).toContain(assistantLanguageRule("en"));
  });

  it("leaves the instructions alone without a language", async () => {
    await generateAssistantResponse({
      assistant,
      conversationId: "c1",
      message: "Olá",
    });

    expect(mocks.responsesCreate.mock.calls[0][0].instructions).toBe(
      "Sê simpático.",
    );
  });
});

describe("opening template per language", () => {
  const base = { BIRD_OPENING_TEMPLATE_PROJECT_ID: "p" };

  it("uses the Portuguese template until the English one is configured", () => {
    const config = getOpeningTemplateConfig(base);
    expect(config.localeEn).toBeNull();
    expect(openingTemplateLocale(config, "en")).toBe("pt-PT");
  });

  it("uses the English template for English speakers once configured", () => {
    const config = getOpeningTemplateConfig({
      ...base,
      BIRD_OPENING_TEMPLATE_LOCALE_EN: " en ",
    });
    expect(openingTemplateLocale(config, "en")).toBe("en");
    expect(openingTemplateLocale(config, "pt")).toBe("pt-PT");
  });

  it("renders the preview in the chosen language", () => {
    expect(
      renderOpeningTemplatePreview({
        name: "Ana",
        orgName: "DIGIK",
        locale: "en",
      }),
    ).toBe(
      "Hi, Ana. Your access to the MyDigitalBot assistant, provided by DIGIK, has been activated. To open it, tap the button below.",
    );
    expect(openingTemplatePreviewFor("en").button).toBe("Open the Assistant");
    expect(openingTemplatePreviewFor("fr")).toBe(
      openingTemplatePreviewFor("pt"),
    );
  });
});

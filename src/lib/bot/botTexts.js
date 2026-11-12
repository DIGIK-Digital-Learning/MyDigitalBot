/**
 * Textos fixos que o bot manda aos colaboradores, em português e em inglês
 * (#241). O que o administrador escreve (perguntas, opções, feedback) não
 * passa por aqui: sai como foi escrito.
 *
 * `{name}` e `{keyword}` são preenchidos por `botText`; `{{certa}}` fica para
 * o preenchimento do feedback do quiz (lib/whatsapp/question.js).
 *
 * Este ficheiro não usa a base de dados nem variáveis de ambiente, por isso
 * também pode ser importado no browser (as sugestões nos campos vazios).
 */

import { DEFAULT_BOT_LOCALE } from "./botLanguage";

export const BOT_TEXTS = {
  pt: {
    /* Perguntas */
    quizCorrect: "Certo! ✅",
    quizIncorrect: "Não é essa. A resposta certa é: {{certa}}",
    surveyThanks: "Obrigado pela tua resposta!",
    questionExpired: "Esta pergunta já não aceita respostas.",
    expectedAnswer: "Resposta esperada:",

    /* Troca de assistente */
    switchKeyword: "assistentes",
    switchQuestion: "Com que assistente queres falar?",
    switchCurrent: "Agora estás com {name}.",
    switchListButton: "Ver assistentes",
    switchReplyWithNumber: "Responde com o número.",
    switchAlreadyActive: "Já estás a falar com {name}.",
    switchSwitched: "Agora estás a falar com {name}.",
    switchHowTo: 'Para trocar, escreve "{keyword}".',
    switchSingle: "Só tens um assistente atribuído.",
    switchSubmit: "Trocar",
    switchSubmitText: "Trocar de assistente",
    switchPersonalOnly:
      "A troca de assistente só está disponível na conversa privada com o bot.",

    /* Quem não está registado */
    whatsappNotRegistered:
      "Este número não se encontra registado, por favor fale com os administradores.",
    teamsNotRegistered:
      "Ainda não estás registado na MyDigitalBot.<br>Pede ao administrador da tua empresa para te adicionar com o email da tua conta Microsoft. Assim que o fizer, ficas ligado automaticamente.",
    teamsTenantNotRegistered:
      "Parece que o teu tenant não está registado e por causa disso não consegues utilizar este serviço.<br>Por favor vai a MyDigitalBot.com e regista a tua organização.",
    teamsTenantNotRegisteredInstall:
      "Este Tenant da Microsoft Teams não está registado em MyDigitalBot. Por favor contacta o teu administrador para registar esta Organização em MyDigitalBot.com.<br>Para mais ajuda escreve --help.",
  },
  en: {
    quizCorrect: "Correct! ✅",
    quizIncorrect: "That's not it. The right answer is: {{certa}}",
    surveyThanks: "Thanks for your answer!",
    questionExpired: "This question no longer accepts answers.",
    expectedAnswer: "Expected answer:",

    switchKeyword: "assistants",
    switchQuestion: "Which assistant would you like to talk to?",
    switchCurrent: "You're currently with {name}.",
    switchListButton: "See assistants",
    switchReplyWithNumber: "Reply with the number.",
    switchAlreadyActive: "You're already talking to {name}.",
    switchSwitched: "You're now talking to {name}.",
    switchHowTo: 'To switch, type "{keyword}".',
    switchSingle: "You only have one assistant assigned.",
    switchSubmit: "Switch",
    switchSubmitText: "Switch assistant",
    switchPersonalOnly:
      "Switching assistants is only available in your private chat with the bot.",

    whatsappNotRegistered:
      "This number isn't registered. Please contact your administrators.",
    teamsNotRegistered:
      "You're not registered in MyDigitalBot yet.<br>Ask your company's administrator to add you with your Microsoft account email. As soon as they do, you'll be connected automatically.",
    teamsTenantNotRegistered:
      "It looks like your tenant isn't registered, so you can't use this service.<br>Please go to MyDigitalBot.com and register your organization.",
    teamsTenantNotRegisteredInstall:
      "This Microsoft Teams tenant isn't registered in MyDigitalBot. Please ask your administrator to register this organization at MyDigitalBot.com.<br>For more help, type --help.",
  },
};

/**
 * Texto `key` na língua `locale` (português se a língua ou o texto não
 * existirem), com `{name}`, `{keyword}`… preenchidos a partir de `values`.
 */
export function botText(locale, key, values = {}) {
  const table = BOT_TEXTS[locale] || BOT_TEXTS[DEFAULT_BOT_LOCALE];
  const text = table[key] ?? BOT_TEXTS[DEFAULT_BOT_LOCALE][key];

  if (text === undefined) {
    throw new Error(`Unknown bot text: ${key}`);
  }

  return text.replace(/(?<!\{)\{(\w+)\}(?!\})/g, (match, name) =>
    values[name] == null ? match : String(values[name]),
  );
}

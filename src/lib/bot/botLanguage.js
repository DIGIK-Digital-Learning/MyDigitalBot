/**
 * Língua em que o bot fala com o colaborador (#241).
 *
 * - O bot começa na língua da organização (a escolhida no topo do site).
 * - Quando o colaborador escreve claramente noutra língua, o bot passa a
 *   responder nessa; fica guardada no colaborador (`user.locale`) para as
 *   mensagens seguintes, até ele voltar a escrever noutra.
 * - Os textos fixos do bot existem em português e em inglês. As respostas do
 *   assistente (IA) seguem a língua da última mensagem, seja qual for.
 *
 * Este ficheiro não usa a base de dados nem variáveis de ambiente.
 */

export const BOT_LOCALES = ["pt", "en"];
export const DEFAULT_BOT_LOCALE = "pt";

const isBotLocale = (value) => BOT_LOCALES.includes(value);

/**
 * Língua das mensagens para este colaborador: a última em que escreveu, senão
 * a da organização, senão português.
 */
export function botLocale({ organization = null, user = null } = {}) {
  if (isBotLocale(user?.locale)) return user.locale;
  if (isBotLocale(organization?.locale)) return organization.locale;
  return DEFAULT_BOT_LOCALE;
}

/* Língua do Teams do colaborador ("en-US", "pt-PT"…), quando não há mais nada. */
export function localeFromTeams(teamsLocale, fallback = DEFAULT_BOT_LOCALE) {
  const value = String(teamsLocale || "").toLowerCase();
  if (value.startsWith("en")) return "en";
  if (value.startsWith("pt")) return "pt";
  return fallback;
}

/*
 * Palavras frequentes que só existem numa das duas línguas. As que existem
 * nas duas («a», «no», «do», «me», «as») ficam de fora, para não enganarem.
 */
const PT_WORDS = new Set(
  `o os e é de da das dos que não nao sim um uma uns umas para com em na nas
  nos ao aos eu tu você voce ele ela nós isto isso este esta está estou estás
  tenho tens tem quero queria posso podes pode preciso como quando onde porque
  porquê qual quais quem obrigado obrigada olá ola bom boa dia tarde noite
  tudo bem muito mais mas também ou se meu minha teu tua já ainda só sobre
  fazer ter ser sei faz favor pelo pela num numa há agora aqui ali então`
    .split(/\s+/)
    .filter(Boolean),
);

const EN_WORDS = new Set(
  `the is are was were i you he she we they it this that what how when where
  why who which can could would should will please thanks thank hello hi hey
  yes my your to and of in on for with have has had am be been not want need
  know help about from there here good morning afternoon evening just also
  but or if an at by get got does did don't i'm it's what's there's`
    .split(/\s+/)
    .filter(Boolean),
);

/* Letras que só aparecem em português (entre as duas línguas). */
const PT_LETTERS = /[ãõçâêôàé]/;

/**
 * Língua de uma mensagem escrita pelo colaborador: "pt", "en" ou null quando
 * não é clara (por exemplo «ok», «1», um nome, ou outra língua qualquer).
 * Só muda a língua guardada quando a mensagem é clara, por isso é preferível
 * dizer null a adivinhar.
 */
export function detectMessageLanguage(text) {
  const clean = String(text || "")
    .toLowerCase()
    .replace(/<[^>]*>/g, " ")
    .replace(/https?:\/\/\S+/g, " ");

  const words = clean.match(/[\p{L}']+/gu) || [];

  let pt = 0;
  let en = 0;

  for (const word of words) {
    if (PT_WORDS.has(word)) pt += 1;
    if (EN_WORDS.has(word)) en += 1;
  }

  if (PT_LETTERS.test(clean)) pt += 2;

  if (pt >= 2 && pt >= en * 2) return "pt";
  if (en >= 2 && en >= pt * 2) return "en";
  return null;
}

/* Como se diz a língua nas instruções à IA. */
export const LANGUAGE_NAMES = {
  pt: "português de Portugal",
  en: "inglês",
};

/**
 * Regra de língua acrescentada às instruções do assistente: responde na
 * língua em que o colaborador escreveu; se não der para perceber, na língua
 * em que o bot está a falar com ele.
 */
export function assistantLanguageRule(locale) {
  const fallback = LANGUAGE_NAMES[locale] || LANGUAGE_NAMES[DEFAULT_BOT_LOCALE];

  return (
    "Língua da resposta: responde na mesma língua em que o colaborador " +
    "escreveu a última mensagem, mesmo que estas instruções estejam noutra " +
    `língua. Se a língua da mensagem não for clara (por exemplo «ok» ou um ` +
    `número), responde em ${fallback}.`
  );
}

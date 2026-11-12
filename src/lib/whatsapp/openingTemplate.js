/**
 * Template de abertura da janela de 24h.
 *
 * O template DigikBot tem texto fixo e recebe apenas "nome" e "empresa".
 * A pré-visualização nas Definições reproduz o texto publicado na Bird.
 * Os helpers do corpo antigo mantêm-se para compatibilidade com as
 * configurações e os pedidos de broadcast já guardados.
 *
 * Este ficheiro não lê variáveis de ambiente fora de getOpeningTemplateConfig,
 * por isso pode ser importado tanto no servidor como no browser.
 */

export const OPENING_TEMPLATE_VARIABLES = {
  name: "nome",
  company: "empresa",
  body: "mensagem",
};

/*
 * O texto publicado na Bird, em cada língua do template (#241). A versão em
 * inglês tem de ser criada no mesmo projeto do Bird, com as mesmas variáveis
 * ({{nome}} e {{empresa}}), e aprovada pela Meta.
 */
export const OPENING_TEMPLATE_PREVIEWS = {
  pt: {
    text: "Olá, {{nome}}. O teu acesso ao assistente MyDigitalBot, disponibilizado por {{empresa}}, foi ativado. Para o abrir, toca no botão abaixo.",
    button: "Aceder ao Assistente",
  },
  en: {
    text: "Hi, {{nome}}. Your access to the MyDigitalBot assistant, provided by {{empresa}}, has been activated. To open it, tap the button below.",
    button: "Open the Assistant",
  },
};

export const OPENING_TEMPLATE_PREVIEW = OPENING_TEMPLATE_PREVIEWS.pt;

export function openingTemplatePreviewFor(locale) {
  return OPENING_TEMPLATE_PREVIEWS[locale] || OPENING_TEMPLATE_PREVIEWS.pt;
}

export const OPENING_TEMPLATE_INTRO =
  "Olá {{nome}}!\n\nDesejas receber comunicações da {{empresa}}?";

export const OPENING_TEMPLATE_OUTRO =
  "Confirma a tua escolha clicando no botão abaixo.";

export const OPENING_TEMPLATE_BUTTON = "Aceito";

export const DEFAULT_OPENING_BODY =
  "Com isto, garantimos que recebes atempadamente todas as comunicações essenciais e informações úteis para ti";

/*
 * A Meta limita o corpo de um template a 1024 caracteres, já com as
 * variáveis preenchidas. O início e o fim ocupam cerca de 130, por isso
 * este limite deixa margem para nomes de organização compridos.
 */
export const OPENING_BODY_MAX_LENGTH = 600;

/**
 * Normaliza o corpo escrito pelo owner. Os valores de variáveis WhatsApp não
 * podem ter quebras de linha, tabulações nem sequências longas de espaços,
 * por isso todo o espaço em branco passa a um único espaço.
 */
export function sanitizeOpeningBody(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Devolve o corpo a usar: o da organização, ou o texto por omissão quando a
 * organização ainda não definiu nenhum.
 */
export function resolveOpeningBody(orgBody) {
  const clean = sanitizeOpeningBody(orgBody);
  return clean || DEFAULT_OPENING_BODY;
}

function fill(text, values) {
  return String(text).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) =>
    values[key] == null ? "" : String(values[key]),
  );
}

export function renderOpeningTemplatePreview({
  name,
  orgName,
  locale = "pt",
} = {}) {
  return fill(openingTemplatePreviewFor(locale).text, {
    [OPENING_TEMPLATE_VARIABLES.name]: name || "",
    [OPENING_TEMPLATE_VARIABLES.company]: orgName || "",
  });
}

/**
 * Renderização do editor antigo, mantida para compatibilidade.
 * O template atual usa renderOpeningTemplatePreview nas Definições.
 */
export function renderOpeningMessage({ name, orgName, body } = {}) {
  const values = {
    [OPENING_TEMPLATE_VARIABLES.name]: name || "",
    [OPENING_TEMPLATE_VARIABLES.company]: orgName || "",
  };

  return [
    fill(OPENING_TEMPLATE_INTRO, values),
    resolveOpeningBody(body),
    OPENING_TEMPLATE_OUTRO,
  ].join("\n\n");
}

/**
 * Parâmetros do template no formato "chave=valor" esperado pelo envio ao
 * Bird, pela ordem das variáveis do template.
 */
export function buildOpeningTemplateParams({ userName, orgName } = {}) {
  return [
    `${OPENING_TEMPLATE_VARIABLES.name}=${userName || ""}`,
    `${OPENING_TEMPLATE_VARIABLES.company}=${orgName || ""}`,
  ];
}

/**
 * Configuração do template no Bird. Só para o servidor.
 *
 * O id guardado é o do projeto, que é estável; cada edição no Bird cria uma
 * nova versão, e o envio pede sempre a mais recente.
 *
 * `localeEn` (#241) é a língua da versão em inglês no Bird (ex.: "en"). Só
 * se preenche BIRD_OPENING_TEMPLATE_LOCALE_EN depois de a Meta aprovar essa
 * versão; até lá, todos recebem a portuguesa.
 */
export function getOpeningTemplateConfig(env = process.env) {
  const projectId = String(env.BIRD_OPENING_TEMPLATE_PROJECT_ID || "").trim();

  if (!projectId) {
    const error = new Error(
      "Missing BIRD_OPENING_TEMPLATE_PROJECT_ID: the WhatsApp opening template is not configured",
    );
    error.status = 500;
    throw error;
  }

  return {
    projectId,
    locale: String(env.BIRD_OPENING_TEMPLATE_LOCALE || "pt-PT").trim(),
    localeEn: String(env.BIRD_OPENING_TEMPLATE_LOCALE_EN || "").trim() || null,
  };
}

/**
 * A língua do template a pedir ao Bird para um colaborador: a inglesa quando
 * o bot fala inglês com ele e essa versão já está configurada; senão a de
 * sempre.
 */
export function openingTemplateLocale(config, language) {
  return language === "en" && config?.localeEn ? config.localeEn : config.locale;
}

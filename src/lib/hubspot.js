// Envia os pedidos de demonstração do site para o HubSpot da DIGIK.
// A API de formulários do HubSpot é pública: só precisa do portal e do GUID
// do formulário, que não são segredos (não há chave nem token).
// Formulário "MyDigitalBot – Pedir demonstração", criado a 09-11-2026.
const HUBSPOT_PORTAL_ID = process.env.HUBSPOT_PORTAL_ID || "144852515";
const HUBSPOT_FORM_GUID =
  process.env.HUBSPOT_MDB_FORM_GUID || "41611c10-0526-49f6-99bc-85581861eb47";
const HUBSPOT_FORMS_URL =
  "https://api-eu1.hsforms.com/submissions/v3/integration/submit";

// Valores aceites pelo campo dgk_plano_mdb (iguais aos ids de pricing/plans.js).
const PLAN_IDS = new Set(["free", "team", "business", "organization", "enterprise"]);

const CONSENT_TEXT =
  "Ao enviar, aceita que a DIGIK use estes dados para responder ao seu pedido.";

// Em desenvolvimento não envia nada para o CRM (só escreve na consola),
// a não ser que HUBSPOT_SEND=true. Em produção envia sempre.
function shouldSend() {
  if (process.env.HUBSPOT_SEND === "true") return true;
  if (process.env.HUBSPOT_SEND === "false") return false;
  return process.env.NODE_ENV === "production";
}

function cleanUtm(value) {
  const text = String(value ?? "").trim().toLowerCase();
  return /^[a-z0-9._~+-]{1,100}$/.test(text) ? text : "";
}

function cleanPath(value) {
  const text = String(value ?? "").trim();
  return /^\/[A-Za-z0-9\-._~/%]{0,200}$/.test(text) ? text : "";
}

function cleanUrl(value) {
  try {
    const url = new URL(String(value ?? ""));
    return url.protocol === "https:" || url.protocol === "http:" ? url.href.slice(0, 500) : "";
  } catch {
    return "";
  }
}

export async function sendDemoRequestToHubspot({
  name,
  email,
  company,
  message,
  plan,
  origem,
  pageUri,
  pageName,
}) {
  const fields = [
    { name: "firstname", value: name },
    { name: "email", value: email },
    { name: "company", value: company || "" },
    { name: "message", value: message },
    { name: "dgk_origem_pedido", value: "mydigitalbot" },
    { name: "dgk_plano_mdb", value: PLAN_IDS.has(plan) ? plan : "sem_plano" },
    { name: "utm_source", value: cleanUtm(origem?.utm_source) },
    { name: "utm_medium", value: cleanUtm(origem?.utm_medium) },
    { name: "utm_campaign", value: cleanUtm(origem?.utm_campaign) },
    { name: "pagina_entrada", value: cleanPath(origem?.entrada) },
  ].filter((field) => field.value !== "");

  const context = {};
  const uri = cleanUrl(pageUri);
  if (uri) context.pageUri = uri;
  if (pageName) context.pageName = String(pageName).slice(0, 200);

  const body = {
    fields,
    context,
    legalConsentOptions: {
      consent: { consentToProcess: true, text: CONSENT_TEXT },
    },
  };

  if (!shouldSend()) {
    console.info("[hubspot] não enviado (desenvolvimento):", JSON.stringify(body));
    return { status: "skipped" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(
      `${HUBSPOT_FORMS_URL}/${HUBSPOT_PORTAL_ID}/${HUBSPOT_FORM_GUID}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("[hubspot] erro", response.status, text.slice(0, 500));
      return { status: "error", code: response.status };
    }

    return { status: "ok" };
  } catch (error) {
    console.error("[hubspot] falhou:", error?.message || error);
    return { status: "error" };
  } finally {
    clearTimeout(timer);
  }
}

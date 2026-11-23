// Planos do MyDigitalBot: fonte única para a página de preços, a secção de
// preços da homepage e o formulário de contacto (?plano=<id>).
// Valores de MyDigitalBot\Planos e Preços\MDB_Planos_SIMPLE.xlsx (folha
// "Serviços (editavel)", tabela Planos). Preço mensal, sem IVA.
export const PLANS = [
  { id: "free", users: 3, price: 0, dailyMessages: 5 },
  { id: "team", users: 100, price: 299, dailyMessages: 10 },
  { id: "business", users: 500, price: 899, dailyMessages: 10 },
  { id: "organization", users: 1000, price: 1599, dailyMessages: 10 },
  { id: "enterprise", users: 5000, price: 6990, dailyMessages: 10 },
];

// Plano destacado na página de preços (primeiro plano pago).
export const FEATURED_PLAN_ID = "team";

export function getPlan(id) {
  return PLANS.find((plan) => plan.id === id) ?? null;
}

const NUMBER_LOCALES = { pt: "pt-PT", en: "en-GB" };

function numberLocale(locale) {
  return NUMBER_LOCALES[locale] ?? NUMBER_LOCALES.pt;
}

export function formatPrice(value, locale, { decimals = 0 } = {}) {
  return new Intl.NumberFormat(numberLocale(locale), {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: "always",
  }).format(value);
}

// Preço equivalente por colaborador e mês (ex.: 299 € / 100 = 2,99 €).
// O plano é um preço fixo para a equipa; isto só serve de comparação.
export function pricePerUser(plan) {
  return plan.users > 0 ? plan.price / plan.users : 0;
}

export function formatCount(value, locale) {
  // pt-PT só agrupa a partir de 5 dígitos; forçamos o separador em 1000/5000.
  return new Intl.NumberFormat(numberLocale(locale), {
    useGrouping: "always",
  }).format(value);
}

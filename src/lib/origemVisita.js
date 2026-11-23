// Origem da visita (UTMs + página de entrada), guardada no sessionStorage
// para seguir com o pedido de demonstração. Primeiro toque: só é substituída
// se a origem guardada não tinha campanha e a visita nova traz UTMs.
// Fica só nesta sessão do browser e não é um cookie.
const KEY = "mdb_origem";
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign"];

export function guardarOrigemVisita() {
  if (typeof window === "undefined") return;

  try {
    const params = new URLSearchParams(window.location.search);
    const nova = { entrada: window.location.pathname };
    UTM_KEYS.forEach((key) => {
      const value = params.get(key);
      if (value) nova[key] = value.slice(0, 100);
    });

    const atual = lerOrigemVisita();
    const novaTemCampanha = UTM_KEYS.some((key) => nova[key]);
    const atualTemCampanha = atual && UTM_KEYS.some((key) => atual[key]);

    if (!atual || (novaTemCampanha && !atualTemCampanha)) {
      window.sessionStorage.setItem(KEY, JSON.stringify(nova));
    }
  } catch {
    // sessionStorage bloqueado (modo privado, etc.): segue sem origem.
  }
}

export function lerOrigemVisita() {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

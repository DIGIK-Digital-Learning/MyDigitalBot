import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// O vitest não lê o .env.local. Alguns módulos criam o cliente admin do
// Supabase ao serem importados e falham sem estas variáveis. Valores falsos
// chegam, porque os testes mockam o @supabase/supabase-js ou os repos. O `??=`
// mantém valores reais exportados na shell (ex.: testes de integração).
process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

/* A mesma função em todos os renders, como no next-intl real. Uma função nova
   a cada render muda as dependências dos efeitos que usam `t` e pode pôr a
   página em ciclo infinito (a de Utilizadores rebentava o worker). */
const translate = (key, vars) => {
  if (!vars) return key;

  if (Object.prototype.hasOwnProperty.call(vars, "name")) {
    return `${key}:${vars.name}`;
  }

  if (Object.prototype.hasOwnProperty.call(vars, "default")) {
    return vars.default;
  }

  return key;
};

vi.mock("next-intl", () => ({
  useLocale: () => "pt",
  useTranslations: () => translate,
}));

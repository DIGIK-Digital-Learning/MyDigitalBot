import React from "react";
import { act, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/*
 * #247: o Supabase volta a avisar a cada regresso ao separador, sempre com
 * um objeto novo para a mesma pessoa. Se o AuthContext trocasse o objeto,
 * a app relia a organização e as páginas por trás das permissões
 * desapareciam e voltavam, perdendo o que estava escrito.
 */

const supabase = vi.hoisted(() => ({
  listener: null,
  session: null,
}));

/* No browser, o cliente do Supabase é sempre o mesmo objeto. */
vi.mock("@/utils/supabase/client", () => {
  const client = {
    auth: {
      getSession: async () => ({ data: { session: supabase.session } }),
      onAuthStateChange: (callback) => {
        supabase.listener = callback;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  };
  return { createClient: () => client };
});

import { AuthProvider, sameUser, useAuth } from "@/app/AuthContext";

const ANA = {
  id: "u1",
  email: "ana@exemplo.pt",
  updated_at: "2026-11-25T10:00:00Z",
  last_sign_in_at: "2026-11-25T09:00:00Z",
};

describe("sameUser", () => {
  it("a mesma conta num objeto novo é a mesma", () => {
    expect(sameUser(ANA, { ...ANA, aud: "authenticated" })).toBe(true);
  });

  it("outra conta, outro email ou um novo login não é", () => {
    expect(sameUser(ANA, { ...ANA, id: "u2" })).toBe(false);
    expect(sameUser(ANA, { ...ANA, email: "outra@exemplo.pt" })).toBe(false);
    expect(sameUser(ANA, { ...ANA, last_sign_in_at: "2026-11-26T09:00:00Z" })).toBe(false);
  });

  it("sem sessão dos dois lados é igual; de um lado só, não", () => {
    expect(sameUser(null, null)).toBe(true);
    expect(sameUser(null, ANA)).toBe(false);
    expect(sameUser(ANA, null)).toBe(false);
  });
});

describe("AuthProvider", () => {
  it("o regresso ao separador não troca o utilizador; sair e entrar troca", async () => {
    supabase.session = { user: ANA };
    const seen = [];

    function Probe() {
      const { user } = useAuth();
      seen.push(user);
      return null;
    }

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await act(async () => {});

    const first = seen.at(-1);
    expect(first).toBe(ANA);
    const renders = seen.length;

    await act(async () => supabase.listener("SIGNED_IN", { user: { ...ANA } }));
    await act(async () => supabase.listener("TOKEN_REFRESHED", { user: { ...ANA } }));
    expect(seen.at(-1)).toBe(first);
    expect(seen.length).toBe(renders);

    await act(async () => supabase.listener("SIGNED_OUT", null));
    expect(seen.at(-1)).toBeNull();

    const other = { ...ANA, id: "u2" };
    await act(async () => supabase.listener("SIGNED_IN", { user: other }));
    expect(seen.at(-1)).toBe(other);
  });
});

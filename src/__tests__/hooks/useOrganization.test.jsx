import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

/*
 * O aviso falso "Organização em falta": as páginas avisavam quando
 * `loading` era false e `org` null. Isto acontecia enquanto a sessão ainda
 * não tinha chegado, e no instante em que o utilizador chegava, antes de a
 * organização ser lida.
 */

const mocks = vi.hoisted(() => ({
  auth: { loading: true },
  single: vi.fn(),
}));

vi.mock("@/app/AuthContext", () => ({
  useAuth: () => mocks.auth,
}));

vi.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: mocks.single }) }),
    }),
  }),
}));

vi.mock("@/lib/helpers/theme.helpers", () => ({
  applyThemeVariables: vi.fn(),
}));

import useOrganization from "@/app/hooks/useOrganization";

const ORG = { id: 7, name: "DIGIK" };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth = { loading: true };
  mocks.single.mockResolvedValue({ data: ORG, error: null });
});

describe("useOrganization", () => {
  it("enquanto a sessão não chegou, está a carregar (não há aviso)", () => {
    const { result } = renderHook(() => useOrganization(null));

    expect(result.current).toMatchObject({ org: null, loading: true });
  });

  it("quando o utilizador chega, continua a carregar até a organização ser lida", async () => {
    const { result, rerender } = renderHook(({ user }) => useOrganization(user), {
      initialProps: { user: null },
    });

    let resolveOrg;
    mocks.single.mockReturnValue(new Promise((resolve) => (resolveOrg = resolve)));
    mocks.auth = { loading: false };
    rerender({ user: { id: "u1" } });

    /* O instante que antes dava loading false e org null. */
    expect(result.current).toMatchObject({ org: null, loading: true });

    resolveOrg({ data: ORG, error: null });

    await waitFor(() =>
      expect(result.current).toMatchObject({ org: ORG, loading: false }),
    );
  });

  it("sem sessão (depois de carregar) não está a carregar e não há organização", () => {
    mocks.auth = { loading: false };

    const { result } = renderHook(() => useOrganization(null));

    expect(result.current).toMatchObject({ org: null, loading: false });
  });

  it("sem organização para este utilizador, deixa de carregar com org null", async () => {
    mocks.auth = { loading: false };
    mocks.single.mockResolvedValue({ data: null, error: { message: "nada" } });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const { result } = renderHook(() => useOrganization({ id: "u2" }));

    await waitFor(() =>
      expect(result.current).toMatchObject({ org: null, loading: false }),
    );
  });
});

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * #242: o administrador muda o plano da própria organização no Admin e a
 * faixa da Demo só mudava com F5. Os limites passam a ser pedidos outra vez
 * quando chega o aviso de que o plano mudou.
 */

const mocks = vi.hoisted(() => ({ fetchPlanLimits: vi.fn() }));

vi.mock("@/lib/plans/plans.api", () => ({
  fetchPlanLimits: mocks.fetchPlanLimits,
}));

import usePlanLimits from "@/app/hooks/usePlanLimits";
import {
  ADMIN_PLAN_CHANGED_EVENT,
  announceAdminPlanChanged,
} from "@/lib/admin/admin.api";

const demo = {
  plan: { name: "Demo" },
  expiresAt: "2026-11-18T23:59:59Z",
  expired: false,
};
const starter = { plan: { name: "Starter" }, expiresAt: null, expired: false };

describe("usePlanLimits", () => {
  beforeEach(() => {
    mocks.fetchPlanLimits.mockReset();
  });

  it("volta a pedir os limites quando o administrador muda o plano", async () => {
    mocks.fetchPlanLimits
      .mockResolvedValueOnce(starter)
      .mockResolvedValueOnce(demo);

    const { result } = renderHook(() => usePlanLimits(188));
    await waitFor(() => expect(result.current.plan?.name).toBe("Starter"));
    expect(result.current.expiresAt).toBeNull();

    act(() => announceAdminPlanChanged());

    await waitFor(() => expect(result.current.plan?.name).toBe("Demo"));
    expect(result.current.expiresAt).toBe(demo.expiresAt);
    expect(mocks.fetchPlanLimits).toHaveBeenCalledTimes(2);
  });

  it("deixa de escutar quando o ecrã sai", async () => {
    mocks.fetchPlanLimits.mockResolvedValue(starter);
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { result, unmount } = renderHook(() => usePlanLimits(188));
    await waitFor(() => expect(result.current.plan?.name).toBe("Starter"));
    unmount();

    expect(removeSpy).toHaveBeenCalledWith(
      ADMIN_PLAN_CHANGED_EVENT,
      expect.any(Function),
    );
    act(() => announceAdminPlanChanged());
    expect(mocks.fetchPlanLimits).toHaveBeenCalledTimes(1);
    removeSpy.mockRestore();
  });
});

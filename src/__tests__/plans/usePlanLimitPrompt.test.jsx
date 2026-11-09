import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const confirmMock = vi.hoisted(() => vi.fn());
const pushMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/components/Confirm/ConfirmProvider", () => ({
  useConfirm: () => confirmMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

import usePlanLimitPrompt from "@/app/hooks/usePlanLimitPrompt";

function prompt() {
  return renderHook(() => usePlanLimitPrompt()).result.current;
}

describe("usePlanLimitPrompt", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["USER_LIMIT_REACHED", "usersTitle", "users"],
    ["ASSISTANT_LIMIT_REACHED", "assistantsTitle", "assistants"],
  ])("%s: aviso com título próprio e o botão Atualizar plano", async (code, title, message) => {
    confirmMock.mockResolvedValue(false);

    const handled = await prompt()({ code, plan: "Demo", limit: 3 });

    expect(handled).toBe(true);
    expect(confirmMock).toHaveBeenCalledWith({
      title,
      message,
      confirmText: "upgrade",
      cancelText: "later",
    });
  });

  it("Atualizar plano leva à página de preços", async () => {
    confirmMock.mockResolvedValue(true);

    await prompt()({ code: "USER_LIMIT_REACHED", plan: "Demo", limit: 3 });

    expect(pushMock).toHaveBeenCalledWith("/pt/pricing");
  });

  it("Agora não fica na página", async () => {
    confirmMock.mockResolvedValue(false);

    await prompt()({ code: "USER_LIMIT_REACHED", plan: "Demo", limit: 3 });

    expect(pushMock).not.toHaveBeenCalled();
  });

  it("sem plano e máximo, usa o texto geral", async () => {
    confirmMock.mockResolvedValue(false);

    await prompt()({ code: "USER_LIMIT_REACHED", plan: null, limit: null });

    expect(confirmMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: "usersNoDetail" }),
    );
  });

  it("outro erro não é de limite: não mostra nada e devolve false", async () => {
    const handled = await prompt()({ error: "duplicate key" });

    expect(handled).toBe(false);
    expect(confirmMock).not.toHaveBeenCalled();
  });
});

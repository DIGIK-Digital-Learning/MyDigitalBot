import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * #247 no ecrã: o que não se pode usar fica cinzento com a razão ao passar
 * o rato; as páginas sem «Ver» mostram um aviso no lugar dos dados.
 */

const mocks = vi.hoisted(() => ({ fetchAccess: vi.fn() }));

vi.mock("next-intl", () => ({
  useTranslations: (ns) => (key) => `${ns}.${key}`,
}));
vi.mock("@/app/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/app/hooks/useOrganization", () => ({
  default: () => ({ org: { id: 188 } }),
}));
vi.mock("@/lib/organizations/organizations.api", () => ({
  fetchAccess: mocks.fetchAccess,
  changeViewAs: vi.fn(),
}));

import usePermissions, { PermissionsProvider } from "@/app/PermissionsContext";
import PermissionGate from "@/app/components/PermissionGate/PermissionGate";
import { PERMISSIONS, SYSTEM_TYPE_PERMISSIONS } from "@/lib/auth/permissions";

const VIEWER = {
  typeKey: "viewer",
  isAdmin: false,
  permissions: SYSTEM_TYPE_PERMISSIONS.viewer,
  viewAs: null,
  canSwitch: false,
  viewAsTypes: [],
};

function SendButton() {
  const { can, lock } = usePermissions();
  return (
    <button
      type="button"
      disabled={!can(PERMISSIONS.SEND_TEAMS)}
      {...lock(PERMISSIONS.SEND_TEAMS)}
    >
      Enviar
    </button>
  );
}

function renderWith(ui) {
  return render(<PermissionsProvider>{ui}</PermissionsProvider>);
}

beforeEach(() => vi.clearAllMocks());

describe("botões sem permissão", () => {
  it("o Leitor vê o Enviar cinzento, com a razão ao passar o rato", async () => {
    mocks.fetchAccess.mockResolvedValue(VIEWER);
    renderWith(<SendButton />);

    const button = screen.getByRole("button", { name: "Enviar" });
    await waitFor(() => expect(button).toBeDisabled());

    expect(button).toHaveAttribute("data-permission-denied");
    expect(button).toHaveAttribute("title", "Permissions.denied");
  });

  it("o Administrador vê o Enviar normal", async () => {
    mocks.fetchAccess.mockResolvedValue({ ...VIEWER, isAdmin: true, typeKey: "admin" });
    renderWith(<SendButton />);

    await waitFor(() => expect(mocks.fetchAccess).toHaveBeenCalledWith(188));
    const button = screen.getByRole("button", { name: "Enviar" });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute("data-permission-denied");
  });

  it("fora da app (sem o contexto) não bloqueia nada", () => {
    render(<SendButton />);
    expect(screen.getByRole("button", { name: "Enviar" })).toBeEnabled();
  });
});

describe("páginas sem «Ver»", () => {
  it("mostram o aviso no lugar dos dados", async () => {
    mocks.fetchAccess.mockResolvedValue(VIEWER);
    renderWith(
      <PermissionGate permission={PERMISSIONS.SETTINGS_ORGANIZATION}>
        <p>Dados da organização</p>
      </PermissionGate>,
    );

    await screen.findByTestId("permission-gate");
    expect(screen.getByText("Permissions.noPage.title")).toBeTruthy();
    expect(screen.queryByText("Dados da organização")).toBeNull();
  });

  it("com «Ver», mostram a página", async () => {
    mocks.fetchAccess.mockResolvedValue(VIEWER);
    renderWith(
      <PermissionGate permission={PERMISSIONS.ANALYTICS_VIEW}>
        <p>Métricas</p>
      </PermissionGate>,
    );

    await waitFor(() => expect(mocks.fetchAccess).toHaveBeenCalled());
    expect(screen.getByText("Métricas")).toBeTruthy();
    expect(screen.queryByTestId("permission-gate")).toBeNull();
  });
});

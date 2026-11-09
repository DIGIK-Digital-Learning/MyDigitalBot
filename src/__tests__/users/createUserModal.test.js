import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

import CreateUserModal from "@/app/[locale]/(app)/users/CreateUser";

vi.mock("../../messages/phoneCountryCodes.json", () => ({
  default: [
    { code: "+351", iso2: "pt" },
    { code: "+34", iso2: "es" },
  ],
}));

vi.mock("@/app/components/PillSelect/PillSelect", () => ({
  default: ({ value, options = [], onChange, placeholder }) =>
    React.createElement(
      "select",
      {
        "aria-label": placeholder || "pillselect",
        value: value ?? "",
        onChange: (e) => onChange?.(e.target.value),
      },
      [
        React.createElement("option", { key: "__empty", value: "" }, "-"),
        ...(options || []).map((o) =>
          React.createElement(
            "option",
            { key: String(o.value), value: o.value },
            o.label,
          ),
        ),
      ],
    ),
}));

const mocks = vi.hoisted(() => ({
  onClose: vi.fn(),
  onCreateUser: vi.fn(),
  alert: vi.fn(() => Promise.resolve()),
}));

/* O modal mostra avisos com useAlert, que só existe dentro do AlertProvider. */
vi.mock("@/app/components/Alert/AlertProvider", () => ({
  useAlert: () => mocks.alert,
}));

const ASSISTANTS = [
  { id: "a1", name: "Assistant One" },
  { id: "a2", name: "Assistant Two" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderModal(props = {}) {
  const base = {
    isOpen: true,
    onClose: mocks.onClose,
    onCreateUser: mocks.onCreateUser,
    assistants: ASSISTANTS,
    defaultPhoneCode: "+351",
  };

  return render(React.createElement(CreateUserModal, { ...base, ...props }));
}

describe("CreateUserModal", () => {
  it("renders when open", () => {
    renderModal();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("CreateUserModal.title")).toBeInTheDocument();
  });

  it("calls onClose when pressing Escape", async () => {
    renderModal();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(mocks.onClose).toHaveBeenCalled();
  });

  it("submits and calls onCreateUser with the correct payload, then closes and clears when ok=true", async () => {
    const user = userEvent.setup();
    /* A página devolve { ok } ao modal; só com ok: true é que limpa e fecha. */
    mocks.onCreateUser.mockResolvedValueOnce({ ok: true });

    renderModal();

    await user.type(screen.getByLabelText("CreateUserModal.userName"), "Alice");

    await user.type(screen.getByLabelText("CreateUserModal.email"), "a@a.com");

    /* Os assistentes escolhem-se numa lista de caixas (vários por pessoa). */
    await user.click(screen.getByText("Assistant Two"));

    await user.click(screen.getByRole("button", { name: "WhatsApp" }));
    await user.type(screen.getByPlaceholderText("912 345 678"), "912345678");

    await user.click(screen.getByRole("button", { name: "Microsoft Teams" }));
    await user.type(
      screen.getByPlaceholderText("00000000-0000-0000-0000-000000000000"),
      "00000000-0000-0000-0000-000000000000",
    );
    await user.type(screen.getByPlaceholderText("29:XXXXXXXXXXXX"), "29:ABC");

    await user.click(
      screen.getByRole("button", { name: "CreateUserModal.create" }),
    );

    await waitFor(() => {
      expect(mocks.onCreateUser).toHaveBeenCalledWith({
        userName: "Alice",
        phoneCode: "+351",
        phoneNational: "912345678",
        email: "a@a.com",
        assistantId: "a2",
        assistantIds: ["a2"],
        teamsAadObjectId: "00000000-0000-0000-0000-000000000000",
        teamsFromId: "29:ABC",
      });
    });

    expect(mocks.onClose).toHaveBeenCalled();
  });

  it("does not close/clear when onCreateUser returns false", async () => {
    const user = userEvent.setup();
    mocks.onCreateUser.mockResolvedValueOnce({ ok: false });

    renderModal();

    await user.type(screen.getByLabelText("CreateUserModal.userName"), "Bob");
    await user.click(screen.getByRole("button", { name: "WhatsApp" }));
    await user.type(screen.getByPlaceholderText("912 345 678"), "999");

    await user.click(
      screen.getByRole("button", { name: "CreateUserModal.create" }),
    );

    await waitFor(() => expect(mocks.onCreateUser).toHaveBeenCalled());
    expect(mocks.onClose).not.toHaveBeenCalled();

    expect(screen.getByDisplayValue("Bob")).toBeInTheDocument();
  });
});

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

import QuickActionsBar from "@/app/[locale]/(app)/users/QuickActions/QuickActions";

vi.mock("next-intl", () => ({
  useTranslations: () => (key, vars) =>
    vars && Object.prototype.hasOwnProperty.call(vars, "number")
      ? `${key}:${vars.number}`
      : key,
}));

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  confirm: vi.fn(),
  onDone: vi.fn(),
  clearSelection: vi.fn(),
}));

vi.mock("@/app/components/Confirm/ConfirmProvider", () => ({
  useConfirm: () => mocks.confirm,
}));

function makeResponse(data, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(data),
    text: () =>
      Promise.resolve(typeof data === "string" ? data : JSON.stringify(data)),
  });
}

const ORG_ID = "org_1";
const SELECTED = ["u1", "u2"];

const ASSISTANTS = [
  { id: "a1", name: "Assistant 1" },
  { id: "a2", name: "Assistant 2" },
];

const TAGS = [
  { id: "t1", name: "IT" },
  { id: "t2", name: "HR" },
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.confirm.mockResolvedValueOnce(true);
  mocks.fetch.mockResolvedValue(makeResponse());
  mocks.onDone.mockResolvedValue();

  vi.stubGlobal("fetch", mocks.fetch);

  vi.stubGlobal("innerWidth", 1200);
  vi.stubGlobal("innerHeight", 800);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderBar(props = {}) {
  const base = {
    count: SELECTED.count,
    assistants: ASSISTANTS,
    tags: TAGS,
    selectedIds: SELECTED,
    orgId: ORG_ID,
    onDone: mocks.onDone,
    clearSelection: mocks.clearSelection,
  };

  return render(React.createElement(QuickActionsBar, { ...base, ...props }));
}

describe("QuickActionsBar", () => {
  it("renders and calls clearSelection when clicking clear", async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(
      screen.getByRole("button", { name: "QuickActions.clear" }),
    );

    expect(mocks.clearSelection).toHaveBeenCalled();
  });

  it("bulk sets assistant (PATCH /api/users/bulk) after choosing assistant and Apply", async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(
      screen.getByRole("button", { name: "QuickActions.bulkLabel" }),
    );

    await user.click(screen.getByText("Assistant 2"));

    await user.click(
      screen.getByRole("button", { name: "QuickActions.apply" }),
    );

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledWith(
        "/api/users/bulk",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            ids: SELECTED,
            assistantId: "a2",
            orgId: ORG_ID,
          }),
        }),
      );
    });

    expect(mocks.onDone).toHaveBeenCalled();
  });

  it("bulk adds tags (POST /api/users/bulk-tags)", async () => {
    const user = userEvent.setup();
    renderBar();

    await user.click(screen.getByRole("button", { name: "QuickActions.tag" }));

    await user.click(screen.getByText("IT"));

    await user.click(screen.getByRole("button", { name: "QuickActions.add" }));

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledWith(
        "/api/users/bulk-tags",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });

    const call = mocks.fetch.mock.calls.find(
      (c) => c[0] === "/api/users/bulk-tags",
    );
    const body = JSON.parse(call[1].body);
    expect(body).toEqual({
      ids: SELECTED,
      tagIds: ["t1"],
      op: "add",
      orgId: ORG_ID,
    });

    expect(mocks.onDone).toHaveBeenCalled();
  });

  it("bulk deletes after confirm (DELETE /api/users/bulk) then clears selection", async () => {
    const user = userEvent.setup();
    /* O DELETE responde com o resumo (a barra lê failedCount). Sem corpo, a
       barra rebentava a ler `undefined.failedCount` (Unhandled Rejection). */
    mocks.fetch.mockResolvedValueOnce(
      makeResponse({ ok: true, deleted: 2, failedCount: 0, failed: [] }),
    );
    renderBar();

    await user.click(
      screen.getByRole("button", { name: "QuickActions.delete" }),
    );

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledWith(
        "/api/users/bulk",
        expect.objectContaining({
          method: "DELETE",
          body: JSON.stringify({ ids: SELECTED, orgId: ORG_ID }),
        }),
      );
    });

    expect(mocks.onDone).toHaveBeenCalled();
    expect(mocks.clearSelection).toHaveBeenCalled();
  });

  it("disables tag button when there are no tags", async () => {
    renderBar({ tags: [] });

    const btn = screen.getByRole("button", { name: "QuickActions.tag" });
    expect(btn).toBeDisabled();
  });
});

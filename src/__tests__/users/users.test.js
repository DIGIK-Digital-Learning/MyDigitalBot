import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";

import UsersPage from "@/app/[locale]/(app)/users/page";

const mocks = vi.hoisted(() => ({
  startLoading: vi.fn(),
  stopLoading: vi.fn(),

  useAuth: vi.fn(),
  useOrganization: vi.fn(),

  confirm: vi.fn(),
  alert: vi.fn(() => Promise.resolve()),
  router: { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() },

  fetch: vi.fn(),
}));

/* A página usa usePlanLimitPrompt, que precisa do router do Next, e mostra
   avisos com useAlert, que só existe dentro do AlertProvider. O router é
   sempre o mesmo objeto, como no Next, para não mudar as dependências dos
   efeitos a cada render. */
vi.mock("next/navigation", () => ({
  useRouter: () => mocks.router,
  usePathname: () => "/pt/users",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/app/components/Alert/AlertProvider", () => ({
  useAlert: () => mocks.alert,
}));

vi.mock("@/app/LoadingScreen/GlobalLoaderContext", () => ({
  useGlobalLoader: () => ({
    startLoading: mocks.startLoading,
    stopLoading: mocks.stopLoading,
  }),
}));

vi.mock("@/app/AuthContext.jsx", () => ({
  useAuth: () => mocks.useAuth(),
}));

vi.mock("@/app/hooks/useOrganization", () => ({
  default: (...args) => mocks.useOrganization(...args),
}));

vi.mock("@/app/components/Confirm/ConfirmProvider", () => ({
  useConfirm: () => mocks.confirm,
}));

vi.mock("@/app/[locale]/(app)/users/CreateUser", () => ({
  default: (props) =>
    props?.isOpen
      ? React.createElement(
          "div",
          { "data-testid": "create-user-modal" },
          "CreateUserModal",
        )
      : null,
}));

vi.mock("@/app/[locale]/(app)/users/ManageTagsModal/ManageTagsModal", () => ({
  default: (props) =>
    props?.isOpen
      ? React.createElement(
          "div",
          { "data-testid": "manage-tags-modal" },
          "ManageTagsModal",
        )
      : null,
}));

vi.mock("@/app/[locale]/(app)/users/EditUserModal", () => ({
  default: (props) =>
    props?.open
      ? React.createElement(
          "div",
          { "data-testid": "edit-user-modal" },
          "EditUserModal",
        )
      : null,
}));

vi.mock("@/app/[locale]/(app)/users/ViewUserModal", () => ({
  default: (props) =>
    props?.open
      ? React.createElement(
          "div",
          { "data-testid": "view-user-modal" },
          "ViewUserModal",
        )
      : null,
}));

vi.mock("@/app/[locale]/(app)/users/FilterMenu", () => ({
  default: (props) =>
    props?.open
      ? React.createElement(
          "div",
          { "data-testid": "filter-menu" },
          "FilterMenu",
        )
      : null,
}));

vi.mock("@/app/[locale]/(app)/users/QuickActions/QuickActions", () => ({
  default: (props) =>
    props?.count > 0
      ? React.createElement(
          "div",
          { "data-testid": "quick-actions-bar" },
          `QuickActionsBar:${props.count}`,
        )
      : null,
}));

vi.mock("@/app/components/PillSelect/PillSelect", () => ({
  default: ({ value, options = [], onChange }) =>
    React.createElement(
      "select",
      {
        "aria-label": "assistant-select",
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

const ORG_ID = "org_1";
const USERS_LIST_URL = `/api/users?orgId=${ORG_ID}&page=1&pageSize=100`;

const ASSISTANTS = [
  { id: "a1", name: "Assistant One" },
  { id: "a2", name: "Assistant Two" },
];

const TAGS = [
  { id: "t1", name: "VIP" },
  { id: "t2", name: "New" },
];

const USERS_INITIAL = [
  {
    id: "u1",
    name: "Alice",
    email: "alice@example.com",
    phone_country_code: "+351",
    phone_national: "912345678",
    tag_names: ["VIP"],
    tag_ids: ["t1"],
    assistant_id: "a1",
    organization_id: ORG_ID,
  },
  {
    id: "u2",
    name: "Bob",
    email: "bob@example.com",
    phone_country_code: "+351",
    phone_national: "987654321",
    tag_names: [],
    tag_ids: [],
    assistant_id: "a2",
    organization_id: ORG_ID,
  },
];

function makeResponse(data, ok = true) {
  return Promise.resolve({
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(data),
    text: () =>
      Promise.resolve(typeof data === "string" ? data : JSON.stringify(data)),
  });
}

let usersDb = [];

beforeEach(() => {
  vi.clearAllMocks();

  localStorage.clear();
  localStorage.setItem("usersView", "list");

  /* O jsdom não tem matchMedia; a página usa-o para encurtar as tags. */
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn((query) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });

  mocks.useAuth.mockReturnValue({
    user: { id: "auth_user_1 " },
    loading: false,
  });

  mocks.useOrganization.mockReturnValue({
    org: { id: ORG_ID, default_phone_country_code: "+351" },
    loading: false,
  });

  mocks.confirm.mockResolvedValue(true);

  usersDb = [...USERS_INITIAL];

  mocks.fetch.mockImplementation((input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    const method = (init?.method || "GET").toUpperCase();

    /* A lista é paginada: devolve { items, total }. */
    if (url === USERS_LIST_URL && method === "GET") {
      return makeResponse({ items: usersDb, total: usersDb.length });
    }

    if (url === `/api/assistants?orgId=${ORG_ID}` && method === "GET") {
      return makeResponse(ASSISTANTS);
    }

    if (url === `/api/tags?orgId=${ORG_ID}` && method === "GET") {
      return makeResponse(TAGS);
    }

    if (url.startsWith("/api/users?id=") && method === "DELETE") {
      const id = url.split("id=")[1];
      usersDb = usersDb.filter((u) => u.id !== id);
      return makeResponse({});
    }

    return makeResponse({});
  });

  vi.stubGlobal("fetch", mocks.fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("UsersPage", () => {
  it("loads users/assistants/tags on mount and renders user rows", async () => {
    render(React.createElement(UsersPage));

    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("alice@example.com")).toBeInTheDocument();

    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("bob@example.com")).toBeInTheDocument();

    expect(mocks.fetch).toHaveBeenCalledWith(USERS_LIST_URL);
    expect(mocks.fetch).toHaveBeenCalledWith(`/api/assistants?orgId=${ORG_ID}`);
    expect(mocks.fetch).toHaveBeenCalledWith(`/api/tags?orgId=${ORG_ID}`);

    expect(mocks.startLoading).toHaveBeenCalled();
    await waitFor(() => expect(mocks.stopLoading).toHaveBeenCalled());
  });

  it("filters the list by search text", async () => {
    const user = userEvent.setup();
    render(React.createElement(UsersPage));

    await screen.findByText("Alice");

    const search = screen.getByLabelText("Users.searchPlaceholder");
    await user.type(search, "bob");

    expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("toggle-all checkbox selects and unselects all visible rows", async () => {
    const user = userEvent.setup();
    render(React.createElement(UsersPage));

    await screen.findByText("Alice");

    const checkboxes = screen.getAllByRole("checkbox");
    const header = checkboxes[0];
    const rowBoxes = checkboxes.slice(1);

    fireEvent.click(header);
    rowBoxes.forEach((cb) => expect(cb).toBeChecked());

    fireEvent.click(header);
    rowBoxes.forEach((cb) => expect(cb).not.toBeChecked());
  });

  it("deletes a user after confirmation and refreshes the list", async () => {
    const user = userEvent.setup();
    render(React.createElement(UsersPage));

    expect(await screen.findByText("Alice")).toBeInTheDocument();

    const deleteButtons = screen.getAllByRole("button", {
      name: "Users.row.delete",
    });

    // Click delete on first row (Alice)
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(mocks.confirm).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledWith("/api/users?id=u1", {
        method: "DELETE",
      });
    });

    // After refreshUsers, Alice should disappear (because our mock "DB" removes her)
    await waitFor(() => {
      expect(screen.queryByText("Alice")).not.toBeInTheDocument();
    });

    expect(screen.getByText("Bob")).toBeInTheDocument();
  });

  it("opens the create user modal when clicking the new user button", async () => {
    const user = userEvent.setup();
    render(React.createElement(UsersPage));

    await screen.findByText("Alice");

    /* "Novo utilizador" abre um menu (criar um ou importar CSV). */
    fireEvent.click(
      screen.getByRole("button", {
        name: "Users.newUser",
      }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", {
        name: "Users.newUser",
      }),
    );

    expect(screen.getByTestId("create-user-modal")).toBeInTheDocument();
  });
});

// src/app/[locale]/(app)/users/page.js
"use client";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import styles from "./users.module.css";
import CreateUserModal from "./CreateUser";
import ImportUsersModal from "./ImportUsersModal/ImportUsersModal";
import { useGlobalLoader } from "@/app/LoadingScreen/GlobalLoaderContext";
import ManageTagsModal from "./ManageTagsModal/ManageTagsModal";
import EditUserModal from "./EditUserModal";
import ViewUserModal from "./ViewUserModal"; // ← NEW
import PillSelect from "@/app/components/PillSelect/PillSelect";
import {
  MoreHorizontal,
  Eye,
  Pencil,
  Trash2,
  Plus,
  Tag,
  Filter,
  Upload,
  ChevronDown,
} from "lucide-react";
import useOrganization from "@/app/hooks/useOrganization";
import { useAuth } from "@/app/AuthContext.jsx";
import { useConfirm } from "@/app/components/Confirm/ConfirmProvider";
import usePlanLimitPrompt from "@/app/hooks/usePlanLimitPrompt";
import usePlanLimits from "@/app/hooks/usePlanLimits";
import useCollaboratorWeeklyUsage from "@/app/hooks/useCollaboratorWeeklyUsage";
import UsageCounter from "@/app/components/UsageCounter/UsageCounter";
import { useAlert } from "@/app/components/Alert/AlertProvider";
import FilterMenu from "./FilterMenu";
import QuickActionsBar from "./QuickActions/QuickActions";

function initial(name = "") {
  return (name.trim()[0] || "?").toUpperCase();
}

export default function UsersPage() {
  const translation = useTranslations();
  const { user, loading: authLoading } = useAuth();
  const { org, loading: orgLoading } = useOrganization(user);

  const [users, setUsers] = useState([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(new Set());
  const [assistantsList, setAssistantsList] = useState([]);

  // filters
  const [allTags, setAllTags] = useState([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterBtnRef = useRef(null);
  const [selectedTagIds, setSelectedTagIds] = useState([]);
  const [selectedAssistantIds, setSelectedAssistantIds] = useState([]);

  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const createMenuRef = useRef(null);

  // UI state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isTagsOpen, setIsTagsOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const [isImportOpen, setIsImportOpen] = useState(false);

  // NEW: view modal state
  const [viewOpen, setViewOpen] = useState(false);
  const [viewingUser, setViewingUser] = useState(null);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [totalUsers, setTotalUsers] = useState(0);

  const confirm = useConfirm();
  const promptPlanLimit = usePlanLimitPrompt();
  const showAlert = useAlert();

    const showAlertRef = useRef(null);

    useEffect(() => {
      showAlertRef.current = showAlert;
    }, [showAlert]);

  // how many tags to show before "+n"; the tags column is narrow up to 1400px
  const [compactTags, setCompactTags] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 1400px)");
    const update = () => setCompactTags(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const MAX_TAGS = compactTags ? 2 : 6;

  const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize));

  // list | grid (persisted)
  const [view, setView] = useState(() => {
    if (typeof window === "undefined") return "list";
    return localStorage.getItem("usersView") || "list";
  });

  const { startLoading, stopLoading } = useGlobalLoader();
  useEffect(() => {
    localStorage.setItem("usersView", view);
  }, [view]);

  const orgId = org?.id;
  const defaultPhoneCode = org?.default_phone_country_code || "+351";

  /*
   * Limite de utilizadores do plano: contador "3 / 100" por cima da lista e
   * "Novo utilizador" (criar um) desativado quando a conta está cheia. O
   * Importar CSV fica ativo: também atualiza os que já existem, e o servidor
   * recusa, linha a linha, só os novos que passem o limite.
   */
  const {
    plan: planInfo,
    limits: planLimits,
    usage: planUsage,
    reload: reloadPlanUsage,
  } = usePlanLimits(orgId);
  const usersFull =
    planLimits?.users != null &&
    planUsage?.users != null &&
    planUsage.users >= planLimits.users;

  /*
   * Mensagens de cada colaborador esta semana, por canal (100 em cada).
   * Só o administrador vê estes números; o colaborador recebe apenas o
   * aviso quando passa o limite.
   */
  const weeklyUsage = useCollaboratorWeeklyUsage(orgId);
  const weeklyHint = translation("Plans.usage.weeklyHint");

  const usersUsageCounter = (
    <UsageCounter
      used={planUsage?.users}
      limit={planLimits?.users}
      label={translation("Plans.usage.usersLabel")}
      hint={translation("Plans.usage.usersHint")}
    />
  );

  // assistants
    useEffect(() => {
  if (authLoading || orgLoading || !orgId) return;

  let alive = true;

  (async () => {
    try {
      const res = await fetch(`/api/assistants?orgId=${orgId}`);
      const data = await res.json().catch(() => []);

      if (!res.ok) {
        throw new Error(data?.error || "Failed to load assistants.");
      }

      if (!alive) return;

      setAssistantsList(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn("[Users] assistants load error:", err);

      if (!alive) return;

      setAssistantsList([]);

      if (typeof showAlertRef.current === "function") {
        await showAlertRef.current({
          title: translation("Users.alerts.assistantsLoadFailed.title"),
          message: translation("Users.alerts.assistantsLoadFailed.message"),
          tone: "danger",
        });
      }
    }
  })();

  return () => {
    alive = false;
  };
}, [authLoading, orgLoading, orgId, translation]);

  // tags for filter
  useEffect(() => {
  if (!orgId) return;

  let alive = true;

  (async () => {
    try {
      const r = await fetch(`/api/tags?orgId=${orgId}`);
      const data = await r.json().catch(() => []);

      if (!r.ok) {
        throw new Error(data?.error || "Failed to load tags.");
      }

      if (!alive) return;

      setAllTags(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn("[Users] tags load error:", err);

      if (!alive) return;

      setAllTags([]);

      if (typeof showAlertRef.current === "function") {
        await showAlertRef.current({
          title: translation("Users.alerts.tagsLoadFailed.title"),
          message: translation("Users.alerts.tagsLoadFailed.message"),
          tone: "danger",
        });
      }
    }
  })();

  return () => {
    alive = false;
  };
}, [orgId, translation]);

  useEffect(() => {
    if (!createMenuOpen) return;

    function handleClickOutside(e) {
      if (!createMenuRef.current?.contains(e.target)) {
        setCreateMenuOpen(false);
      }
    }

    function handleEsc(e) {
      if (e.key === "Escape") setCreateMenuOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [createMenuOpen]);

  const refreshUsers = useCallback(
  async (showSuccessAlert = false) => {
    /* O contador acompanha criar, apagar, ações em massa e importação. */
    reloadPlanUsage();

    if (!orgId) {
      if (showSuccessAlert && typeof showAlertRef.current === "function") {
        await showAlertRef.current({
          title: translation("Users.alerts.noOrg.title"),
          message: translation("Users.alerts.noOrg.message"),
          tone: "warning",
        });
      }

      return;
    }

    startLoading();

    try {
      const res = await fetch(
        `/api/users?orgId=${orgId}&page=${page}&pageSize=${pageSize}`,
      );

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || "Failed to load users.");
      }

      setUsers(Array.isArray(data?.items) ? data.items : []);
      setTotalUsers(Number(data?.total || 0));

      if (showSuccessAlert && typeof showAlertRef.current === "function") {
        await showAlertRef.current({
          title: translation("Users.alerts.usersRefreshSuccess.title"),
          message: translation("Users.alerts.usersRefreshSuccess.message"),
          tone: "success",
        });
      }
    } catch (err) {
      console.warn("[Users] refresh users error:", err);

      setUsers([]);
      setTotalUsers(0);

      if (typeof showAlertRef.current === "function") {
        await showAlertRef.current({
          title: translation("Users.alerts.usersLoadFailed.title"),
          message: translation("Users.alerts.usersLoadFailed.message"),
          tone: "danger",
        });
      }
    } finally {
      stopLoading();
    }
  },
  [orgId, page, pageSize, startLoading, stopLoading, translation, reloadPlanUsage],
);

  useEffect(() => {
    if (authLoading || orgLoading || !orgId) return;
    refreshUsers();
  }, [authLoading, orgLoading, orgId, refreshUsers]);

  const normalized = useMemo(
    () =>
      users.map((u) => ({
        id: u.id,
        name: u.name,
        // legacy full phone
        phone: u.phone_number ?? u.phoneNumber ?? "",
        // new fields from DB (if present)
        phoneCountryCode: u.phone_country_code ?? "",
        phoneNational: u.phone_national ?? "",
        email: u.email ?? "",
        tags: u.tag_names ?? (u.tags || []).map((t) => t.name) ?? [],
        tagIds: u.tag_ids ?? (u.tags || []).map((t) => t.id) ?? [],
        assistantId: u.assistant_id ?? null,
        assistantIds:
          u.assistant_ids ?? (u.assistant_id ? [u.assistant_id] : []),
        teamsAadObjectId: u.teams_aad_object_id,
        teamsFromId: u.teams_from_id,
        assistantName: u.assistantName ?? "—",
        organization_id: u.organization_id,
      })),
    [users],
  );

  // Apply text + Tag + Assistant filters
  const visible = useMemo(() => {
    return normalized.filter((u) => {
      const textOk = (
        u.name +
        " " +
        (u.phone || "") +
        " " +
        [u.phoneCountryCode, u.phoneNational].join(" ") +
        " " +
        (u.email || "")
      )
        .toLowerCase()
        .includes(q.toLowerCase());

      const tagsOk =
        selectedTagIds.length === 0 ||
        selectedTagIds.every((id) => (u.tagIds || []).includes(id));

      const assistantOk =
        selectedAssistantIds.length === 0 ||
        selectedAssistantIds.some((id) => u.assistantIds.includes(id));

      return textOk && tagsOk && assistantOk;
    });
  }, [normalized, q, selectedTagIds, selectedAssistantIds]);

  // selection helpers
  const allVisibleIds = visible.map((u) => u.id);
  const allChecked =
    allVisibleIds.length > 0 && allVisibleIds.every((id) => selected.has(id));
  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) allVisibleIds.forEach((id) => next.delete(id));
      else allVisibleIds.forEach((id) => next.add(id));
      return next;
    });
  }
  function toggleOne(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

      async function handleCreateUser({
      userName,
      phoneCode,
      phoneNational,
      email,
      assistantId,
      assistantIds,
      teamsAadObjectId,
      teamsFromId,
    }) {
      if (!org?.id) {
        await showAlert({
          title: translation("Users.alerts.noOrg.title"),
          message: translation("Users.alerts.noOrg.message"),
          tone: "warning",
        });

        return {
          ok: false,
          error: translation("Users.alerts.noOrg.message"),
        };
      }

      try {
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            organizationId: org.id,
            name: userName,
            email: email || null,
            assistantId,
            assistantIds,
            phoneCountryCode: phoneCode,
            phoneNational,
            teamsAadObjectId: teamsAadObjectId || null,
            teamsFromId: teamsFromId || null,
          }),
        });

        if (!res.ok) {
          let err = null;

          try {
            err = await res.json();
          } catch {
            // manter fallback
          }

          /* Limite do plano: aviso com o botão "Atualizar plano". */
          if (!(await promptPlanLimit(err))) {
            await showAlert({
              title: translation("Users.alerts.createUserFailed.title"),
              message: translation("Users.alerts.createUserFailed.message"),
              tone: "danger",
            });
          }

          return {
            ok: false,
            code: err?.code ?? null,
            error: err?.error || "Failed to create user.",
          };
        }

        await refreshUsers();
        setIsCreateOpen(false);

        

        return { ok: true };
      } catch (err) {
        console.warn("[Users] create user error:", err);

        await showAlert({
          title: translation("Users.alerts.createUserFailed.title"),
          message: translation("Users.alerts.createUserFailed.message"),
          tone: "danger",
        });

        return {
          ok: false,
          error: err?.message || "Failed to create user.",
        };
      }
    }

  function openEditFor(u) {
    setEditingUser(u);
    setEditOpen(true);
  }

  // NEW: open the view modal
  function openViewFor(u) {
    setViewingUser(u);
    setViewOpen(true);
  }

      async function deleteUserById(u) {
      const ok = await confirm({
        title: translation("Users.confirmDeleteTitle", { name: u.name }),
        message: translation("Users.confirmDeleteMessage"),
        confirmText: translation("Common.delete"),
        cancelText: translation("Common.cancel"),
        tone: "danger",
      });

      if (!ok) return;

      try {
        const res = await fetch(`/api/users?id=${u.id}`, { method: "DELETE" });

        if (!res.ok) {
          const errorText = await res.text().catch(() => "");
          throw new Error(errorText || "Failed to delete user.");
        }

        await refreshUsers();

        await showAlert({
          title: translation("Users.alerts.userDeleted.title"),
          message: translation("Users.alerts.userDeleted.message", {
            name: u.name,
          }),
          tone: "success",
        });
      } catch (err) {
        console.warn("[Users] delete user error:", err);

        await showAlert({
          title: translation("Users.alerts.deleteUserFailed.title"),
          message: translation("Users.alerts.deleteUserFailed.message"),
          tone: "danger",
        });
      }
    }

async function handleUserAssistantChange(u, newAssistantId) {
  try {
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // Com vários atribuídos só muda o ativo; com um (ou nenhum) troca-o.
      body: JSON.stringify({
        id: u.id,
        assistantId: newAssistantId,
        ...(u.assistantIds.length > 1 ? {} : { assistantIds: [newAssistantId] }),
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new Error(data?.error || "Failed to update assistant.");
    }

    await refreshUsers();

    await showAlert({
      title: translation("Users.alerts.assistantUpdated.title"),
      message: translation("Users.alerts.assistantUpdated.message", {
        name: u.name,
      }),
      tone: "success",
    });
  } catch (err) {
    console.warn("[Users] update assistant error:", err);

    await showAlert({
      title: translation("Users.alerts.assistantUpdateFailed.title"),
      message: translation("Users.alerts.assistantUpdateFailed.message"),
      tone: "danger",
    });
  }
}

async function openCreateUserModal() {
  if (!orgId) {
    await showAlert({
      title: translation("Users.alerts.noOrg.title"),
      message: translation("Users.alerts.noOrg.message"),
      tone: "warning",
    });

    return;
  }

  setIsCreateOpen(true);
}

  const selectedCount = selected.size;
  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  function clearSelection() {
    setSelected(new Set());
  }

  const assistantsById = useMemo(() => {
    const m = new Map();
    (assistantsList || []).forEach((a) => m.set(String(a.id), a));
    return m;
  }, [assistantsList]);

  const activeFilterCount = selectedTagIds.length + selectedAssistantIds.length;

  return (
    <div className={styles.usersScreen}>
      {/* Toolbar */}
      <div className={styles.toolbarRow}>
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon} aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
            >
              <circle cx="11" cy="11" r="7" strokeWidth="2" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" strokeWidth="2" />
            </svg>
          </span>
          <input
            className={styles.searchInputXL}
            placeholder={translation("Users.searchPlaceholder")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label={translation("Users.searchPlaceholder")}
          />
        </div>
        <button
          type="button"
          ref={filterBtnRef}
          className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
          onClick={() => setFilterOpen((v) => !v)}
          title={translation("Common.filter")}
        >
          <Filter size={16} /> <span>{translation("Common.filter")}</span>
          {activeFilterCount > 0 && (
            <span className={styles.filterBadge}>{activeFilterCount}</span>
          )}
        </button>

        {/* Right-side actions */}
        <div className={styles.toolbarRight}>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
            onClick={() => setIsTagsOpen(true)}
            title={translation("Users.manageTags")}
          >
            <Tag size={16} /> <span>{translation("Users.manageTags")}</span>
          </button>
          <div className={styles.createMenuWrap} ref={createMenuRef}>
            <button
              type="button"
              className={`${styles.actionBtn} ${styles.actionBtnPrimary}`}
              onClick={() => setCreateMenuOpen((v) => !v)}
              title={translation("Users.newUser")}
              aria-haspopup="menu"
              aria-expanded={createMenuOpen}
            >
              <Plus size={16} />
              <span>{translation("Users.newUser")}</span>
              <ChevronDown size={16} />
            </button>

            {createMenuOpen && (
              <div
                className={`${styles.createMenu} animateDropdownFadeDown`}
                role="menu"
              >
                <button
                  type="button"
                  className={styles.createMenuItem}
                  role="menuitem"
                  disabled={usersFull}
                  title={
                    usersFull
                      ? translation("Plans.limits.users", {
                          plan: planInfo?.name ?? "",
                          limit: planLimits.users,
                        })
                      : undefined
                  }
                  onClick={() => {
                    setCreateMenuOpen(false);
                    openCreateUserModal();
                  }}
                >
                  <Plus size={16} />
                  <span>{translation("Users.newUser")}</span>
                </button>

                <button
                  type="button"
                  className={styles.createMenuItem}
                  role="menuitem"
                  onClick={() => {
                    setCreateMenuOpen(false);
                    setIsImportOpen(true);
                  }}
                >
                  <Upload size={16} />
                  <span>Import CSV</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {selectedCount > 0 && (
        <QuickActionsBar
          count={selectedCount}
          assistants={assistantsList}
          tags={allTags}
          selectedIds={selectedIds}
          orgId={orgId}
          onDone={refreshUsers}
          clearSelection={clearSelection}
        />
      )}
      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div className={styles.activeFilters}>
          {selectedTagIds.map((id) => {
            const t = allTags.find((x) => x.id === id);
            if (!t) return null;
            return (
              <button
                key={`t${id}`}
                className={styles.filterChip}
                onClick={() =>
                  setSelectedTagIds((prev) => prev.filter((x) => x !== id))
                }
                title={translation("Users.filters.remove")}
              >
                {t.name} ×
              </button>
            );
          })}
          {selectedAssistantIds.map((id) => {
            const a = assistantsList.find((x) => x.id === id);
            if (!a) return null;
            return (
              <button
                key={`a${id}`}
                className={styles.filterChip}
                onClick={() =>
                  setSelectedAssistantIds((prev) =>
                    prev.filter((x) => x !== id),
                  )
                }
                title={translation("Users.filters.remove")}
              >
                {a.name} ×
              </button>
            );
          })}
          <button
            className={styles.filterClearAll}
            onClick={() => {
              setSelectedTagIds([]);
              setSelectedAssistantIds([]);
            }}
          >
            {translation("Common.clearAll")}
          </button>
        </div>
      )}

      {/*
        Contador do limite de utilizadores ("3 / 100"). Na lista fica dentro
        do cabeçalho da tabela, à altura de "Assistente". Na vista de cartões
        (sem cabeçalho) e nos ecrãs pequenos (onde o cabeçalho se esconde),
        fica numa linha por cima, encostado à direita.
      */}
      <div
        className={`${styles.usageRow} ${
          view === "list" ? styles.usageRowNoHeader : ""
        }`}
      >
        {usersUsageCounter}
      </div>

      {/* LIST VIEW */}
      {view === "list" && (
        <div className={styles.tableCard}>
          <div className={styles.table}>
            <div className={`${styles.row} ${styles.header}`}>
              <div className={styles.cellChk}>
                <label className={styles.chkWrap}>
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={toggleAll}
                  />
                  <span className={styles.chkFake} />
                </label>
              </div>
              <div className={styles.cellHead}>
                {translation("Users.list.name")}
              </div>
              <div className={styles.cellHead}>
                {translation("Users.list.phone")}
              </div>
              <div className={styles.cellHead} title={weeklyHint}>
                {translation("Users.list.thisWeek")}
              </div>
              <div className={styles.cellHead}>
                {translation("Users.list.tags")}
              </div>
              <div className={styles.cellHead}>
                {translation("Users.list.assistant")}
              </div>
              <div className={styles.cellHeadRight}>{usersUsageCounter}</div>
            </div>

            {visible.map((u, i) => {
              const all = Array.isArray(u.tags) ? u.tags : [];
              const shown = all.slice(0, MAX_TAGS);
              const extra = all.length - shown.length;

              return (
                <div
                  key={u.id}
                  className={`${styles.row} ${i % 2 ? styles.rowAlt : ""}`}
                >
                  <div className={styles.cellChk}>
                    <label className={styles.chkWrap}>
                      <input
                        type="checkbox"
                        checked={selected.has(u.id)}
                        onChange={() => toggleOne(u.id)}
                      />
                      <span className={styles.chkFake} />
                    </label>
                  </div>

                  <div
                    className={styles.cellName}
                    role="button"
                    onMouseUp={() => openViewFor(u)}
                  >
                    <div className={styles.avatar}>{initial(u.name)}</div>
                    <div className={styles.nameBlock}>
                      <div className={styles.name}>{u.name}</div>
                      <div className={styles.subline}>{u.email || ""}</div>
                    </div>
                  </div>

                  <div className={styles.cellPhone}>
                    {u.phoneNational || u.phone || "—"}
                  </div>

                  <div className={styles.cellWeek} title={weeklyHint}>
                    {weeklyUsage.limit !== null &&
                      ["whatsapp", "teams"].map((channel) => (
                        <span key={channel} className={styles.weekLine}>
                          <span className={styles.weekChannel}>
                            {channel === "whatsapp" ? "WhatsApp" : "Teams"}
                          </span>
                          <UsageCounter
                            used={weeklyUsage.usage[u.id]?.[channel] ?? 0}
                            limit={weeklyUsage.limit}
                            label={translation("Plans.usage.weeklyLabel", {
                              channel:
                                channel === "whatsapp" ? "WhatsApp" : "Teams",
                            })}
                          />
                        </span>
                      ))}
                  </div>

                  <div className={styles.cellTags}>
                    {shown.map((t) => (
                      <span key={t} className={styles.chip} title={t}>
                        {t}
                      </span>
                    ))}
                    {extra > 0 && (
                      <span className={`${styles.chip} ${styles.chipDark}`}>
                        +{extra}
                      </span>
                    )}
                  </div>

                  <div className={styles.cellAssistant}>
                    <PillSelect
                      value={u.assistantId}
                      options={assistantsList
                        .filter(
                          (a) =>
                            u.assistantIds.length <= 1 ||
                            u.assistantIds.includes(a.id),
                        )
                        .map((a) => ({
                          value: a.id,
                          label: a.name,
                        }))}
                      onChange={(newAssistantId) => handleUserAssistantChange(u, newAssistantId)}
                    />
                    {u.assistantIds.length > 1 && (
                      <span
                        className={styles.assistantExtra}
                        title={translation("UserAssistants.extraTitle", {
                          count: u.assistantIds.length,
                        })}
                      >
                        +{u.assistantIds.length - 1}
                      </span>
                    )}
                  </div>

                  <div className={styles.cellKebab}>
                    <button
                      className={`${styles.iconBtn} ${styles.kebabDefault}`}
                      aria-label={translation("Users.row.more")}
                      onClick={() => openEditFor(u)}
                    >
                      <MoreHorizontal size={18} />
                    </button>

                    <div
                      className={styles.rowActions}
                      aria-label={translation("Common.actions")}
                    >
                      <button
                        className={styles.rowActBtn}
                        onClick={() => openViewFor(u)}
                        title={translation("Users.row.view")}
                      >
                        <Eye size={16} />{" "}
                        <span>{translation("Users.row.view")}</span>
                      </button>
                      <button
                        className={styles.rowActBtn}
                        onClick={() => openEditFor(u)}
                        title={translation("Users.row.edit")}
                      >
                        <Pencil size={16} />{" "}
                        <span>{translation("Users.row.edit")}</span>
                      </button>
                      <button
                        className={`${styles.rowActBtn} ${styles.rowActBtnDanger}`}
                        onClick={() => deleteUserById(u)}
                        title={translation("Users.row.delete")}
                      >
                        <Trash2 size={16} />{" "}
                        <span>{translation("Users.row.delete")}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className={styles.pagination}>
           <div className={styles.paginationLeft}>
            <span>
              {translation("Users.pagination.summary", {
                page,
                totalPages,
                totalUsers,
              })}
            </span>
          </div>

          <div className={styles.paginationRight}>
            <PillSelect
              value={pageSize}
              options={[
                { value: 50, label: translation("Users.pagination.perPage", { count: 50 }) },
                { value: 100, label: translation("Users.pagination.perPage", { count: 100 }) },
                { value: 200, label: translation("Users.pagination.perPage", { count: 200 }) },
              ]}
              onChange={(newValue) => {
                setPageSize(Number(newValue));
                setPage(1);
              }}
            />

            <button
              type="button"
              className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              >
              {translation("Users.pagination.previous")}
              </button>

              <button
              type="button"
              className={`${styles.actionBtn} ${styles.actionBtnSecondary}`}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              >
              {translation("Users.pagination.next")}
              </button>
                </div>
                    </div>
                  </div>
                )}

      {/* Popover filter */}
      <FilterMenu
        open={filterOpen}
        anchorEl={filterBtnRef.current}
        tags={allTags}
        assistants={assistantsList}
        selectedTagIds={selectedTagIds}
        setSelectedTagIds={setSelectedTagIds}
        selectedAssistantIds={selectedAssistantIds}
        setSelectedAssistantIds={setSelectedAssistantIds}
        onClose={() => setFilterOpen(false)}
        onClear={() => {
          setSelectedTagIds([]);
          setSelectedAssistantIds([]);
        }}
      />

      {/* Modals */}
      <CreateUserModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        onCreateUser={handleCreateUser}
        assistants={assistantsList}
        defaultPhoneCode={defaultPhoneCode}
      />

      <ImportUsersModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        orgId={orgId}
        assistants={assistantsList}
        defaultPhoneCode={defaultPhoneCode}
        onImported={async () => {
        await refreshUsers();

        await showAlert({
          title: translation("Users.alerts.importSuccess.title"),
          message: translation("Users.alerts.importSuccess.message"),
          tone: "success",
        });
      }}
      />

      {orgId && (
        <ManageTagsModal
          isOpen={isTagsOpen}
          orgId={org.id}
          tags={allTags}
          setTags={setAllTags}
          onClose={() => setIsTagsOpen(false)}
        />
      )}

      {orgId && (
        <EditUserModal
          open={editOpen}
          user={editingUser}
          orgId={orgId}
          assistants={assistantsList}
          onDelete={deleteUserById}
          onClose={() => setEditOpen(false)}
          onSaved={async () => {
          await refreshUsers();

        }}
          defaultPhoneCode={defaultPhoneCode}
        />
      )}

      {/* NEW: View modal with threads/messages */}
      {orgId && (
        <ViewUserModal
          open={viewOpen}
          onClose={() => setViewOpen(false)}
          user={viewingUser}
          orgId={orgId}
          onEdit={() => {
            // jump into edit flow from view
            setViewOpen(false);
            if (viewingUser) {
              setEditingUser(viewingUser);
              setEditOpen(true);
            }
          }}
          assistantsById={assistantsById}
        />
      )}
    </div>
  );
}

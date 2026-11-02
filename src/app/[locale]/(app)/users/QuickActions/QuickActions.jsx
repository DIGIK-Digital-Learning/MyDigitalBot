// src/app/[locale]/(app)/users/QuickActions/QuickActions.jsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import bar from "./quickActions.module.css";
import u from "../users.module.css"; // reuse your filter popover styles
import { useConfirm } from "@/app/components/Confirm/ConfirmProvider";
import { useTranslations } from "next-intl";

function usePopover(anchorRef, minWidth = 280) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: minWidth });

  const update = () => {
    if (!anchorRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    const width = Math.max(minWidth, r.width);
    const left = Math.min(Math.max(12, r.left), window.innerWidth - width - 12);
    const top = Math.min(r.bottom + 8, window.innerHeight - 320);
    setPos({ top, left, width });
  };

  useEffect(() => {
    if (!open) return;
    update();
    const onDoc = (e) => {
      if (
        anchorRef.current?.contains(e.target) ||
        document.getElementById("qa-popover")?.contains(e.target)
      )
        return;
      setOpen(false);
    };
    const onEsc = (e) => e.key === "Escape" && setOpen(false);
    const onResize = () => update();
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    window.addEventListener("resize", onResize);
    document.addEventListener("scroll", update, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("scroll", update, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return { open, setOpen, pos, update };
}

export default function QuickActionsBar({
  count,
  assistants,
  tags,
  selectedIds,
  orgId,
  onDone,
  clearSelection,
}) {
  const t = useTranslations();
  const confirm = useConfirm();
  const canAct = selectedIds?.length > 0;

  // assistant
  const [assistantId, setAssistantId] = useState(null);
  const [aSearch, setASearch] = useState("");
  const aBtnRef = useRef(null);
  const aPop = usePopover(aBtnRef, 320);

  // tags
  const [tagIds, setTagIds] = useState([]);
  const [tagSearch, setTagSearch] = useState("");
  const tagBtnRef = useRef(null);
  const tagPop = usePopover(tagBtnRef, 360);

  const [show, setShow] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(id);
  });

  const aOptions = useMemo(
    () =>
      (assistants || [])
        .filter((x) =>
          x.name?.toLowerCase().includes(aSearch.toLowerCase().trim()),
        )
        .map((x) => ({ value: x.id, label: x.name })),
    [assistants, aSearch],
  );

  const tagOptions = useMemo(
    () =>
      (tags || [])
        .filter((x) =>
          x.name?.toLowerCase().includes(tagSearch.toLowerCase().trim()),
        )
        .map((x) => ({ value: x.id, label: x.name })),
    [tags, tagSearch],
  );

  // "add" junta o assistente aos que cada utilizador já tem; sem modo substitui-os.
  async function bulkSetAssistant(mode) {
    if (!assistantId || !canAct) return;
    const res = await fetch("/api/users/bulk", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ids: selectedIds,
        assistantId,
        orgId,
        ...(mode ? { mode } : {}),
      }),
    });
    if (!res.ok) console.error(await res.text());
    await onDone?.();
    setAssistantId(null);
    aPop.setOpen(false);
  }

  async function bulkModifyTags(op) {
    if (!canAct || tagIds.length === 0) return;
    const res = await fetch("/api/users/bulk-tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIds, tagIds, op, orgId }),
    });
    if (!res.ok) console.error(await res.text());
    await onDone?.();
    setTagIds([]);
    tagPop.setOpen(false);
  }

  async function bulkDelete() {
    if (!canAct) return;

    const ok = await confirm({
      title: t("QuickActions.confirmUserDeletion.title", {
        number: selectedIds.length,
      }),
      message: t("QuickActions.confirmUserDeletion.message"),
      confirmText: t("QuickActions.confirmUserDeletion.confirm"),
      cancelText: t("QuickActions.confirmUserDeletion.cancel"),
      tone: "danger",
    });

    if (!ok) return;

    const res = await fetch("/api/users/bulk", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: selectedIds, orgId }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error(data.error || data);
      return;
    }

    if (data.failedCount > 0) {
      console.error("Some users failed to delete:", data.failed);
    }

    await onDone?.();
    clearSelection?.();
  }

  return (
    <div
      className={`${bar.bulkBar} ${show ? bar.bulkBarShow : ""}`}
      aria-live="polite"
    >
      <div className={bar.bulkLeft}>
        <strong>{count}</strong> {t("QuickActions.selected")}
        <button
          className={bar.bulkClear}
          onClick={clearSelection}
          type="button"
        >
          {t("QuickActions.clear")}
        </button>
      </div>

      <div className={bar.bulkControls}>
        {/* Assistant menu (popover) */}
        <div className={bar.bulkGroup}>
          <button
            ref={aBtnRef}
            className={bar.bulkBtn}
            onClick={() => aPop.setOpen((v) => !v)}
            type="button"
          >
            {t("QuickActions.bulkLabel")} {assistantId ? "•" : ""}
          </button>

          {aPop.open && (
            <div
              id="qa-popover"
              className={u.filterPopover}
              style={{
                top: aPop.pos.top,
                left: aPop.pos.left,
                width: aPop.pos.width,
                position: "fixed",
              }}
            >
              <div className={u.filterHead}>
                <input
                  className={u.filterSearch}
                  placeholder={t("Users.searchPlaceholder")}
                  value={aSearch}
                  onChange={(e) => setASearch(e.target.value)}
                />
                <button
                  className={u.filterGhost}
                  onClick={() => setASearch("")}
                >
                  {t("QuickActions.clear")}
                </button>
              </div>

              <div className={u.filterSection}>
                <div className={u.filterTitle}>{t("Users.list.assistant")}</div>
                <div className={u.filterList}>
                  {aOptions.length === 0 && (
                    <div className={u.filterEmpty}>
                      {t("ManageTagsModal.none")}
                    </div>
                  )}
                  {aOptions.map((opt) => (
                    <label key={opt.value} className={u.checkRow}>
                      <input
                        type="radio"
                        name="qa-assistant"
                        checked={String(assistantId) === String(opt.value)}
                        onChange={() => setAssistantId(opt.value)}
                      />
                      <span>{opt.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className={bar.popoverFooter}>
                <button
                  className={bar.bulkBtn}
                  onClick={() => {
                    setAssistantId(null);
                  }}
                >
                  {t("QuickActions.clear")}
                </button>
                <button
                  className={bar.bulkBtn}
                  onClick={() => bulkSetAssistant("add")}
                  disabled={!assistantId || !canAct}
                  title={t("QuickActions.addAssistantHint")}
                >
                  {t("QuickActions.add")}
                </button>
                <button
                  className={bar.bulkBtnPrimary}
                  onClick={() => bulkSetAssistant()}
                  disabled={!assistantId || !canAct}
                  title={t("QuickActions.replaceAssistantHint")}
                >
                  {t("QuickActions.apply")}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Tags menu (popover) */}
        <div className={bar.bulkGroup}>
          <button
            ref={tagBtnRef}
            className={bar.bulkBtn}
            onClick={() => tagPop.setOpen((v) => !v)}
            type="button"
            disabled={!tags?.length}
            title={!tags?.length ? t("QuickActions.noTags") : undefined}
          >
            {t("QuickActions.tag")} {tagIds.length ? `(${tagIds.length})` : ""}
          </button>

          {tagPop.open && (
            <div
              id="qa-popover"
              className={u.filterPopover}
              style={{
                top: tagPop.pos.top,
                left: tagPop.pos.left,
                width: tagPop.pos.width,
                position: "fixed",
              }}
            >
              <div className={u.filterHead}>
                <input
                  className={u.filterSearch}
                  placeholder={t("Users.searchPlaceholder")}
                  value={tagSearch}
                  onChange={(e) => setTagSearch(e.target.value)}
                />
                <button
                  className={u.filterGhost}
                  onClick={() => setTagSearch("")}
                >
                  {t("QuickActions.clear")}
                </button>
              </div>

              <div className={u.filterSection}>
                <div className={u.filterTitle}>{t("Users.list.tags")}</div>
                <div className={u.filterList}>
                  {tagOptions.length === 0 && (
                    <div className={u.filterEmpty}>
                      {t("ManageTagsModal.none")}
                    </div>
                  )}
                  {tagOptions.map((opt) => {
                    const checked = tagIds.includes(opt.value);
                    return (
                      <label key={opt.value} className={`${u.checkRow}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setTagIds((prev) =>
                              e.target.checked
                                ? [...prev, opt.value]
                                : prev.filter((id) => id !== opt.value),
                            );
                          }}
                        />
                        <span>{opt.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className={bar.popoverFooter}>
                <button className={bar.bulkBtn} onClick={() => setTagIds([])}>
                  {t("QuickActions.clear")}
                </button>
                <button
                  className={bar.bulkBtn}
                  onClick={() => bulkModifyTags("remove")}
                  disabled={!tagIds.length || !canAct}
                >
                  {t("QuickActions.remove")}
                </button>
                <button
                  className={bar.bulkBtnPrimary}
                  onClick={() => bulkModifyTags("add")}
                  disabled={!tagIds.length || !canAct}
                >
                  {t("QuickActions.add")}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Danger: delete */}
        <div className={bar.bulkGroup}>
          <button
            type="button"
            className={bar.bulkBtnDanger}
            onClick={bulkDelete}
            disabled={!canAct}
          >
            {t("QuickActions.delete")}
          </button>
        </div>
      </div>
    </div>
  );
}

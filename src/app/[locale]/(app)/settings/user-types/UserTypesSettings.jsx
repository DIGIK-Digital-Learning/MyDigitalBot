"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Copy, Plus } from "lucide-react";

import { useAuth } from "@/app/AuthContext";
import { useAlert } from "@/app/components/Alert/AlertProvider";
import { useConfirm } from "@/app/components/Confirm/ConfirmProvider";
import RowAction, { RowActions } from "@/app/components/RowAction/RowAction";
import UsageCounter from "@/app/components/UsageCounter/UsageCounter";
import useOrganization from "@/app/hooks/useOrganization";
import { ALL_PERMISSIONS } from "@/lib/auth/permissions";
import {
  deleteUserType,
  fetchUserTypes,
  saveUserType,
} from "@/lib/organizations/organizations.api";

import settingsStyles from "../settings.module.css";
import PermissionTree from "./PermissionTree";
import styles from "./userTypes.module.css";

/*
 * Definições → Tipos de utilizador (#247, parte 4/4), como na TalentLMS:
 * a lista dos tipos e, para cada um, uma árvore de caixas com o que pode
 * fazer. O Administrador, o Editor e o Leitor não se editam; o Editor e o
 * Leitor duplicam-se para criar um parecido.
 */
export default function UserTypesSettings() {
  const t = useTranslations("UserTypes");
  const teamT = useTranslations("Team");
  const settingsT = useTranslations("Settings");
  const { user } = useAuth();
  const { org } = useOrganization(user);
  const orgId = org?.id ?? null;
  const confirm = useConfirm();
  const showAlert = useAlert();

  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState(false);
  /* O tipo aberto na árvore: { typeId, name, selected, readOnly }. */
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      setData(await fetchUserTypes(orgId));
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  const allowed = useMemo(() => new Set(data?.myPermissions ?? []), [data]);
  const limitReached = data ? data.used >= data.limit : false;

  const typeLabel = (type) =>
    type.isSystem && teamT.has(`types.${type.key}`) ? teamT(`types.${type.key}`) : type.name;

  const errorText = (error) =>
    t.has(`errors.${error?.code}`) ? t(`errors.${error.code}`) : t("errors.generic");

  function openNew() {
    setEditing({ typeId: null, name: "", selected: new Set(), readOnly: false });
  }

  function openDuplicate(type) {
    setEditing({
      typeId: null,
      name: t("copyOf", { name: typeLabel(type) }).slice(0, 80),
      /* Só o que quem duplica pode dar. */
      selected: new Set(type.permissions.filter((permission) => allowed.has(permission))),
      readOnly: false,
    });
  }

  function openEdit(type) {
    setEditing({
      typeId: type.id,
      name: type.name,
      selected: new Set(type.permissions),
      readOnly: false,
    });
  }

  function openView(type) {
    setEditing({
      typeId: type.id,
      name: typeLabel(type),
      selected: new Set(type.permissions),
      readOnly: true,
    });
  }

  async function save(event) {
    event.preventDefault();
    if (!editing || editing.readOnly) return;
    setSaving(true);
    try {
      await saveUserType(orgId, {
        typeId: editing.typeId,
        name: editing.name,
        /* Pela ordem do catálogo, para a base de dados ficar arrumada. */
        permissions: ALL_PERMISSIONS.filter((permission) => editing.selected.has(permission)),
      });
      void showAlert({
        title: t("saved.title"),
        message: t(editing.typeId ? "saved.updated" : "saved.created", { name: editing.name.trim() }),
        tone: "success",
      });
      setEditing(null);
      await load();
    } catch (error) {
      void showAlert({ title: t("errors.title"), message: errorText(error), tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  async function remove(type) {
    const ok = await confirm({
      title: t("remove.title", { name: type.name }),
      message: t("remove.message"),
      confirmText: t("remove.confirm"),
      cancelText: t("remove.cancel"),
      tone: "danger",
    });
    if (!ok) return;

    setBusyId(type.id);
    try {
      await deleteUserType(orgId, type.id);
      if (editing?.typeId === type.id) setEditing(null);
      await load();
    } catch (error) {
      void showAlert({ title: t("errors.title"), message: errorText(error), tone: "danger" });
    } finally {
      setBusyId(null);
    }
  }

  const permissionCount = (type) =>
    type.permissions.length >= ALL_PERMISSIONS.length
      ? t("table.all")
      : t("table.count", { count: type.permissions.length, total: ALL_PERMISSIONS.length });

  return (
    <main className={settingsStyles.page}>
      <header className={settingsStyles.header}>
        <h1 className={settingsStyles.pageTitle}>{settingsT("title")}</h1>
        <p className={settingsStyles.pageDescription}>{settingsT("description")}</p>
      </header>

      <section className={settingsStyles.section} aria-labelledby="user-types-title">
        <div className={styles.headingRow}>
          <div className={settingsStyles.sectionHeading}>
            <h2 id="user-types-title">{t("title")}</h2>
            <p>{t("description")}</p>
          </div>
          <div className={styles.headingActions}>
            {data ? (
              <UsageCounter
                used={data.used}
                limit={data.limit}
                label={t("usage.label")}
                hint={t("usage.hint")}
              />
            ) : null}
            <button
              type="button"
              className={settingsStyles.primaryButton}
              onClick={openNew}
              disabled={!data || limitReached || Boolean(editing && !editing.readOnly)}
              title={limitReached ? t("errors.TYPE_LIMIT_REACHED") : undefined}
            >
              <Plus size={16} aria-hidden />
              <span>{t("add")}</span>
            </button>
          </div>
        </div>

        {loadError ? (
          <div className={settingsStyles.errorBox} role="alert">
            <span>{t("errors.load")}</span>
            <button type="button" className={settingsStyles.secondaryButton} onClick={load}>
              {settingsT("retry")}
            </button>
          </div>
        ) : null}

        {editing ? (
          <form className={styles.editor} onSubmit={save}>
            <div className={styles.editorHeader}>
              <h3>
                {editing.readOnly
                  ? t("editor.viewTitle", { name: editing.name })
                  : editing.typeId
                    ? t("editor.editTitle")
                    : t("editor.newTitle")}
              </h3>
              {editing.readOnly ? <p>{t("editor.systemHint")}</p> : <p>{t("editor.hint")}</p>}
            </div>

            {editing.readOnly ? null : (
              <label className={settingsStyles.field}>
                <span>{t("editor.name")}</span>
                <input
                  value={editing.name}
                  onChange={(event) => setEditing({ ...editing, name: event.target.value })}
                  placeholder={t("editor.namePlaceholder")}
                  maxLength={80}
                  required
                  disabled={saving}
                />
              </label>
            )}

            <PermissionTree
              selected={editing.selected}
              allowed={allowed}
              readOnly={editing.readOnly || saving}
              onChange={(selected) => setEditing({ ...editing, selected })}
            />

            <div className={styles.editorActions}>
              <button
                type="button"
                className={settingsStyles.secondaryButton}
                onClick={() => setEditing(null)}
                disabled={saving}
              >
                {editing.readOnly ? t("editor.close") : t("editor.cancel")}
              </button>
              {editing.readOnly ? null : (
                <button
                  type="submit"
                  className={settingsStyles.primaryButton}
                  disabled={saving || !editing.name.trim() || editing.selected.size === 0}
                >
                  {saving ? t("editor.saving") : t("editor.save")}
                </button>
              )}
            </div>
          </form>
        ) : null}

        {data ? (
          <div className={settingsStyles.tableCard}>
            <div className={settingsStyles.tableWrap}>
              <table className={settingsStyles.table}>
                <thead>
                  <tr>
                    <th>{t("table.name")}</th>
                    <th>{t("table.permissions")}</th>
                    <th>{t("table.people")}</th>
                    <th aria-label={t("table.actions")} />
                  </tr>
                </thead>
                <tbody>
                  {data.types.map((type) => {
                    const rowBusy = busyId === type.id;
                    const isAdminType = type.key === "admin";
                    const canDuplicate = !isAdminType && !limitReached && !editing;
                    const inUse = type.memberCount > 0;

                    return (
                      <tr key={type.id}>
                        <td>
                          <span className={styles.typeName}>{typeLabel(type)}</span>
                          {type.isSystem ? (
                            <span className={styles.badgeMuted}>{t("table.system")}</span>
                          ) : null}
                        </td>
                        <td>{permissionCount(type)}</td>
                        <td>{type.memberCount}</td>
                        <td>
                          <RowActions label={t("table.actions")}>
                            {type.isSystem ? (
                              <RowAction kind="view" label={t("actions.view")} onClick={() => openView(type)} />
                            ) : (
                              <RowAction
                                kind="edit"
                                label={t("actions.edit")}
                                onClick={() => openEdit(type)}
                                disabled={rowBusy || !type.canAssign || Boolean(editing)}
                                title={type.canAssign ? undefined : t("errors.NOT_ALLOWED")}
                              />
                            )}
                            {isAdminType ? null : (
                              <RowAction
                                kind="duplicate"
                                icon={Copy}
                                label={t("actions.duplicate")}
                                onClick={() => openDuplicate(type)}
                                disabled={rowBusy || !canDuplicate}
                                title={limitReached ? t("errors.TYPE_LIMIT_REACHED") : undefined}
                              />
                            )}
                            {type.isSystem ? null : (
                              <RowAction
                                kind="delete"
                                label={t("actions.delete")}
                                onClick={() => remove(type)}
                                disabled={rowBusy || inUse || !type.canAssign || Boolean(editing)}
                                title={inUse ? t("errors.TYPE_IN_USE") : undefined}
                              />
                            )}
                          </RowActions>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

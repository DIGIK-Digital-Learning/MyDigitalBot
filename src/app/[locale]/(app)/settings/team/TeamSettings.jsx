"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { MailPlus, UserPlus } from "lucide-react";

import { useAuth } from "@/app/AuthContext";
import { useAlert } from "@/app/components/Alert/AlertProvider";
import { useConfirm } from "@/app/components/Confirm/ConfirmProvider";
import RowAction, { RowActions } from "@/app/components/RowAction/RowAction";
import UsageCounter from "@/app/components/UsageCounter/UsageCounter";
import useOrganization from "@/app/hooks/useOrganization";
import usePermissions from "@/app/PermissionsContext";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasRoomFor } from "@/lib/plans/limitRules";
import {
  changeTeamMemberType,
  fetchTeam,
  inviteTeamMember,
  removeTeamMember,
  resendTeamInvite,
} from "@/lib/organizations/organizations.api";

import settingsStyles from "../settings.module.css";
import styles from "./team.module.css";

/*
 * Definições → Equipa (#247, parte 3/4): quem entra na app da organização.
 * Cada conta ocupa um lugar de colaborador e há um máximo de contas por
 * plano; o dono é sempre Administrador.
 */
export default function TeamSettings() {
  const t = useTranslations("Team");
  const settingsT = useTranslations("Settings");
  const locale = useLocale();
  const { user } = useAuth();
  const { org } = useOrganization(user);
  const orgId = org?.id ?? null;
  const confirm = useConfirm();
  const showAlert = useAlert();
  const { can, lock } = usePermissions();
  const canManage = can(PERMISSIONS.TEAM_MANAGE);

  const [team, setTeam] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [email, setEmail] = useState("");
  const [typeKey, setTypeKey] = useState("editor");
  const [inviting, setInviting] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      setTeam(await fetchTeam(orgId));
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [orgId]);

  useEffect(() => {
    load();
  }, [load]);

  const errorText = (error) =>
    t.has(`errors.${error?.code}`) ? t(`errors.${error.code}`) : t("errors.generic");

  const teamFull =
    team && !hasRoomFor(team.limits.teamMembers, team.usage.teamMembers);
  const seatsFull = team && !hasRoomFor(team.limits.users, team.usage.users);
  const fullHint = teamFull
    ? t("errors.TEAM_LIMIT_REACHED")
    : seatsFull
      ? t("errors.USER_LIMIT_REACHED")
      : undefined;

  async function invite(event) {
    event.preventDefault();
    if (!email.trim()) return;
    setInviting(true);
    try {
      const result = await inviteTeamMember(orgId, { email, typeKey, locale });
      setEmail("");
      void showAlert({
        title: t("invite.sentTitle"),
        message: result.emailSent
          ? t("invite.sent", { email: result.email })
          : t("invite.added", { email: result.email }),
        tone: "success",
      });
      await load();
    } catch (error) {
      void showAlert({ title: t("invite.errorTitle"), message: errorText(error), tone: "danger" });
    } finally {
      setInviting(false);
    }
  }

  async function changeType(member, nextType) {
    setBusyId(member.id);
    try {
      await changeTeamMemberType(orgId, member.id, nextType);
      await load();
    } catch (error) {
      void showAlert({ title: t("errors.title"), message: errorText(error), tone: "danger" });
    } finally {
      setBusyId(null);
    }
  }

  /* O link do convite expira; quem ainda não entrou recebe um novo. */
  async function resend(member) {
    setBusyId(member.id);
    try {
      const result = await resendTeamInvite(orgId, member.id, locale);
      void showAlert({
        title: t("resend.sentTitle"),
        message: t("resend.sent", { email: result.email }),
        tone: "success",
      });
      await load();
    } catch (error) {
      void showAlert({ title: t("errors.title"), message: errorText(error), tone: "danger" });
    } finally {
      setBusyId(null);
    }
  }

  async function remove(member) {
    const ok = await confirm({
      title: t("remove.title", { email: member.email ?? "" }),
      message: t("remove.message"),
      confirmText: t("remove.confirm"),
      cancelText: t("remove.cancel"),
      tone: "danger",
    });
    if (!ok) return;

    setBusyId(member.id);
    try {
      await removeTeamMember(orgId, member.id);
      await load();
    } catch (error) {
      void showAlert({ title: t("errors.title"), message: errorText(error), tone: "danger" });
    } finally {
      setBusyId(null);
    }
  }

  const formatDate = (value) =>
    value
      ? new Date(value).toLocaleDateString(locale, {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "—";

  return (
    <main className={settingsStyles.page}>
      <header className={settingsStyles.header}>
        <h1 className={settingsStyles.pageTitle}>{settingsT("title")}</h1>
        <p className={settingsStyles.pageDescription}>{settingsT("description")}</p>
      </header>

      <section className={settingsStyles.section} aria-labelledby="team-title">
        <div className={styles.headingRow}>
          <div className={settingsStyles.sectionHeading}>
            <h2 id="team-title">{t("title")}</h2>
            <p>{t("description")}</p>
          </div>
          {team ? (
            <div className={styles.counters}>
              <UsageCounter
                used={team.usage.teamMembers}
                limit={team.limits.teamMembers}
                label={t("usage.accounts")}
                hint={t("usage.accountsHint")}
              />
              <UsageCounter
                used={team.usage.users}
                limit={team.limits.users}
                label={t("usage.seats")}
                hint={t("usage.seatsHint")}
              />
            </div>
          ) : null}
        </div>

        <form className={styles.inviteRow} onSubmit={invite}>
          <label className={settingsStyles.field}>
            <span>{t("invite.email")}</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t("invite.emailPlaceholder")}
              maxLength={254}
              required
              disabled={inviting || !canManage}
              {...lock(PERMISSIONS.TEAM_MANAGE)}
            />
          </label>
          <label className={settingsStyles.field}>
            <span>{t("invite.type")}</span>
            <select
              value={typeKey}
              onChange={(event) => setTypeKey(event.target.value)}
              disabled={inviting || !canManage}
              {...lock(PERMISSIONS.TEAM_MANAGE)}
            >
              {(team?.types ?? ["admin", "editor", "viewer"]).map((key) => (
                <option key={key} value={key}>
                  {t(`types.${key}`)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className={settingsStyles.primaryButton}
            disabled={inviting || !canManage || teamFull || seatsFull}
            title={fullHint}
            {...lock(PERMISSIONS.TEAM_MANAGE)}
          >
            <UserPlus size={16} aria-hidden />
            <span>{inviting ? t("invite.sending") : t("invite.button")}</span>
          </button>
        </form>
        <p className={settingsStyles.helpText}>{t("invite.help")}</p>

        {loadError ? (
          <div className={settingsStyles.errorBox} role="alert">
            <span>{t("errors.load")}</span>
            <button type="button" className={settingsStyles.secondaryButton} onClick={load}>
              {settingsT("retry")}
            </button>
          </div>
        ) : null}

        {team ? (
          <div className={settingsStyles.tableCard}>
            <div className={settingsStyles.tableWrap}>
              <table className={settingsStyles.table}>
                <thead>
                  <tr>
                    <th>{t("table.email")}</th>
                    <th>{t("table.type")}</th>
                    <th>{t("table.status")}</th>
                    <th>{t("table.lastSignIn")}</th>
                    <th aria-label={t("table.actions")} />
                  </tr>
                </thead>
                <tbody>
                  {team.members.map((member) => {
                    const locked = member.isOwner || member.isYou;
                    const lockedReason = member.isOwner
                      ? t("ownerLocked")
                      : member.isYou
                        ? t("selfLocked")
                        : undefined;
                    const rowBusy = busyId === member.id;

                    return (
                      <tr key={member.id}>
                        <td>
                          <span className={styles.email}>{member.email ?? "—"}</span>
                          {member.isOwner ? (
                            <span className={styles.badge}>{t("owner")}</span>
                          ) : null}
                          {member.isYou ? (
                            <span className={styles.badgeMuted}>{t("you")}</span>
                          ) : null}
                        </td>
                        <td>
                          {locked ? (
                            <span title={lockedReason}>{t(`types.${member.typeKey}`)}</span>
                          ) : (
                            <select
                              className={styles.typeSelect}
                              aria-label={t("table.type")}
                              value={member.typeKey}
                              onChange={(event) => changeType(member, event.target.value)}
                              disabled={rowBusy || !canManage}
                              {...lock(PERMISSIONS.TEAM_MANAGE)}
                            >
                              {team.types.map((key) => (
                                <option key={key} value={key}>
                                  {t(`types.${key}`)}
                                </option>
                              ))}
                            </select>
                          )}
                        </td>
                        <td>
                          <span className={member.pending ? styles.pending : styles.active}>
                            {member.pending ? t("status.pending") : t("status.active")}
                          </span>
                        </td>
                        <td>{formatDate(member.lastSignInAt)}</td>
                        <td>
                          {locked ? null : (
                            <RowActions label={t("table.actions")}>
                              {member.pending ? (
                                <RowAction
                                  kind="resend"
                                  icon={MailPlus}
                                  label={t("resend.action")}
                                  onClick={() => resend(member)}
                                  disabled={rowBusy || !canManage}
                                  {...lock(PERMISSIONS.TEAM_MANAGE)}
                                />
                              ) : null}
                              <RowAction
                                kind="delete"
                                label={t("remove.action")}
                                onClick={() => remove(member)}
                                disabled={rowBusy || !canManage}
                                {...lock(PERMISSIONS.TEAM_MANAGE)}
                              />
                            </RowActions>
                          )}
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

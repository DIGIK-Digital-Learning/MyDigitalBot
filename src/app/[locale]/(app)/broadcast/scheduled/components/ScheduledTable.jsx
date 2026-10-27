import { Fragment } from "react";
import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  CircleStop,
  Eye,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import styles from "../scheduled.module.css";
import { Link } from "@/i18n/navigation";
import {
  canCloseChain,
  formatDateTime,
  isChain,
  previewText,
} from "../helpers/scheduled.helpers";
import NewBadge from "@/app/components/NewBadge/NewBadge";

export default function ScheduledTable({
  loading,
  translation,
  filteredItems,
  openViewModal,
  openEditModal,
  canEditItem,
  handleDelete,
  canDeleteItem,
  deletingId,
  isNew = () => false,
  footer = null,
  expandedChains = new Set(),
  onToggleChain = () => {},
  onCloseChain = () => {},
  closingChainId = null,
  onRemoveStep = () => {},
  removingStepKey = null,
}) {
  /* Porque é que uma mensagem da corrente não se pode tirar (ou null). */
  function stepBlockedReason(item, step) {
    if (item.status === "sending") return translation("Chain.stepLocked");
    if (step.locked) return translation("Chain.stepLocked");
    if (item.chain.stepCount <= 2) return translation("Chain.minSteps");
    return null;
  }

  function statusClassName(status) {
    switch (status) {
      case "scheduled":
        return styles.statusScheduled;
      case "sending":
        return styles.statusSending;
      case "running":
        return styles.statusRunning;
      case "sent":
        return styles.statusSent;
      case "failed":
        return styles.statusFailed;
      case "cancelled":
        return styles.statusCancelled;
      default:
        return "";
    }
  }
  return (
    <div className={styles.tableCard}>
      {loading ? (
        <div className={styles.stateBox}>{translation("Loading")}</div>
      ) : filteredItems.length === 0 ? (
        <div className={styles.stateBox}>
          <CalendarClock aria-hidden className={styles.emptyIcon} />
          <h2 className={styles.emptyTitle}>{translation("Empty.title")}</h2>
          <p className={styles.emptyText}>{translation("Empty.text")}</p>
          <Link href="/broadcast" className={styles.primaryButton}>
            <Plus aria-hidden className={styles.buttonIcon} />
            <span>{translation("NewMessage")}</span>
          </Link>
        </div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>{translation("Table.message")}</th>
                <th>{translation("Table.channel")}</th>
                <th>{translation("Table.recipients")}</th>
                <th>{translation("Table.scheduledFor")}</th>
                <th>{translation("Table.status")}</th>
                <th>{translation("Table.createdBy")}</th>
                <th>{translation("Table.actions")}</th>
              </tr>
            </thead>

            <tbody>
              {filteredItems.map((item) => {
                const chain = isChain(item) ? item.chain : null;
                const expanded = chain && expandedChains.has(item.id);

                return (
                  <Fragment key={item.id}>
                    <tr>
                      <td>
                        <div className={styles.messageCell}>
                          <strong className={styles.messagePreview}>
                            {previewText(item.message)}
                            {/* Agendada desde a última visita a esta página. */}
                            {isNew(item.createdAt) ? <NewBadge /> : null}
                          </strong>
                          {chain ? (
                            <span className={styles.chainTag}>
                              {translation("Chain.tag", {
                                count: chain.stepCount,
                              })}
                            </span>
                          ) : null}
                          <span className={styles.secondaryText}>
                            {item.timezone || "Europe/Lisbon"}
                          </span>
                        </div>
                      </td>

                      <td>
                        <span className={styles.channelBadge}>
                          {translation(`Channels.${item.channel}`)}
                        </span>
                      </td>

                      <td>{item.recipientsCount}</td>

                      <td>
                        {formatDateTime(item.scheduledFor, item.timezone)}
                      </td>

                      <td>
                        <span
                          className={`${styles.statusPill} ${statusClassName(item.status)}`}
                        >
                          {translation(`Statuses.${item.status}`)}
                        </span>
                        {chain && item.status === "running" ? (
                          <span className={styles.chainProgress}>
                            {translation("Chain.progress", {
                              done: chain.recipientsDone,
                              total: chain.recipientCount,
                            })}
                          </span>
                        ) : null}
                      </td>

                      <td>{item.createdBy || "-"}</td>

                      <td>
                        {chain ? (
                          <div className={styles.actions}>
                            {/* Uma corrente abre-se na própria tabela, mensagem a mensagem. */}
                            <button
                              type="button"
                              className={styles.iconButton}
                              onClick={() => onToggleChain(item.id)}
                              aria-expanded={expanded}
                              title={translation(
                                expanded
                                  ? "Chain.hideSteps"
                                  : "Chain.showSteps",
                              )}
                            >
                              {expanded ? (
                                <ChevronDown aria-hidden />
                              ) : (
                                <ChevronRight aria-hidden />
                              )}
                            </button>

                            <button
                              type="button"
                              className={styles.iconButton}
                              disabled
                              title={translation("Chain.noEdit")}
                            >
                              <Pencil aria-hidden />
                            </button>

                            <button
                              type="button"
                              className={`${styles.iconButton} ${styles.dangerButton}`}
                              onClick={() => onCloseChain(item)}
                              disabled={
                                !canCloseChain(item) ||
                                closingChainId === item.id
                              }
                              title={translation(
                                item.status === "running"
                                  ? "Chain.stop"
                                  : "Chain.cancel",
                              )}
                            >
                              <CircleStop aria-hidden />
                            </button>
                          </div>
                        ) : (
                          <div className={styles.actions}>
                            <button
                              type="button"
                              className={styles.iconButton}
                              onClick={() => openViewModal(item)}
                              title={translation("Actions.view")}
                            >
                              <Eye aria-hidden />
                            </button>

                            <button
                              type="button"
                              className={styles.iconButton}
                              onClick={() => openEditModal(item)}
                              disabled={!canEditItem(item)}
                              title={translation("Actions.edit")}
                            >
                              <Pencil aria-hidden />
                            </button>

                            <button
                              type="button"
                              className={`${styles.iconButton} ${styles.dangerButton}`}
                              onClick={() => handleDelete(item)}
                              disabled={
                                !canDeleteItem(item) || deletingId === item.id
                              }
                              title={translation("Actions.delete")}
                            >
                              <Trash2 aria-hidden />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>

                    {expanded
                      ? chain.steps.map((step) => (
                          <tr key={step.index} className={styles.chainStepRow}>
                            <td colSpan={7}>
                              <div className={styles.chainStep}>
                                <span className={styles.chainStepIndex}>
                                  {translation("Chain.step", {
                                    index: step.index,
                                  })}
                                </span>
                                <span className={styles.chainStepText}>
                                  {step.preview || translation("Chain.noText")}
                                </span>
                                {step.fileCount ? (
                                  <span className={styles.chainStepMeta}>
                                    {translation("Chain.files", {
                                      count: step.fileCount,
                                    })}
                                  </span>
                                ) : null}
                                {step.hasQuestion ? (
                                  <span className={styles.chainStepMeta}>
                                    {translation("Chain.question")}
                                  </span>
                                ) : null}
                                {step.index > 1 ? (
                                  <span className={styles.chainStepMeta}>
                                    {step.delayMinutes
                                      ? translation("Chain.delay", {
                                          minutes: step.delayMinutes,
                                        })
                                      : translation("Chain.afterRead")}
                                  </span>
                                ) : null}
                                <span className={styles.chainStepMeta}>
                                  {translation("Chain.reached", {
                                    count: step.reached,
                                    total: chain.recipientCount,
                                  })}
                                </span>
                                {/* Tirar só esta mensagem da corrente. */}
                                <button
                                  type="button"
                                  className={`${styles.iconButton} ${styles.dangerButton} ${styles.chainStepRemove}`}
                                  onClick={() => onRemoveStep(item, step)}
                                  disabled={
                                    Boolean(stepBlockedReason(item, step)) ||
                                    removingStepKey ===
                                      `${item.id}:${step.index}`
                                  }
                                  title={
                                    stepBlockedReason(item, step) ||
                                    translation("Chain.removeStep")
                                  }
                                  aria-label={translation("Chain.removeStep")}
                                >
                                  <Trash2 aria-hidden />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginação, por baixo da tabela. */}
      {!loading && filteredItems.length > 0 ? footer : null}
    </div>
  );
}

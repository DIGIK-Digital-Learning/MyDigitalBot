import { Fragment } from "react";
import { CalendarClock, CircleStop, Plus } from "lucide-react";
import styles from "../scheduled.module.css";
import { Link } from "@/i18n/navigation";
import {
  canCloseChain,
  formatDateTime,
  isChain,
  previewText,
} from "../helpers/scheduled.helpers";
import NewBadge from "@/app/components/NewBadge/NewBadge";
import RowAction, { RowActions } from "@/app/components/RowAction/RowAction";
import { rowClickHandler } from "@/app/components/RowAction/rowClick";

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
  onEditStep = () => {},
}) {
  /* Porque é que o texto de uma mensagem da corrente não se edita (ou null). */
  function stepEditBlockedReason(item, step) {
    if (item.status === "sending" || step.locked) {
      return translation("Chain.stepLockedEdit");
    }
    if (step.hasQuestion) return translation("Chain.questionNoEdit");
    return null;
  }

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
                    {/* #238: a linha faz o mesmo que "Ver" (numa sequência,
                        abre as mensagens na própria tabela). */}
                    <tr
                      className={styles.rowClickable}
                      onClick={rowClickHandler(() =>
                        chain ? onToggleChain(item.id) : openViewModal(item),
                      )}
                    >
                      <td>
                        <div className={styles.messageCell}>
                          <strong className={styles.messagePreview}>
                            {/* Abre o mesmo que "Ver" (e é o alvo do teclado). */}
                            <button
                              type="button"
                              className={styles.messageLink}
                              onClick={() =>
                                chain
                                  ? onToggleChain(item.id)
                                  : openViewModal(item)
                              }
                            >
                              {previewText(item.message)}
                            </button>
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
                          <RowActions
                            label={translation("Table.actions")}
                            className={styles.actions}
                          >
                            {/* Uma sequência abre-se na própria tabela, mensagem a mensagem. */}
                            <RowAction
                              kind="view"
                              label={translation("Actions.view")}
                              onClick={() => onToggleChain(item.id)}
                              aria-expanded={expanded}
                              title={translation(
                                expanded
                                  ? "Chain.hideSteps"
                                  : "Chain.showSteps",
                              )}
                            />
                            <RowAction
                              kind="edit"
                              label={translation("Actions.edit")}
                              disabled
                              title={translation("Chain.noEdit")}
                            />
                            <RowAction
                              kind="stop"
                              icon={CircleStop}
                              danger
                              label={translation(
                                item.status === "running"
                                  ? "Chain.stop"
                                  : "Chain.cancel",
                              )}
                              onClick={() => onCloseChain(item)}
                              disabled={
                                !canCloseChain(item) ||
                                closingChainId === item.id
                              }
                            />
                          </RowActions>
                        ) : (
                          <RowActions
                            label={translation("Table.actions")}
                            className={styles.actions}
                          >
                            <RowAction
                              kind="view"
                              label={translation("Actions.view")}
                              onClick={() => openViewModal(item)}
                            />
                            <RowAction
                              kind="edit"
                              label={translation("Actions.edit")}
                              onClick={() => openEditModal(item)}
                              disabled={!canEditItem(item)}
                            />
                            <RowAction
                              kind="delete"
                              label={translation("Actions.delete")}
                              onClick={() => handleDelete(item)}
                              disabled={
                                !canDeleteItem(item) || deletingId === item.id
                              }
                            />
                          </RowActions>
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
                                <RowActions
                                  label={translation("Table.actions")}
                                  className={styles.chainStepActions}
                                >
                                  {/* Mudar só o texto desta mensagem. */}
                                  <RowAction
                                    kind="edit"
                                    label={translation("Actions.edit")}
                                    onClick={() => onEditStep(item, step)}
                                    disabled={Boolean(
                                      stepEditBlockedReason(item, step),
                                    )}
                                    title={
                                      stepEditBlockedReason(item, step) ||
                                      translation("Chain.editStep")
                                    }
                                    aria-label={translation("Chain.editStep")}
                                  />
                                  {/* Tirar só esta mensagem da sequência. */}
                                  <RowAction
                                    kind="remove"
                                    danger
                                    label={translation("Actions.remove")}
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
                                  />
                                </RowActions>
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

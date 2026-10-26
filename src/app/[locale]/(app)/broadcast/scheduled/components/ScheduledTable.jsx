import { CalendarClock, Pencil, Plus, Eye, Trash2 } from "lucide-react";
import styles from "../scheduled.module.css";
import { Link } from "@/i18n/navigation";
import { formatDateTime, previewText } from "../helpers/scheduled.helpers";
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
}) {
  function statusClassName(status) {
    switch (status) {
      case "scheduled":
        return styles.statusScheduled;
      case "sending":
        return styles.statusSending;
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
              {filteredItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className={styles.messageCell}>
                      <strong className={styles.messagePreview}>
                        {previewText(item.message)}
                        {/* Agendada desde a última visita a esta página. */}
                        {isNew(item.createdAt) ? <NewBadge /> : null}
                      </strong>
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

                  <td>{formatDateTime(item.scheduledFor, item.timezone)}</td>

                  <td>
                    <span
                      className={`${styles.statusPill} ${statusClassName(item.status)}`}
                    >
                      {translation(`Statuses.${item.status}`)}
                    </span>
                  </td>

                  <td>{item.createdBy || "-"}</td>

                  <td>
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
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

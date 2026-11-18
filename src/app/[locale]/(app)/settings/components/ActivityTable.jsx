import { History } from "lucide-react";
import { SkeletonTable } from "@/app/components/Skeleton/Skeleton";
import styles from "../settings.module.css";
import {
  actionLabelKey,
  actorLabel,
  areaOfAction,
  detailEntries,
  entityLabel,
  formatDateTime,
} from "../helpers/activity.helpers";

export default function ActivityTable({
  translation,
  locale,
  items,
  loading,
  hasFilters,
}) {
  if (loading) {
    return (
      <SkeletonTable
        rows={8}
        columns={5}
        card={false}
        label={translation("Loading")}
      />
    );
  }

  if (!items.length) {
    return (
      <div className={styles.stateBox}>
        <History aria-hidden className={styles.emptyIcon} />
        <h3 className={styles.emptyTitle}>
          {translation(hasFilters ? "Empty.filteredTitle" : "Empty.title")}
        </h3>
        <p className={styles.emptyText}>
          {translation(hasFilters ? "Empty.filteredText" : "Empty.text")}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>{translation("Table.when")}</th>
            <th>{translation("Table.action")}</th>
            <th>{translation("Table.entity")}</th>
            <th>{translation("Table.details")}</th>
            <th>{translation("Table.actor")}</th>
          </tr>
        </thead>

        <tbody>
          {items.map((item) => {
            const area = areaOfAction(item.action);
            const details = detailEntries(item, translation, locale);

            return (
              <tr key={item.id}>
                <td className={styles.whenCell}>
                  {formatDateTime(item.created_at, locale)}
                </td>

                <td>
                  <div className={styles.actionCell}>
                    <span className={styles.actionLabel}>
                      {translation(actionLabelKey(item.action))}
                    </span>
                    {area ? (
                      <span className={styles.areaTag}>
                        {translation(`Areas.${area}`)}
                      </span>
                    ) : null}
                  </div>
                </td>

                <td className={styles.entityCell}>{entityLabel(item)}</td>

                <td className={styles.detailsCell}>
                  {details.length ? (
                    <dl className={styles.detailList}>
                      {details.map((entry) => (
                        <div key={entry.key} className={styles.detailItem}>
                          <dt className={styles.detailLabel}>{entry.label}</dt>
                          <dd className={styles.detailValue}>{entry.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <span className={styles.noDetails}>-</span>
                  )}
                </td>

                <td className={styles.actorCell}>
                  {actorLabel(item, translation)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

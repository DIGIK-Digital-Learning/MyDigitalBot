import { Link } from "@/i18n/navigation";
import styles from "../dashboard.module.css";
import { toNumber } from "../lib/dashboard.helpers";

export function UpcomingList({ items, t, locale }) {
  if (!items.length) {
    return <p className={styles.emptyState}>{t("upcoming.empty")}</p>;
  }

  const formatter = new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <ul className={styles.upcomingList}>
      {items.map((item) => {
        const date = item.scheduledFor ? new Date(item.scheduledFor) : null;
        const channelLabel =
          item.channel === "teams" || item.channel === "whatsapp"
            ? t(`channels.${item.channel}`)
            : item.channel;
        return (
          <li key={item.id}>
            <Link href="/broadcast/scheduled" className={styles.upcomingItem}>
              <span className={styles.upcomingWhen}>
                {date && !Number.isNaN(date.getTime())
                  ? formatter.format(date)
                  : "—"}
              </span>
              <span className={styles.upcomingBody}>
                <span className={styles.upcomingPreview}>
                  {item.preview || t("upcoming.noPreview")}
                </span>
                <span className={styles.upcomingMeta}>
                  <span
                    className={styles.channelTag}
                    data-channel={item.channel}
                  >
                    {channelLabel}
                  </span>
                  {t("upcoming.recipients", {
                    count: toNumber(item.recipients),
                  })}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

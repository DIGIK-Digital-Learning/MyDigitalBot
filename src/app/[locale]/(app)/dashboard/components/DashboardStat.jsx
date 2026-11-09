import { Link } from "@/i18n/navigation";
import styles from "../dashboard.module.css";
import { toNumber } from "../lib/dashboard.helpers";

export function DashboardStat({ label, value, meta, href, percent }) {
  const body = (
    <>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statBody}>
        <span className={styles.statValue}>{toNumber(value)}</span>
        {typeof percent === "number" ? (
          <span className={styles.statBar} aria-hidden="true">
            <span style={{ width: `${percent}%` }} />
          </span>
        ) : null}
        {meta ? <span className={styles.statMeta}>{meta}</span> : null}
      </span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={styles.stat}>
        {body}
      </Link>
    );
  }

  return <div className={styles.stat}>{body}</div>;
}

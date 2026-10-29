import { Link } from "@/i18n/navigation";
import { ChevronRight } from "lucide-react";
import styles from "../dashboard.module.css";

export function DashboardSection({
  title,
  description,
  linkHref,
  linkLabel,
  children,
}) {
  return (
    <section className={styles.section}>
      <header className={styles.sectionHeader}>
        <div className={styles.sectionCopy}>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {linkHref ? (
          <Link href={linkHref} className={styles.sectionLink}>
            {linkLabel}
            <ChevronRight size={15} aria-hidden="true" />
          </Link>
        ) : null}
      </header>
      {children}
    </section>
  );
}

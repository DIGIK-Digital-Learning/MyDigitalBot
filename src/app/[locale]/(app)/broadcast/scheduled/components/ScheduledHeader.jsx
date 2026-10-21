import { Link } from "@/i18n/navigation";
import { Plus } from "lucide-react";
import styles from "../scheduled.module.css";

export default function ScheduledHeader({ translation, organizationName }) {
  return (
    <div className={styles.header}>
      <div className={styles.headerText}>
        <h1 className={styles.title}>{translation("Title")}</h1>
        <p className={styles.subtitle}>
          {translation("Subtitle", { organization: organizationName ?? "-" })}
        </p>
      </div>

      <Link href="/broadcast" className={styles.primaryButton}>
        <Plus aria-hidden className={styles.buttonIcon} />
        <span>{translation("NewMessage")}</span>
      </Link>
    </div>
  );
}

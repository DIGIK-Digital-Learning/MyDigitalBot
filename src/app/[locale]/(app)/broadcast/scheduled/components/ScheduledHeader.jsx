import { Link } from "@/i18n/navigation";
import { Plus } from "lucide-react";
import styles from "../scheduled.module.css";

/* Sem título nem descrição: só o botão para uma mensagem nova. */
export default function ScheduledHeader({ translation }) {
  return (
    <div className={`${styles.header} ${styles.headerActions}`}>
      <Link href="/broadcast" className={styles.primaryButton}>
        <Plus aria-hidden className={styles.buttonIcon} />
        <span>{translation("NewMessage")}</span>
      </Link>
    </div>
  );
}

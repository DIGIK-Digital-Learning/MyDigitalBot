import { Link } from "@/i18n/navigation";
import { Plus } from "lucide-react";
import styles from "../scheduled.module.css";

/*
 * `usage` é o contador do limite do plano ("2 / 100" agendadas, #186). O
 * botão "Nova mensagem" fica sempre ativo: no composer também se envia já,
 * e o limite só trava o agendar (que lá fica desativado quando está cheio).
 */
export default function ScheduledHeader({ translation, organizationName, usage = null }) {
  return (
    <div className={styles.header}>
      <div className={styles.headerText}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{translation("Title")}</h1>
          {usage}
        </div>
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

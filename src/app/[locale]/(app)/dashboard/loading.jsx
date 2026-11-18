import { DashboardLoadingState } from "./components/DashboardLoadingState";
import styles from "./dashboard.module.css";

/* Ao abrir o Dashboard, o skeleton aparece logo, antes da página (#272). */
export default function Loading() {
  return (
    <main className={styles.page}>
      <DashboardLoadingState />
    </main>
  );
}

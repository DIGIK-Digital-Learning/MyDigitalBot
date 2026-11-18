import AnalyticsSkeleton from "./AnalyticsSkeleton";
import styles from "./analytics.module.css";

export default function Loading() {
  return (
    <main className={styles.page}>
      <AnalyticsSkeleton />
    </main>
  );
}

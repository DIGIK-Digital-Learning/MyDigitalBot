import styles from "../dashboard.module.css";

export function DashboardLoadingState() {
  return (
    <div className={styles.loadingState} aria-busy="true" aria-label="Loading">
      <div className={`${styles.skeleton} ${styles.skeletonWide}`} />
      <div className={styles.loadingColumns}>
        <div className={styles.skeleton} />
        <div className={styles.skeleton} />
      </div>
      <div className={styles.loadingColumns}>
        <div className={styles.skeleton} />
        <div className={styles.skeleton} />
      </div>
    </div>
  );
}

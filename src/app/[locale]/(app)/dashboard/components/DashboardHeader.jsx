import styles from "../dashboard.module.css";

export function DashboardHeader({ t, children }) {
  return (
    <header className={styles.header}>
      <div className={styles.headerCopy}>
        <h1>{t("title")}</h1>
        <p>{t("description")}</p>
      </div>
      {children}
    </header>
  );
}

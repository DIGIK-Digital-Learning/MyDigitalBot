import SiteUnavailable from "../../components/SiteUnavailable/SiteUnavailable";
import styles from "./marketingShell.module.css";
import OrigemVisita from "./components/OrigemVisita/OrigemVisita";

export default function MarketingLayout({ children }) {
  const isMaintenanceMode = process.env.MAINTENANCE_MODE === "true";

  if (isMaintenanceMode) {
    return <SiteUnavailable />;
  }

  return (
    <div className={styles.shell} data-marketing-shell>
      <OrigemVisita />
      {children}
    </div>
  );
}

import LanguageSwitch from "@/app/components/TopBar/LanguageSwitch";
import styles from "./auth-layout.module.css";

// Login e recuperação de password: fora dos resultados de pesquisa.
export const metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({ children }) {
  return (
    <div className={styles.frame}>
      <div className={styles.lang}>
        <LanguageSwitch />
      </div>
      {children}
    </div>
  );
}

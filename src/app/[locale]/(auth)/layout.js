import LanguageSwitch from "@/app/components/TopBar/LanguageSwitch";
import styles from "./auth-layout.module.css";

// Login e recuperação de password: fora dos resultados de pesquisa.
export const metadata = {
  robots: { index: false, follow: false },
};

// App, login, legal e links rastreados continuam a ser gerados a cada pedido,
// como antes. Só as páginas de marketing passaram a estáticas.
export const dynamic = "force-dynamic";

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

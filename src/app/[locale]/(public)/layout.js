import PersistentHeader from "@/app/components/Navbar/MarketingNavbar/PersistentHeader";
import styles from "./public.module.css";
import Footer from "../(marketing)/components/Footer/Footer";

// App, login, legal e links rastreados continuam a ser gerados a cada pedido,
// como antes. Só as páginas de marketing passaram a estáticas.
export const dynamic = "force-dynamic";

export default function PublicLayout({ children }) {
  return (
    <main className={styles.main}>
      <PersistentHeader reserveSpace />
      <div>{children}</div>
      <Footer />
    </main>
  );
}

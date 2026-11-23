import PersistentHeader from "@/app/components/Navbar/MarketingNavbar/PersistentHeader";
import Footer from "../Footer/Footer";
import site from "./site.module.css";

/**
 * Estrutura comum das páginas públicas: cabeçalho fixo, conteúdo e rodapé.
 * O <div> entre o <main> e as secções existe porque o marketingShell.module.css
 * estiliza "main > section:first-child" (os heróis antigos) e não se deve
 * aplicar a estas páginas.
 */
export default function SiteShell({ children }) {
  return (
    <div className={site.page}>
      <PersistentHeader />
      <main>
        <div>{children}</div>
      </main>
      <Footer />
    </div>
  );
}

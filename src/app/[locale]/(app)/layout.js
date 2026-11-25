import RouteLoader from "../../LoadingScreen/RouteLoader";
import GlobalLoadingOverlay from "../../LoadingScreen/GlobalLoadingOverlay";
import Navbar from "../../components/Navbar/Navbar";
import TopBar from "../../components/TopBar/TopBar";
import { MobileNavProvider } from "@/app/components/MobileNav/MobileNavContext";
import "react-datepicker/dist/react-datepicker.css";

// App, login, legal e links rastreados continuam a ser gerados a cada pedido,
// como antes. Só as páginas de marketing passaram a estáticas.
export const dynamic = "force-dynamic";

export default function AppLayout({ children }) {
  return (
    <MobileNavProvider>
      <RouteLoader />
      <TopBar />
      <div className="app-shell">
        <Navbar />
        <div className="main-col">
          <div className="page-content">
            <GlobalLoadingOverlay />
            <main className="app-main">{children}</main>
          </div>
        </div>
      </div>
    </MobileNavProvider>
  );
}

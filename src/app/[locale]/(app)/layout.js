import { redirect } from "next/navigation";
import RouteLoader from "../../LoadingScreen/RouteLoader";
import GlobalLoadingOverlay from "../../LoadingScreen/GlobalLoadingOverlay";
import Navbar from "../../components/Navbar/Navbar";
import TopBar from "../../components/TopBar/TopBar";
import AdminPlanBanner from "../../components/AdminPlanBanner/AdminPlanBanner";
import { MobileNavProvider } from "@/app/components/MobileNav/MobileNavContext";
import { getCurrentSession } from "@/lib/auth/session";
import { getOrganizationMetadata } from "@/lib/helpers/organizationBranding.helpers";
import { routing } from "@/i18n/routing";
import "react-datepicker/dist/react-datepicker.css";

export async function generateMetadata() {
  const { supabase, user } = await getCurrentSession();
  if (!user) return {};

  const { data: org, error } = await supabase
    .from("organization")
    .select("name, favicon_url")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[AppLayout] organization branding lookup failed", error);
    return {};
  }

  return getOrganizationMetadata(org);
}

export default async function AppLayout({ children, params }) {
  const { user } = await getCurrentSession();

  if (!user) {
    const { locale } = await params;
    redirect(locale === routing.defaultLocale ? "/login" : `/${locale}/login`);
  }

  return (
    <MobileNavProvider>
      <RouteLoader />
      <TopBar />
      <div className="app-shell">
        <Navbar />
        <div className="main-col">
          <AdminPlanBanner />
          <div className="page-content">
            <GlobalLoadingOverlay />
            <main className="app-main">{children}</main>
          </div>
        </div>
      </div>
    </MobileNavProvider>
  );
}

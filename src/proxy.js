import createMiddleware from "next-intl/middleware";
import { NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { updateSession } from "./utils/supabase/middleware";
import { getSafeRedirectPath } from "./lib/auth/safeRedirect";

const intl = createMiddleware(routing);
const PRIVATE_ROUTE_ROOTS = new Set([
  "admin",
  "analytics",
  "assistants",
  "automations",
  "broadcast",
  "dashboard",
  "options",
  "platform-admin",
  "private",
  "settings",
  "teams-groups",
  "templates",
  "users",
]);
/* Páginas de marketing que vão para a «Em construção» com
   MAINTENANCE_MODE=true. A /legal e os links rastreados (/r) ficam de fora. */
const MARKETING_ROUTE_ROOTS = new Set([
  "",
  "contact",
  "how-it-works",
  "pricing",
  "product",
  "solution",
]);
const UNDER_CONSTRUCTION_ROOT = "under-construction";

function localizedPath(locale, path) {
  return locale === routing.defaultLocale ? path : `/${locale}${path}`;
}

function getRouteInfo(pathname) {
  const segments = pathname.split("/").filter(Boolean);
  const requestedLocale = routing.locales.includes(segments[0])
    ? segments.shift()
    : routing.defaultLocale;

  return {
    locale: requestedLocale,
    root: segments[0] ?? "",
  };
}

function copyResponseCookies(source, target) {
  source.cookies.getAll().forEach((cookie) => target.cookies.set(cookie));
  return target;
}

export async function proxy(request) {
  const { response: sessionResponse, user } = await updateSession(request);
  const { locale, root } = getRouteInfo(request.nextUrl.pathname);

  if (!user && PRIVATE_ROUTE_ROOTS.has(root)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = localizedPath(locale, "/login");
    loginUrl.search = "";
    loginUrl.searchParams.set(
      "next",
      getSafeRedirectPath(
        `${request.nextUrl.pathname}${request.nextUrl.search}`,
      ),
    );

    return copyResponseCookies(
      sessionResponse,
      NextResponse.redirect(loginUrl),
    );
  }

  /* Com o site em manutenção o marketing vai para a «Em construção»; sem
     manutenção é a «Em construção» que volta para a página inicial. */
  const maintenance = process.env.MAINTENANCE_MODE === "true";
  if (
    maintenance
      ? MARKETING_ROUTE_ROOTS.has(root)
      : root === UNDER_CONSTRUCTION_ROOT
  ) {
    const targetUrl = request.nextUrl.clone();
    targetUrl.pathname = localizedPath(
      locale,
      maintenance ? `/${UNDER_CONSTRUCTION_ROOT}` : "/",
    );
    targetUrl.search = "";

    return copyResponseCookies(
      sessionResponse,
      NextResponse.redirect(targetUrl),
    );
  }

  return copyResponseCookies(sessionResponse, intl(request));
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};

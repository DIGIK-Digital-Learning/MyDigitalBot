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
    loginUrl.pathname =
      locale === routing.defaultLocale ? "/login" : `/${locale}/login`;
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

  return copyResponseCookies(sessionResponse, intl(request));
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};

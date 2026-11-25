// src/middleware.js
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";
import { NextResponse } from "next/server";
// import { updateSession } from "@/utils/supabase/middleware"; // ← don't run on public

const intl = createMiddleware(routing);

// Língua de um caminho: /en/... = en, /pt/... = pt, sem prefixo = default (pt).
function localeOfPath(pathname) {
  const first = pathname.split("/")[1];
  return routing.locales.includes(first) ? first : routing.defaultLocale;
}

// O next-intl redireciona sempre com 307 (temporário). Quando o redirect só
// corrige o URL dentro da mesma língua (/how-it-works -> /como-funciona,
// /pt/solucao -> /solucao, /en/solucao -> /en/solution), passa a 308 para o
// Google transferir a autoridade para o URL novo. Os que mudam de língua
// (/ -> /en pelo cookie ou Accept-Language) ficam 307: dependem do visitante.
function makeCanonicalRedirectsPermanent(request, response) {
  if (response.status !== 307) return response;
  const location = response.headers.get("location");
  if (!location) return response;

  const from = new URL(request.url).pathname;
  const to = new URL(location, request.url).pathname;
  if (localeOfPath(from) !== localeOfPath(to)) return response;

  const permanent = NextResponse.redirect(new URL(location, request.url), 308);
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "location") permanent.headers.set(key, value);
  });
  return permanent;
}

// Public routes that must never be redirected to /login
const PUBLIC = [
  /^\/(pt|en)\/login$/,
  /^\/(pt|en)\/reset\/confirm$/,
  /^\/(pt|en)\/reset(\/request)?$/,
  /^\/(pt|en)\/privacy(?:\/.*)?$/,
  /^\/(pt|en)\/terms(?:\/.*)?$/,
  /^\/(pt|en)\/security(?:\/.*)?$/,

  /^\/$/,
  /^\/(pt|en)$/,
];

export function middleware(request) {
  const p = new URL(request.url).pathname;

  // Skip API/Next/static
  if (p.startsWith("/api") || p.startsWith("/_next") || /\.[\w]+$/.test(p)) {
    return NextResponse.next();
  }

  // Locale handling first (may redirect only to add the locale)
  const intlRes = intl(request);
  if (intlRes) return makeCanonicalRedirectsPermanent(request, intlRes);

  // Allow public routes with NO auth guard at all
  if (PUBLIC.some((re) => re.test(p))) {
    return NextResponse.next();
  }

  // For the rest of your app you can run your usual session logic here
  // const sessionRes = updateSession(request);
  // if (sessionRes instanceof Response) return sessionRes;
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};

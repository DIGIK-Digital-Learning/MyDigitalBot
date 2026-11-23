import { notFound } from "next/navigation";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { ConfirmProvider } from "../components/Confirm/ConfirmProvider";
import NavCursor from "../components/NavCursor/NavCursor";
import TopLoader from "./(marketing)/components/TopLoader/TopLoader";
import SiteUnavailable from "../components/SiteUnavailable/SiteUnavailable";
import { AlertProvider } from "../components/Alert/AlertProvider";
import { routing } from "@/i18n/routing";

export function generateStaticParams() {
  return [{ locale: "en" }, { locale: "pt" }];
}

export default async function LocaleLayout({ children, params }) {
  // Caminhos como /llms.txt caíam aqui como se fossem uma língua e
  // devolviam a homepage com 200. Língua desconhecida = 404.
  const { locale: requestedLocale } = await params;
  if (!hasLocale(routing.locales, requestedLocale)) notFound();

  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <TopLoader />
      <NavCursor />
      <AlertProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </AlertProvider>
    </NextIntlClientProvider>
  );
}

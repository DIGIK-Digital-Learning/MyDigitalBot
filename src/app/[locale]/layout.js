import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { ConfirmProvider } from "../components/Confirm/ConfirmProvider";
import NavCursor from "../components/NavCursor/NavCursor";
import TopLoader from "./(marketing)/components/TopLoader/TopLoader";
import SiteUnavailable from "../components/SiteUnavailable/SiteUnavailable";
import { AlertProvider } from "../components/Alert/AlertProvider";
import HtmlLang from "../components/HtmlLang/HtmlLang";

export function generateStaticParams() {
  return [{ locale: "en" }, { locale: "pt" }];
}

export default async function LocaleLayout({ children }) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <HtmlLang />
      <TopLoader />
      <NavCursor />
      <AlertProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </AlertProvider>
    </NextIntlClientProvider>
  );
}

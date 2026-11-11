import localFont from "next/font/local";
import "./globals.css";
import { getLocale } from "next-intl/server";
import { AuthProvider } from "./AuthContext";
import { GlobalLoaderProvider } from "./LoadingScreen/GlobalLoaderContext";

const inter = localFont({
  src: [
    {
      path: "./fonts/InterVariable.woff2",
      style: "normal",
      weight: "100 900",
    },
  ],
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
  title: "MyDigitalBot",
  description:
    "Send any type of messages to your employees or let them have a chat on WhatsApp with a Virtual Assistant powered by AI",
  icons: {
    icon: "/favicon.ico",
  },
};

export default async function RootLayout({ children }) {
  /*
   * #243: a língua da página vem do pedido (o URL, via next-intl) e não do
   * cookie NEXT_LOCALE. Na primeira visita não há cookie e uma página em PT
   * dizia ao browser que estava em inglês (e o Chrome oferecia traduzi-la).
   */
  const locale = await getLocale();

  return (
    <html lang={locale} className={inter.variable}>
      <body>
        <GlobalLoaderProvider>
          <AuthProvider>{children}</AuthProvider>
        </GlobalLoaderProvider>
      </body>
    </html>
  );
}

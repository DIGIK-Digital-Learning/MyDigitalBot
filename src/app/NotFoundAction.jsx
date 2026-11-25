"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

// Botão da página 404. Antes lia o caminho e os cookies no servidor
// (headers()/cookies()), mas o not-found da raiz entra na árvore de todas as
// páginas e isso tornava o site inteiro dinâmico. Agora decide no browser:
// começa em "Ir para Login" (PT) e ajusta depois de montar.
const DEFAULT_TARGET = { href: "/pt/login", label: "Ir para Login" };

export default function NotFoundAction({ className }) {
  const [target, setTarget] = useState(DEFAULT_TARGET);

  useEffect(() => {
    const first = window.location.pathname.split("/").filter(Boolean)[0];
    const locale = /^(pt|en)$/i.test(first ?? "") ? first.toLowerCase() : "pt";

    // Mesmo critério de antes: há sessão se existirem estes cookies.
    const cookieNames = document.cookie
      .split(";")
      .map((part) => part.split("=")[0].trim());
    const isAuthed =
      cookieNames.includes("sb-access-token") ||
      cookieNames.includes("sb:token");

    setTarget({
      href: `/${locale}${isAuthed ? "/users" : "/login"}`,
      label: isAuthed ? "Ir para Utilizadores" : "Ir para Login",
    });
  }, []);

  return (
    <Link href={target.href} className={className}>
      {target.label}
    </Link>
  );
}

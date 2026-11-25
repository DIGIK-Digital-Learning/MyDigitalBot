"use client";

import { Link } from "@/i18n/navigation";
import { startTopLoader } from "./TopLoader";

// Sem useSearchParams/usePathname (não eram usados): o useSearchParams
// obrigava a um <Suspense> à volta de cada link para a página ser estática.
// O URL atual lê-se de window.location no clique.
export default function LoaderLink({ onClick, href, ...props }) {
  function isModifiedEvent(event) {
    return (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    );
  }

  function isSameUrl(targetHref) {
    if (typeof window === "undefined") return false;
    if (typeof targetHref !== "string") return false;

    const current = new URL(window.location.href);
    const target = new URL(targetHref, window.location.origin);

    return (
      current.pathname === target.pathname &&
      current.search === target.search &&
      current.hash === target.hash
    );
  }

  function handleClick(event) {
    onClick?.(event);

    if (event.defaultPrevented || isModifiedEvent(event)) {
      return;
    }

    if (typeof href === "string" && isSameUrl(href)) {
      return;
    }

    startTopLoader();
  }

  return <Link href={href} onClick={handleClick} {...props} />;
}

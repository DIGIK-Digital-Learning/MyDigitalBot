"use client";

import { SkeletonPage } from "@/app/components/Skeleton/Skeleton";
import { usePathname } from "@/i18n/navigation";

import DetailLoading from "./detail/loading";

/* Também aparece ao abrir o detalhe vindo de outra página (#272). */
export default function Loading() {
  const pathname = usePathname();

  if (pathname.startsWith("/teams-groups/detail")) {
    return <DetailLoading />;
  }

  return <SkeletonPage stats={2} columns={4} />;
}

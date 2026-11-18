"use client";

import { usePathname } from "@/i18n/navigation";

import BroadcastSkeleton from "./BroadcastSkeleton";
import MediaLoading from "./media/loading";
import QuestionsLoading from "./questions/loading";
import ScheduledLoading from "./scheduled/loading";
import TrackedLinksLoading from "./tracked-links/loading";

/*
 * Este loading também aparece ao entrar numa página de baixo (Agendadas,
 * Perguntas…) vindo de outra secção, por isso escolhe o skeleton pelo
 * caminho para onde se vai (#272).
 */
const CHILDREN = [
  ["/broadcast/scheduled", ScheduledLoading],
  ["/broadcast/questions", QuestionsLoading],
  ["/broadcast/tracked-links", TrackedLinksLoading],
  ["/broadcast/media", MediaLoading],
];

export default function Loading() {
  const pathname = usePathname();
  const Child = CHILDREN.find(([path]) => pathname.startsWith(path))?.[1];

  return Child ? <Child /> : <BroadcastSkeleton />;
}

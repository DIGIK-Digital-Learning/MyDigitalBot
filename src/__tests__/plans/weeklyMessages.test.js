import { describe, expect, it } from "vitest";

import {
  weeklyMessagesResetAt,
  weeklyMessagesWeekStart,
} from "@/lib/plans/weeklyMessages";

const iso = (date) => date.toISOString();

describe("weeklyMessagesWeekStart", () => {
  it.each([
    /* Sexta, 23 de outubro de 2026 (verão, UTC+1): segunda 19 às 00:00. */
    ["2026-10-23T10:00:00Z", "2026-10-18T23:00:00.000Z", "a meio da semana"],
    /* Domingo às 23:59 de Lisboa ainda é a mesma semana. */
    ["2026-10-25T23:59:00Z", "2026-10-18T23:00:00.000Z", "domingo à noite"],
    /* Segunda 26 às 00:00 de Lisboa (já inverno, UTC+0): semana nova. */
    ["2026-10-26T00:00:00Z", "2026-10-26T00:00:00.000Z", "segunda às 00:00"],
    /* Segunda às 00:00 de Lisboa no verão é domingo às 23:00 UTC. */
    ["2026-10-18T23:00:00Z", "2026-10-18T23:00:00.000Z", "segunda de verão"],
    ["2026-10-18T22:59:00Z", "2026-10-11T23:00:00.000Z", "ainda domingo"],
    /* Inverno. */
    ["2026-01-15T12:00:00Z", "2026-01-12T00:00:00.000Z", "inverno"],
  ])("%s → %s (%s)", (now, expected) => {
    expect(iso(weeklyMessagesWeekStart(new Date(now)))).toBe(expected);
  });
});

describe("weeklyMessagesResetAt", () => {
  it.each([
    /* A semana da mudança de hora acaba já em hora de inverno. */
    ["2026-10-23T10:00:00Z", "2026-10-26T00:00:00.000Z"],
    ["2026-01-15T12:00:00Z", "2026-01-19T00:00:00.000Z"],
    /* A semana da mudança para o verão acaba já em hora de verão. */
    ["2026-03-25T12:00:00Z", "2026-03-29T23:00:00.000Z"],
  ])("%s → %s", (now, expected) => {
    expect(iso(weeklyMessagesResetAt(new Date(now)))).toBe(expected);
  });
});

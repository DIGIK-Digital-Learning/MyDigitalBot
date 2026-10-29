import { describe, expect, it } from "vitest";

import { dailySendsDayStart, dailySendsResetAt } from "@/lib/plans/dailySends";

const iso = (date) => date.toISOString();

describe("dailySendsDayStart (#188)", () => {
  it.each([
    /* Verão (UTC+1): 00:01 de Lisboa é 23:01 UTC do dia anterior. */
    ["2026-10-22T10:00:00Z", "2026-10-21T23:01:00.000Z", "a meio do dia"],
    ["2026-10-21T23:00:30Z", "2026-10-20T23:01:00.000Z", "00:00 ainda é ontem"],
    ["2026-10-21T23:01:00Z", "2026-10-21T23:01:00.000Z", "00:01 já é hoje"],
    /* Inverno (UTC+0). */
    ["2026-01-15T00:00:30Z", "2026-01-14T00:01:00.000Z", "inverno, 00:00"],
    ["2026-01-15T00:01:00Z", "2026-01-15T00:01:00.000Z", "inverno, 00:01"],
    /* Dia da mudança de hora para o inverno (25 de outubro de 2026). */
    ["2026-10-25T12:00:00Z", "2026-10-24T23:01:00.000Z", "dia de 25 horas"],
    /* Dia da mudança para o verão (29 de março de 2026). */
    ["2026-03-29T12:00:00Z", "2026-03-29T00:01:00.000Z", "dia de 23 horas"],
  ])("%s → %s (%s)", (now, expected) => {
    expect(iso(dailySendsDayStart(new Date(now)))).toBe(expected);
  });
});

describe("dailySendsResetAt (#188)", () => {
  it.each([
    ["2026-10-22T10:00:00Z", "2026-10-22T23:01:00.000Z"],
    ["2026-01-15T12:00:00Z", "2026-01-16T00:01:00.000Z"],
    /* A meio do dia de 25 horas, o reset já é em hora de inverno. */
    ["2026-10-25T12:00:00Z", "2026-10-26T00:01:00.000Z"],
    ["2026-03-28T12:00:00Z", "2026-03-29T00:01:00.000Z"],
  ])("%s → %s", (now, expected) => {
    expect(iso(dailySendsResetAt(new Date(now)))).toBe(expected);
  });
});

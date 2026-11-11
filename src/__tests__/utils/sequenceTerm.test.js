// @vitest-environment node

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
 * #237: o envio que avança quando cada mensagem é lida chama-se «sequência de
 * mensagens» (EN «message sequence»). A app usava quatro nomes para a mesma
 * coisa: corrente, corrente de leitura, cadeia e sequência de leitura.
 * As chaves (`chainHelp`, `readChains`…) e o código ficam como estavam: isto só
 * olha para o que a pessoa lê.
 */

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

function texts(node, path = "") {
  return Object.entries(node).flatMap(([key, value]) => {
    const where = path ? `${path}.${key}` : key;
    return value && typeof value === "object"
      ? texts(value, where)
      : [[where, String(value)]];
  });
}

describe("«sequência de mensagens» em vez de «corrente»", () => {
  it.each([
    ["pt", /corrente|cadeia/i],
    ["en", /chain/i],
  ])("%s: nenhum texto usa o nome antigo", (locale, oldTerm) => {
    const messages = JSON.parse(read(`../../messages/${locale}.json`));
    const left = texts(messages).filter(([, text]) => oldTerm.test(text));
    expect(left).toEqual([]);
  });

  it("os erros que a página de envio mostra também usam o termo novo", () => {
    const route = read("../../app/api/broadcast/read-chain/route.js");
    const errors = route.match(/error:\s*[`"][^`"]*[`"]/g) ?? [];
    expect(errors.filter((line) => /chain/i.test(line))).toEqual([]);
  });
});

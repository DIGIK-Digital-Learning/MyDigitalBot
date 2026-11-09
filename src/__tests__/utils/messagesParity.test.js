// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * As duas línguas têm de ter os mesmos textos: uma chave que só existe em
 * português dá MISSING_MESSAGE no ecrã em inglês. E nenhuma chave pode
 * aparecer duas vezes no mesmo objeto: o JSON fica só com a última, e a
 * outra é texto morto que engana quem a edita.
 */

const LOCALES = ["pt", "en"];

const raw = (locale) =>
  readFileSync(resolve("src/messages", `${locale}.json`), "utf8");

function flatten(object, prefix = "", out = {}) {
  for (const [key, value] of Object.entries(object)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object") flatten(value, path, out);
    else out[path] = value;
  }
  return out;
}

/* Os argumentos ICU de um texto: {plan}, {count, plural, …}. */
const argumentsOf = (text) =>
  [...new Set(String(text).match(/\{(\w+)(?=[,}])/g) || [])].sort();

/* Chaves repetidas no mesmo objeto, lidas do texto do ficheiro. */
function duplicateKeys(text) {
  const duplicates = [];
  const stack = [];
  const pattern = /"((?:[^"\\]|\\.)*)"\s*(:)?|[{}[\]]/g;
  let match;

  while ((match = pattern.exec(text))) {
    const token = match[0];
    if (token === "{")
      stack.push({ keys: new Set(), path: stack.at(-1)?.last });
    else if (token === "[") stack.push(null);
    else if (token === "}" || token === "]") stack.pop();
    else if (match[2] && stack.at(-1)) {
      const scope = stack.at(-1);
      if (scope.keys.has(match[1]))
        duplicates.push(`${scope.path ?? ""}.${match[1]}`);
      scope.keys.add(match[1]);
      scope.last = match[1];
    }
  }

  return duplicates;
}

describe("textos das duas línguas", () => {
  const [pt, en] = LOCALES.map((locale) => flatten(JSON.parse(raw(locale))));

  it("têm as mesmas chaves", () => {
    expect(Object.keys(en).filter((key) => !(key in pt))).toEqual([]);
    expect(Object.keys(pt).filter((key) => !(key in en))).toEqual([]);
  });

  it("usam os mesmos argumentos em cada texto", () => {
    const different = Object.keys(pt).filter(
      (key) => argumentsOf(pt[key]).join() !== argumentsOf(en[key]).join(),
    );
    expect(different).toEqual([]);
  });

  it.each(LOCALES)("%s.json não repete chaves", (locale) => {
    expect(duplicateKeys(raw(locale))).toEqual([]);
  });
});

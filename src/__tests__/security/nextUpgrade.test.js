// @vitest-environment node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readJson = (name) => JSON.parse(readFileSync(resolve(name), "utf8"));

describe("Atualização de segurança do Next.js", () => {
  it("fixa a versão corrigida e mantém o lock coerente", () => {
    const manifest = readJson("package.json");
    const lock = readJson("package-lock.json");

    expect(manifest.dependencies.next).toBe("16.3.5");
    expect(lock.packages[""].dependencies.next).toBe("16.3.5");
    expect(lock.packages["node_modules/next"].version).toBe("16.3.5");
    expect(lock.packages["node_modules/next"].optionalDependencies.sharp).toBe("^0.35.4");
    // O Node resolve primeiro a dependência dentro de Next. A versão da raiz
    // é usada pelos uploads da aplicação e pode ser diferente sem afetar Next.
    const sharpForNext = lock.packages["node_modules/next/node_modules/sharp"]
      ?? lock.packages["node_modules/sharp"];
    expect(sharpForNext.version).toBe("0.35.4");
  });
});

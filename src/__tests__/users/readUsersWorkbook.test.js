import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import readUsersWorkbook from "@/app/[locale]/(app)/users/ImportUsersModal/readUsersWorkbook";
import mapCsvRow from "@/app/[locale]/(app)/users/ImportUsersModal/helpers";

async function build(fill) {
  const workbook = new ExcelJS.Workbook();
  fill(workbook);
  return workbook.xlsx.writeBuffer();
}

describe("readUsersWorkbook", () => {
  it("reads the downloadable template: one example row, no empty rows", async () => {
    const buffer = readFileSync("public/templates/user_import_template.xlsx");

    const rows = await readUsersWorkbook(buffer, ExcelJS);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: "Exemplo",
      email: "example@example.com",
      phone_number: "+351912345658",
      tags: "Grupo 1,Grupo 2",
      assistant_position: "1",
    });
  });

  it("prefers the Users sheet, keeps empty cells as '' and skips empty rows", async () => {
    const buffer = await build((workbook) => {
      workbook.addWorksheet("Instruções").addRow(["Lê isto primeiro"]);
      const sheet = workbook.addWorksheet("Users");
      sheet.addRow(["name", "email", "phone_number", "assistant_id"]);
      sheet.addRow(["Ana Silva", "ana@example.com", 912345678, 3]);
      sheet.addRow([]);
      sheet.addRow(["Só nome"]);
    });

    const rows = await readUsersWorkbook(buffer, ExcelJS);

    expect(rows).toEqual([
      { name: "Ana Silva", email: "ana@example.com", phone_number: "912345678", assistant_id: "3" },
      { name: "Só nome", email: "", phone_number: "", assistant_id: "" },
    ]);
  });

  it("uses the first sheet when there is no Users sheet", async () => {
    const buffer = await build((workbook) => {
      const sheet = workbook.addWorksheet("Folha1");
      sheet.addRow(["name"]);
      sheet.addRow(["Rui"]);
      workbook.addWorksheet("Outra").addRow(["name"]);
    });

    expect(await readUsersWorkbook(buffer, ExcelJS)).toEqual([{ name: "Rui" }]);
  });

  it("finds a table that does not start at A1 and names blank or repeated headers like SheetJS", async () => {
    const buffer = await build((workbook) => {
      const sheet = workbook.addWorksheet("Users");
      sheet.getCell("C3").value = "name";
      sheet.getCell("D3").value = "email";
      sheet.getCell("F3").value = "email";
      sheet.getCell("C4").value = "Maria";
      sheet.getCell("D4").value = "m@example.com";
      sheet.getCell("E4").value = "sem cabeçalho";
      sheet.getCell("F4").value = "m2@example.com";
    });

    expect(await readUsersWorkbook(buffer, ExcelJS)).toEqual([
      { name: "Maria", email: "m@example.com", __EMPTY: "sem cabeçalho", email_1: "m2@example.com" },
    ]);
  });

  it("reads rich text, links and formula results as plain text", async () => {
    const buffer = await build((workbook) => {
      const sheet = workbook.addWorksheet("Users");
      sheet.addRow(["name", "email", "phone_number", "tags"]);
      sheet.addRow([
        { richText: [{ text: "Jo" }, { text: "ão", font: { bold: true } }] },
        { text: "joao@example.com", hyperlink: "mailto:joao@example.com" },
        { formula: "910000000+1", result: 910000001 },
        { formula: '"x"&"y"', result: "xy" },
      ]);
    });

    expect(await readUsersWorkbook(buffer, ExcelJS)).toEqual([
      { name: "João", email: "joao@example.com", phone_number: "910000001", tags: "xy" },
    ]);
  });

  it("keeps every digit of a long phone stored as a number", async () => {
    // O SheetJS devolvia "3.51912E+11", e o número ficava errado.
    const buffer = await build((workbook) => {
      const sheet = workbook.addWorksheet("Users");
      sheet.addRow(["name", "phone_number"]);
      sheet.addRow(["Grande", 351912345678]);
    });

    const [row] = await readUsersWorkbook(buffer, ExcelJS);

    expect(row.phone_number).toBe("351912345678");
    expect(mapCsvRow({ ...row, phone_number: "+351912345678" }).phoneNational).toBe("912345678");
  });

  it("returns no rows for an empty sheet", async () => {
    const buffer = await build((workbook) => {
      workbook.addWorksheet("Users");
    });

    expect(await readUsersWorkbook(buffer, ExcelJS)).toEqual([]);
  });
});

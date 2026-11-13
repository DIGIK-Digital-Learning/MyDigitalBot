/*
 * Lê a folha de utilizadores de um .xlsx com o ExcelJS.
 *
 * Substitui o XLSX.utils.sheet_to_json do SheetJS, que deixou de ter
 * correções de segurança no npm. Devolve o mesmo formato:
 * - usa a folha «Users» ou, se não existir, a primeira;
 * - a primeira linha com valores dá os cabeçalhos;
 * - cada linha seguinte é um objeto { cabeçalho: texto }, com "" nas
 *   células vazias, e as linhas vazias ficam de fora;
 * - cabeçalhos vazios ficam "__EMPTY", "__EMPTY_1"…, e os repetidos
 *   ganham "_1", "_2"…, como no SheetJS.
 *
 * Devolve null se o ficheiro não tiver folhas.
 */

function cellText(cell) {
  const value = cell?.value;

  if (value == null) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  if (typeof value === "object") {
    // Fórmula: interessa o resultado calculado.
    if ("formula" in value || "sharedFormula" in value) {
      const result = value.result;
      if (result == null || typeof result === "object") return "";
      return String(result);
    }

    // Texto formatado e hiperligações: só o texto.
    if (Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
    if ("text" in value) return String(value.text ?? "");

    // Erros de fórmula (#N/A, #DIV/0!…) não são dados.
    if ("error" in value) return "";

    return "";
  }

  return String(value);
}

function uniqueHeaders(rawHeaders) {
  const seen = new Map();
  let empty = 0;

  return rawHeaders.map((raw) => {
    let header = raw;

    if (!header) {
      header = empty === 0 ? "__EMPTY" : `__EMPTY_${empty}`;
      empty += 1;
      return header;
    }

    const count = seen.get(header) || 0;
    seen.set(header, count + 1);

    return count === 0 ? header : `${header}_${count}`;
  });
}

export default async function readUsersWorkbook(buffer, ExcelJS) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet =
    workbook.getWorksheet("Users") || workbook.worksheets[0] || null;

  if (!worksheet) return null;

  // Só as linhas com algum texto, e a coluna mais à esquerda e mais à
  // direita que têm valores.
  const rows = [];
  let firstColumn = Infinity;
  let lastColumn = 0;

  worksheet.eachRow((row) => {
    const texts = new Map();

    row.eachCell((cell, column) => {
      const text = cellText(cell);
      if (text === "") return;

      texts.set(column, text);
      firstColumn = Math.min(firstColumn, column);
      lastColumn = Math.max(lastColumn, column);
    });

    if (texts.size) rows.push(texts);
  });

  if (!rows.length) return [];

  const columns = [];
  for (let column = firstColumn; column <= lastColumn; column += 1) {
    columns.push(column);
  }

  const [headerRow, ...dataRows] = rows;
  const headers = uniqueHeaders(
    columns.map((column) => headerRow.get(column) || ""),
  );

  return dataRows.map((texts) =>
    Object.fromEntries(
      columns.map((column, index) => [headers[index], texts.get(column) || ""]),
    ),
  );
}

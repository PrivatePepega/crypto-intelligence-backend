import * as XLSX from "xlsx";

export interface AaiiRawObservation {
  date: number;
  bullish: number | null;
  neutral: number | null;
  bearish: number | null;
  bullBearSpread: number | null;
}

export function parseAaiiSentiment(
  buffer: ArrayBuffer,
): AaiiRawObservation[] {
  const workbook = XLSX.read(buffer, {
    type: "array",
  });

  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new Error("AAII workbook contains no sheets");
  }

  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error(`AAII workbook sheet "${sheetName}" was not found`);
  }

  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(
    sheet,
    {
      header: 1,
      defval: null,
      range: 3,
    },
  );

  return rows
    .filter((row) => typeof row[0] === "number")
    .map((row) => ({
      date: row[0] as number,
      bullish: typeof row[1] === "number" ? row[1] : null,
      neutral: typeof row[2] === "number" ? row[2] : null,
      bearish: typeof row[3] === "number" ? row[3] : null,
      bullBearSpread: typeof row[5] === "number" ? row[5] : null,
    }));
}
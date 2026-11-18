/**
 * src/lib/csv.ts
 *
 * Pure CSV formatting and downloading utilities.
 * Handles proper escaping for commas, quotes, and newlines.
 */

export interface CsvColumn<T> {
  header: string;
  accessor: (row: T) => string | number | boolean | null | undefined;
}

/**
 * Escapes a cell according to RFC 4180:
 * If the value contains quotes, commas, or newlines, enclose in double quotes and escape internal quotes by doubling them.
 */
export function escapeCsvCell(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Converts an array of objects into a CSV string with a header row.
 */
export function toCsv<T>(rows: readonly T[], columns: readonly CsvColumn<T>[]): string {
  const headerLine = columns.map((col) => escapeCsvCell(col.header)).join(",");
  if (rows.length === 0) {
    return headerLine;
  }

  const lines = rows.map((row) =>
    columns.map((col) => escapeCsvCell(col.accessor(row))).join(","),
  );

  return [headerLine, ...lines].join("\r\n");
}

/**
 * Downloads a CSV string in the browser with a UTF-8 BOM so Excel opens it correctly.
 */
export function downloadCsv(filename: string, csvContent: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  // UTF-8 BOM (\uFEFF) ensures Excel decodes special characters and dates properly
  const blob = new Blob(["\uFEFF", csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename.endsWith(".csv") ? filename : `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Downloads a JSON string or object in the browser.
 */
export function downloadJson(filename: string, data: unknown): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  const jsonStr = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename.endsWith(".json") ? filename : `${filename}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

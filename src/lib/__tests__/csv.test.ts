/**
 * src/lib/__tests__/csv.test.ts
 */

import { describe, it, expect } from "vitest";
import { escapeCsvCell, toCsv, type CsvColumn } from "../csv";

describe("CSV Utilities", () => {
  it("escapes cells containing commas, quotes, and newlines according to RFC 4180", () => {
    expect(escapeCsvCell("simple")).toBe("simple");
    expect(escapeCsvCell(123)).toBe("123");
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
    expect(escapeCsvCell("hello, world")).toBe('"hello, world"');
    expect(escapeCsvCell('say "hello"')).toBe('"say ""hello"""');
    expect(escapeCsvCell("line 1\nline 2")).toBe('"line 1\nline 2"');
    expect(escapeCsvCell('mixed, "value"\nnext')).toBe('"mixed, ""value""\nnext"');
  });

  it("formats table rows to CSV with header line", () => {
    interface Sample {
      name: string;
      count: number;
      notes: string;
    }

    const cols: CsvColumn<Sample>[] = [
      { header: "Name", accessor: (r) => r.name },
      { header: "Count", accessor: (r) => r.count },
      { header: "Notes", accessor: (r) => r.notes },
    ];

    const data: Sample[] = [
      { name: "Mandi House", count: 12, notes: "Cleared quickly" },
      { name: 'ITO "Special"', count: 45, notes: "Heavy rain, delay" },
    ];

    const csv = toCsv(data, cols);
    const lines = csv.split("\r\n");

    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe("Name,Count,Notes");
    expect(lines[1]).toBe("Mandi House,12,Cleared quickly");
    expect(lines[2]).toBe('"ITO ""Special""",45,"Heavy rain, delay"');
  });

  it("handles empty dataset by returning only headers", () => {
    const cols: CsvColumn<{ id: string }>[] = [
      { header: "ID", accessor: (r) => r.id },
      { header: "Status", accessor: () => "OK" },
    ];

    const csv = toCsv([], cols);
    expect(csv).toBe("ID,Status");
  });
});

import { parse as parseCsv } from "csv-parse/sync";
import { extname } from "node:path";
import ExcelJS from "exceljs";
import { RouteLeg } from "../types/state";

type RawRow = Record<string, unknown>;

const normalizeHeader = (header: string): string =>
  header.trim().toLowerCase().replace(/[\s_-]+/g, "");

const normalizeValue = (value: unknown): string => String(value ?? "").trim();
const toNodeBuffer = (value: Buffer | Uint8Array): Buffer =>
  Buffer.isBuffer(value) ? value : Buffer.from(value);

const parseNumber = (value: unknown): number | null => {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseBoolean = (value: unknown): boolean => {
  if (typeof value === "boolean") {
    return value;
  }

  const normalized = normalizeValue(value).toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "y";
};

const pickField = (row: RawRow, keys: string[]): unknown => {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && normalizeValue(row[key]) !== "") {
      return row[key];
    }
  }
  return undefined;
};

const asNormalizedRows = (rows: RawRow[]): RawRow[] => {
  return rows.map((row) => {
    const normalizedRow: RawRow = {};
    for (const [rawKey, value] of Object.entries(row)) {
      normalizedRow[normalizeHeader(rawKey)] = value;
    }
    return normalizedRow;
  });
};

const mapRowsToLegs = (rows: RawRow[]): RouteLeg[] => {
  const legs: RouteLeg[] = [];

  for (const row of rows) {
    const systemRaw = pickField(row, ["systemname", "system", "starsystem", "star", "target"]);
    const systemName = normalizeValue(systemRaw);
    if (!systemName) {
      continue;
    }

    legs.push({
      systemName,
      distance: parseNumber(pickField(row, ["distance", "dist", "jumpdistance"])),
      distanceRemaining: parseNumber(
        pickField(row, ["distanceremaining", "remainingdistance", "remaining"])
      ),
      fuelLeft: parseNumber(pickField(row, ["fuelleft", "fuelremaining", "fuel"])),
      fuelUsed: parseNumber(pickField(row, ["fuelused", "fuelconsumed"])),
      refuel: parseBoolean(pickField(row, ["refuel", "scoop", "refuelstop"])),
      neutronStar: parseBoolean(pickField(row, ["neutronstar", "neutron", "isneutron"]))
    });
  }

  if (legs.length === 0) {
    throw new Error("Route file does not contain a valid system column.");
  }

  return legs;
};

const parseCsvRows = (buffer: Buffer | Uint8Array): RawRow[] => {
  const rows = parseCsv(toNodeBuffer(buffer), {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    trim: true
  }) as RawRow[];

  return asNormalizedRows(rows);
};

const toPlainCellValue = (value: ExcelJS.CellValue): unknown => {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "object") {
    const objectValue = value as unknown as Record<string, unknown>;

    if ("text" in objectValue) {
      return objectValue.text;
    }

    if ("result" in objectValue) {
      return objectValue.result ?? "";
    }

    if ("richText" in objectValue && Array.isArray(objectValue.richText)) {
      return objectValue.richText
        .map((chunk) =>
          typeof chunk === "object" && chunk !== null && "text" in chunk
            ? String((chunk as Record<string, unknown>).text ?? "")
            : ""
        )
        .join("");
    }

    if ("hyperlink" in objectValue) {
      return objectValue.text ?? objectValue.hyperlink;
    }
  }

  return value;
};

const parseExcelRows = async (buffer: Buffer | Uint8Array): Promise<RawRow[]> => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(toNodeBuffer(buffer) as any);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("Excel file has no sheets.");
  }

  const headerValues = worksheet.getRow(1).values as unknown[];
  const headers = headerValues
    .map((header) => normalizeHeader(String(header ?? "")))
    .slice(1);

  const rows: RawRow[] = [];
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const parsedRow: RawRow = {};
    let hasContent = false;

    for (let columnNumber = 1; columnNumber <= headers.length; columnNumber += 1) {
      const header = headers[columnNumber - 1];
      if (!header) {
        continue;
      }

      const rawCellValue = toPlainCellValue(row.getCell(columnNumber).value);
      parsedRow[header] = rawCellValue;
      if (normalizeValue(rawCellValue)) {
        hasContent = true;
      }
    }

    if (hasContent) {
      rows.push(parsedRow);
    }
  }

  return rows;
};

export const parseRouteFile = async (
  buffer: Buffer | Uint8Array,
  fileName: string
): Promise<RouteLeg[]> => {
  const extension = extname(fileName).toLowerCase();
  const rows = extension === ".csv" ? parseCsvRows(buffer) : await parseExcelRows(buffer);
  return mapRowsToLegs(rows);
};

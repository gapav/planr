import type { TeamPlayerInput } from "./types";

const aliases = {
  fullName: ["navn", "full name", "fullname", "name", "spiller", "player", "medlem", "member"],
  firstName: ["fornavn", "first name", "firstname", "given name"],
  lastName: ["etternavn", "last name", "lastname", "surname", "family name"],
  email: ["e-post", "epost", "email", "email address", "e-mail"],
  jerseyNumber: ["draktnummer", "drakt nr", "draktnr", "nummer", "jersey number", "shirt number", "number"],
  externalId: ["hoopit id", "medlemsnummer", "medlem id", "member id", "user id", "bruker id", "external id"],
} as const;

type Column = keyof typeof aliases;
type ColumnMap = Partial<Record<Column, number>>;

function normalized(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase("nb-NO").replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

export function minimizePlayerName(value: string) {
  const parts = value.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts[0]} ${parts.at(-1)?.charAt(0).toLocaleUpperCase("nb-NO")}.`;
}

function mapColumns(row: readonly unknown[]): ColumnMap {
  const columns: ColumnMap = {};
  row.forEach((cell, index) => {
    const heading = normalized(cell);
    for (const [column, names] of Object.entries(aliases) as [Column, readonly string[]][]) {
      if (columns[column] === undefined && names.some((name) => normalized(name) === heading)) columns[column] = index;
    }
  });
  return columns;
}

function hasNameColumn(columns: ColumnMap) {
  return columns.fullName !== undefined || columns.firstName !== undefined || columns.lastName !== undefined;
}

function textAt(row: readonly unknown[], index: number | undefined) {
  if (index === undefined) return "";
  return String(row[index] ?? "").trim().replace(/\s+/g, " ");
}

export interface RosterParseResult {
  players: TeamPlayerInput[];
  skippedRows: number;
  headerRow: number;
}

export function parseRosterRows(rows: readonly (readonly unknown[])[]): RosterParseResult {
  const headerIndex = rows.slice(0, 15).findIndex((row) => hasNameColumn(mapColumns(row)));
  if (headerIndex < 0) throw new Error("Could not find a name column. Use ‘Navn’, or ‘Fornavn’ and ‘Etternavn’.");
  const columns = mapColumns(rows[headerIndex]);
  const players: TeamPlayerInput[] = [];
  const seen = new Set<string>();
  let skippedRows = 0;

  for (const row of rows.slice(headerIndex + 1)) {
    const sourceName = textAt(row, columns.fullName) || [textAt(row, columns.firstName), textAt(row, columns.lastName)].filter(Boolean).join(" ");
    if (!sourceName || normalized(sourceName) === "total") { skippedRows += 1; continue; }
    const email = textAt(row, columns.email).toLocaleLowerCase("nb-NO") || null;
    const jerseyNumber = textAt(row, columns.jerseyNumber) || null;
    const externalId = textAt(row, columns.externalId) || null;
    const fullName = minimizePlayerName(sourceName);
    const key = externalId ? `id:${normalized(externalId)}` : email ? `email:${email}` : `name:${normalized(fullName)}:${jerseyNumber ?? ""}`;
    if (seen.has(key)) { skippedRows += 1; continue; }
    seen.add(key);
    players.push({ fullName, jerseyNumber });
  }
  if (!players.length) throw new Error("The spreadsheet did not contain any player rows.");
  return { players, skippedRows, headerRow: headerIndex + 1 };
}

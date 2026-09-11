/**
 * Appends a business day to the Cheetah Plains "Daily Detailed Report" workbook.
 *
 * The workbook the revenue team keeps is one sheet per business day — `07Sep2026`,
 * `04Sep2026`, `31Aug2026` … — each holding three financial-year blocks of month
 * rows with quarter sub-totals, budget, provisional, same-time-last-year and
 * last-year columns, almost all of it live Excel formulas.
 *
 * Rebuilding that from scratch would lose the layout and the years of budget /
 * last-year data it carries, and reading 380-odd sheets through a spreadsheet
 * library exhausts an edge worker. So a day is added the way the team adds it:
 * the newest day sheet is copied, the previous day's figures shift into the
 * "previous day" columns, and the current-day columns take the day's measured
 * figures. Everything else — budget, last year, all formulas — is left exactly
 * as it was.
 *
 * The work happens at the zip level: only the parts that change are touched, so
 * the 11 MB workbook never has to be parsed in full.
 */

import JSZip from "npm:jszip@3.10.1";
import { readYearGrids, type DailyYearGrid } from "./daySheetGrid.ts";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** `2026-09-07` → `07Sep2026`, the naming the workbook already uses. */
export function daySheetName(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}${MONTHS[Number(month) - 1]}${year}`;
}

/** A day sheet's name, as opposed to `Week on Week` and other summary tabs. */
const DAY_SHEET = /^(\d{1,2})([A-Za-z]{3,9})(\d{2,4})$/;

const SERIAL_EPOCH = Date.UTC(1899, 11, 30);

/** Excel serial → `YYYY-MM`, for the month rows down column A. */
const serialToMonth = (serial: number): string | null => {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null;
  const date = new Date(SERIAL_EPOCH + Math.round(serial) * 86400000);
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}`;
};

interface Cell {
  ref: string;
  column: string;
  attrs: string;
  inner: string;
}

const cellsOf = (rowBody: string): Cell[] => {
  const cells: Cell[] = [];
  const pattern = /<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
  for (let match = pattern.exec(rowBody); match; match = pattern.exec(rowBody)) {
    cells.push({
      ref: match[1],
      column: match[1].replace(/\d+/g, ""),
      attrs: match[2] ?? "",
      inner: match[3] ?? "",
    });
  }
  return cells;
};

const isFormula = (cell: Cell): boolean => /<f[\s/>]/.test(cell.inner);

/** Cached or literal number held by a cell, when it holds one. */
const numberOf = (cell: Cell | undefined): number | null => {
  if (!cell) return null;
  if (/t="(s|inlineStr|str|b|e)"/.test(cell.attrs)) return null;
  const value = cell.inner.match(/<v>([^<]*)<\/v>/);
  if (!value) return null;
  const parsed = Number(value[1]);
  return Number.isFinite(parsed) ? parsed : null;
};

const renderCell = (cell: Cell, attrs: string, inner: string): string =>
  inner ? `<c r="${cell.ref}"${attrs}>${inner}</c>` : `<c r="${cell.ref}"${attrs}/>`;

/** Same cell, holding a plain number. */
const withNumber = (cell: Cell, value: number | null): string => {
  const attrs = cell.attrs.replace(/\s*t="[^"]*"/, "");
  return renderCell(cell, attrs, value === null ? "" : `<v>${value}</v>`);
};

/** Same formula cell, minus its stale cached result. */
const withoutCache = (cell: Cell): string => {
  const inner = cell.inner.replace(/<v>[^<]*<\/v>/, "");
  return renderCell(cell, cell.attrs, inner);
};

export interface DaySheetPatch {
  /** Provisional revenue on the books per `YYYY-MM`, from the day's exports. */
  provisionalByMonth: Record<string, number>;
  /** Confirmed revenue on the books per `YYYY-MM`, when the day carries it. */
  confirmedByMonth?: Record<string, number>;
  /** Occupancy (0–1) per `YYYY-MM`, only written alongside confirmed revenue. */
  occupancyByMonth?: Record<string, number>;
}

export interface DaySheetPatchResult {
  xml: string;
  /** Months whose current-day columns were written from the day's exports. */
  monthsWritten: string[];
  /** Month rows found on the sheet. */
  monthsSeen: string[];
}

/**
 * Shifts the sheet's current-day columns into the previous-day columns and
 * writes the day's measured figures into the current-day columns.
 *
 * Columns, as the workbook lays them out:
 *   B BOB current day    D occupancy current day    E/F their previous day
 *   I provisional current day                       J its previous day
 * Everything else (budget, last year, every formula) is untouched.
 */
export function patchDaySheet(xml: string, patch: DaySheetPatch): DaySheetPatchResult {
  const monthsWritten: string[] = [];
  const monthsSeen: string[] = [];

  const patched = xml.replace(
    /<row([^>]*)>([\s\S]*?)<\/row>/g,
    (whole, rowAttrs: string, body: string) => {
      const cells = cellsOf(body);
      if (!cells.length) return whole;
      const byColumn = new Map(cells.map((cell) => [cell.column, cell]));

      const monthCell = byColumn.get("A");
      const month = serialToMonth(numberOf(monthCell) ?? NaN);
      if (month) monthsSeen.push(month);

      const previousBob = numberOf(byColumn.get("B"));
      const previousOcc = numberOf(byColumn.get("D"));
      const previousProv = numberOf(byColumn.get("I"));

      const provisional = month ? patch.provisionalByMonth[month] : undefined;
      const confirmed = month ? patch.confirmedByMonth?.[month] : undefined;
      const occupancy = month ? patch.occupancyByMonth?.[month] : undefined;
      if (month && provisional !== undefined) monthsWritten.push(month);

      let changed = false;
      let next = body;
      const swap = (cell: Cell | undefined, replacement: string) => {
        if (!cell) return;
        const original = renderCell(cell, cell.attrs, cell.inner);
        if (original === replacement) return;
        next = next.replace(original, replacement);
        changed = true;
      };

      for (const cell of cells) {
        // Previous-day columns: static cells take yesterday's current-day
        // figure; the totals in those columns are formulas and look after
        // themselves.
        if (cell.column === "E" && !isFormula(cell) && previousBob !== null) {
          swap(cell, withNumber(cell, previousBob));
          continue;
        }
        if (cell.column === "F" && !isFormula(cell) && previousOcc !== null) {
          swap(cell, withNumber(cell, previousOcc));
          continue;
        }
        if (cell.column === "J" && !isFormula(cell) && previousProv !== null) {
          swap(cell, withNumber(cell, previousProv));
          continue;
        }
        // Current-day columns, only where the day's exports carry the month.
        if (cell.column === "I" && !isFormula(cell) && provisional !== undefined) {
          swap(cell, withNumber(cell, Math.round(provisional * 100) / 100));
          continue;
        }
        if (cell.column === "B" && !isFormula(cell) && confirmed !== undefined) {
          swap(cell, withNumber(cell, Math.round(confirmed * 100) / 100));
          continue;
        }
        if (
          cell.column === "D" &&
          !isFormula(cell) &&
          confirmed !== undefined &&
          occupancy !== undefined
        ) {
          swap(cell, withNumber(cell, Math.round(occupancy * 100) / 100));
          continue;
        }
        // Cached formula results are yesterday's — drop them so the workbook
        // recalculates the whole sheet when it is opened.
        if (isFormula(cell) && /<v>/.test(cell.inner)) {
          swap(cell, withoutCache(cell));
        }
      }

      return changed ? `<row${rowAttrs}>${next}</row>` : whole;
    },
  );

  return { xml: patched, monthsWritten, monthsSeen };
}

interface SheetEntry {
  tag: string;
  name: string;
  rid: string;
  sheetId: number;
}

const sheetEntries = (workbookXml: string): SheetEntry[] =>
  [...workbookXml.matchAll(/<sheet\s[^>]*\/>/g)].map((match) => {
    const tag = match[0];
    return {
      tag,
      name: (tag.match(/name="([^"]*)"/) ?? [, ""])[1]!,
      rid: (tag.match(/r:id="([^"]*)"/) ?? [, ""])[1]!,
      sheetId: Number((tag.match(/sheetId="(\d+)"/) ?? [, "0"])[1]),
    };
  });

const relationshipTarget = (relsXml: string, rid: string): string | null => {
  const pattern = new RegExp(`<Relationship[^>]*Id="${rid}"[^>]*>`);
  const tag = relsXml.match(pattern)?.[0];
  const target = tag?.match(/Target="([^"]*)"/)?.[1] ?? null;
  if (!target) return null;
  return target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
};

const escapeXml = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface AppendDayResult {
  bytes: Uint8Array;
  sheetName: string;
  /** True when the day already had a sheet and it was rewritten in place. */
  replaced: boolean;
  /** The sheet the day was copied from. */
  templateSheet: string;
  monthsWritten: string[];
  notes: string[];
  /** The day's printed financial form, read off the sheet as written. */
  yearGrids: DailyYearGrid[];
}

/**
 * Resolves only the shared strings the day sheet's label column points at.
 *
 * The workbook holds tens of thousands of strings across 380-odd sheets;
 * materialising all of them alongside the rebuilt file exhausts the worker.
 */
const labelStrings = (sharedXml: string, xmls: string[]): string[] => {
  const wanted = new Set<number>();
  for (const xml of xmls) {
    for (const match of xml.matchAll(/<c r="A\d+"[^>]*t="s"[^>]*>\s*<v>(\d+)<\/v>/g)) {
      wanted.add(Number(match[1]));
    }
  }
  const resolved: string[] = [];
  if (wanted.size === 0) return resolved;
  const pattern = /<si>([\s\S]*?)<\/si>/g;
  let index = 0;
  let found = 0;
  for (let match = pattern.exec(sharedXml); match; match = pattern.exec(sharedXml)) {
    if (wanted.has(index)) {
      resolved[index] = [...match[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
        .map((piece) => piece[1])
        .join("")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
      found += 1;
      if (found === wanted.size) break;
    }
    index += 1;
  }
  return resolved;
};



/**
 * Copies the workbook's newest day sheet into a sheet for `date`, patched with
 * the day's figures, and returns the rebuilt workbook.
 */
export async function appendDaySheet(
  base: ArrayBuffer,
  date: string,
  patch: DaySheetPatch,
): Promise<AppendDayResult> {
  const zip = await JSZip.loadAsync(base);
  const notes: string[] = [];
  const sheetName = daySheetName(date);

  const workbookFile = zip.file("xl/workbook.xml");
  const relsFile = zip.file("xl/_rels/workbook.xml.rels");
  const typesFile = zip.file("[Content_Types].xml");
  if (!workbookFile || !relsFile || !typesFile) {
    throw new Error("The running workbook is not a readable spreadsheet");
  }

  let workbookXml = await workbookFile.async("string");
  let relsXml = await relsFile.async("string");
  let typesXml = await typesFile.async("string");

  const entries = sheetEntries(workbookXml);
  const existing = entries.find((entry) => entry.name === sheetName);
  const template = entries.find(
    (entry) => entry.name !== sheetName && DAY_SHEET.test(entry.name),
  );
  if (!template) throw new Error("The running workbook has no day sheet to copy");

  const templatePath = relationshipTarget(relsXml, template.rid);
  if (!templatePath || !zip.file(templatePath)) {
    throw new Error(`Sheet ${template.name} could not be read from the workbook`);
  }
  let templateXml = await zip.file(templatePath)!.async("string");
  const result = patchDaySheet(templateXml, patch);

  if (existing) {
    const existingPath = relationshipTarget(relsXml, existing.rid);
    if (!existingPath) throw new Error(`Sheet ${sheetName} could not be located`);
    zip.file(existingPath, result.xml);
    notes.push(`${sheetName} already existed and was rebuilt from ${template.name}`);
  } else {
    // A brand-new part, relationship, sheet entry and content type.
    const used = new Set(
      Object.keys(zip.files)
        .map((name) => Number(name.match(/^xl\/worksheets\/sheet(\d+)\.xml$/)?.[1] ?? NaN))
        .filter((value) => Number.isFinite(value)),
    );
    let index = 1;
    while (used.has(index)) index += 1;
    const path = `xl/worksheets/sheet${index}.xml`;

    const ridNumbers = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map((match) => Number(match[1]));
    const rid = `rId${Math.max(0, ...ridNumbers) + 1}`;
    const sheetId = Math.max(0, ...entries.map((entry) => entry.sheetId)) + 1;

    zip.file(path, result.xml);
    relsXml = relsXml.replace(
      "</Relationships>",
      `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index}.xml"/></Relationships>`,
    );
    typesXml = typesXml.replace(
      "</Types>",
      `<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    );

    const entry = `<sheet name="${escapeXml(sheetName)}" sheetId="${sheetId}" r:id="${rid}"/>`;
    // Newest day first, directly ahead of the previous newest day sheet.
    workbookXml = workbookXml.replace(template.tag, `${entry}${template.tag}`);
  }

  // The sheet's formulas keep no usable cached results now, so the workbook is
  // asked to recalculate on open and the stale calculation chain is dropped.
  if (/<calcPr\b/.test(workbookXml)) {
    workbookXml = workbookXml.replace(/<calcPr\b([^>]*?)\/?>/, (whole, attrs: string) =>
      /fullCalcOnLoad/.test(attrs)
        ? whole
        : `<calcPr${attrs} fullCalcOnLoad="1"/>`,
    );
  } else {
    workbookXml = workbookXml.replace(
      "</workbook>",
      '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>',
    );
  }
  if (zip.file("xl/calcChain.xml")) {
    zip.remove("xl/calcChain.xml");
    typesXml = typesXml.replace(
      /<Override PartName="\/xl\/calcChain\.xml"[^>]*\/>/,
      "",
    );
    relsXml = relsXml.replace(/<Relationship[^>]*calcChain\.xml"[^>]*\/>/, "");
  }

  zip.file("xl/workbook.xml", workbookXml);
  zip.file("xl/_rels/workbook.xml.rels", relsXml);
  zip.file("[Content_Types].xml", typesXml);

  // The printed financial form is read before the workbook is rebuilt, so the
  // sheet XML can be released before the multi-megabyte zip is written.
  let yearGrids: DailyYearGrid[] = [];
  try {
    const sharedFile = zip.file("xl/sharedStrings.xml");
    const sharedXml = sharedFile ? await sharedFile.async("string") : "";
    yearGrids = readYearGrids(
      result.xml,
      templateXml,
      labelStrings(sharedXml, [result.xml, templateXml]),
    );
  } catch (error) {
    notes.push(
      `The day sheet's financial form could not be read for the report (${
        error instanceof Error ? error.message : "unknown"
      })`,
    );
  }
  templateXml = "";
  result.xml = "";

  // Do not deflate the 380-odd unchanged sheets again. Recompression is CPU
  // bound and exhausts the edge worker even at level 1; STORE trades a larger
  // upload for a predictable, short build. This mirrors the repair path used
  // for large protel workbooks.
  const bytes = (await zip.generateAsync({
    type: "uint8array",
    compression: "STORE",
  })) as Uint8Array;

  return {
    bytes,
    sheetName,
    replaced: Boolean(existing),
    templateSheet: template.name,
    monthsWritten: result.monthsWritten,
    notes,
    yearGrids,
  };

}

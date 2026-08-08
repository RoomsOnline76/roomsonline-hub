/**
 * Consolidated cost-sharing statement PDF (StarshipX ⇄ RoomsOnline).
 *
 * Mirrors the signed-off consolidated invoice layout: constituent breakdown for
 * the selected period, consolidated totals, 60/40 allocation blocks and an
 * all-time summary of funds contributed vs funds spent.
 */

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { invoiceOwnAmount, invoiceZar, type BurnInvoice, type FxRates } from "./burnRate";
import { formatZar, type CostShareSummary, type Contribution, CONTRIBUTORS, sumContributionsZar } from "./costSharing";

const INK: [number, number, number] = [26, 26, 46];
const PINK: [number, number, number] = [233, 30, 140];
const LINE: [number, number, number] = [220, 220, 228];

export interface StatementOptions {
  periodInvoices: BurnInvoice[];
  contributions: Contribution[];
  summary: CostShareSummary;
  fx: FxRates;
  periodStart?: string;
  periodEnd?: string;
  statementDate?: string;
  issuer?: string;
  billTo?: string;
  signatory?: string;
  signatoryPhone?: string;
}

const fmtDate = (value?: string | null) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
};

export function buildCostShareStatement(opts: StatementOptions): jsPDF {
  const {
    periodInvoices,
    contributions,
    summary,
    fx,
    periodStart,
    periodEnd,
    issuer = "StarshipX",
    billTo = "RoomsOnline",
    signatory = "Dawie J Erasmus",
    signatoryPhone = "+27 82 460 2220",
  } = opts;

  const statementDate = opts.statementDate ?? new Date().toISOString().slice(0, 10);
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const M = 48;
  let y = 56;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...PINK);
  doc.text(issuer.toUpperCase(), M, y);

  y += 26;
  doc.setFontSize(20);
  doc.setTextColor(...INK);
  doc.text("CONSOLIDATED STATEMENT", M, y);

  y += 22;
  doc.setDrawColor(...LINE);
  doc.line(M, y, pageW - M, y);

  y += 22;
  doc.setFontSize(9);
  const col2 = pageW / 2 + 10;
  const pair = (label: string, value: string, x: number, yy: number) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...INK);
    doc.text(label, x, yy);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90, 90, 105);
    doc.text(value, x, yy + 13);
  };

  pair("Issuer:", issuer, M, y);
  pair("Bill To:", billTo, col2, y);
  y += 34;
  pair("Statement Number:", `Sx-ROL-${statementDate.replace(/-/g, "")}`, M, y);
  pair("Statement Date:", fmtDate(statementDate), col2, y);
  y += 34;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...INK);
  doc.text("Reference:", M, y);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(90, 90, 105);
  const refPeriod =
    periodStart && periodEnd ? `${fmtDate(periodStart)} – ${fmtDate(periodEnd)}` : "All recorded expenses";
  const ref = doc.splitTextToSize(
    `Reimbursement of platform development expenses incurred on behalf of ${billTo} (${refPeriod}). Settlement basis — ${summary.roomsonlinePct}/${summary.partnerPct} split.`,
    pageW - M * 2 - 60,
  );
  doc.text(ref, M + 60, y);
  y += ref.length * 12 + 14;

  /* ---- constituent breakdown ---- */
  const rows = periodInvoices
    .slice()
    .sort((a, b) => String(a.invoice_date ?? "").localeCompare(String(b.invoice_date ?? "")))
    .map((inv) => {
      const own = invoiceOwnAmount(inv);
      const symbol = own.currency === "USD" ? "$" : own.currency === "EUR" ? "€" : "R";
      return [
        String(inv.invoice_date ?? "").slice(0, 10),
        (inv as { receipt_number?: string | null }).receipt_number ?? "",
        [inv.vendor, inv.description].filter(Boolean).join(" — "),
        own.currency === "ZAR"
          ? ""
          : `${symbol}${own.amount.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        formatZar(invoiceZar(inv, fx)),
      ];
    });

  autoTable(doc, {
    startY: y,
    head: [["Date", "Receipt No.", "Description", "Source Amount", "ZAR Amount"]],
    body: rows.length ? rows : [["—", "", "No bills in the selected period", "", formatZar(0)]],
    styles: { font: "helvetica", fontSize: 8, cellPadding: 5, textColor: INK, lineColor: LINE, lineWidth: 0.5 },
    headStyles: { fillColor: INK, textColor: [255, 255, 255], fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 62 },
      1: { cellWidth: 66 },
      3: { cellWidth: 74, halign: "right" },
      4: { cellWidth: 80, halign: "right" },
    },
    margin: { left: M, right: M },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;

  const block = (
    title: string,
    lines: Array<[string, string, boolean?]>,
  ) => {
    if (y > 700) {
      doc.addPage();
      y = 56;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...PINK);
    doc.text(title.toUpperCase(), M, y);
    y += 6;
    autoTable(doc, {
      startY: y,
      body: lines.map(([l, v]) => [l, v]),
      styles: { font: "helvetica", fontSize: 9, cellPadding: 5, textColor: INK, lineColor: LINE, lineWidth: 0.5 },
      columnStyles: { 0: { cellWidth: pageW - M * 2 - 130 }, 1: { cellWidth: 130, halign: "right" } },
      didParseCell: (data) => {
        if (lines[data.row.index]?.[2]) {
          data.cell.styles.fontStyle = "bold";
          data.cell.styles.fillColor = [246, 246, 250];
        }
      },
      margin: { left: M, right: M },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;
  };

  block("Period totals", [
    ["Consolidated period total (ZAR)", formatZar(summary.periodSpendZar), true],
    [`Exchange rate applied (ZAR/USD)`, fx.usdZar.toFixed(2)],
  ]);

  block(`${CONTRIBUTORS.carike.name} — RoomsOnline allocation (${summary.roomsonlinePct}%)`, [
    ["Allocation of total spend to date", formatZar(summary.roomsonlineAllocationZar)],
    ["Less: funds contributed", `(${formatZar(summary.carikeContributedZar)})`],
    ["Outstanding", formatZar(summary.roomsonlineOutstandingZar), true],
  ]);

  block(`${CONTRIBUTORS.dawie.name} — Partner allocation (${summary.partnerPct}%)`, [
    ["Allocation of total spend to date", formatZar(summary.partnerAllocationZar)],
    ["Less: invoices paid in full", `(${formatZar(summary.partnerAllocationZar)})`],
    ["Outstanding", formatZar(0), true],
  ]);

  block("Summary — all time", [
    ["Total funds spent to date", formatZar(summary.allTimeSpendZar), true],
    [`Total contributed — ${CONTRIBUTORS.dawie.name} (incl. ${summary.partnerPct}% settled)`, formatZar(summary.dawieContributedZar)],
    [`Total contributed — ${CONTRIBUTORS.carike.name}`, formatZar(summary.carikeContributedZar)],
    ["Total funds contributed", formatZar(summary.totalContributedZar), true],
    ["Total outstanding", formatZar(summary.roomsonlineOutstandingZar), true],
  ]);

  if (y > 690) {
    doc.addPage();
    y = 56;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text("Notes", M, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(90, 90, 105);
  const notes = doc.splitTextToSize(
    `All original receipts are retained with the underlying transactions for verification and audit. Partner allocation is treated as settled: all invoices to date were paid in full by ${signatory}. Contributions received from ${CONTRIBUTORS.carike.name} reduce the RoomsOnline allocation and the outstanding amount.`,
    pageW - M * 2,
  );
  doc.text(notes, M, y);
  y += notes.length * 12 + 24;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...INK);
  doc.text(issuer, M, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(90, 90, 105);
  doc.text(signatory, M, y);
  doc.text(signatoryPhone, M, y + 13);

  return doc;
}

export function downloadCostShareStatement(opts: StatementOptions) {
  const doc = buildCostShareStatement(opts);
  const stamp = (opts.statementDate ?? new Date().toISOString().slice(0, 10)).replace(/-/g, "");
  doc.save(`ROL_Consolidated_Statement_${stamp}.pdf`);
}

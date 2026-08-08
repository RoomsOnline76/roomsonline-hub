/**
 * Owner account statement PDF.
 *
 * A running-balance statement of everything between a property/portfolio and
 * ROL for the selected period, closing with an all-time summary. Amounts come
 * from the ledger as stored — this file only lays them out.
 *
 * Visual style aligns with the Equatorial Luxe document family: ivory page,
 * charcoal ink, ROL pink accents, light architectural lines and clean Swiss
 * typography using the standard PDF font stack.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtMoney, type StatementView } from "./ownerAccount";

const INK: [number, number, number] = [26, 26, 46];
const PINK: [number, number, number] = [233, 30, 140];
const LINE: [number, number, number] = [220, 220, 228];
const MUTED: [number, number, number] = [110, 110, 125];
const IVORY: [number, number, number] = [250, 248, 245];

const KIND_LABEL: Record<string, string> = {
  subscription: "Subscription",
  setup: "Setup / once-off",
  commission: "Commission invoice",
  payment: "Payment",
  payout: "Payout due to you",
  payout_paid: "Payout paid",
};

const fmtDate = (value?: string | null) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
};

export interface OwnerStatementOptions {
  scopeName: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  statement: StatementView;
  dueToYou: number;
  issuer?: string;
  /** Optional company legal name for the document footer. */
  companyName?: string;
  /** Optional VAT number to print in the footer. */
  vatNumber?: string | null;
  /** Optional company address to print in the footer. */
  companyAddress?: string | null;
}

export function buildOwnerStatementPdf(opts: OwnerStatementOptions): jsPDF {
  const {
    scopeName,
    periodStart,
    periodEnd,
    currency,
    statement,
    dueToYou,
    issuer = "RoomsOnline",
    companyName,
    vatNumber,
    companyAddress,
  } = opts;

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const M = 42;
  const money = (n: number) => fmtMoney(n, currency);
  let y = 52;

  /* ---------------- Header ---------------- */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...PINK);
  doc.text((companyName || issuer).toUpperCase(), M, y);

  y += 24;
  doc.setFontSize(19);
  doc.setTextColor(...INK);
  doc.text("ACCOUNT STATEMENT", M, y);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.text(`Statement period: ${fmtDate(periodStart)} – ${fmtDate(periodEnd)}`, pageW - M, y, { align: "right" });

  y += 16;
  doc.setDrawColor(...LINE);
  doc.line(M, y, pageW - M, y);

  /* ---------------- Info pairs ---------------- */
  y += 20;
  const col2 = pageW / 2 + 10;
  const pair = (label: string, value: string, x: number, yy: number) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...INK);
    doc.setFontSize(8.5);
    doc.text(label, x, yy);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(value || "—", x, yy + 12, { maxWidth: pageW / 2 - M - 12 });
  };

  pair("Statement to", scopeName, M, y);
  pair("Issued by", issuer, col2, y);
  y += 32;
  pair("Period", `${fmtDate(periodStart)} – ${fmtDate(periodEnd)}`, M, y);
  pair("Issued on", fmtDate(new Date().toISOString().slice(0, 10)), col2, y);

  /* ---------------- Opening / closing balance box ---------------- */
  y += 38;
  const balanceBoxH = 52;
  doc.setFillColor(250, 244, 249);
  doc.rect(M, y - 14, pageW - M * 2, balanceBoxH, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text("OPENING BALANCE", M + 12, y + 4);
  doc.text("CLOSING BALANCE", pageW / 2 + 10, y + 4);

  doc.setFontSize(13);
  doc.setTextColor(...PINK);
  doc.text(money(statement.openingBalance), M + 12, y + 22);
  doc.text(money(statement.closingBalance), pageW / 2 + 10, y + 22);

  y += balanceBoxH + 10;

  /* ---------------- Transaction table ---------------- */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text("TRANSACTIONS", M, y);
  y += 10;

  autoTable(doc, {
    startY: y,
    head: [["Date", "Type", "Reference", "Description", "Amount", "Balance"]],
    body: statement.entries.map((e) => [
      fmtDate(e.date),
      KIND_LABEL[e.kind] || e.kind,
      e.reference,
      e.description,
      money(e.amount),
      money(e.balance),
    ]),
    styles: { fontSize: 8, cellPadding: 5, textColor: INK, lineColor: LINE, lineWidth: 0.4 },
    headStyles: { fillColor: IVORY, textColor: INK, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [252, 252, 254] },
    columnStyles: {
      0: { cellWidth: 58 },
      4: { halign: "right" },
      5: { halign: "right" },
    },
    margin: { left: M, right: M },
  });

  const afterY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 80;
  y = afterY + 26;

  /* ---------------- All-time summary ---------------- */
  if (y > 560) {
    doc.addPage();
    y = 52;
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text("ALL-TIME SUMMARY", M, y);
  y += 10;

  autoTable(doc, {
    startY: y,
    body: [
      ["Total charged by ROL", money(statement.allTime.charged)],
      ["Total paid to ROL", money(statement.allTime.paid)],
      ["Total received from ROL (payouts)", money(statement.allTime.receivedFromRol)],
      ["Due to you", money(dueToYou)],
      ["Net position (positive = due to ROL)", money(statement.closingBalance)],
    ],
    styles: { fontSize: 9, cellPadding: 5, textColor: INK, lineColor: LINE, lineWidth: 0.4 },
    columnStyles: { 0: { cellWidth: 260 }, 1: { halign: "right", fontStyle: "bold" } },
    theme: "plain",
    margin: { left: M, right: M },
  });

  const endY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 80;

  /* ---------------- Notes ---------------- */
  const noteY = Math.min(endY + 22, doc.internal.pageSize.getHeight() - 60);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.8);
  doc.setTextColor(...MUTED);
  doc.text(
    "This statement reflects documents issued to date. Amounts recovered on a payout statement are never invoiced again.",
    M,
    noteY,
    { maxWidth: pageW - M * 2 },
  );

  /* ---------------- Footer on every page ---------------- */
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    const footer = [
      companyName || issuer,
      vatNumber ? `VAT ${vatNumber}` : null,
      companyAddress,
    ]
      .filter(Boolean)
      .join(" · ");
    doc.text(footer, M, doc.internal.pageSize.getHeight() - 28, { maxWidth: pageW - M * 2 });
    doc.text(`Page ${i} of ${pageCount}`, pageW - M, doc.internal.pageSize.getHeight() - 28, { align: "right" });
  }

  return doc;
}

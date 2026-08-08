/**
 * Owner account statement PDF.
 *
 * A running-balance statement of everything between a property/portfolio and
 * ROL for the selected period, closing with an all-time summary. Amounts come
 * from the ledger as stored — this file only lays them out.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fmtMoney, type StatementView } from "./ownerAccount";

const INK: [number, number, number] = [26, 26, 46];
const PINK: [number, number, number] = [233, 30, 140];

export interface OwnerStatementOptions {
  scopeName: string;
  periodStart: string;
  periodEnd: string;
  currency: string;
  statement: StatementView;
  dueToYou: number;
  issuer?: string;
}

const KIND_LABEL: Record<string, string> = {
  subscription: "Subscription",
  setup: "Setup / once-off",
  commission: "Commission invoice",
  payment: "Payment",
  payout: "Payout due to you",
  payout_paid: "Payout paid",
};

export function buildOwnerStatementPdf(opts: OwnerStatementOptions): jsPDF {
  const { scopeName, periodStart, periodEnd, currency, statement, dueToYou, issuer = "RoomsOnline" } = opts;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const M = 48;

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...INK);
  doc.setFontSize(16);
  doc.text("ACCOUNT STATEMENT", M, 62);

  doc.setFontSize(10);
  doc.text(scopeName, M, 84);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Statement period: ${periodStart} to ${periodEnd}`, M, 100);
  doc.text(`Issued by ${issuer} on ${new Date().toISOString().slice(0, 10)}`, M, 114);

  doc.setFont("helvetica", "bold");
  doc.setTextColor(...PINK);
  doc.text(`Opening balance  ${fmtMoney(statement.openingBalance, currency)}`, pageW - M, 100, { align: "right" });
  doc.text(`Closing balance  ${fmtMoney(statement.closingBalance, currency)}`, pageW - M, 114, { align: "right" });
  doc.setTextColor(...INK);

  autoTable(doc, {
    startY: 136,
    head: [["Date", "Type", "Reference", "Description", "Amount", "Balance"]],
    body: statement.entries.map((e) => [
      e.date,
      KIND_LABEL[e.kind] || e.kind,
      e.reference,
      e.description,
      fmtMoney(e.amount, e.currency || currency),
      fmtMoney(e.balance, currency),
    ]),
    styles: { fontSize: 8, cellPadding: 4, textColor: INK },
    headStyles: { fillColor: INK, textColor: [255, 255, 255], fontSize: 8 },
    columnStyles: {
      4: { halign: "right" },
      5: { halign: "right" },
    },
    margin: { left: M, right: M },
  });

  const afterY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 200;
  let y = afterY + 26;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("All-time summary", M, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    body: [
      ["Total charged by ROL", fmtMoney(statement.allTime.charged, currency)],
      ["Total paid to ROL", fmtMoney(statement.allTime.paid, currency)],
      ["Total received from ROL (payouts)", fmtMoney(statement.allTime.receivedFromRol, currency)],
      ["Due to you", fmtMoney(dueToYou, currency)],
      ["Net position (positive = due to ROL)", fmtMoney(statement.closingBalance, currency)],
    ],
    styles: { fontSize: 9, cellPadding: 5, textColor: INK },
    columnStyles: { 0: { cellWidth: 260 }, 1: { halign: "right", fontStyle: "bold" } },
    theme: "plain",
    margin: { left: M, right: M },
  });

  const endY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 80;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 130);
  doc.text(
    "This statement reflects documents issued to date. Amounts recovered on a payout statement are never invoiced again.",
    M,
    Math.min(endY + 22, doc.internal.pageSize.getHeight() - 40),
  );

  return doc;
}

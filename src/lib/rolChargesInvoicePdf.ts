/**
 * ROL charges invoice PDF — the tax invoice that matches the deduction shown on
 * the payout statement. It is issued as already settled, because the amount was
 * withheld from the payout rather than collected separately.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  fmtMoney,
  periodLabel,
  recoveryLines,
  adjustmentLines,
  type PayoutStatementDetail,
  type VatSettings,
} from "./payoutStatement";

const INK: [number, number, number] = [26, 26, 46];
const PINK: [number, number, number] = [233, 30, 140];
const LINE: [number, number, number] = [220, 220, 228];
const MUTED: [number, number, number] = [110, 110, 125];

export function buildRolChargesInvoicePdf(
  statement: PayoutStatementDetail,
  vat: VatSettings,
): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const M = 42;
  const money = (n: number) => fmtMoney(n, statement.currency);
  let y = 52;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...PINK);
  doc.text((vat.company_legal_name || "ROOMS ONLINE").toUpperCase(), M, y);

  y += 24;
  doc.setFontSize(19);
  doc.setTextColor(...INK);
  doc.text(vat.vat_enabled ? "TAX INVOICE" : "INVOICE", M, y);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.text(statement.invoice_reference || "DRAFT — not yet issued", pageW - M, y, { align: "right" });

  y += 16;
  doc.setDrawColor(...LINE);
  doc.line(M, y, pageW - M, y);
  y += 20;

  const col2 = pageW / 2 + 10;
  const pair = (label: string, value: string, x: number, yy: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...INK);
    doc.text(label, x, yy);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(value || "—", x, yy + 12);
  };

  pair("Invoiced to", statement.group_name, M, y);
  pair("Period", periodLabel(statement.period_start, statement.period_end), col2, y);
  y += 32;
  pair("Contact", statement.owner_email || "—", M, y);
  pair("Related statement", statement.statement_reference || "—", col2, y);
  y += 32;
  if (vat.vat_enabled && vat.vat_number) {
    pair("Our VAT number", vat.vat_number, M, y);
    y += 32;
  }
  y += 8;

  interface Row {
    description: string;
    amount: number;
  }
  const rows: Row[] = [];
  if (statement.rol_commission > 0)
    rows.push({ description: "Booking commission — payments processed by Rooms Online", amount: statement.rol_commission });
  if (statement.byo_commission > 0)
    rows.push({
      description: "Booking commission — payments received in the property's own account",
      amount: statement.byo_commission,
    });
  if (statement.transaction_fees > 0)
    rows.push({ description: "Payment processing fees", amount: statement.transaction_fees });

  [...recoveryLines(statement.lines), ...adjustmentLines(statement.lines)]
    .filter((l) => l.line_kind === "charge" || l.line_kind === "opening_balance" || l.line_kind === "adjustment")
    .forEach((l) =>
      rows.push({
        description: `${l.description || "Platform charge"}${l.property_name ? ` — ${l.property_name}` : ""}`,
        amount: l.fee_amount || l.commission_amount,
      }),
    );

  const gross = statement.invoice_total;
  const exclusive = vat.vat_enabled ? statement.invoice_subtotal : gross;
  const vatAmount = vat.vat_enabled ? statement.invoice_vat : 0;
  const factor = gross > 0 ? exclusive / gross : 1;

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    styles: { fontSize: 8, cellPadding: 5, textColor: INK, lineColor: LINE, lineWidth: 0.4 },
    headStyles: { fillColor: [244, 244, 248], textColor: INK, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right" }, 2: { halign: "right" } },
    head: vat.vat_enabled
      ? [["Description", "Excl. VAT", "Incl. VAT"]]
      : [["Description", "Amount"]],
    body: rows.map((r) =>
      vat.vat_enabled
        ? [r.description, money(r.amount * factor), money(r.amount)]
        : [r.description, money(r.amount)],
    ),
  });
  // deno-lint-ignore no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 24;

  const totalLine = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 10 : 8.6);
    doc.setTextColor(...(bold ? INK : MUTED));
    doc.text(label, pageW / 2, y);
    doc.setTextColor(...INK);
    doc.text(value, pageW - M, y, { align: "right" });
    y += bold ? 18 : 14;
  };

  if (vat.vat_enabled) {
    totalLine("Subtotal (excl. VAT)", money(exclusive));
    totalLine(`VAT @ ${statement.vat_rate}%`, money(vatAmount));
  }
  doc.setDrawColor(...LINE);
  doc.line(pageW / 2, y - 6, pageW - M, y - 6);
  y += 6;
  totalLine("Total due", money(gross), true);

  y += 8;
  doc.setFillColor(240, 250, 244);
  doc.rect(M, y - 12, pageW - M * 2, 44, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text("PAID IN FULL — SETTLED BY DEDUCTION", M + 12, y + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(
    `Deducted from payout statement ${statement.statement_reference || "(pending)"}. No payment is required.`,
    M + 12,
    y + 20,
  );

  const footer = [
    vat.company_legal_name || "Rooms Online",
    vat.vat_enabled && vat.vat_number ? `VAT ${vat.vat_number}` : null,
    vat.company_address,
  ]
    .filter(Boolean)
    .join(" · ");
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text(footer, M, doc.internal.pageSize.getHeight() - 28);

  return doc;
}

export function downloadRolChargesInvoicePdf(
  statement: PayoutStatementDetail,
  vat: VatSettings,
): void {
  const doc = buildRolChargesInvoicePdf(statement, vat);
  const name = (statement.invoice_reference || `rol-invoice-${statement.group_name}`)
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .toLowerCase();
  doc.save(`${name}.pdf`);
}

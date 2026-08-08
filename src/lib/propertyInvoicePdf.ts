/**
 * ROL property invoice PDF — the receivable sent to a property or portfolio for
 * commission on bookings ROL never settled, plus platform subscription fees.
 *
 * Unlike the payout-deduction invoice, this document is payable: it carries a
 * due date, banking narrative and the pay-link reference.
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  DEFAULT_VAT_SNAPSHOT,
  LINE_KIND_LABELS,
  fmtMoney,
  linesOfKind,
  periodLabel,
  type PropertyInvoiceDetail,
  type PropertyInvoiceLineKind,
} from "./propertyInvoice";

const INK: [number, number, number] = [26, 26, 46];
const PINK: [number, number, number] = [233, 30, 140];
const LINE: [number, number, number] = [220, 220, 228];
const MUTED: [number, number, number] = [110, 110, 125];

const SECTIONS: PropertyInvoiceLineKind[] = ["commission", "recurring", "charge", "adjustment"];

export function buildPropertyInvoicePdf(invoice: PropertyInvoiceDetail, payUrl?: string): jsPDF {
  const vat = { ...DEFAULT_VAT_SNAPSHOT, ...(invoice.vat_snapshot || {}) };
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const M = 42;
  const money = (n: number) => fmtMoney(n, invoice.currency);
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
  doc.text(invoice.invoice_reference || "DRAFT — not yet issued", pageW - M, y, { align: "right" });

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
    doc.text(value || "—", x, yy + 12, { maxWidth: pageW / 2 - M - 12 });
  };

  pair("Invoiced to", invoice.bill_to_name || invoice.group_name, M, y);
  pair("Period", periodLabel(invoice.period_start, invoice.period_end), col2, y);
  y += 32;
  pair("Contact", invoice.bill_to_email || "—", M, y);
  pair("Due date", invoice.due_date || "On receipt", col2, y);
  y += 32;
  if (vat.vat_enabled && vat.vat_number) {
    pair("Our VAT number", vat.vat_number, M, y);
    pair("Bookings billed", String(invoice.booking_count), col2, y);
    y += 32;
  }
  y += 8;

  const body: (string | number)[][] = [];
  SECTIONS.forEach((kind) => {
    const lines = linesOfKind(invoice.lines, kind);
    if (lines.length === 0) return;
    body.push([{ content: LINE_KIND_LABELS[kind], colSpan: 3, styles: { fontStyle: "bold", fillColor: [248, 248, 251] } } as never]);
    lines.forEach((l) => {
      const detail = [
        l.rol_reference,
        l.guest_name,
        l.check_in_date && l.check_out_date ? `${l.check_in_date} → ${l.check_out_date}` : null,
      ]
        .filter(Boolean)
        .join(" · ");
      body.push([
        `${l.description || "—"}${detail ? `\n${detail}` : ""}${l.property_name && kind !== "commission" ? `\n${l.property_name}` : ""}`,
        l.gross_amount > 0 ? `${money(l.gross_amount)}${l.rate ? ` @ ${l.rate}%` : ""}` : l.quantity > 1 ? `${l.quantity} × ${money(l.rate)}` : "—",
        money(l.amount),
      ]);
    });
  });

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    styles: { fontSize: 8, cellPadding: 5, textColor: INK, lineColor: LINE, lineWidth: 0.4 },
    headStyles: { fillColor: [244, 244, 248], textColor: INK, fontStyle: "bold" },
    columnStyles: { 1: { halign: "right", cellWidth: 120 }, 2: { halign: "right", cellWidth: 90 } },
    head: [["Description", "Basis", "Amount"]],
    body,
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

  totalLine(vat.vat_enabled ? "Subtotal (excl. VAT)" : "Subtotal", money(invoice.subtotal));
  if (invoice.vat_amount > 0) totalLine(`VAT @ ${invoice.vat_rate}%`, money(invoice.vat_amount));
  doc.setDrawColor(...LINE);
  doc.line(pageW / 2, y - 6, pageW - M, y - 6);
  y += 6;
  totalLine("Total due", money(invoice.total), true);
  if (invoice.amount_paid > 0) {
    totalLine("Paid", money(invoice.amount_paid));
    totalLine("Balance", money(invoice.total - invoice.amount_paid), true);
  }

  y += 8;
  const settled = invoice.status === "paid";
  doc.setFillColor(...(settled ? [240, 250, 244] : [253, 244, 249]));
  doc.rect(M, y - 12, pageW - M * 2, 52, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...INK);
  doc.text(settled ? "PAID IN FULL — THANK YOU" : "PAYMENT DUE", M + 12, y + 4);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(
    settled
      ? `Settled${invoice.payment_reference ? ` · reference ${invoice.payment_reference}` : ""}. No further action required.`
      : `Settle online using the secure payment link sent with this invoice${invoice.due_date ? `, on or before ${invoice.due_date}` : ""}.`,
    M + 12,
    y + 20,
    { maxWidth: pageW - M * 2 - 24 },
  );
  if (!settled && payUrl) {
    doc.setTextColor(...PINK);
    doc.text(payUrl, M + 12, y + 34, { maxWidth: pageW - M * 2 - 24 });
  }

  const footer = [
    vat.company_legal_name || "Rooms Online",
    vat.vat_enabled && vat.vat_number ? `VAT ${vat.vat_number}` : null,
    vat.company_address,
    vat.footer_note,
  ]
    .filter(Boolean)
    .join(" · ");
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  doc.text(footer, M, doc.internal.pageSize.getHeight() - 28, { maxWidth: pageW - M * 2 });

  return doc;
}

export function downloadPropertyInvoicePdf(invoice: PropertyInvoiceDetail, payUrl?: string): void {
  const doc = buildPropertyInvoicePdf(invoice, payUrl);
  const name = (invoice.invoice_reference || `rol-invoice-${invoice.group_name}`)
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .toLowerCase();
  doc.save(`${name}.pdf`);
}

/**
 * Property payout statement PDF.
 *
 * Sections mirror the on-screen statement exactly:
 *   A  Bookings settled through ROL (per transaction, with ROL reference)
 *   B  Recoveries and platform charges
 *   C  ROL charges invoice summary (settled by deduction)
 *   D  Net payable + bank payment reference
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  bookingLines,
  recoveryLines,
  adjustmentLines,
  propertySubtotals,
  fmtMoney,
  periodLabel,
  type PayoutStatementDetail,
  type VatSettings,
} from "./payoutStatement";

const INK: [number, number, number] = [26, 26, 46];
const PINK: [number, number, number] = [233, 30, 140];
const LINE: [number, number, number] = [220, 220, 228];
const MUTED: [number, number, number] = [110, 110, 125];

const fmtDate = (value?: string | null) => {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
};

export function buildPayoutStatementPdf(
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
  doc.text("PAYOUT STATEMENT", M, y);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.text(statement.statement_reference || "DRAFT — not yet issued", pageW - M, y, { align: "right" });

  y += 16;
  doc.setDrawColor(...LINE);
  doc.line(M, y, pageW - M, y);

  y += 20;
  const col2 = pageW / 2 + 10;
  const pair = (label: string, value: string, x: number, yy: number) => {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...INK);
    doc.setFontSize(8.5);
    doc.text(label, x, yy);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(value || "—", x, yy + 12);
  };

  pair("Statement to", statement.group_name, M, y);
  pair("Period", periodLabel(statement.period_start, statement.period_end), col2, y);
  y += 32;
  pair("Owner contact", statement.owner_email || "—", M, y);
  pair(
    "Settlement",
    statement.group_kind === "portfolio"
      ? `Portfolio · ${statement.payout_mode === "split" ? "paid per property" : "consolidated payment"}`
      : "Single property",
    col2,
    y,
  );
  y += 38;

  /* ---------------- Section A ---------------- */
  const bookings = bookingLines(statement.lines);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text("A · BOOKINGS IN THIS PERIOD", M, y);
  y += 10;

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    styles: { fontSize: 7.4, cellPadding: 4, textColor: INK, lineColor: LINE, lineWidth: 0.4 },
    headStyles: { fillColor: [244, 244, 248], textColor: INK, fontStyle: "bold" },
    head: [["Reference", "Guest", "Property", "Stay", "Gross", "Comm %", "Commission", "Fees", "Net held"]],
    body: bookings.map((l) => [
      l.rol_reference || "—",
      l.guest_name || "—",
      l.property_name || "—",
      `${fmtDate(l.check_in_date)} – ${fmtDate(l.check_out_date)}`,
      money(l.gross_amount),
      `${l.commission_rate.toFixed(2)}%`,
      money(l.commission_amount),
      money(l.fee_amount),
      money(l.net_amount),
    ]),
    foot: [[
      "", "", "", "Totals",
      money(statement.gross_amount),
      "",
      money(statement.rol_commission + statement.byo_commission),
      money(statement.transaction_fees),
      money(statement.amount_held),
    ]],
    footStyles: { fillColor: [255, 255, 255], textColor: INK, fontStyle: "bold" },
  });
  // deno-lint-ignore no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 24;

  /* ---------------- Per-property subtotals (consolidated portfolios) ---- */
  if (statement.group_kind === "portfolio") {
    const subtotals = propertySubtotals(bookings);
    if (subtotals.length > 1) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("PER-PROPERTY BREAKDOWN", M, y);
      y += 10;
      autoTable(doc, {
        startY: y,
        margin: { left: M, right: M },
        styles: { fontSize: 7.6, cellPadding: 4, textColor: INK, lineColor: LINE, lineWidth: 0.4 },
        headStyles: { fillColor: [244, 244, 248], textColor: INK, fontStyle: "bold" },
        head: [["Property", "Bookings", "Gross", "Commission", "Fees", "Net held"]],
        body: subtotals.map((s) => [
          s.property_name,
          String(s.bookings),
          money(s.gross),
          money(s.commission),
          money(s.fees),
          money(s.net),
        ]),
      });
      // deno-lint-ignore no-explicit-any
      y = (doc as any).lastAutoTable.finalY + 24;
    }
  }

  /* ---------------- Section B + C ---------------- */
  if (y > 600) { doc.addPage(); y = 52; }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("B · ROL CHARGES INVOICE", M, y);
  y += 14;

  const rows: [string, string][] = [
    ["Commission on bookings processed by ROL", money(statement.rol_commission)],
    ["Payment processing fee recovered (non-commissionable)", money(statement.transaction_fees)],
  ];


  doc.setFontSize(8.6);
  rows.forEach(([label, value]) => {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(label, M, y);
    doc.setTextColor(...INK);
    doc.text(value, pageW - M, y, { align: "right" });
    y += 14;
  });

  if (statement.invoice_vat > 0) {
    doc.setTextColor(...MUTED);
    doc.text(`Excluding VAT (${statement.vat_rate}%)`, M, y);
    doc.setTextColor(...INK);
    doc.text(money(statement.invoice_subtotal), pageW - M, y, { align: "right" });
    y += 14;
    doc.setTextColor(...MUTED);
    doc.text("VAT", M, y);
    doc.setTextColor(...INK);
    doc.text(money(statement.invoice_vat), pageW - M, y, { align: "right" });
    y += 14;
  }

  doc.setDrawColor(...LINE);
  doc.line(M, y, pageW - M, y);
  y += 16;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.text(`Invoice ${statement.invoice_reference || "(pending)"} total`, M, y);
  doc.text(money(statement.invoice_total), pageW - M, y, { align: "right" });
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text("Settled by deduction from this payout — paid in full, no action required.", M, y);
  y += 30;

  doc.setFillColor(250, 244, 249);
  doc.rect(M, y - 14, pageW - M * 2, 68, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text("D · NET PAYABLE TO PROPERTY", M + 12, y + 4);
  doc.setFontSize(16);
  doc.setTextColor(...PINK);
  doc.text(money(statement.net_payable), pageW - M - 12, y + 6, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  const payment = statement.payments[0];
  const bankLine = payment
    ? `${payment.beneficiary_name || statement.group_name} · ${payment.bank_name || "bank on file"} · ${payment.account_number_masked || "account on file"}`
    : "Banking details on file";
  doc.text(bankLine, M + 12, y + 24);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...INK);
  doc.text(
    `Your bank statement will show reference: ${statement.payment_reference || payment?.payment_reference || "(issued on finalisation)"}`,
    M + 12,
    y + 38,
  );
  y += 74;

  if (statement.carry_forward > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(
      `${money(statement.carry_forward)} could not be recovered from this period and carries forward to your next statement.`,
      M,
      y,
    );
    y += 16;
  }

  if (statement.payments.length > 1) {
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      styles: { fontSize: 7.6, cellPadding: 4, textColor: INK, lineColor: LINE, lineWidth: 0.4 },
      headStyles: { fillColor: [244, 244, 248], textColor: INK, fontStyle: "bold" },
      head: [["Beneficiary", "Bank", "Account", "Reference", "Amount"]],
      body: statement.payments.map((p) => [
        p.beneficiary_name || "—",
        p.bank_name || "—",
        p.account_number_masked || "—",
        p.payment_reference,
        money(p.amount),
      ]),
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i += 1) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    const footer = [
      vat.company_legal_name || "Rooms Online",
      vat.vat_enabled && vat.vat_number ? `VAT ${vat.vat_number}` : null,
      vat.company_address,
    ]
      .filter(Boolean)
      .join(" · ");
    doc.text(footer, M, doc.internal.pageSize.getHeight() - 28);
    doc.text(`Page ${i} of ${pageCount}`, pageW - M, doc.internal.pageSize.getHeight() - 28, {
      align: "right",
    });
  }

  return doc;
}

export function downloadPayoutStatementPdf(
  statement: PayoutStatementDetail,
  vat: VatSettings,
): void {
  const doc = buildPayoutStatementPdf(statement, vat);
  const name = (statement.statement_reference || `payout-${statement.group_name}`)
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .toLowerCase();
  doc.save(`${name}.pdf`);
}

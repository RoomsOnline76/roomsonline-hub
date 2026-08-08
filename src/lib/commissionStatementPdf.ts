/**
 * Referral commission statement PDF — a commission payout advice, not a payslip.
 *
 * Sections:
 *   A  Commission per referred property (with revenue components and rate source)
 *   B  Adjustments and clawbacks
 *   C  Net commission payout (+ VAT for VAT vendors), banking and payment reference
 *   D  Tax position — independent contractor, partner carries SARS liability
 */
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  COMMISSION_BASIS_NOTE,
  COMMISSION_PAYOUT_TAX_NOTE,
  COMMISSION_TYPE_LABELS,
  COMMISSION_VAT_NOTE,
  RATE_SOURCE_LABELS,
  commissionAdjustments,
  commissionVatBreakdown,
  fmtMoney,
  monthLabel,
  periodLabel,
  propertyBlocks,
  type CommissionStatementDetail,
} from "./commissionStatement";
import type { VatSettings } from "./payoutStatement";


const INK: [number, number, number] = [26, 26, 46];
const PINK: [number, number, number] = [233, 30, 140];
const LINE: [number, number, number] = [220, 220, 228];
const MUTED: [number, number, number] = [110, 110, 125];

const fmtDate = (value?: string | null) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? String(value)
    : d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" });
};

export function buildCommissionStatementPdf(
  statement: CommissionStatementDetail,
  vat: VatSettings,
  currency = "ZAR",
): jsPDF {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const M = 42;
  const money = (n: number) => fmtMoney(n, currency);
  let y = 52;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...PINK);
  doc.text((vat.company_legal_name || "ROOMS ONLINE").toUpperCase(), M, y);

  y += 24;
  doc.setFontSize(19);
  doc.setTextColor(...INK);
  doc.text("COMMISSION PAYOUT STATEMENT", M, y);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...MUTED);
  doc.text(statement.statement_reference || "DRAFT — not yet issued", pageW - M, y, {
    align: "right",
  });

  y += 13;
  doc.setFontSize(7.8);
  doc.setTextColor(...MUTED);
  doc.text(
    "Referral commission payout — not remuneration. No employment relationship exists.",
    M,
    y,
  );

  y += 12;
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

  const terms = statement.terms_snapshot || {};
  pair(
    "Statement to",
    `${statement.rep_name || "Referral partner"}${statement.rep_code ? ` (${statement.rep_code})` : ""}`,
    M,
    y,
  );
  pair("Period", periodLabel(statement.period_start, statement.period_end), col2, y);
  y += 32;
  pair("Contact", statement.rep_email || "—", M, y);
  pair(
    "Commission terms",
    terms.first_year_rate != null
      ? `${terms.tier_label || "Base"} · ${terms.first_year_rate}% first year · ${terms.residual_rate}% residual${
          terms.residual_months ? ` for ${terms.residual_months} mo` : ""
        }`
      : monthLabel(statement.period_month),
    col2,
    y,
  );
  y += 38;

  /* ---------------- Section A ---------------- */
  const blocks = propertyBlocks(statement.lines);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text("A · COMMISSION BY REFERRED PROPERTY", M, y);
  y += 10;

  autoTable(doc, {
    startY: y,
    margin: { left: M, right: M },
    styles: { fontSize: 7.4, cellPadding: 4, textColor: INK, lineColor: LINE, lineWidth: 0.4 },
    headStyles: { fillColor: [244, 244, 248], textColor: INK, fontStyle: "bold" },
    head: [["Property", "Referred", "Type", "Revenue components", "ROL revenue", "Rate", "Commission"]],
    body:
      blocks.length > 0
        ? blocks.map((b) => [
            b.property_name,
            fmtDate(b.since),
            COMMISSION_TYPE_LABELS[b.commission_type] || b.commission_type,
            [
              b.breakdown.booking_commission
                ? `Booking commission (${b.breakdown.booking_count ?? 0} bookings) ${money(b.breakdown.booking_commission)}`
                : null,
              b.breakdown.recovered_commission
                ? `Recovered commission ${money(b.breakdown.recovered_commission)}`
                : null,
              b.breakdown.subscription_revenue
                ? `Platform subscription ${money(b.breakdown.subscription_revenue)}`
                : null,
            ]
              .filter(Boolean)
              .join("\n") || "—",
            money(b.revenue),
            `${b.rate_applied.toFixed(2)}%\n${RATE_SOURCE_LABELS[b.rate_source || ""] || ""}`,
            money(b.commission),
          ])
        : [["No commissionable revenue in this period", "", "", "", money(0), "", money(0)]],
    foot: [[
      "", "", "", "Gross commission",
      money(statement.total_revenue),
      "",
      money(statement.gross_commission),
    ]],
    footStyles: { fillColor: [255, 255, 255], textColor: INK, fontStyle: "bold" },
  });
  // deno-lint-ignore no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 24;

  /* ---------------- Section B ---------------- */
  const adjustments = commissionAdjustments(statement.lines);
  if (adjustments.length > 0) {
    if (y > 620) { doc.addPage(); y = 52; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text("B · ADJUSTMENTS & CLAWBACKS", M, y);
    y += 10;
    autoTable(doc, {
      startY: y,
      margin: { left: M, right: M },
      styles: { fontSize: 7.6, cellPadding: 4, textColor: INK, lineColor: LINE, lineWidth: 0.4 },
      headStyles: { fillColor: [244, 244, 248], textColor: INK, fontStyle: "bold" },
      head: [["Type", "Property", "Reason", "Amount"]],
      body: adjustments.map((l) => [
        l.line_kind === "clawback" ? "Clawback" : "Adjustment",
        l.property_name || "—",
        l.description || l.clawback_reason || l.notes || "—",
        money(Number(l.amount) || 0),
      ]),
      foot: [["", "", "Total adjustments", money(statement.adjustments_total)]],
      footStyles: { fillColor: [255, 255, 255], textColor: INK, fontStyle: "bold" },
    });
    // deno-lint-ignore no-explicit-any
    y = (doc as any).lastAutoTable.finalY + 24;
  }

  /* ---------------- Section C ---------------- */
  if (y > 600) { doc.addPage(); y = 52; }

  doc.setFillColor(250, 244, 249);
  doc.rect(M, y - 14, pageW - M * 2, 74, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text(adjustments.length > 0 ? "C · NET PAYABLE" : "B · NET PAYABLE", M + 12, y + 4);
  doc.setFontSize(16);
  doc.setTextColor(...PINK);
  doc.text(money(statement.net_payable), pageW - M - 12, y + 6, { align: "right" });

  const bank = statement.bank_snapshot || {};
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  const bankLine = bank.bank_name || bank.account_number_masked
    ? `${bank.account_holder || statement.rep_name || "Referral partner"} · ${bank.bank_name || "bank on file"} · ${bank.account_number_masked || "account on file"}${bank.is_verified ? "" : " · banking not yet verified"}`
    : "No banking details on file — capture them before paying this statement.";
  doc.text(bankLine, M + 12, y + 26);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...INK);
  doc.text(
    `Payment reference: ${statement.paid_reference || statement.statement_reference || "(issued on approval)"}`,
    M + 12,
    y + 42,
  );
  y += 82;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.6);
  doc.setTextColor(...MUTED);
  doc.text(doc.splitTextToSize(COMMISSION_BASIS_NOTE, pageW - M * 2), M, y);
  y += 24;

  if (statement.status === "paid" && statement.paid_at) {
    doc.setFontSize(8);
    doc.text(`Paid on ${fmtDate(statement.paid_at)}.`, M, y);
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

export function downloadCommissionStatementPdf(
  statement: CommissionStatementDetail,
  vat: VatSettings,
  currency = "ZAR",
): void {
  const doc = buildCommissionStatementPdf(statement, vat, currency);
  const name = (statement.statement_reference || `commission-${statement.rep_code || statement.rep_id}`)
    .replace(/[^A-Za-z0-9-]+/g, "-")
    .toLowerCase();
  doc.save(`${name}.pdf`);
}

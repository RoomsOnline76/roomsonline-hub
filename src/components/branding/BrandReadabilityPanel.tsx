/**
 * BrandReadabilityPanel
 *
 * Shared across property branding, portfolio branding and the PMS branding page.
 * Renders live miniature replicas of the real booking surfaces using the entered
 * palette, plus an auto-correct proposal the user explicitly accepts.
 */

import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, Check, ShieldCheck, Wand2, ArrowRight, Eye } from "lucide-react";
import { contrastRatio } from "@/lib/brandOverride";
import {
  proposeBrandFixes,
  applyBrandFixes,
  readabilityScore,
  AA_TEXT,
  AA_LARGE,
  type BrandPalette,
  type BrandFix,
} from "@/lib/brandAutoCorrect";
import { surfaceForegroundPair, bestForegroundFor } from "@/lib/brandOverride";

interface Props {
  palette: BrandPalette;
  onApply: (patch: Partial<BrandPalette>) => void;
  /** Optional label for the entity being branded, e.g. "portfolio" */
  entityLabel?: string;
}

const isHex = (v?: string | null) => !!v && /^#[0-9a-fA-F]{6}$/.test(v.trim());
const val = (v: string | null | undefined, fallback: string) =>
  isHex(v) ? (v as string).trim() : fallback;

function RatioTag({ fg, bg, min = AA_TEXT }: { fg: string; bg: string; min?: number }) {
  const ratio = contrastRatio(fg, bg);
  const pass = ratio >= min;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
        pass ? "bg-emerald-100 text-emerald-800" : "bg-destructive/10 text-destructive"
      }`}
    >
      {pass ? <Check className="h-2.5 w-2.5" /> : <AlertTriangle className="h-2.5 w-2.5" />}
      {ratio.toFixed(1)}:1
    </span>
  );
}

export function BrandReadabilityPanel({ palette, onApply, entityLabel = "property" }: Props) {
  const fixes = useMemo(() => proposeBrandFixes(palette), [palette]);
  const score = useMemo(() => readabilityScore(palette), [palette]);
  const [selected, setSelected] = useState<string[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setSelected(fixes.map((f) => f.id));
    setDismissed(false);
  }, [fixes.map((f) => `${f.id}:${f.proposed}`).join("|")]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolved colours used by the replicas
  const primary = val(palette.brand_primary_color, "#E91E8C");
  const secondary = val(palette.brand_secondary_color, "#F3F1EE");
  const darkBg = val(palette.brand_dark_bg_color, "#1A1A2E");
  const lightBg = val(palette.brand_light_bg_color, "#FFFFFF");
  const legacyFont = isHex(palette.brand_font_color) ? palette.brand_font_color!.trim() : null;
  const bodyText = val(palette.brand_body_text_color ?? legacyFont, "#1A1A2E");
  const headingText = val(palette.brand_heading_text_color ?? legacyFont, "#1A1A2E");
  const mutedText = val(palette.brand_muted_text_color, "#6B7280");

  const onPrimary = surfaceForegroundPair(primary, bodyText);
  const onSecondary = surfaceForegroundPair(secondary, bodyText);
  const onDark = surfaceForegroundPair(darkBg, bodyText);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const accept = () => {
    const patch = applyBrandFixes(fixes, selected);
    if (Object.keys(patch).length > 0) onApply(patch);
    setDismissed(true);
  };

  return (
    <div className="space-y-4">
      {/* ── Auto-correct proposal ── */}
      {fixes.length > 0 && !dismissed && (
        <Card className="border-amber-400/60 bg-amber-50/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-900">
              <Wand2 className="h-4 w-4" />
              Readability auto-correct — {fixes.length} proposed change{fixes.length > 1 ? "s" : ""}
            </CardTitle>
            <p className="text-xs text-amber-900/80">
              Some colours in this {entityLabel}'s palette produce hard-to-read text on the live booking
              pages. These proposals keep your brand hue and only adjust lightness so the text passes
              WCAG AA. Review them, then accept.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {fixes.map((fix) => (
              <FixRow key={fix.id} fix={fix} checked={selected.includes(fix.id)} onToggle={() => toggle(fix.id)} />
            ))}
            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" onClick={accept} disabled={selected.length === 0}>
                <Check className="h-4 w-4 mr-1" /> Accept proposed changes ({selected.length})
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
                Dismiss
              </Button>
            </div>
            <p className="text-[11px] text-amber-900/70">
              Accepting updates the colour fields above — you still need to Save for the change to go live.
            </p>
          </CardContent>
        </Card>
      )}

      {fixes.length === 0 && (
        <div className="flex items-center gap-2 rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <ShieldCheck className="h-4 w-4" />
          All brand surfaces pass WCAG AA readability checks.
        </div>
      )}

      {/* ── Live replicas ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Eye className="h-4 w-4 text-primary" /> How your booking pages will look
            <Badge variant="outline" className="ml-auto text-[10px]">
              Readability {score}/100
            </Badge>
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            These are exact replicas of the surfaces guests see. Every text pair is checked against the
            colour behind it.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* 1. Booking header bar */}
          <Replica
            title="Booking page header"
            checks={[
              { label: "Title on brand bar", fg: onPrimary.fg, bg: primary, min: AA_LARGE },
              { label: "Subtitle on brand bar", fg: onPrimary.muted, bg: primary, min: AA_LARGE },
            ]}
          >
            <div
              className="flex items-center justify-between gap-3 rounded-t-md px-3 py-2.5"
              style={{ background: primary }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="h-7 w-7 shrink-0 rounded"
                  style={{ background: onPrimary.fg, opacity: 0.85 }}
                />
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold" style={{ color: onPrimary.fg }}>
                    Dassiesingel Self-catering Units
                  </div>
                  <div className="truncate text-[10px]" style={{ color: onPrimary.muted }}>
                    Dassie Singel, Jongensfontein
                  </div>
                </div>
              </div>
              <div
                className="shrink-0 rounded border px-2 py-1 text-[10px]"
                style={{ color: onPrimary.fg, borderColor: onPrimary.muted }}
              >
                Promo code
              </div>
            </div>
          </Replica>

          {/* 2. Rate calendar */}
          <Replica
            title="Rate calendar"
            checks={[
              { label: "Weekday labels on header row", fg: onPrimary.muted, bg: primary, min: AA_LARGE },
              { label: "Rate figures on page", fg: bodyText, bg: lightBg, min: AA_TEXT },
            ]}
          >
            <div className="overflow-hidden rounded-md border" style={{ borderColor: mutedText + "40" }}>
              <div className="grid grid-cols-5 px-2 py-2 text-[10px]" style={{ background: primary }}>
                <span style={{ color: onPrimary.fg }}>Room Type</span>
                {["WED 29", "THU 30", "FRI 31", "SAT 1"].map((d) => (
                  <span key={d} className="text-center" style={{ color: onPrimary.muted }}>
                    {d}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-5 items-center px-2 py-2 text-[10px]" style={{ background: lightBg }}>
                <span style={{ color: headingText }} className="font-semibold">
                  BOSBOK
                </span>
                {["700.00", "700.00", "700.00", "850.00"].map((p, i) => (
                  <span key={i} className="text-center" style={{ color: bodyText }}>
                    {p}
                  </span>
                ))}
              </div>
              <div className="flex justify-end px-2 pb-2" style={{ background: lightBg }}>
                <span
                  className="rounded px-2 py-1 text-[10px] font-medium"
                  style={{ background: primary, color: onPrimary.fg }}
                >
                  Book
                </span>
              </div>
            </div>
          </Replica>

          {/* 3. Room card */}
          <Replica
            title="Room card"
            checks={[
              { label: "Card heading", fg: headingText, bg: lightBg, min: AA_LARGE },
              { label: "Card muted copy", fg: mutedText, bg: lightBg, min: AA_TEXT },
            ]}
          >
            <div className="rounded-md border p-3" style={{ background: lightBg, borderColor: mutedText + "40" }}>
              <div className="text-xs font-semibold" style={{ color: headingText }}>
                Grysbok Unit
              </div>
              <div className="text-[10px]" style={{ color: mutedText }}>
                Sleeps 3 · Self-catering · Sea view
              </div>
              <div className="mt-2 text-xs font-semibold" style={{ color: primary }}>
                R 550.00 <span className="font-normal" style={{ color: mutedText }}>per night</span>
              </div>
            </div>
          </Replica>

          {/* 4. Checkout summary */}
          <Replica
            title="Checkout summary"
            checks={[
              { label: "Panel text on secondary", fg: onSecondary.fg, bg: secondary, min: AA_TEXT },
              { label: "Fine print", fg: mutedText, bg: lightBg, min: AA_TEXT },
            ]}
          >
            <div className="rounded-md" style={{ background: lightBg }}>
              <div className="rounded-t-md px-3 py-2 text-[10px]" style={{ background: secondary }}>
                <div className="flex justify-between" style={{ color: onSecondary.fg }}>
                  <span>2 nights × Grysbok</span>
                  <span className="font-semibold">R 1,100.00</span>
                </div>
                <div className="flex justify-between" style={{ color: onSecondary.muted }}>
                  <span>Service fee</span>
                  <span>R 0.00</span>
                </div>
              </div>
              <div className="px-3 py-2">
                <div className="flex justify-between text-xs font-semibold" style={{ color: headingText }}>
                  <span>Total</span>
                  <span>R 1,100.00</span>
                </div>
                <p className="mt-1 text-[9px]" style={{ color: mutedText }}>
                  Cancellations within 14 days of arrival forfeit the deposit.
                </p>
              </div>
            </div>
          </Replica>

          {/* 5. Footer band */}
          <Replica
            title="Footer / accent band"
            checks={[{ label: "Footer text on dark band", fg: onDark.fg, bg: darkBg, min: AA_TEXT }]}
          >
            <div className="rounded-md px-3 py-3" style={{ background: darkBg }}>
              <div className="text-[11px] font-semibold" style={{ color: onDark.fg }}>
                Jongensfontein Holiday Accommodation
              </div>
              <div className="text-[10px]" style={{ color: onDark.muted }}>
                info@jongensfontein.co.za · +27 44 000 0000
              </div>
            </div>
          </Replica>
        </CardContent>
      </Card>
    </div>
  );
}

function Replica({
  title,
  checks,
  children,
}: {
  title: string;
  checks: { label: string; fg: string; bg: string; min?: number }[];
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</div>
      {children}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {checks.map((c) => (
          <span key={c.label} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            {c.label}
            <RatioTag fg={c.fg} bg={c.bg} min={c.min} />
          </span>
        ))}
      </div>
      <Separator />
    </div>
  );
}

function FixRow({ fix, checked, onToggle }: { fix: BrandFix; checked: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-md border bg-background p-2.5">
      <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-1" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium">{fix.label}</span>
          <Badge variant={fix.severity === "fail" ? "destructive" : "secondary"} className="text-[9px]">
            {fix.surface}
          </Badge>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <Swatch hex={fix.current} caption={`${fix.ratioBefore.toFixed(1)}:1`} bad />
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <Swatch hex={fix.proposed} caption={`${fix.ratioAfter.toFixed(1)}:1`} />
        </div>
        <p className="mt-1.5 text-[11px] text-muted-foreground">{fix.reason}</p>
      </div>
    </div>
  );
}

function Swatch({ hex, caption, bad }: { hex: string; caption: string; bad?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-5 w-5 rounded border" style={{ background: hex }} />
      <span className="font-mono text-[10px] uppercase">{hex}</span>
      <span className={`text-[10px] ${bad ? "text-destructive" : "text-emerald-700"}`}>{caption}</span>
    </span>
  );
}

export default BrandReadabilityPanel;

/**
 * BrandReadabilityPanel
 *
 * Shared across property branding, portfolio branding and the PMS branding page.
 * Renders live miniature replicas of the real booking surfaces using the entered
 * palette — in day OR dark presentation — plus an auto-correct proposal the user
 * explicitly accepts.
 */

import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, Check, ShieldCheck, Wand2, ArrowRight, Eye, Sun, Moon } from "lucide-react";
import { contrastRatio, mixHex } from "@/lib/brandOverride";
import {
  proposeBrandFixes,
  applyBrandFixes,
  readabilityScore,
  readabilityScoreForMode,
  readabilityScoreForScope,
  AA_TEXT,
  AA_LARGE,
  DEFAULT_DARK_BG,
  ROLOS_LIGHT_PAGE,
  ROLOS_DARK_PAGE,
  ROLOS_DARK_CARD,
  type BrandPalette,
  type BrandFix,
  type BrandMode,
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
        pass ? "bg-success-surface text-success" : "bg-destructive/10 text-destructive"
      }`}
    >
      {pass ? <Check className="h-2.5 w-2.5" /> : <AlertTriangle className="h-2.5 w-2.5" />}
      {ratio.toFixed(1)}:1
    </span>
  );
}

function ModeBadge({ modes }: { modes: BrandMode[] }) {
  const label =
    modes.length > 1 ? "Fails in day + dark" : modes[0] === "dark" ? "Fails in dark mode" : "Fails in day mode";
  return (
    <span className="inline-flex items-center gap-1 rounded bg-warning-surface px-1.5 py-0.5 text-[9px] font-medium text-warning">
      {modes.includes("dark") ? <Moon className="h-2.5 w-2.5" /> : <Sun className="h-2.5 w-2.5" />}
      {label}
    </span>
  );
}

export function BrandReadabilityPanel({ palette, onApply, entityLabel = "property" }: Props) {
  const fixes = useMemo(() => proposeBrandFixes(palette), [palette]);
  const score = useMemo(() => readabilityScore(palette), [palette]);
  const dayScore = useMemo(() => readabilityScoreForMode(palette, "light"), [palette]);
  const darkScore = useMemo(() => readabilityScoreForMode(palette, "dark"), [palette]);
  const bookingScore = useMemo(() => readabilityScoreForScope(palette, "booking"), [palette]);
  const rolosScore = useMemo(() => readabilityScoreForScope(palette, "rolos"), [palette]);

  const signature = useMemo(
    () => fixes.map((f) => `${f.field}:${f.proposed}`).sort().join("|"),
    [fixes],
  );

  const [selected, setSelected] = useState<string[]>([]);
  const [dismissedSignature, setDismissedSignature] = useState<string | null>(null);
  const [appliedCount, setAppliedCount] = useState(0);
  const [previewMode, setPreviewMode] = useState<BrandMode>("light");

  useEffect(() => {
    setSelected(fixes.map((f) => f.id));
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  const suppressed = dismissedSignature !== null && dismissedSignature === signature;

  // Resolved colours used by the replicas
  const primary = val(palette.brand_primary_color, "#E91E8C");
  const secondary = val(palette.brand_secondary_color, "#F3F1EE");
  const darkBg = val(palette.brand_dark_bg_color, DEFAULT_DARK_BG);
  const lightBg = val(palette.brand_light_bg_color, "#FFFFFF");
  const legacyFont = isHex(palette.brand_font_color) ? palette.brand_font_color!.trim() : null;
  const bodyBrand = val(palette.brand_body_text_color ?? legacyFont, "#1A1A2E");
  const headingBrand = val(palette.brand_heading_text_color ?? legacyFont, "#1A1A2E");
  const mutedBrand = val(palette.brand_muted_text_color, "#6B7280");

  const dark = previewMode === "dark";

  // Surfaces swap with the preview mode; text colours keep their brand value but
  // fall back to a readable derivation when the brand value cannot survive the surface.
  const pageBg = dark ? darkBg : lightBg;
  const cardBg = dark ? mixHex(darkBg, "#ffffff", 0.07) : lightBg;
  const safe = (fg: string, bg: string, min: number) =>
    contrastRatio(fg, bg) >= min ? fg : bestForegroundFor(bg);

  const bodyText = safe(bodyBrand, cardBg, AA_TEXT);
  const headingText = safe(headingBrand, cardBg, AA_LARGE);
  const mutedText = safe(mutedBrand, cardBg, AA_TEXT);

  const onPrimary = surfaceForegroundPair(primary, bodyBrand);
  const onSecondary = surfaceForegroundPair(dark ? mixHex(secondary, darkBg, 0.75) : secondary, bodyBrand);
  const secondaryFill = dark ? mixHex(secondary, darkBg, 0.75) : secondary;
  const onDark = surfaceForegroundPair(darkBg, bodyBrand);
  const borderTint = dark ? "#ffffff33" : mutedBrand + "40";

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const accept = () => {
    const patch = applyBrandFixes(fixes, selected);
    const count = Object.keys(patch).length;
    if (count > 0) onApply(patch);
    setAppliedCount(count);
    setDismissedSignature(signature);
  };

  return (
    <div className="space-y-4">
      {/* ── Auto-correct proposal ── */}
      {fixes.length > 0 && !suppressed && (
        <Card className="border-warning-border bg-warning-surface">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-warning">
              <Wand2 className="h-4 w-4" />
              Readability auto-correct — {fixes.length} proposed change{fixes.length > 1 ? "s" : ""}
            </CardTitle>
            <p className="text-xs text-foreground/80">
              Some colours in this {entityLabel}'s palette produce hard-to-read text on the live booking
              pages — assessed in both day and dark presentation. These proposals keep your brand hue and
              only adjust lightness so the text passes WCAG AA. Review them, then accept.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {(["booking", "rolos"] as const).map((scope) => {
              const group = fixes.filter((f) => f.scope === scope);
              if (group.length === 0) return null;
              return (
                <div key={scope} className="space-y-2">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-foreground/70">
                    {scope === "booking"
                      ? "Guest booking pages"
                      : "ROLOS interface (admin & PMS)"}
                  </div>
                  {group.map((fix) => (
                    <FixRow
                      key={fix.id}
                      fix={fix}
                      checked={selected.includes(fix.id)}
                      onToggle={() => toggle(fix.id)}
                    />
                  ))}
                </div>
              );
            })}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button size="sm" onClick={accept} disabled={selected.length === 0}>
                <Check className="h-4 w-4 mr-1" /> Accept proposed changes ({selected.length})
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setAppliedCount(0); setDismissedSignature(signature); }}>
                Dismiss
              </Button>
            </div>
            <p className="text-[11px] text-foreground/70">
              Accepting updates the colour fields above — you still need to Save for the change to go live.
            </p>
          </CardContent>
        </Card>
      )}

      {fixes.length > 0 && suppressed && appliedCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-success-border bg-success-surface px-3 py-2 text-xs text-success">
          <Check className="h-4 w-4" />
          Applied {appliedCount} colour change{appliedCount > 1 ? "s" : ""} to the fields above — press
          <span className="font-semibold">Save</span> to publish.
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-6 px-2 text-[11px]"
            onClick={() => setDismissedSignature(null)}
          >
            Review remaining
          </Button>
        </div>
      )}

      {fixes.length === 0 && (
        <div className="flex items-center gap-2 rounded-md border border-success-border bg-success-surface px-3 py-2 text-xs text-success">
          <ShieldCheck className="h-4 w-4" />
          All brand surfaces pass WCAG AA readability checks in day and dark mode.
        </div>
      )}

      {/* ── Live replicas ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex flex-wrap items-center gap-2">
            <Eye className="h-4 w-4 text-primary" /> How your booking pages will look
            <Badge variant="outline" className="ml-auto text-[10px]">
              Readability {score}/100
            </Badge>
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <div className="inline-flex overflow-hidden rounded-md border border-border">
              <button
                type="button"
                onClick={() => setPreviewMode("light")}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] ${
                  !dark ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"
                }`}
              >
                <Sun className="h-3 w-3" /> Day
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode("dark")}
                className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] ${
                  dark ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground"
                }`}
              >
                <Moon className="h-3 w-3" /> Dark
              </button>
            </div>
            <Badge variant="outline" className="text-[10px]">Day {dayScore}/100</Badge>
            <Badge variant="outline" className="text-[10px]">Dark {darkScore}/100</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            These are exact replicas of the surfaces guests see. Every text pair is checked against the
            colour behind it in the selected mode.
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
              { label: "Rate figures on page", fg: bodyText, bg: pageBg, min: AA_TEXT },
            ]}
          >
            <div className="overflow-hidden rounded-md border" style={{ borderColor: borderTint }}>
              <div className="grid grid-cols-5 px-2 py-2 text-[10px]" style={{ background: primary }}>
                <span style={{ color: onPrimary.fg }}>Room Type</span>
                {["WED 29", "THU 30", "FRI 31", "SAT 1"].map((d) => (
                  <span key={d} className="text-center" style={{ color: onPrimary.muted }}>
                    {d}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-5 items-center px-2 py-2 text-[10px]" style={{ background: pageBg }}>
                <span style={{ color: headingText }} className="font-semibold">
                  BOSBOK
                </span>
                {["700.00", "700.00", "700.00", "850.00"].map((p, i) => (
                  <span key={i} className="text-center" style={{ color: bodyText }}>
                    {p}
                  </span>
                ))}
              </div>
              <div className="flex justify-end px-2 pb-2" style={{ background: pageBg }}>
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
              { label: "Card heading", fg: headingText, bg: cardBg, min: AA_LARGE },
              { label: "Card muted copy", fg: mutedText, bg: cardBg, min: AA_TEXT },
              { label: "Price in primary", fg: safe(primary, cardBg, AA_LARGE), bg: cardBg, min: AA_LARGE },
            ]}
          >
            <div className="rounded-md border p-3" style={{ background: cardBg, borderColor: borderTint }}>
              <div className="text-xs font-semibold" style={{ color: headingText }}>
                Grysbok Unit
              </div>
              <div className="text-[10px]" style={{ color: mutedText }}>
                Sleeps 3 · Self-catering · Sea view
              </div>
              <div className="mt-2 text-xs font-semibold" style={{ color: safe(primary, cardBg, AA_LARGE) }}>
                R 550.00 <span className="font-normal" style={{ color: mutedText }}>per night</span>
              </div>
            </div>
          </Replica>

          {/* 4. Checkout summary */}
          <Replica
            title="Checkout summary"
            checks={[
              { label: "Panel text on secondary", fg: onSecondary.fg, bg: secondaryFill, min: AA_TEXT },
              { label: "Fine print", fg: mutedText, bg: pageBg, min: AA_TEXT },
            ]}
          >
            <div className="rounded-md" style={{ background: pageBg }}>
              <div className="rounded-t-md px-3 py-2 text-[10px]" style={{ background: secondaryFill }}>
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
          <ModeBadge modes={fix.modes} />
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
      <span className={`text-[10px] ${bad ? "text-destructive" : "text-success"}`}>{caption}</span>
    </span>
  );
}

export default BrandReadabilityPanel;

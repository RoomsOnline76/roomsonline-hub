/**
 * Page 2 — "TOBI Assessment": the opt-in read that prints straight after the
 * cover, before any grid.
 *
 * Generation runs on TOBI's consultant brain (xAI/Grok) first, standing by on
 * the Lovable gateway when xAI is unavailable, so an owner-facing page never
 * fails outright. All user-visible copy stays branded TOBI.
 *
 * Mirrors src/lib/reports/page2.ts — keep both in step.
 */
import { XAI_CHAT_URL, aiChat, modelForTask, AI_TEMPERATURE } from "./aiModels.ts";

export interface Page2Document {
  headline: string;
  primer: string;
  highlights: string[];
  warnings: string[];
  redFlags: string[];
  generatedAt: string | null;
  edited: boolean;
  error: string | null;
}

export const PAGE2_PAGE_KEY = "tobi_assessment";
export const PAGE2_PAGE_TITLE = "TOBI Assessment";

const LIMITS = { headline: 160, primer: 700, bullet: 260, bullets: 6 } as const;

const clamp = (value: unknown, max: number): string => {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return trimmed.length > max ? `${trimmed.slice(0, max - 1).trimEnd()}…` : trimmed;
};

const clampList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => clamp(entry, LIMITS.bullet))
    .filter((entry) => entry.length > 0)
    .slice(0, LIMITS.bullets);
};

export function parsePage2(value: unknown): Page2Document {
  const raw = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  return {
    headline: clamp(raw.headline, LIMITS.headline),
    primer: clamp(raw.primer, LIMITS.primer),
    highlights: clampList(raw.highlights),
    warnings: clampList(raw.warnings),
    redFlags: clampList(raw.red_flags ?? raw.redFlags),
    generatedAt: clamp(raw.generated_at ?? raw.generatedAt, 40) || null,
    edited: raw.edited === true,
    error: clamp(raw.error, 300) || null,
  };
}

export function serialisePage2(doc: Page2Document): Record<string, unknown> {
  return {
    headline: doc.headline,
    primer: doc.primer,
    highlights: doc.highlights,
    warnings: doc.warnings,
    red_flags: doc.redFlags,
    generated_at: doc.generatedAt,
    edited: doc.edited,
    error: doc.error,
  };
}

export function page2HasContent(doc: Page2Document | null | undefined): boolean {
  if (!doc) return false;
  return Boolean(
    doc.headline || doc.primer || doc.highlights.length || doc.warnings.length || doc.redFlags.length,
  );
}

/* ── Generation ───────────────────────────────────────────────── */

const SYSTEM_PROMPT =
  `You are TOBI, the revenue analyst for a South African hospitality group. You are
writing PAGE 2 of a monthly revenue outlook report — the first thing the owner reads
after the cover, before any table or chart. It sets up everything that follows.

Write it as a seasoned revenue director briefing the owner in person: calm, direct,
commercially useful. Four parts:
- "headline": one sentence, the single thing the owner must take away.
- "primer": two to four sentences preparing the owner for the pages that follow —
  what this period is really about and how to read what comes next.
- "highlights": what is genuinely going well, and why it matters.
- "warnings": what needs attention this period, each with the lever to pull.
- "red_flags": only things that will cost real money if ignored. Leave the list
  empty when nothing qualifies. Never manufacture one.

Hard rules:
- Use ONLY figures present in "facts", "snapshot" or "prior_years". Never calculate,
  round differently, estimate or invent a number, month or percentage.
- Stay inside "period.months". Earlier months are comparatives only.
- Currency is South African rand, written as R129 000 style. Use "k" only in short
  bullet asides ("R144k on the books").
- British/South African English. No vendor names, no mention of AI, models or
  providers. No emojis, no markdown, no headings inside the text. No hype words.
- Never promise the owner an outcome.

Return STRICT JSON with exactly these keys:
{
  "headline": "one sentence",
  "primer": "two to four sentences",
  "highlights": ["one sentence each, at most 5"],
  "warnings": ["one sentence each, at most 5"],
  "red_flags": ["one sentence each, at most 4, may be empty"]
}
Never add keys.`;

const XAI_MODEL = "grok-4-fast";

interface GenerateOutcome {
  ok: boolean;
  status: number;
  provider: "xai" | "gateway" | null;
  data?: Record<string, unknown>;
  error?: string;
}

const parseContent = (payload: unknown): Record<string, unknown> | null => {
  const content = String(
    (payload as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message
      ?.content ?? "",
  );
  const cleaned = content.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  if (!cleaned) return null;
  try {
    return JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    return null;
  }
};

/**
 * Runs the assessment pass: xAI first (this is a judgement page, and the
 * consultant brain writes it best), Lovable gateway as the standby.
 */
export async function generatePage2(
  payload: Record<string, unknown>,
  options: { signal?: AbortSignal; label?: string } = {},
): Promise<GenerateOutcome> {
  const label = options.label ?? "revenue-report-page2";
  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: JSON.stringify(payload) },
  ];

  const xaiKey = Deno.env.get("XAI_API_KEY");
  if (xaiKey) {
    try {
      const resp = await fetch(XAI_CHAT_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${xaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: XAI_MODEL,
          temperature: AI_TEMPERATURE.prose,
          response_format: { type: "json_object" },
          messages,
        }),
        signal: options.signal,
      });
      if (resp.ok) {
        const parsed = parseContent(await resp.json());
        if (parsed) return { ok: true, status: 200, provider: "xai", data: parsed };
        console.warn(`[${label}] primary pass unreadable; standing by`);
      } else {
        console.warn(`[${label}] primary pass refused (${resp.status}); standing by`);
      }
    } catch (err) {
      console.warn(`[${label}] primary pass failed; standing by`, err);
    }
  }

  const outcome = await aiChat(
    {
      model: modelForTask("revenue_report_insights"),
      temperature: AI_TEMPERATURE.prose,
      response_format: { type: "json_object" },
      messages,
    },
    { label, signal: options.signal },
  );
  if (!outcome.ok) {
    return {
      ok: false,
      status: outcome.status,
      provider: null,
      error: outcome.error ?? "TOBI could not write the assessment this time.",
    };
  }
  const parsed = parseContent(outcome.data);
  if (!parsed) {
    return {
      ok: false,
      status: 502,
      provider: "gateway",
      error: "TOBI returned an unreadable assessment. Please try again.",
    };
  }
  return { ok: true, status: 200, provider: "gateway", data: parsed };
}

/** Shapes a model reply into a stored document. */
export function page2FromModel(raw: Record<string, unknown>): Page2Document {
  return {
    ...parsePage2({
      headline: raw.headline,
      primer: raw.primer,
      highlights: raw.highlights,
      warnings: raw.warnings,
      red_flags: raw.red_flags,
    }),
    generatedAt: new Date().toISOString(),
    edited: false,
    error: null,
  };
}

/* ── Printed page ─────────────────────────────────────────────── */

const escHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const block = (title: string, items: string[], variant: string): string => {
  if (items.length === 0) return "";
  return `<div class="assess-block assess-${variant}">
    <h4>${escHtml(title)}</h4>
    <ul>${items.map((item) => `<li>${escHtml(item)}</li>`).join("")}</ul>
  </div>`;
};

/** Body markup for the assessment page (page chrome is added by the builder). */
export function renderPage2Body(doc: Page2Document): string {
  if (!page2HasContent(doc)) return "";
  const parts = [
    doc.headline ? `<p class="assess-headline">${escHtml(doc.headline)}</p>` : "",
    doc.primer
      ? `<p class="assess-primer">${escHtml(doc.primer).replace(/\n+/g, "<br />")}</p>`
      : "",
    block("What is going well", doc.highlights, "good"),
    block("Needs attention", doc.warnings, "warn"),
    block("Red flags", doc.redFlags, "flag"),
  ];
  return parts.filter(Boolean).join("");
}

/** CSS for the assessment page, appended to the report stylesheet. */
export const PAGE2_CSS = `
  /* Page 2 — TOBI Assessment */
  .assess-headline {
    font-family: 'Italiana', Georgia, serif;
    font-size: 19pt;
    line-height: 1.25;
    margin: 0;
    color: var(--secondary);
  }
  .assess-primer { margin: 0; font-size: 10.5pt; line-height: 1.6; }
  .assess-block {
    border: 1px solid var(--line);
    border-left: 2.5mm solid var(--primary);
    border-radius: 2mm;
    padding: 4mm 4.5mm;
    break-inside: avoid;
  }
  .assess-block h4 {
    margin: 0 0 2mm;
    font-size: 8pt;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
    font-weight: 500;
  }
  .assess-block ul { margin: 0; padding-left: 4.5mm; font-size: 9.5pt; line-height: 1.55; }
  .assess-block li { margin: 0 0 1.5mm; }
  .assess-good { border-left-color: var(--primary); }
  .assess-warn { border-left-color: #B45309; }
  .assess-flag { border-left-color: #B91C1C; }
`;

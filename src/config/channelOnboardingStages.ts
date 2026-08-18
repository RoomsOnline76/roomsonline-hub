/**
 * Owner-facing Channel Onboarding stages.
 *
 * The eleven/twelve macros in `rolosOnboardingMacros.ts` remain the engine.
 * This file is the job-shaped container: three stages a person can finish
 * without learning the sidebar map.
 */

import { ROLOS_ONBOARDING_MACROS, type MacroDef } from "@/config/rolosOnboardingMacros";
import type { MacroProgress } from "@/hooks/useRolosOnboardingProgress";

export type ChannelOnboardingStageKey = "ready" | "published" | "live";

export interface ChannelOnboardingStageDef {
  key: ChannelOnboardingStageKey;
  title: string;
  goal: string;
  /** Macro keys that belong to this stage, in order. */
  macroKeys: string[];
}

export const CHANNEL_ONBOARDING_STAGES: ChannelOnboardingStageDef[] = [
  {
    key: "ready",
    title: "Ready to sell",
    goal: "Goal: complete identity, place, rooms, photos and prices so the property can sell.",
    macroKeys: ["identity", "location", "rooms", "media", "commercial"],
  },
  {
    key: "published",
    title: "Published",
    goal: "Goal: get the listing onto the distribution layer and signed off.",
    macroKeys: ["push_owner", "keys", "company_profile", "signoff", "pull_listings", "publish", "currency", "entitlement"],
  },
  {
    key: "live",
    title: "Channels live",
    goal: "Goal: connect at least one sales channel and start trading.",
    macroKeys: ["connect"],
  },
];

export interface StageProgress {
  def: ChannelOnboardingStageDef;
  macros: MacroProgress[];
  complete: boolean;
  locked: boolean;
  score: number;
  currentMacro: MacroProgress | null;
}

export function macrosForStage(stage: ChannelOnboardingStageDef): MacroDef[] {
  return stage.macroKeys
    .map((key) => ROLOS_ONBOARDING_MACROS.find((m) => m.key === key))
    .filter((m): m is MacroDef => !!m);
}

export function buildStageProgress(macros: MacroProgress[]): StageProgress[] {
  const byKey = new Map(macros.map((m) => [m.macro.key, m]));
  let previousComplete = true;
  return CHANNEL_ONBOARDING_STAGES.map((def) => {
    const stageMacros = def.macroKeys.map((k) => byKey.get(k)).filter((m): m is MacroProgress => !!m);
    const complete = stageMacros.length > 0 && stageMacros.every((m) => m.complete);
    const scores = stageMacros.map((m) => m.score);
    const score = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;
    const currentMacro = stageMacros.find((m) => !m.complete) ?? null;
    const locked = !previousComplete;
    previousComplete = previousComplete && complete;
    return { def, macros: stageMacros, complete, locked, score, currentMacro };
  });
}

export function channelOnboardingPath(propertyId: string, variant: "admin" | "pms" = "admin"): string {
  return variant === "pms"
    ? `/pms/channels?property=${propertyId}`
    : `/admin/onboarding/${propertyId}`;
}

/** Editor sections the embedded property form can render. */
export const EDITOR_SECTIONS = new Set([
  "general",
  "contacts",
  "rooms",
  "info-facilities",
  "images",
  "rates",
  "rate-plans",
  // Policy and commercial add-on surfaces belong to step 5. Without them a
  // "Fix" on a policy or payment-method blocker resolved to a section the
  // embedded editor refused to render, leaving the step with no way in.
  "policies",
  "charges",
  "specials",
  "packages",
  "addons",
  "integrations",
]);


/** Section the in-page editor should open for a ready-to-sell macro. */
export function editorSectionForMacro(macroKey: string): string {
  if (macroKey === "commercial") return "rate-plans";
  const macro = ROLOS_ONBOARDING_MACROS.find((m) => m.key === macroKey);
  return macro?.section ?? "general";
}

/**
 * Every editable surface a step covers, in the order an owner should work
 * through them. The wizard renders these as switcher tabs so a step like
 * "Policies, rates & pricing coverage" can reach the policies panel directly
 * instead of depending on a blocker existing to link there.
 */
export function editorSectionsForMacro(macroKey: string): Array<{ section: string; label: string }> {
  switch (macroKey) {
    case "identity":
      return [
        { section: "general", label: "Identity" },
        { section: "contacts", label: "Contacts" },
      ];
    case "rooms":
      return [
        { section: "rooms", label: "Rooms & units" },
        { section: "info-facilities", label: "Facilities" },
      ];
    case "media":
      return [{ section: "images", label: "Media" }];
    case "commercial":
      return [
        { section: "rates", label: "Calendar & seasons" },
        { section: "rate-plans", label: "Rate plans" },
        { section: "policies", label: "Policies" },
        { section: "charges", label: "Charges" },
        { section: "specials", label: "Specials" },
        { section: "packages", label: "Packages" },
        { section: "addons", label: "Add-ons" },
      ];
    default:
      return [];
  }
}


/**
 * Which macro owns a given editor section. Sections that are not a macro's
 * headline section (contacts, info-facilities, rate-plans) still belong to a
 * step through its field tasks — without this map a "Fix" click resolved to
 * nothing and appeared broken.
 */
export function macroKeyForSection(section: string): string | null {
  const explicit: Record<string, string> = {
    contacts: "identity",
    general: "identity",
    "info-facilities": "rooms",
    rooms: "rooms",
    images: "media",
    rates: "commercial",
    "rate-plans": "commercial",
    policies: "commercial",
    charges: "commercial",
    specials: "commercial",
    packages: "commercial",
    addons: "commercial",
    integrations: "publish",

  };
  if (explicit[section]) return explicit[section];
  const byTask = ROLOS_ONBOARDING_MACROS.find((m) =>
    m.tasks.some((t) => t.kind === "fields" && t.sections.includes(section)),
  );
  if (byTask) return byTask.key;
  return ROLOS_ONBOARDING_MACROS.find((m) => m.section === section)?.key ?? null;
}


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
    goal: "Identity, place, rooms, photos and prices are complete enough to sell.",
    macroKeys: ["identity", "location", "rooms", "media", "commercial"],
  },
  {
    key: "published",
    title: "Published",
    goal: "The listing exists on the distribution layer and is signed off.",
    macroKeys: ["push_owner", "keys", "publish", "currency", "signoff", "entitlement"],
  },
  {
    key: "live",
    title: "Channels live",
    goal: "At least one sales channel is connected and trading.",
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

/** Section the in-page editor should open for a ready-to-sell macro. */
export function editorSectionForMacro(macroKey: string): string {
  if (macroKey === "commercial") return "rate-plans";
  const macro = ROLOS_ONBOARDING_MACROS.find((m) => m.key === macroKey);
  return macro?.section ?? "general";
}

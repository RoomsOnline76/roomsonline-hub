import { describe, expect, it } from "vitest";
import {
  CHANNEL_ONBOARDING_STAGES,
  buildStageProgress,
  channelOnboardingPath,
  editorSectionForMacro,
} from "./channelOnboardingStages";
import { ROLOS_ONBOARDING_MACROS } from "./rolosOnboardingMacros";
import type { MacroProgress } from "@/hooks/useRolosOnboardingProgress";

function fakeMacro(key: string, complete: boolean): MacroProgress {
  const macro = ROLOS_ONBOARDING_MACROS.find((m) => m.key === key)!;
  return {
    macro,
    fieldItems: [],
    mandatoryOutstanding: complete ? 0 : 1,
    recommendedOutstanding: 0,
    stateChecks: [],
    score: complete ? 100 : 0,
    complete,
    locked: false,
    outstandingLabels: complete ? [] : ["todo"],
  };
}

describe("channel onboarding stages", () => {
  it("covers every registered macro exactly once", () => {
    const assigned = CHANNEL_ONBOARDING_STAGES.flatMap((s) => s.macroKeys);
    const keys = ROLOS_ONBOARDING_MACROS.map((m) => m.key);
    expect([...assigned].sort()).toEqual([...keys].sort());
  });

  it("locks later stages until earlier ones complete", () => {
    const macros = ROLOS_ONBOARDING_MACROS.map((m) =>
      fakeMacro(m.key, ["identity", "location"].includes(m.key)),
    );
    const stages = buildStageProgress(macros);
    expect(stages[0].complete).toBe(false);
    expect(stages[0].locked).toBe(false);
    expect(stages[1].locked).toBe(true);
    expect(stages[2].locked).toBe(true);
  });

  it("routes admin and owner to the same job", () => {
    expect(channelOnboardingPath("abc", "admin")).toBe("/admin/onboarding/abc");
    expect(channelOnboardingPath("abc", "pms")).toBe("/pms/channels?property=abc");
  });

  it("maps ready-to-sell work to in-page editor sections", () => {
    expect(editorSectionForMacro("identity")).toBe("general");
    expect(editorSectionForMacro("rooms")).toBe("rooms");
    expect(editorSectionForMacro("media")).toBe("images");
    expect(editorSectionForMacro("commercial")).toBe("rate-plans");
  });
});

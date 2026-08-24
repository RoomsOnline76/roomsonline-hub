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
  it("covers the five Ready-to-sell macros only", () => {
    const assigned = CHANNEL_ONBOARDING_STAGES.flatMap((s) => s.macroKeys);
    expect(assigned).toEqual(["identity", "location", "rooms", "media", "commercial"]);
    assigned.forEach((key) => {
      expect(ROLOS_ONBOARDING_MACROS.some((m) => m.key === key)).toBe(true);
    });
  });

  it("reports the Ready-to-sell stage as incomplete while a step is outstanding", () => {
    const macros = ROLOS_ONBOARDING_MACROS.map((m) =>
      fakeMacro(m.key, ["identity", "location"].includes(m.key)),
    );
    const stages = buildStageProgress(macros);
    expect(stages).toHaveLength(1);
    expect(stages[0].complete).toBe(false);
    expect(stages[0].locked).toBe(false);
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

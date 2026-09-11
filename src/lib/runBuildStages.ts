/**
 * The report builder walks a run through compartmentalised stages, one screen
 * at a time. Completion is derived from real run state (not from clicking
 * Continue) so the rail, the resume position and the guards always agree.
 */

export type RunBuildStage =
  | "parse"
  | "more_files"
  | "prior_upload"
  | "prior_ingest"
  | "baseline"
  | "review"
  | "media"
  | "organize"
  | "insights"
  | "build"
  | "daily_upload"
  | "daily_review"
  | "daily_build";

export const RUN_BUILD_STAGES: RunBuildStage[] = [
  "parse",
  "more_files",
  "prior_upload",
  "prior_ingest",
  "baseline",
  "review",
  "media",
  "organize",
  "insights",
  "build",
];

/** The Daily Detailed Report is a short three-screen build. */
export const DAILY_BUILD_STAGES: RunBuildStage[] = [
  "daily_upload",
  "daily_review",
  "daily_build",
];

/** Which stage list a run walks, from its report kind. */
export const stagesForKind = (reportKind?: string | null): RunBuildStage[] =>
  reportKind === "daily_detailed" ? DAILY_BUILD_STAGES : RUN_BUILD_STAGES;


interface StageMeta {
  letter: string;
  label: string;
  blurb: string;
  /** Stages the reviewer may leave untouched without blocking the build. */
  optional: boolean;
}

export const STAGE_META: Record<RunBuildStage, StageMeta> = {
  parse: {
    letter: "A",
    label: "Parse files",
    blurb: "Reading the uploaded source workbooks into booking rows.",
    optional: false,
  },
  more_files: {
    letter: "B",
    label: "More files",
    blurb: "Add any remaining exports for this period, or carry on.",
    optional: true,
  },
  prior_upload: {
    letter: "C",
    label: "Previous report",
    blurb: "The workbook the owner already receives fills the history gaps.",
    optional: false,
  },
  prior_ingest: {
    letter: "D",
    label: "Ingest",
    blurb: "Choose which figures to absorb from the previous report.",
    optional: true,
  },
  baseline: {
    letter: "E",
    label: "Baseline",
    blurb: "Which earlier run supplies the comparison columns.",
    optional: true,
  },
  review: {
    letter: "F",
    label: "Review results",
    blurb:
      "Check the aggregated figures for the review month and the five ahead, and capture any additional revenue.",
    optional: false,
  },
  media: {
    letter: "G",
    label: "Screenshots",
    blurb: "Drop the channel and stats screenshots into their slots.",
    optional: true,
  },
  organize: {
    letter: "H",
    label: "Slide order",
    blurb: "Shuffle the pages and images into the order you want.",
    optional: true,
  },
  insights: {
    letter: "I",
    label: "TOBI analysis",
    blurb: "Review TOBI's read, tick what to include, and write the narrative notes.",
    optional: false,
  },
  build: {
    letter: "J",
    label: "Build",
    blurb: "Process the run, review the numbers and take the downloads.",
    optional: false,
  },
  daily_upload: {
    letter: "A",
    label: "Day's files",
    blurb: "Drop the day's villa state, provisional bookings and movement prints.",
    optional: false,
  },
  daily_review: {
    letter: "B",
    label: "Review the day",
    blurb: "Check the day's figures before they are added to the running workbook.",
    optional: false,
  },
  daily_build: {
    letter: "C",
    label: "Build & download",
    blurb: "Add the day to the workbook and take both the workbook and the report.",
    optional: false,
  },
};

export const isRunBuildStage = (value: unknown): value is RunBuildStage =>
  typeof value === "string" &&
  ([...RUN_BUILD_STAGES, ...DAILY_BUILD_STAGES] as string[]).includes(value);

export interface StageStateInput {
  /** Source (non-prior) files attached to the run. */
  sourceFiles: { parsedOk: boolean | null }[];
  /** Previous-report workbooks attached to the run. */
  priorFiles: unknown[];
  /** Reviewer confirmed there is no previous workbook to import. */
  priorDeclined: boolean;
  /**
   * This client compares against the pack we sent a year ago, so a previous
   * workbook must be attached — declining is only allowed when one of our own
   * runs from that time can supply the column instead.
   */
  stlyRequired?: boolean;
  /** A previous run is pinned or auto-selected as the comparison. */
  hasBaseline: boolean;
  /** Aggregated snapshot exists. */
  hasSnapshot: boolean;
  /** At least one screenshot uploaded. */
  hasMedia: boolean;
  /** TOBI insights exist and the reviewer has been through them. */
  insightsReviewed: boolean;
  /** Daily Detailed Report: the day's figures have been built. */
  hasDailyDay?: boolean;
}

export type StageCompletion = Record<RunBuildStage, boolean>;

/** Which stages are satisfied by the run's actual state. */
export function deriveStageCompletion(input: StageStateInput): StageCompletion {
  const parsedAll =
    input.sourceFiles.length > 0 && input.sourceFiles.every((file) => file.parsedOk === true);
  const priorSettled =
    input.priorFiles.length > 0 || (input.priorDeclined && !input.stlyRequired);
  const dailyDone = Boolean(input.hasDailyDay);

  return {
    parse: parsedAll,
    more_files: parsedAll,
    prior_upload: priorSettled,
    prior_ingest: priorSettled,
    baseline: input.hasBaseline || priorSettled || input.hasSnapshot,
    review: input.hasSnapshot,
    media: input.hasMedia,
    organize: input.hasMedia,
    insights: input.insightsReviewed,
    build: input.hasSnapshot,
    daily_upload: input.sourceFiles.length > 0,
    daily_review: dailyDone,
    daily_build: dailyDone,
  };
}

/** Where a reviewer returning to a run should land. */
export function resumeStage(
  stored: unknown,
  completion: StageCompletion,
  stages: RunBuildStage[] = RUN_BUILD_STAGES,
): RunBuildStage {
  if (isRunBuildStage(stored) && stages.includes(stored)) return stored;
  const firstOpen = stages.find(
    (stage) => !completion[stage] && !STAGE_META[stage].optional,
  );
  return firstOpen ?? stages[stages.length - 1];
}

export const nextStage = (
  stage: RunBuildStage,
  stages: RunBuildStage[] = RUN_BUILD_STAGES,
): RunBuildStage | null => {
  const index = stages.indexOf(stage);
  return index >= 0 && index < stages.length - 1 ? stages[index + 1] : null;
};

export const previousStage = (
  stage: RunBuildStage,
  stages: RunBuildStage[] = RUN_BUILD_STAGES,
): RunBuildStage | null => {
  const index = stages.indexOf(stage);
  return index > 0 ? stages[index - 1] : null;
};


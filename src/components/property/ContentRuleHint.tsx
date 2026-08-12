import React from "react";
import { AlertTriangle, BedDouble, Check, ImageIcon, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { CHANNEL_MIN_DESCRIPTION } from "@/lib/channelFieldRules";
import { MIN_IMAGE_HEIGHT, MIN_IMAGE_WIDTH } from "@/lib/imageValidation";
import type { ImageAuditEntry } from "@/hooks/useImageDimensionAudit";

/**
 * Live content-rule helpers.
 *
 * Every hard channel content rule (description length, image size, sleeping
 * capacity, kitchen) reads its threshold and wording from here so the control,
 * the readiness rail and the push gate can never disagree.
 */

/** Recommended prose target — above the hard channel floor. */
export const RECOMMENDED_DESCRIPTION_CHARS = 800;

interface CharacterCounterHintProps {
  value: string | null | undefined;
  /** Hard floor that blocks channel distribution. Defaults to the channel minimum. */
  required?: number;
  /** Softer target shown as "recommended". */
  recommended?: number;
  className?: string;
}

/** `444 / 700 required · 800 recommended` counter that flips tone as it fills. */
export const CharacterCounterHint: React.FC<CharacterCounterHintProps> = ({
  value,
  required = CHANNEL_MIN_DESCRIPTION,
  recommended = RECOMMENDED_DESCRIPTION_CHARS,
  className,
}) => {
  const length = (value ?? "").trim().length;
  const blocked = length < required;
  const short = !blocked && length < recommended;

  return (
    <span
      className={cn(
        "text-[10px] tabular-nums",
        blocked ? "font-medium text-destructive" : short ? "text-amber-600" : "text-muted-foreground",
        className,
      )}
    >
      {length} / {required} required{recommended > required ? ` · ${recommended} recommended` : ""}
    </span>
  );
};

interface DescriptionShortfallHintProps {
  value: string | null | undefined;
  required?: number;
  recommended?: number;
  /** What the text describes, used in the sentence ("unit", "property"). */
  subject?: string;
  className?: string;
}

/** One-line explanation under a description control, measured while typing. */
export const DescriptionShortfallHint: React.FC<DescriptionShortfallHintProps> = ({
  value,
  required = CHANNEL_MIN_DESCRIPTION,
  recommended = RECOMMENDED_DESCRIPTION_CHARS,
  subject = "listing",
  className,
}) => {
  const length = (value ?? "").trim().length;

  if (length < required) {
    return (
      <p className={cn("flex items-center gap-1 text-[10px] text-destructive", className)}>
        <AlertTriangle className="h-3 w-3 shrink-0" />
        {required - length} more characters needed — distribution channels reject the {subject} below{" "}
        {required} characters.
      </p>
    );
  }

  if (length < recommended) {
    return (
      <p className={cn("flex items-center gap-1 text-[10px] text-amber-600", className)}>
        <Info className="h-3 w-3 shrink-0" />
        Past the {required}-character channel floor. {recommended - length} more characters reaches the{" "}
        {recommended} recommended for stronger conversion.
      </p>
    );
  }

  return (
    <p className={cn("flex items-center gap-1 text-[10px] text-muted-foreground", className)}>
      <Check className="h-3 w-3 shrink-0 text-emerald-600" />
      {length} characters — meets the channel minimum and the recommended target.
    </p>
  );
};

interface BedCapacityHintProps {
  /** Total sleeping capacity from the authored bed configuration. */
  capacity: number;
  /** Declared max guests for the unit. */
  maxGuests: number;
  className?: string;
  /** Optional inline action (e.g. "set max guests to capacity"). */
  action?: React.ReactNode;
}

/** `Beds sleep 2 · needs 4` capacity line for a unit row or card. */
export const BedCapacityHint: React.FC<BedCapacityHintProps> = ({
  capacity,
  maxGuests,
  className,
  action,
}) => {
  const needed = Math.max(0, Number(maxGuests) || 0);
  const short = capacity < needed || capacity === 0;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px]",
        short ? "font-medium text-destructive" : "text-muted-foreground",
        className,
      )}
    >
      <BedDouble className="h-3 w-3 shrink-0" />
      {capacity === 0
        ? `No beds authored · needs ${needed}`
        : short
          ? `Beds sleep ${capacity} · needs ${needed}`
          : `Beds sleep ${capacity} of ${needed}`}
      {short && action ? action : null}
    </span>
  );
};

interface ImageAuditSummaryProps {
  urls: string[];
  results: Record<string, ImageAuditEntry>;
  /** True when one photo is flagged as the main/hero image. */
  hasMainImage?: boolean;
  className?: string;
}

/** Gallery-level tally: how many photos are below the channel minimum. */
export const ImageAuditSummary: React.FC<ImageAuditSummaryProps> = ({
  urls,
  results,
  hasMainImage,
  className,
}) => {
  const list = urls.filter(Boolean);
  if (list.length === 0) return null;

  const entries = list.map((url) => results[url]);
  const failing = entries.filter((e) => e?.status === "fail").length;
  const unmeasured = entries.filter((e) => e?.status === "unmeasured").length;
  const pending = entries.filter((e) => !e || e.status === "pending").length;

  const problems: string[] = [];
  if (failing > 0)
    problems.push(
      `${failing} of ${list.length} photos below ${MIN_IMAGE_WIDTH}×${MIN_IMAGE_HEIGHT} — re-upload those`,
    );
  if (unmeasured > 0) problems.push(`${unmeasured} could not be measured`);
  if (hasMainImage === false) problems.push("main photo not set");

  const clean = problems.length === 0;

  return (
    <p
      className={cn(
        "flex flex-wrap items-center gap-1 text-[10px]",
        clean ? "text-muted-foreground" : "font-medium text-destructive",
        className,
      )}
    >
      {clean ? (
        <Check className="h-3 w-3 shrink-0 text-emerald-600" />
      ) : (
        <AlertTriangle className="h-3 w-3 shrink-0" />
      )}
      {clean ? (
        <>
          <ImageIcon className="h-3 w-3 shrink-0" />
          {list.length} photos · all at least {MIN_IMAGE_WIDTH}×{MIN_IMAGE_HEIGHT}
          {pending > 0 ? ` (${pending} still measuring)` : ""}
        </>
      ) : (
        problems.join(" · ")
      )}
    </p>
  );
};

interface KitchenHintProps {
  /** True when the unit/property is sold as self-catering. */
  selfCatering: boolean;
  /** True when a kitchen or kitchenette amenity is already ticked. */
  hasKitchen: boolean;
  /** Quick-tick shortcuts. */
  onTickKitchen?: () => void;
  onTickKitchenette?: () => void;
  className?: string;
}

/** Inline helper for self-catering units missing a kitchen amenity. */
export const KitchenHint: React.FC<KitchenHintProps> = ({
  selfCatering,
  hasKitchen,
  onTickKitchen,
  onTickKitchenette,
  className,
}) => {
  if (!selfCatering || hasKitchen) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded border border-destructive bg-destructive/10 px-2 py-1.5 text-[10px] text-destructive",
        className,
      )}
    >
      <AlertTriangle className="h-3 w-3 shrink-0" />
      <span className="font-medium">
        Self-catering units must declare a kitchen or kitchenette — the channel rejects the listing
        without it.
      </span>
      {onTickKitchen && (
        <button
          type="button"
          onClick={onTickKitchen}
          className="rounded border border-destructive px-1.5 py-0.5 font-semibold underline-offset-2 hover:underline"
        >
          Tick Kitchen
        </button>
      )}
      {onTickKitchenette && (
        <button
          type="button"
          onClick={onTickKitchenette}
          className="rounded border border-destructive px-1.5 py-0.5 font-semibold underline-offset-2 hover:underline"
        >
          Tick Kitchenette
        </button>
      )}
    </div>
  );
};

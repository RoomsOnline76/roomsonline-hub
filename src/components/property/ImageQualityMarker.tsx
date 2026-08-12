import { AlertTriangle, HelpCircle } from "lucide-react";
import { MIN_IMAGE_HEIGHT, MIN_IMAGE_WIDTH } from "@/lib/imageValidation";
import type { ImageAuditEntry } from "@/hooks/useImageDimensionAudit";

interface Props {
  entry?: ImageAuditEntry;
}

/**
 * Overlay marker for gallery thumbnails whose dimensions fail the channel
 * minimum, or that could not be measured at all.
 */
export function ImageQualityMarker({ entry }: Props) {
  if (!entry || entry.status === "pending") return null;

  // Passing photos still show their measurement so owners can read the size
  // without having to fail the rule first.
  if (entry.status === "pass") {
    return (
      <div
        title={`${entry.width}×${entry.height}px — meets the ${MIN_IMAGE_WIDTH}×${MIN_IMAGE_HEIGHT}px channel minimum.`}
        className="absolute bottom-1 left-1 rounded bg-background/85 px-1.5 py-0.5 text-[9px] font-medium tabular-nums text-muted-foreground"
      >
        {entry.width}×{entry.height}
      </div>
    );
  }

  const failed = entry.status === "fail";
  const label = failed
    ? `${entry.width}×${entry.height}px — below ${MIN_IMAGE_WIDTH}×${MIN_IMAGE_HEIGHT}px. Re-upload a larger photo.`
    : `Size could not be verified — re-upload this photo (minimum ${MIN_IMAGE_WIDTH}×${MIN_IMAGE_HEIGHT}px).`;

  return (
    <>
      <div
        className={`pointer-events-none absolute inset-0 rounded-[inherit] ring-2 ring-inset ${
          failed ? "ring-destructive" : "ring-amber-500"
        }`}
      />
      <div
        title={label}
        className={`absolute bottom-1 left-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium ${
          failed ? "bg-destructive text-destructive-foreground" : "bg-amber-500 text-black"
        }`}
      >
        {failed ? <AlertTriangle className="h-2.5 w-2.5" /> : <HelpCircle className="h-2.5 w-2.5" />}
        {failed ? `${entry.width}×${entry.height}` : "Unverified"}
      </div>
    </>
  );
}

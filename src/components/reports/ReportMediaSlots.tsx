import { useMemo, useRef, useState, type ClipboardEvent } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronDown, ChevronLeft, ChevronRight, ImagePlus, Trash2, Upload } from "lucide-react";
import { useReportMedia, type ReportMediaSlotState } from "@/hooks/useReportMedia";
import { MEDIA_SECTIONS } from "@/lib/reportMediaSlots";

interface ReportMediaSlotsProps {
  runId: string;
}

function SlotEditor({
  slot,
  media,
}: {
  slot: ReportMediaSlotState;
  media: ReturnType<typeof useReportMedia>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropActive, setDropActive] = useState(false);

  const addFiles = (files: FileList | File[] | null) => {
    const list = Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));
    if (list.length === 0) return;
    media.upload.mutate({ slotKey: slot.definition.key, files: list });
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (files.length === 0) return;
    event.preventDefault();
    addFiles(files);
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{slot.definition.title}</p>
          <p className="text-xs text-muted-foreground">{slot.definition.hint}</p>
        </div>
        <Badge variant={slot.images.length > 0 ? "secondary" : "outline"}>
          {slot.images.length} image{slot.images.length === 1 ? "" : "s"}
        </Badge>
      </div>

      <div
        tabIndex={0}
        onPaste={handlePaste}
        onDragOver={(event) => {
          event.preventDefault();
          setDropActive(true);
        }}
        onDragLeave={() => setDropActive(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDropActive(false);
          addFiles(event.dataTransfer?.files ?? null);
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-md border border-dashed p-5 text-center outline-none transition-colors ${
          dropActive ? "border-primary bg-accent" : "border-border"
        }`}
      >
        <ImagePlus className="h-5 w-5 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Click here and press <span className="font-medium">Ctrl/Cmd + V</span> to paste a
          screenshot, or drop an image
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={media.upload.isPending}
        >
          <Upload className="mr-2 h-3.5 w-3.5" />
          Choose image
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {slot.images.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {slot.images.map((image, index) => (
            <div key={image.id} className="space-y-2 rounded-md border border-border p-2">
              <img
                src={image.url}
                alt={image.caption ?? slot.definition.title}
                loading="lazy"
                className="w-full rounded border border-border object-contain"
              />
              <Input
                defaultValue={image.caption ?? ""}
                placeholder="Caption (optional)"
                className="h-8 text-xs"
                onBlur={(event) => {
                  if ((image.caption ?? "") === event.target.value.trim()) return;
                  media.setCaption.mutate({ id: image.id, caption: event.target.value });
                }}
              />
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={index === 0}
                    onClick={() => media.move.mutate({ row: image, direction: -1 })}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={index === slot.images.length - 1}
                    onClick={() => media.move.mutate({ row: image, direction: 1 })}
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => media.remove.mutate(image)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Screenshot capture for the revenue team: one paste target per report slot,
 * grouped by the page the images print on.
 */
export function ReportMediaSlots({ runId }: ReportMediaSlotsProps) {
  const media = useReportMedia(runId);
  const [open, setOpen] = useState(false);

  const bySection = useMemo(
    () =>
      MEDIA_SECTIONS.map((section) => ({
        section,
        slots: media.slots.filter((slot) => slot.definition.section === section),
      })),
    [media.slots],
  );

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle className="text-base font-medium">Screenshots & slides</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">
                  Paste channel, promotion and traveller-trend screenshots — they print in the
                  draft report in this order.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={media.total > 0 ? "secondary" : "outline"}>
                  {media.total} captured
                </Badge>
                <ChevronDown
                  className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                />
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-6">
            {bySection.map((group) => (
              <div key={group.section} className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {group.section}
                </p>
                <div className="space-y-3">
                  {group.slots.map((slot) => (
                    <SlotEditor key={slot.definition.key} slot={slot} media={media} />
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

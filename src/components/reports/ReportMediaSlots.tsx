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
import { ChevronDown, ChevronLeft, ChevronRight, ImagePlus, Plus, Trash2, Upload } from "lucide-react";
import { useReportMedia, type ReportMediaSlotState } from "@/hooks/useReportMedia";


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
        <div className="min-w-[240px] flex-1">
          {slot.definition.isCustom ? (
            <Input
              defaultValue={slot.definition.title}
              placeholder="Slide section title"
              className="h-8 text-sm font-medium"
              onBlur={(event) => {
                if (event.target.value.trim() === slot.definition.title) return;
                media.updateSlot.mutate({ id: slot.definition.id!, title: event.target.value });
              }}
            />
          ) : (
            <p className="text-sm font-medium">{slot.definition.title}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">{slot.definition.hint}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={slot.images.length > 0 ? "secondary" : "outline"}>
            {slot.images.length} image{slot.images.length === 1 ? "" : "s"}
          </Badge>
          {slot.definition.isCustom && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive"
              aria-label="Remove slide section"
              onClick={() => media.deleteSlot.mutate(slot.definition)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
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
                defaultValue={image.section_title ?? ""}
                placeholder="Section title (prints as the heading)"
                className="h-8 text-xs font-medium"
                onBlur={(event) => {
                  if ((image.section_title ?? "") === event.target.value.trim()) return;
                  media.setSectionTitle.mutate({ id: image.id, title: event.target.value });
                }}
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
  const [newTitle, setNewTitle] = useState("");

  const bySection = useMemo(
    () =>
      media.sections.map((section) => ({
        section,
        slots: media.slots.filter((slot) => slot.definition.section === section),
      })),
    [media.sections, media.slots],
  );

  const addSection = () => {
    media.createSlot.mutate(newTitle, { onSuccess: () => setNewTitle("") });
  };

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

            <div className="space-y-2 rounded-lg border border-dashed border-border p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Add another slide section
              </p>
              <div className="flex flex-wrap gap-2">
                <Input
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  placeholder="e.g. Airbnb performance"
                  className="h-9 max-w-xs text-sm"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addSection();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addSection}
                  disabled={media.createSlot.isPending}
                >
                  <Plus className="mr-2 h-3.5 w-3.5" />
                  Add section
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Each section prints as its own page once you paste an image into it. Use the slide
                organizer below to change where it lands.
              </p>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}


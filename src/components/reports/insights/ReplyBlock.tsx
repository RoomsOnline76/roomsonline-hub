import { Copy, MapPin, Orbit, Pencil, RotateCcw, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  effectivePlacement,
  placementLabel,
  placementOptions,
  type InsightPlacement,
} from "@/lib/reports/insightPlacement";

export const CRYSTAL_BALL_LABEL = "TOBI's Crystal Ball";

export interface ReplyBlockProps {
  index: 1 | 2;
  tone: "conservative" | "crystal";
  text: string;
  note: string | null;
  editable?: boolean;
  /** True when the shown text is the reviewer's own wording. */
  edited?: boolean;
  checked: boolean;
  /** Months in the run's report window — the placement picker lists these. */
  months: string[];
  /** Saved placement override, `auto` when the wording decides. */
  placement?: string;
  onToggle: (next: boolean) => void;
  onEdit: (value: string) => void;
  onPlacement: (next: InsightPlacement) => void;
  onRevert?: () => void;
  onCopy: (text: string) => void | Promise<void>;
}

/** One labelled opinion inside a flag or commentary topic. */
export function ReplyBlock({
  index,
  tone,
  text,
  note,
  editable = false,
  edited = false,
  checked,
  months,
  placement,
  onToggle,
  onEdit,
  onPlacement,
  onRevert,
  onCopy,
}: ReplyBlockProps) {
  const label = tone === "conservative" ? "Conservative" : CRYSTAL_BALL_LABEL;
  const Icon = tone === "conservative" ? ShieldCheck : Orbit;
  const resolved = effectivePlacement(placement, text, months);

  return (
    <div
      className={`rounded-md border p-2.5 space-y-2 ${
        tone === "crystal" ? "border-primary bg-muted" : "border-border"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <Checkbox checked={checked} onCheckedChange={(next) => onToggle(next === true)} />
          <Icon className={`h-3.5 w-3.5 ${tone === "crystal" ? "text-primary" : "text-muted-foreground"}`} />
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {index}. {label}
          </span>
        </label>

        <div className="flex items-center gap-1">
          {edited && (
            <Badge variant="outline" className="text-[10px] font-normal">
              Edited
            </Badge>
          )}
          {edited && onRevert && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2"
                  onClick={onRevert}
                  aria-label={`Revert ${label} reply to TOBI's wording`}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Restore TOBI's wording</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2"
                onClick={() => void onCopy(text)}
                aria-label={`Copy ${label} reply`}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Copy this comment</TooltipContent>
          </Tooltip>
          {editable && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex items-center px-1 text-muted-foreground">
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                </span>
              </TooltipTrigger>
              <TooltipContent>Type in the box to reword — it saves when you click away</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {editable ? (
        <Textarea
          key={text}
          defaultValue={text}
          rows={3}
          className="text-sm"
          onBlur={(event) => {
            if (event.target.value === text) return;
            onEdit(event.target.value);
          }}
        />
      ) : (
        <p className="text-sm text-foreground whitespace-pre-line">{text}</p>
      )}
      {note && <p className="text-sm text-muted-foreground">{note}</p>}

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {checked ? (
          <>
            <Badge variant="secondary" className="gap-1 text-[10px] font-normal">
              <MapPin className="h-3 w-3" aria-hidden />
              Goes to: {placementLabel(resolved)}
            </Badge>
            <Select
              value={placement && placement !== "auto" ? placement : "auto"}
              onValueChange={(next) => onPlacement(next as InsightPlacement)}
            >
              <SelectTrigger className="h-7 w-[230px] text-xs" aria-label="Where this comment prints">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {placementOptions(months).map((option) => (
                  <SelectItem key={option.value} value={option.value} className="text-xs">
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        ) : (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Not in report — tick to include
          </span>
        )}
      </div>
    </div>
  );
}

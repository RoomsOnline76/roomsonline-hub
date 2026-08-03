import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, Search, Tag, X } from "lucide-react";
import {
  RU_POPULAR_TAGS,
  RU_TAG_MAIN,
  RuImageTag,
  ruImageTagGroups,
  ruImageTagLabel,
  RU_IMAGE_TAGS,
} from "@/lib/ruImageTags";

interface RuImageTagPickerProps {
  /** Selected Rentals United photo tag IDs for this image. */
  value: number[];
  onChange: (next: number[]) => void;
  /** The gallery's primary photo always pushes as Main (1). */
  isMain?: boolean;
  disabled?: boolean;
  /** Compact chip row for image thumbnails (default) or a wider inline layout. */
  align?: "start" | "center" | "end";
}

/**
 * Per-image Rentals United tag selector. Leads with a popular-first shortlist,
 * then the full searchable 210-tag dictionary. The first selected tag becomes the
 * primary `ImageTypeID` pushed to RU; extras ride along as secondary tags.
 */
export default function RuImageTagPicker({
  value,
  onChange,
  isMain,
  disabled,
  align = "start",
}: RuImageTagPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = useMemo(() => value.filter((id) => id !== RU_TAG_MAIN), [value]);

  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return RU_IMAGE_TAGS.filter((t) => ruImageTagLabel(t.id).toLowerCase().includes(q)).slice(0, 60);
  }, [search]);

  const groups = useMemo(() => ruImageTagGroups(), []);

  const toggle = (id: number) => {
    if (disabled) return;
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  };

  const renderTag = (tag: RuImageTag) => {
    const active = selected.includes(tag.id);
    return (
      <button
        key={tag.id}
        type="button"
        onClick={() => toggle(tag.id)}
        className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs transition-colors ${
          active ? "bg-primary text-primary-foreground" : "hover:bg-muted"
        }`}
      >
        <Check className={`h-3 w-3 shrink-0 ${active ? "opacity-100" : "opacity-0"}`} />
        <span className="truncate">{tag.label}</span>
      </button>
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {isMain && (
        <Badge variant="default" className="h-5 px-1.5 text-[10px]">
          Main
        </Badge>
      )}
      {selected.map((id) => (
        <Badge key={id} variant="secondary" className="h-5 gap-1 px-1.5 text-[10px]">
          <span className="max-w-[110px] truncate">{ruImageTagLabel(id)}</span>
          {!disabled && (
            <button type="button" onClick={() => toggle(id)} aria-label={`Remove ${ruImageTagLabel(id)}`}>
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </Badge>
      ))}
      {!isMain && selected.length === 0 && (
        <Badge variant="outline" className="h-5 border-warning-border bg-warning-surface px-1.5 text-[10px] text-warning">
          Untagged → Interior
        </Badge>
      )}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="ghost" size="sm" className="h-5 gap-1 px-1.5 text-[10px]" disabled={disabled}>
            <Tag className="h-3 w-3" />
            Tag
          </Button>
        </PopoverTrigger>
        <PopoverContent align={align} className="w-72 p-2">
          <div className="relative mb-2">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search 210 RU photo tags..."
              className="h-8 pl-7 text-xs"
            />
          </div>
          <ScrollArea className="h-64 pr-2">
            {results ? (
              results.length ? (
                <div className="space-y-0.5">{results.map(renderTag)}</div>
              ) : (
                <p className="p-2 text-xs text-muted-foreground">No matching tag.</p>
              )
            ) : (
              <div className="space-y-3">
                <div>
                  <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Popular
                  </p>
                  <div className="space-y-0.5">{RU_POPULAR_TAGS.map(renderTag)}</div>
                </div>
                {groups.map((g) => (
                  <div key={g.group}>
                    <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {g.group}
                    </p>
                    <div className="space-y-0.5">{g.tags.map(renderTag)}</div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
          <p className="mt-2 border-t pt-2 text-[10px] leading-tight text-muted-foreground">
            The first tag is pushed to Rentals United as the photo's type; extras sync as additional tags.
          </p>
        </PopoverContent>
      </Popover>
    </div>
  );
}

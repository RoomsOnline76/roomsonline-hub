import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PAGE2_LIMITS, type Page2Document } from "@/lib/reports/page2";

interface Page2EditorProps {
  doc: Page2Document;
  disabled?: boolean;
  /** Called with the reviewer's version — always marked as edited on save. */
  onSave: (doc: Page2Document) => Promise<void>;
}

type ListField = "highlights" | "warnings" | "redFlags";

const LIST_LABELS: Record<ListField, { title: string; hint: string }> = {
  highlights: { title: "What is going well", hint: "The wins worth the owner's attention" },
  warnings: { title: "Needs attention", hint: "Each with the lever to pull this period" },
  redFlags: { title: "Red flags", hint: "Only what costs real money if ignored" },
};

/** Inline editor for the printed assessment page. */
export function Page2Editor({ doc, disabled, onSave }: Page2EditorProps) {
  const [draft, setDraft] = useState<Page2Document>(doc);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!dirty) setDraft(doc);
  }, [doc, dirty]);

  const patch = useCallback((next: Partial<Page2Document>) => {
    setDraft((current) => ({ ...current, ...next }));
    setDirty(true);
  }, []);

  const setItem = useCallback(
    (field: ListField, index: number, value: string) => {
      setDraft((current) => {
        const list = [...current[field]];
        list[index] = value;
        return { ...current, [field]: list };
      });
      setDirty(true);
    },
    [],
  );

  const addItem = useCallback((field: ListField) => {
    setDraft((current) =>
      current[field].length >= PAGE2_LIMITS.bullets
        ? current
        : { ...current, [field]: [...current[field], ""] },
    );
    setDirty(true);
  }, []);

  const removeItem = useCallback((field: ListField, index: number) => {
    setDraft((current) => ({
      ...current,
      [field]: current[field].filter((_, i) => i !== index),
    }));
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await onSave({
        ...draft,
        headline: draft.headline.trim(),
        primer: draft.primer.trim(),
        highlights: draft.highlights.map((entry) => entry.trim()).filter(Boolean),
        warnings: draft.warnings.map((entry) => entry.trim()).filter(Boolean),
        redFlags: draft.redFlags.map((entry) => entry.trim()).filter(Boolean),
      });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, [draft, onSave]);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="page2-headline" className="text-xs uppercase tracking-wide">
          Headline
        </Label>
        <Input
          id="page2-headline"
          value={draft.headline}
          maxLength={PAGE2_LIMITS.headline}
          disabled={disabled}
          placeholder="The one thing the owner must take away"
          onChange={(event) => patch({ headline: event.target.value })}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="page2-primer" className="text-xs uppercase tracking-wide">
          Primer
        </Label>
        <Textarea
          id="page2-primer"
          value={draft.primer}
          maxLength={PAGE2_LIMITS.primer}
          rows={4}
          disabled={disabled}
          placeholder="Two to four sentences setting up the pages that follow"
          onChange={(event) => patch({ primer: event.target.value })}
        />
      </div>

      {(Object.keys(LIST_LABELS) as ListField[]).map((field) => (
        <div key={field} className="space-y-2 rounded-md border border-border p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium">{LIST_LABELS[field].title}</p>
              <p className="text-xs text-muted-foreground">{LIST_LABELS[field].hint}</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || draft[field].length >= PAGE2_LIMITS.bullets}
              onClick={() => addItem(field)}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add
            </Button>
          </div>
          {draft[field].length === 0 ? (
            <p className="text-xs text-muted-foreground">Nothing listed — this block will not print.</p>
          ) : (
            <div className="space-y-2">
              {draft[field].map((item, index) => (
                <div key={`${field}-${index}`} className="flex items-start gap-2">
                  <Textarea
                    value={item}
                    rows={2}
                    maxLength={PAGE2_LIMITS.bullet}
                    disabled={disabled}
                    onChange={(event) => setItem(field, index, event.target.value)}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="mt-0.5 h-8 w-8 shrink-0"
                    disabled={disabled}
                    aria-label="Remove line"
                    onClick={() => removeItem(field, index)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Your wording is kept: a later generation will not overwrite it.
        </p>
        <Button type="button" size="sm" disabled={disabled || !dirty || saving} onClick={handleSave}>
          {saving ? "Saving…" : "Save assessment"}
        </Button>
      </div>
    </div>
  );
}

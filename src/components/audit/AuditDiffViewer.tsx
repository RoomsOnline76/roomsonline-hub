import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface AuditDiffViewerProps {
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  changedFields: string[];
}

export function AuditDiffViewer({ oldValues, newValues, changedFields }: AuditDiffViewerProps) {
  const diffData = useMemo(() => {
    const allKeys = new Set([
      ...Object.keys(oldValues || {}),
      ...Object.keys(newValues || {}),
    ]);

    const entries: {
      key: string;
      oldValue: unknown;
      newValue: unknown;
      status: "added" | "removed" | "changed" | "unchanged";
    }[] = [];

    for (const key of allKeys) {
      // Skip meta fields
      if (["updated_at", "created_at"].includes(key)) continue;

      const oldVal = oldValues?.[key];
      const newVal = newValues?.[key];
      
      let status: "added" | "removed" | "changed" | "unchanged";
      if (oldVal === undefined && newVal !== undefined) {
        status = "added";
      } else if (oldVal !== undefined && newVal === undefined) {
        status = "removed";
      } else if (changedFields.includes(key)) {
        status = "changed";
      } else {
        status = "unchanged";
      }

      entries.push({ key, oldValue: oldVal, newValue: newVal, status });
    }

    // Sort: changed first, then added, removed, unchanged
    const order = { changed: 0, added: 1, removed: 2, unchanged: 3 };
    return entries.sort((a, b) => order[a.status] - order[b.status]);
  }, [oldValues, newValues, changedFields]);

  const formatValue = (value: unknown): string => {
    if (value === undefined) return "—";
    if (value === null) return "null";
    if (typeof value === "object") return JSON.stringify(value, null, 2);
    return String(value);
  };

  if (diffData.length === 0) {
    return (
      <div className="text-sm text-muted-foreground p-4 bg-muted rounded-md">
        No data available
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="grid grid-cols-3 bg-muted text-xs font-medium">
        <div className="px-3 py-2 border-r">Field</div>
        <div className="px-3 py-2 border-r">Before</div>
        <div className="px-3 py-2">After</div>
      </div>
      <div className="divide-y max-h-[400px] overflow-y-auto">
        {diffData.map(({ key, oldValue, newValue, status }) => (
          <div
            key={key}
            className={cn(
              "grid grid-cols-3 text-xs",
              status === "added" && "bg-green-500/5",
              status === "removed" && "bg-red-500/5",
              status === "changed" && "bg-amber-500/5"
            )}
          >
            <div className="px-3 py-2 border-r font-medium flex items-center gap-2">
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  status === "added" && "bg-green-500",
                  status === "removed" && "bg-red-500",
                  status === "changed" && "bg-amber-500",
                  status === "unchanged" && "bg-muted-foreground/30"
                )}
              />
              {key}
            </div>
            <div
              className={cn(
                "px-3 py-2 border-r font-mono break-all",
                status === "removed" && "text-red-600 line-through",
                status === "changed" && "text-muted-foreground"
              )}
            >
              <pre className="whitespace-pre-wrap">{formatValue(oldValue)}</pre>
            </div>
            <div
              className={cn(
                "px-3 py-2 font-mono break-all",
                status === "added" && "text-green-600",
                status === "changed" && "text-amber-600"
              )}
            >
              <pre className="whitespace-pre-wrap">{formatValue(newValue)}</pre>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useCallback, useRef, useState } from "react";
import { FileSpreadsheet, Loader2, Upload, X, Check, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ACCEPTED_SOURCE_EXTENSIONS,
  formatBytes,
  hasAcceptedExtension,
  MAX_SOURCE_FILE_BYTES,
  type UploadPhase,
} from "@/lib/reportUpload";

export interface DropZoneFileState {
  phase: UploadPhase;
  message?: string;
}

interface FileDropZoneProps {
  files: File[];
  states: Record<number, DropZoneFileState>;
  disabled?: boolean;
  onFilesAdded: (files: File[]) => void;
  onRemove: (index: number) => void;
}

const PHASE_ICON: Record<UploadPhase, JSX.Element> = {
  pending: <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />,
  hashing: <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />,
  uploading: <Loader2 className="h-4 w-4 animate-spin text-primary" />,
  done: <Check className="h-4 w-4 text-primary" />,
  error: <AlertTriangle className="h-4 w-4 text-destructive" />,
};

/**
 * Multi-file drop zone for NightsBridge bookingsummary workbooks.
 * Native drag & drop — no extra dependency — with per-file status rows.
 */
export function FileDropZone({
  files,
  states,
  disabled = false,
  onFilesAdded,
  onRemove,
}: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const accept = useCallback((incoming: FileList | null) => {
    if (!incoming) return;
    onFilesAdded(Array.from(incoming));
  }, [onFilesAdded]);

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        aria-disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && (e.key === "Enter" || e.key === " ")) inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) accept(e.dataTransfer.files);
        }}
        className={cn(
          "rounded-lg border border-dashed px-6 py-10 text-center transition-colors cursor-pointer",
          dragging ? "border-primary bg-muted/50" : "hover:bg-muted/30",
          disabled && "opacity-60 pointer-events-none",
        )}
      >
        <Upload className="h-6 w-6 mx-auto mb-3 text-muted-foreground" />
        <p className="text-sm font-medium">Drop bookingsummary files here</p>
        <p className="text-sm text-muted-foreground mt-1">
          or click to browse — {ACCEPTED_SOURCE_EXTENSIONS.join(" / ")}, up to{" "}
          {formatBytes(MAX_SOURCE_FILE_BYTES)} each
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED_SOURCE_EXTENSIONS.join(",")}
          className="hidden"
          onChange={(e) => {
            accept(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {files.length > 0 && (
        <ul className="space-y-2">
          {files.map((file, index) => {
            const state = states[index] ?? { phase: "pending" as UploadPhase };
            const invalid = !hasAcceptedExtension(file.name) || file.size > MAX_SOURCE_FILE_BYTES;
            return (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
              >
                {PHASE_ICON[state.phase]}
                <span className="flex-1 min-w-0 truncate font-medium">{file.name}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatBytes(file.size)}
                </span>
                {(state.message || invalid) && (
                  <span
                    className={cn(
                      "text-xs shrink-0",
                      state.phase === "error" || invalid
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    {state.message ??
                      (file.size > MAX_SOURCE_FILE_BYTES ? "Too large" : "Unsupported type")}
                  </span>
                )}
                {!disabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => onRemove(index)}
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

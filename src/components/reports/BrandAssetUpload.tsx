import { useCallback, useRef, useState } from "react";
import { ImageIcon, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  getValidationErrorMessage,
  validateImageDimensions,
} from "@/lib/imageValidation";

const BUCKET = "property-images";
const MAX_BYTES = 8 * 1024 * 1024;

interface BrandAssetUploadProps {
  label: string;
  /** Current stored public URL (empty string when unset). */
  value: string;
  onChange: (url: string) => void;
  propertyId: string | undefined;
  /** Storage filename prefix, e.g. "logo" or "cover". */
  kind: string;
  /** Logos are exempt from the minimum-dimension rule. */
  enforceMinDimensions?: boolean;
  previewClassName?: string;
  helpText?: string;
  disabled?: boolean;
}

/**
 * Upload/preview/remove zone for report brand assets. Files land in the public
 * `property-images` bucket under `reports/{propertyId}/` so the stored URL is
 * readable by the workbook and printed report renderers. Manual URL entry stays
 * available for externally hosted artwork.
 */
export function BrandAssetUpload({
  label,
  value,
  onChange,
  propertyId,
  kind,
  enforceMinDimensions = false,
  previewClassName,
  helpText,
  disabled = false,
}: BrandAssetUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const upload = useCallback(
    async (file: File) => {
      if (!propertyId) {
        toast.error("Select a property first");
        return;
      }
      if (!file.type.startsWith("image/")) {
        toast.error("Only image files can be uploaded");
        return;
      }
      if (file.size > MAX_BYTES) {
        toast.error("Image must be 8MB or smaller");
        return;
      }
      if (enforceMinDimensions) {
        const dims = await validateImageDimensions(file);
        if (!dims.valid) {
          toast.error("Image too small", {
            description: getValidationErrorMessage(file.name, dims.width, dims.height),
          });
          return;
        }
      }

      setUploading(true);
      try {
        const ext = file.name.split(".").pop()?.toLowerCase() || "png";
        const path = `reports/${propertyId}/${kind}-${Date.now()}.${ext}`;
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { cacheControl: "3600", upsert: true });
        if (error) throw error;
        const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
        onChange(data.publicUrl);
        toast.success(`${label} uploaded`);
      } catch (error) {
        toast.error(`Could not upload ${label.toLowerCase()}`, {
          description: error instanceof Error ? error.message : undefined,
        });
      } finally {
        setUploading(false);
      }
    },
    [enforceMinDimensions, kind, label, onChange, propertyId],
  );

  const busy = disabled || uploading;

  return (
    <div className="space-y-2">
      <Label>{label}</Label>

      {value ? (
        <div className="relative rounded-md border bg-muted/30 p-2">
          <img
            src={value}
            alt={`${label} preview`}
            loading="lazy"
            className={cn("mx-auto object-contain", previewClassName ?? "h-16 w-auto")}
          />
          {!disabled && (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              className="absolute right-1 top-1 h-7 w-7"
              onClick={() => onChange("")}
              aria-label={`Remove ${label}`}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          aria-disabled={busy}
          onClick={() => !busy && inputRef.current?.click()}
          onKeyDown={(e) => {
            if (!busy && (e.key === "Enter" || e.key === " ")) inputRef.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (!busy && file) void upload(file);
          }}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-6 text-center transition-colors cursor-pointer",
            dragging ? "border-primary bg-muted/50" : "hover:bg-muted/30",
            busy && "pointer-events-none opacity-60",
          )}
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          ) : (
            <Upload className="h-5 w-5 text-muted-foreground" />
          )}
          <p className="text-sm font-medium">
            {uploading ? "Uploading…" : "Drop an image or click to browse"}
          </p>
          {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />

      {!disabled && (
        <div className="flex items-center gap-2">
          <ImageIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <Input
            value={value}
            placeholder="…or paste an image URL"
            onChange={(e) => onChange(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
      )}
    </div>
  );
}

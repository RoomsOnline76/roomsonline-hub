import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Download, FileText, Loader2, Trash2, Upload } from "lucide-react";

export const INVOICE_BUCKET = "accounting-invoices";
const MAX_BYTES = 15 * 1024 * 1024;
const ACCEPTED = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/csv",
];

export interface InvoiceDocument {
  document_path: string | null;
  document_name: string | null;
  document_size: number | null;
  document_type: string | null;
}

export const emptyInvoiceDocument: InvoiceDocument = {
  document_path: null,
  document_name: null,
  document_size: null,
  document_type: null,
};

export function formatFileSize(bytes: number | null | undefined) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Opens a private invoice document in a new tab using a short-lived signed URL. */
export async function openInvoiceDocument(path: string) {
  const { data, error } = await supabase.storage
    .from(INVOICE_BUCKET)
    .createSignedUrl(path, 60);
  if (error || !data?.signedUrl) {
    toast.error("Could not open document: " + (error?.message ?? "unknown error"));
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

interface InvoiceDocumentFieldProps {
  value: InvoiceDocument;
  onChange: (next: InvoiceDocument) => void;
}

/**
 * Upload / replace / remove the supporting document for an accounting transaction.
 * Files land in a private bucket; the parent form persists the returned path.
 */
export function InvoiceDocumentField({ value, onChange }: InvoiceDocumentFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File) => {
    if (file.size > MAX_BYTES) {
      toast.error("File is larger than 15 MB");
      return;
    }
    if (file.type && !ACCEPTED.includes(file.type)) {
      toast.error("Use a PDF, image, spreadsheet or CSV file");
      return;
    }

    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const owner = userData.user?.id ?? "shared";
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${owner}/${Date.now()}-${safeName}`;

      const { error } = await supabase.storage
        .from(INVOICE_BUCKET)
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (error) throw error;

      // Best effort clean-up of the file this one replaces.
      if (value.document_path) {
        await supabase.storage.from(INVOICE_BUCKET).remove([value.document_path]);
      }

      onChange({
        document_path: path,
        document_name: file.name,
        document_size: file.size,
        document_type: file.type || null,
      });
      toast.success("Document attached");
    } catch (err) {
      toast.error("Upload failed: " + (err as Error).message);
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    if (!value.document_path) return;
    setBusy(true);
    try {
      await supabase.storage.from(INVOICE_BUCKET).remove([value.document_path]);
      onChange({ ...emptyInvoiceDocument });
      toast.success("Document removed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-2">
      <Label>Invoice document</Label>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.csv"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />

      {value.document_path ? (
        <div className="flex items-center gap-2 rounded-md border p-2">
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {value.document_name || "Attached document"}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatFileSize(value.document_size)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Open document"
            onClick={() => void openInvoiceDocument(value.document_path!)}
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Replace document"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive"
            title="Remove document"
            disabled={busy}
            onClick={() => void handleRemove()}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="justify-start"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Upload className="mr-2 h-4 w-4" />
          )}
          Upload invoice (PDF, image or spreadsheet)
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        Stored privately — only admins, developers and the fearless leader can open it.
      </p>
    </div>
  );
}

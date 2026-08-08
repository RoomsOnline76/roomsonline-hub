import { supabase } from "@/integrations/supabase/client";
import { FunctionsHttpError } from "@supabase/supabase-js";

/**
 * Downloads a subscription invoice PDF.
 *
 * Stored `pdf_url` signed links expire and cannot be opened from inside the
 * app frame, so we always mint a fresh short-lived signed URL server-side and
 * stream the file into a blob download (no popup, no expiry issues).
 */
export async function downloadSubscriptionInvoice(invoiceId: string, invoiceNumber?: string | null): Promise<void> {
  const { data, error } = await supabase.functions.invoke("generate-subscription-invoice-pdf", {
    body: { invoice_id: invoiceId, mode: "url" },
  });

  if (error) {
    const details = error instanceof FunctionsHttpError ? await error.context.text() : error.message;
    throw new Error(details || "Could not prepare the invoice");
  }

  const url = (data as { url?: string; pdf_url?: string } | null)?.url ?? (data as { pdf_url?: string } | null)?.pdf_url;
  if (!url) throw new Error("Invoice PDF is not available yet");

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Invoice download failed (${res.status})`);
  const blob = await res.blob();

  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = `${invoiceNumber || "invoice"}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}

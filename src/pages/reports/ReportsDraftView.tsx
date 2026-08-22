import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { reportsPath } from "@/lib/config";
import { extractDocumentTitle, htmlToBlobUrl, printFrameWithTitle } from "@/lib/reportDraftHtml";
import { usePageSEO } from "@/hooks/usePageSEO";

const BUCKET = "revenue-reports";

/**
 * Full-page viewer for a generated report (draft pack or a specialised slide).
 * Lives on the app's own domain so shared/opened links never expose a storage or
 * blob URL, and sets the tab title to the report's own title so "Save as PDF"
 * proposes the branded filename.
 */
export default function ReportsDraftView() {
  const { runId } = useParams<{ runId: string }>();
  const [params] = useSearchParams();
  const slideId = params.get("slide");
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [documentTitle, setDocumentTitle] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  usePageSEO({
    title: documentTitle ?? "Report preview | Rooms Online",
    description: "Generated revenue report preview.",
    noIndex: true,
  });

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    const load = async () => {
      if (!runId) return;
      setError(null);
      setUrl(null);

      let storagePath: string | null = null;
      if (slideId) {
        const { data } = await supabase
          .from("report_special_reports")
          .select("storage_path")
          .eq("id", slideId)
          .maybeSingle();
        storagePath = data?.storage_path ?? null;
      } else {
        const { data } = await supabase
          .from("report_runs")
          .select("draft_report_path")
          .eq("id", runId)
          .maybeSingle();
        storagePath = (data as { draft_report_path?: string | null } | null)?.draft_report_path ?? null;
      }

      if (!storagePath) {
        if (!cancelled) setError("No generated report found for this run — build the draft first.");
        return;
      }

      const signed = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60 * 30);
      if (!signed.data?.signedUrl) {
        if (!cancelled) setError("Could not open the stored report.");
        return;
      }

      try {
        const response = await fetch(signed.data.signedUrl);
        const html = await response.text();
        if (cancelled) return;
        objectUrl = htmlToBlobUrl(html);
        setDocumentTitle(extractDocumentTitle(html));
        setUrl(objectUrl);
      } catch {
        if (!cancelled) setError("Could not load the report contents.");
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [runId, slideId]);

  const handlePrint = useCallback(() => {
    printFrameWithTitle(frameRef.current, documentTitle);
  }, [documentTitle]);

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Button variant="ghost" size="sm" asChild>
            <Link to={reportsPath(`/runs/${runId}`)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to run
            </Link>
          </Button>
          <p className="text-sm text-muted-foreground truncate">{documentTitle ?? "Report preview"}</p>
        </div>
        <Button size="sm" onClick={handlePrint} disabled={!url}>
          <Printer className="h-4 w-4 mr-2" />
          Save as PDF
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {!url && !error && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading report…
        </div>
      )}

      {url && (
        <iframe
          ref={frameRef}
          src={url}
          title={documentTitle ?? "Report preview"}
          className="flex-1 w-full rounded border bg-muted"
        />
      )}
    </div>
  );
}

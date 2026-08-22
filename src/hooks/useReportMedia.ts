import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { REPORT_MEDIA_SLOTS, type MediaSlotDefinition } from "@/lib/reportMediaSlots";

const BUCKET = "revenue-reports";

export interface ReportMediaRow {
  id: string;
  run_id: string;
  slot_key: string;
  storage_path: string;
  caption: string | null;
  section_title: string | null;
  sort_order: number;
  content_type: string | null;
}

export interface ReportMediaImage extends ReportMediaRow {
  /** Signed, ready-to-render URL. */
  url: string;
}

/** A slot definition plus the custom-slot bookkeeping the editor needs. */
export interface ReportSlotDefinition extends MediaSlotDefinition {
  /** Custom slots are per-run rows the reviewer created. */
  isCustom: boolean;
  /** `report_media_slots.id` for custom slots. */
  id?: string;
}

export interface ReportMediaSlotState {
  definition: ReportSlotDefinition;
  images: ReportMediaImage[];
}


const extensionFor = (file: File): string => {
  const fromName = file.name.split(".").pop();
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
};

/**
 * Manages the pasted screenshots for a report run: upload (file or clipboard),
 * caption, reorder and delete. Signed URLs are refreshed with the query.
 */
export function useReportMedia(runId: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["report-media", runId], [runId]);

  const query = useQuery({
    queryKey,
    enabled: Boolean(runId),
    staleTime: 60_000,
    queryFn: async (): Promise<ReportMediaImage[]> => {
      const { data, error } = await supabase
        .from("report_media")
        .select("id, run_id, slot_key, storage_path, caption, section_title, sort_order, content_type")
        .eq("run_id", runId as string)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as ReportMediaRow[];
      if (rows.length === 0) return [];

      const { data: signed, error: signError } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(
          rows.map((row) => row.storage_path),
          60 * 60 * 4,
        );
      if (signError) throw signError;

      return rows.map((row, index) => ({
        ...row,
        url: signed?.[index]?.signedUrl ?? "",
      }));
    },
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  const upload = useMutation({
    mutationFn: async ({ slotKey, files }: { slotKey: string; files: File[] }) => {
      if (!runId) throw new Error("No run selected");
      const existing = (query.data ?? []).filter((row) => row.slot_key === slotKey);
      let order = existing.reduce((max, row) => Math.max(max, row.sort_order), -1);
      let uploaded = 0;

      for (const file of files) {
        if (!file.type.startsWith("image/")) continue;
        order += 1;
        const path = `media/${runId}/${slotKey}/${Date.now()}-${order}.${extensionFor(file)}`;
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false });
        if (uploadError) throw uploadError;

        const { error: insertError } = await supabase.from("report_media").insert({
          run_id: runId,
          slot_key: slotKey,
          storage_path: path,
          sort_order: order,
          byte_size: file.size,
          content_type: file.type,
        });
        if (insertError) throw insertError;
        uploaded += 1;
      }
      return uploaded;
    },
    onSuccess: (uploaded) => {
      if (uploaded > 0) toast.success(`${uploaded} image${uploaded === 1 ? "" : "s"} added`);
      else toast.error("No images found — paste or pick an image file.");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Could not add the image"),
  });

  const setCaption = useMutation({
    mutationFn: async ({ id, caption }: { id: string; caption: string }) => {
      const { error } = await supabase
        .from("report_media")
        .update({ caption: caption.trim() || null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message || "Could not save the caption"),
  });

  const setSectionTitle = useMutation({
    mutationFn: async ({ id, title }: { id: string; title: string }) => {
      const { error } = await supabase
        .from("report_media")
        .update({ section_title: title.trim() || null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Section title saved");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Could not save the section title"),
  });


  const remove = useMutation({
    mutationFn: async (row: ReportMediaRow) => {
      const { error } = await supabase.from("report_media").delete().eq("id", row.id);
      if (error) throw error;
      await supabase.storage.from(BUCKET).remove([row.storage_path]);
    },
    onSuccess: () => {
      toast.success("Image removed");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Could not remove the image"),
  });

  const move = useMutation({
    mutationFn: async ({ row, direction }: { row: ReportMediaRow; direction: -1 | 1 }) => {
      const siblings = (query.data ?? [])
        .filter((entry) => entry.slot_key === row.slot_key)
        .sort((a, b) => a.sort_order - b.sort_order);
      const index = siblings.findIndex((entry) => entry.id === row.id);
      const target = siblings[index + direction];
      if (index < 0 || !target) return;
      await supabase.from("report_media").update({ sort_order: target.sort_order }).eq("id", row.id);
      await supabase.from("report_media").update({ sort_order: row.sort_order }).eq("id", target.id);
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message || "Could not reorder the images"),
  });

  const slots: ReportMediaSlotState[] = useMemo(
    () =>
      REPORT_MEDIA_SLOTS.map((definition) => ({
        definition,
        images: (query.data ?? [])
          .filter((row) => row.slot_key === definition.key)
          .sort((a, b) => a.sort_order - b.sort_order),
      })),
    [query.data],
  );

  return {
    slots,
    total: query.data?.length ?? 0,
    isLoading: query.isLoading,
    upload,
    setCaption,
    setSectionTitle,
    remove,
    move,
    refresh: invalidate,
  };
}

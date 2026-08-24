import { useCallback, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  builtInSlotByKey,
  isBuiltInSlotKey,
  slotsForSource,
  type MediaSlotDefinition,
} from "@/lib/reportMediaSlots";

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
  /** `report_media_slots.id` for custom slots or title overrides. */
  id?: string;
  /** True when a built-in heading has been renamed for this run. */
  isRenamed?: boolean;
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
export function useReportMedia(runId: string | undefined, sourceType?: string | null) {
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

  const slotsQueryKey = useMemo(() => ["report-media-slots", runId], [runId]);

  const customSlots = useQuery({
    queryKey: slotsQueryKey,
    enabled: Boolean(runId),
    staleTime: 60_000,
    queryFn: async (): Promise<ReportSlotDefinition[]> => {
      const { data, error } = await supabase
        .from("report_media_slots")
        .select("id, slot_key, section, title, hint, layout, sort_order")
        .eq("run_id", runId as string)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((row) => ({
        id: row.id as string,
        key: row.slot_key as string,
        section: (row.section as string) ?? (row.title as string),
        title: (row.title as string) ?? "Additional slides",
        hint: (row.hint as string) ?? "Paste anything else the revenue team needs in the report.",
        layout: row.layout === "half" ? "half" : "full",
        explode: true,
        isCustom: !isBuiltInSlotKey(row.slot_key as string),
      }));
    },
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey });
    void queryClient.invalidateQueries({ queryKey: slotsQueryKey });
  }, [queryClient, queryKey, slotsQueryKey]);


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

  // ── Custom "additional slide" sections ────────────────────────────────
  const createSlot = useMutation({
    mutationFn: async (title: string) => {
      if (!runId) throw new Error("No run selected");
      const clean = title.trim() || "Additional slide";
      const nextOrder =
        (customSlots.data ?? []).length > 0
          ? (customSlots.data ?? []).length + 1
          : 1;

      const { error } = await supabase.from("report_media_slots").insert({
        run_id: runId,
        slot_key: `custom_${crypto.randomUUID().slice(0, 8)}`,
        section: clean,
        title: clean,
        layout: "full",
        sort_order: nextOrder,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Slide section added");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Could not add the slide section"),
  });

  const updateSlot = useMutation({
    mutationFn: async ({
      id,
      title,
      layout,
    }: {
      id: string;
      title?: string;
      layout?: "full" | "half";
    }) => {
      const patch: Record<string, string> = {};
      if (typeof title === "string") {
        const clean = title.trim() || "Additional slide";
        patch.title = clean;
        patch.section = clean;
      }
      if (layout) patch.layout = layout;
      if (Object.keys(patch).length === 0) return;
      const { error } = await supabase.from("report_media_slots").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message || "Could not update the slide section"),
  });

  const deleteSlot = useMutation({
    mutationFn: async (definition: ReportSlotDefinition) => {
      if (!definition.id) return;
      const images = (query.data ?? []).filter((row) => row.slot_key === definition.key);
      if (images.length > 0) {
        await supabase.from("report_media").delete().eq("slot_key", definition.key).eq("run_id", runId as string);
        await supabase.storage.from(BUCKET).remove(images.map((row) => row.storage_path));
      }
      const { error } = await supabase.from("report_media_slots").delete().eq("id", definition.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Slide section removed");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Could not remove the slide section"),
  });

  /**
   * Renames a built-in section heading for this run. Stored as a
   * `report_media_slots` row whose `slot_key` matches the built-in slot.
   */
  const renameSection = useMutation({
    mutationFn: async ({ slotKey, title }: { slotKey: string; title: string }) => {
      if (!runId) throw new Error("No run selected");
      const clean = title.trim();
      const existing = (customSlots.data ?? []).find(
        (row) => row.key === slotKey && !row.isCustom,
      );
      if (!clean) {
        if (existing?.id) {
          const { error } = await supabase.from("report_media_slots").delete().eq("id", existing.id);
          if (error) throw error;
        }
        return;
      }
      if (existing?.id) {
        const { error } = await supabase
          .from("report_media_slots")
          .update({ section: clean, title: clean })
          .eq("id", existing.id);
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("report_media_slots").insert({
        run_id: runId,
        slot_key: slotKey,
        section: clean,
        title: clean,
        layout: "full",
        sort_order: 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Section heading saved");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Could not save the heading"),
  });

  const definitions: ReportSlotDefinition[] = useMemo(() => {
    const rows = customSlots.data ?? [];
    const overrides = new Map(rows.filter((row) => !row.isCustom).map((row) => [row.key, row]));
    const builtIns = slotsForSource(sourceType).map((definition) => {
      const override = overrides.get(definition.key);
      if (!override) return { ...definition, isCustom: false };
      return {
        ...definition,
        section: override.section || definition.section,
        title: override.title || definition.title,
        id: override.id,
        isCustom: false,
        isRenamed: true,
      };
    });
    const known = new Set([...builtIns, ...rows].map((slot) => slot.key));
    // Images captured under another source's slot stay visible (and printable)
    // so switching a run's source never hides work already done.
    const orphans: ReportSlotDefinition[] = [];
    for (const row of query.data ?? []) {
      if (known.has(row.slot_key) || orphans.some((slot) => slot.key === row.slot_key)) continue;
      const fallback = builtInSlotByKey(row.slot_key);
      if (!fallback) continue;
      orphans.push({ ...fallback, isCustom: false });
    }
    return [...builtIns, ...rows.filter((row) => row.isCustom), ...orphans];
  }, [customSlots.data, query.data, sourceType]);

  const slots: ReportMediaSlotState[] = useMemo(
    () =>
      definitions.map((definition) => ({
        definition,
        images: (query.data ?? [])
          .filter((row) => row.slot_key === definition.key)
          .sort((a, b) => a.sort_order - b.sort_order),
      })),
    [definitions, query.data],
  );

  return {
    slots,
    /** Sections in print order — built-in sections first, then custom ones. */
    sections: useMemo(() => {
      const out: string[] = [];
      for (const definition of definitions) {
        if (!out.includes(definition.section)) out.push(definition.section);
      }
      return out;
    }, [definitions]),
    total: query.data?.length ?? 0,
    isLoading: query.isLoading,
    upload,
    setCaption,
    setSectionTitle,
    remove,
    move,
    createSlot,
    updateSlot,
    renameSection,
    deleteSlot,
    refresh: invalidate,
  };

}

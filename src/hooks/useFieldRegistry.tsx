import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface FieldRegistryEntry {
  id: string;
  field_key: string;
  ui_label: string;
  db_table: string | null;
  db_column: string | null;
  data_type: string | null;
  is_required: boolean;
  pms_populated: boolean;
  pms_lockable: boolean;
  section: string | null;
  tab: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// Local field map type from JSON
interface LocalFieldEntry {
  ui_label: string;
  db_table: string;
  db_column: string;
  data_type: string;
  is_required: boolean;
  pms_populated: boolean;
  pms_lockable: boolean;
  section: string;
  tab?: string;
  notes?: string;
}

type LocalFieldMap = Record<string, LocalFieldEntry>;

export function useFieldRegistry() {
  return useQuery({
    queryKey: ["field-registry"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("field_registry")
        .select("*")
        .order("section", { ascending: true })
        .order("ui_label", { ascending: true });

      if (error) throw error;
      return data as FieldRegistryEntry[];
    },
  });
}

export function useLocalFieldMap() {
  // This returns the local JSON field map for cases where DB isn't synced yet
  return useQuery({
    queryKey: ["local-field-map"],
    queryFn: async () => {
      // Dynamically import the field map
      const fieldMapModule = await import("@/../docs/property-form-field-map.json");
      const fieldMap = fieldMapModule.default as LocalFieldMap;
      
      // Transform to array format
      const entries: Omit<FieldRegistryEntry, "id" | "created_at" | "updated_at">[] = 
        Object.entries(fieldMap).map(([key, value]) => ({
          field_key: key,
          ui_label: value.ui_label,
          db_table: value.db_table,
          db_column: value.db_column,
          data_type: value.data_type,
          is_required: value.is_required,
          pms_populated: value.pms_populated,
          pms_lockable: value.pms_lockable,
          section: value.section,
          tab: value.tab || null,
          notes: value.notes || null,
        }));

      return entries;
    },
  });
}

export function useFieldRegistryBySection() {
  const { data: fields } = useFieldRegistry();

  if (!fields) return {};

  // Group by section
  const grouped: Record<string, FieldRegistryEntry[]> = {};
  for (const field of fields) {
    const section = field.section || "Other";
    if (!grouped[section]) {
      grouped[section] = [];
    }
    grouped[section].push(field);
  }

  return grouped;
}

export function useSyncFieldRegistry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Dynamically import the field map
      const fieldMapModule = await import("@/../docs/property-form-field-map.json");
      const fieldMap = fieldMapModule.default as LocalFieldMap;
      // Get existing entries
      const { data: existing } = await supabase
        .from("field_registry")
        .select("field_key");

      const existingKeys = new Set(existing?.map((e) => e.field_key) || []);

      // Prepare entries to insert/update
      const entries = Object.entries(fieldMap).map(([key, value]) => ({
        field_key: key,
        ui_label: value.ui_label,
        db_table: value.db_table,
        db_column: value.db_column,
        data_type: value.data_type,
        is_required: value.is_required,
        pms_populated: value.pms_populated,
        pms_lockable: value.pms_lockable,
        section: value.section,
        tab: value.tab || null,
        notes: value.notes || null,
      }));

      // Upsert all entries
      const { error } = await supabase
        .from("field_registry")
        .upsert(entries, { onConflict: "field_key" });

      if (error) throw error;

      return {
        total: entries.length,
        new: entries.filter((e) => !existingKeys.has(e.field_key)).length,
        updated: entries.filter((e) => existingKeys.has(e.field_key)).length,
      };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["field-registry"] });
      toast.success(
        `Field registry synced: ${result.new} new, ${result.updated} updated`
      );
    },
    onError: (error) => {
      toast.error(`Failed to sync field registry: ${error.message}`);
    },
  });
}

export function useFieldRegistrySearch(searchTerm: string) {
  const { data: fields } = useFieldRegistry();

  if (!fields || !searchTerm) return fields || [];

  const term = searchTerm.toLowerCase();
  return fields.filter(
    (field) =>
      field.field_key.toLowerCase().includes(term) ||
      field.ui_label.toLowerCase().includes(term) ||
      field.section?.toLowerCase().includes(term) ||
      field.notes?.toLowerCase().includes(term)
  );
}

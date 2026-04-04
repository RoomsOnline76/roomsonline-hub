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

// Local field map JSON structure
interface JsonFieldEntry {
  uiLabel: string;
  stateVariable: string;
  dbTable: string | null;
  dbColumn: string | null;
  dataType: string;
  required: boolean;
  pmsPopulated: boolean;
  pmsLockable: boolean;
  notes?: string;
}

interface JsonSection {
  sectionLabel: string;
  fields: JsonFieldEntry[];
}

interface JsonTab {
  tabLabel: string;
  tabValue: string;
  description: string;
  sections: Record<string, JsonSection>;
}

interface PropertyFieldMap {
  version: string;
  lastUpdated: string;
  description: string;
  databaseTables: Record<string, string>;
  tabs: Record<string, JsonTab>;
  summary: Record<string, unknown>;
}

// Helper to flatten the nested JSON structure
function flattenFieldMap(fieldMap: PropertyFieldMap): Omit<FieldRegistryEntry, "id" | "created_at" | "updated_at">[] {
  const entries: Omit<FieldRegistryEntry, "id" | "created_at" | "updated_at">[] = [];

  for (const [tabKey, tab] of Object.entries(fieldMap.tabs || {})) {
    for (const [sectionKey, section] of Object.entries(tab.sections || {})) {
      for (const field of section.fields) {
        // Generate a unique field_key from stateVariable
        const fieldKey = field.stateVariable
          .replace("formData.", "")
          .replace("roomFormData.", "room_")
          .replace(/\./g, "_");

        entries.push({
          field_key: fieldKey,
          ui_label: field.uiLabel,
          db_table: field.dbTable,
          db_column: field.dbColumn,
          data_type: field.dataType,
          is_required: field.required,
          pms_populated: field.pmsPopulated,
          pms_lockable: field.pmsLockable,
          section: section.sectionLabel,
          tab: tab.tabLabel,
          notes: field.notes || null,
        });
      }
    }
  }

  return entries;
}

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
      const fieldMap = fieldMapModule.default as unknown as PropertyFieldMap;
      
      return flattenFieldMap(fieldMap);
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
      const fieldMap = fieldMapModule.default as unknown as PropertyFieldMap;
      
      // Get existing entries
      const { data: existing } = await supabase
        .from("field_registry")
        .select("field_key");

      const existingKeys = new Set(existing?.map((e) => e.field_key) || []);

      // Flatten and prepare entries
      const entries = flattenFieldMap(fieldMap);

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

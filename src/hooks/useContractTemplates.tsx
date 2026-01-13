import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

export interface ContractVariable {
  type: "string" | "percentage" | "date" | "number" | "currency";
  required: boolean;
  source?: string;
  default?: string;
  description?: string;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
}

export interface VariablesSchema {
  [key: string]: ContractVariable;
}

export interface ContractTemplate {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  current_version_id: string | null;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

export interface ContractTemplateVersion {
  id: string;
  template_id: string;
  version_number: number;
  content_markdown: string;
  variables_schema: VariablesSchema;
  status: "draft" | "active" | "deprecated" | "archived";
  created_at: string;
  created_by: string | null;
  activated_at: string | null;
  activated_by: string | null;
}

export interface ContractTemplateWithVersions extends ContractTemplate {
  versions: ContractTemplateVersion[];
  current_version?: ContractTemplateVersion;
}

export function useContractTemplates() {
  return useQuery({
    queryKey: ["contract-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_templates")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as ContractTemplate[];
    },
  });
}

export function useContractTemplate(templateId: string | undefined) {
  return useQuery({
    queryKey: ["contract-template", templateId],
    queryFn: async () => {
      if (!templateId) return null;

      const { data: template, error: templateError } = await supabase
        .from("contract_templates")
        .select("*")
        .eq("id", templateId)
        .single();

      if (templateError) throw templateError;

      const { data: versions, error: versionsError } = await supabase
        .from("contract_template_versions")
        .select("*")
        .eq("template_id", templateId)
        .order("version_number", { ascending: false });

      if (versionsError) throw versionsError;

      const typedVersions = (versions || []).map(v => ({
        ...v,
        status: v.status as ContractTemplateVersion["status"],
        variables_schema: (v.variables_schema || {}) as VariablesSchema,
      }));

      const currentVersion = typedVersions.find(
        (v) => v.id === template.current_version_id
      );

      return {
        ...template,
        versions: typedVersions,
        current_version: currentVersion,
      } as ContractTemplateWithVersions;
    },
    enabled: !!templateId,
  });
}

export function useContractTemplateMutations() {
  const queryClient = useQueryClient();

  const createTemplate = useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
    }) => {
      const { data: template, error } = await supabase
        .from("contract_templates")
        .insert({
          name: data.name,
          description: data.description,
        })
        .select()
        .single();

      if (error) throw error;
      return template;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contract-templates"] });
      toast.success("Contract template created");
    },
    onError: (error) => {
      toast.error(`Failed to create template: ${error.message}`);
    },
  });

  const updateTemplate = useMutation({
    mutationFn: async (data: {
      id: string;
      name?: string;
      description?: string;
      is_active?: boolean;
      current_version_id?: string;
    }) => {
      const { id, ...updates } = data;
      const { error } = await supabase
        .from("contract_templates")
        .update(updates)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["contract-templates"] });
      queryClient.invalidateQueries({
        queryKey: ["contract-template", variables.id],
      });
      toast.success("Contract template updated");
    },
    onError: (error) => {
      toast.error(`Failed to update template: ${error.message}`);
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (templateId: string) => {
      const { error } = await supabase
        .from("contract_templates")
        .delete()
        .eq("id", templateId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contract-templates"] });
      toast.success("Contract template deleted");
    },
    onError: (error) => {
      toast.error(`Failed to delete template: ${error.message}`);
    },
  });

  const createVersion = useMutation({
    mutationFn: async (data: {
      template_id: string;
      content_markdown: string;
      variables_schema: VariablesSchema;
    }) => {
      // Get the next version number
      const { data: existingVersions } = await supabase
        .from("contract_template_versions")
        .select("version_number")
        .eq("template_id", data.template_id)
        .order("version_number", { ascending: false })
        .limit(1);

      const nextVersion = (existingVersions?.[0]?.version_number || 0) + 1;

      const { data: version, error } = await supabase
        .from("contract_template_versions")
        .insert({
          template_id: data.template_id,
          version_number: nextVersion,
          content_markdown: data.content_markdown,
          variables_schema: data.variables_schema as unknown as Json,
          status: "draft",
        })
        .select()
        .single();

      if (error) throw error;
      return version;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["contract-template", variables.template_id],
      });
      toast.success("New version created as draft");
    },
    onError: (error) => {
      toast.error(`Failed to create version: ${error.message}`);
    },
  });

  const updateVersion = useMutation({
    mutationFn: async (data: {
      id: string;
      template_id: string;
      content_markdown?: string;
      variables_schema?: VariablesSchema;
    }) => {
      const { id, template_id, variables_schema, ...rest } = data;
      const updates = {
        ...rest,
        ...(variables_schema && { variables_schema: variables_schema as unknown as Json }),
      };
      const { error } = await supabase
        .from("contract_template_versions")
        .update(updates)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["contract-template", variables.template_id],
      });
      toast.success("Version updated");
    },
    onError: (error) => {
      toast.error(`Failed to update version: ${error.message}`);
    },
  });

  const activateVersion = useMutation({
    mutationFn: async (data: {
      version_id: string;
      template_id: string;
    }) => {
      // First, deprecate any currently active versions
      await supabase
        .from("contract_template_versions")
        .update({ status: "deprecated" })
        .eq("template_id", data.template_id)
        .eq("status", "active");

      // Activate the new version
      const { error: versionError } = await supabase
        .from("contract_template_versions")
        .update({
          status: "active",
          activated_at: new Date().toISOString(),
        })
        .eq("id", data.version_id);

      if (versionError) throw versionError;

      // Update the template's current_version_id
      const { error: templateError } = await supabase
        .from("contract_templates")
        .update({
          current_version_id: data.version_id,
          is_active: true,
        })
        .eq("id", data.template_id);

      if (templateError) throw templateError;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["contract-templates"] });
      queryClient.invalidateQueries({
        queryKey: ["contract-template", variables.template_id],
      });
      toast.success("Version activated successfully");
    },
    onError: (error) => {
      toast.error(`Failed to activate version: ${error.message}`);
    },
  });

  return {
    createTemplate,
    updateTemplate,
    deleteTemplate,
    createVersion,
    updateVersion,
    activateVersion,
  };
}

// Extract variables from markdown content
export function extractVariablesFromContent(content: string): string[] {
  const variableRegex = /\{\{(\w+)\}\}/g;
  const variables: string[] = [];
  let match;

  while ((match = variableRegex.exec(content)) !== null) {
    if (!variables.includes(match[1])) {
      variables.push(match[1]);
    }
  }

  return variables;
}

// Validate that all variables in content are declared in schema
export function validateContractVariables(
  content: string,
  schema: VariablesSchema
): { valid: boolean; undeclared: string[]; missing: string[] } {
  const usedVariables = extractVariablesFromContent(content);
  const declaredVariables = Object.keys(schema);

  const undeclared = usedVariables.filter(
    (v) => !declaredVariables.includes(v)
  );

  const requiredVariables = Object.entries(schema)
    .filter(([_, config]) => config.required)
    .map(([key]) => key);

  const missing = requiredVariables.filter((v) => !usedVariables.includes(v));

  return {
    valid: undeclared.length === 0 && missing.length === 0,
    undeclared,
    missing,
  };
}

// Render contract with variables
export function renderContractWithVariables(
  content: string,
  variables: Record<string, string>
): string {
  return content.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    return variables[varName] ?? match;
  });
}

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Json } from "@/integrations/supabase/types";

export interface OnboardingWizard {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  created_by: string | null;
  updated_at: string;
}

export interface OnboardingStep {
  id: string;
  wizard_id: string;
  step_key: string;
  title: string;
  description: string | null;
  order_index: number;
  is_required: boolean;
  is_active: boolean;
  component_type: "form" | "confirmation" | "custom";
  custom_component_path: string | null;
  icon: string;
  estimated_minutes: number;
  weight: number;
  created_at: string;
  updated_at: string;
}

export interface OnboardingField {
  id: string;
  step_id: string;
  field_key: string;
  label_override: string | null;
  help_text: string | null;
  is_required: boolean;
  is_pms_lockable: boolean;
  score_weight: number;
  order_index: number;
  validation_rules: Record<string, unknown> | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OnboardingStepWithFields extends OnboardingStep {
  fields: OnboardingField[];
}

export interface OnboardingWizardWithSteps extends OnboardingWizard {
  steps: OnboardingStepWithFields[];
}

export function useOnboardingWizards() {
  return useQuery({
    queryKey: ["onboarding-wizards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("onboarding_wizards")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data as OnboardingWizard[];
    },
  });
}

export function useOnboardingWizard(wizardId: string | undefined) {
  return useQuery({
    queryKey: ["onboarding-wizard", wizardId],
    queryFn: async () => {
      if (!wizardId) return null;

      const { data: wizard, error: wizardError } = await supabase
        .from("onboarding_wizards")
        .select("*")
        .eq("id", wizardId)
        .single();

      if (wizardError) throw wizardError;

      const { data: steps, error: stepsError } = await supabase
        .from("onboarding_steps")
        .select("*")
        .eq("wizard_id", wizardId)
        .order("order_index", { ascending: true });

      if (stepsError) throw stepsError;

      // Fetch fields for all steps
      const stepIds = steps?.map((s) => s.id) || [];
      const { data: fields, error: fieldsError } = await supabase
        .from("onboarding_fields")
        .select("*")
        .in("step_id", stepIds)
        .order("order_index", { ascending: true });

      if (fieldsError) throw fieldsError;

      // Group fields by step_id
      const stepsWithFields: OnboardingStepWithFields[] = (steps || []).map(
        (step) => ({
          ...step,
          component_type: step.component_type as OnboardingStep["component_type"],
          fields: (fields || []).filter((f) => f.step_id === step.id).map(f => ({
            ...f,
            validation_rules: (f.validation_rules || null) as Record<string, unknown> | null,
          })),
        })
      );

      return {
        ...wizard,
        steps: stepsWithFields,
      } as OnboardingWizardWithSteps;
    },
    enabled: !!wizardId,
  });
}

export function useActiveWizard() {
  return useQuery({
    queryKey: ["active-onboarding-wizard"],
    queryFn: async () => {
      const { data: wizard, error: wizardError } = await supabase
        .from("onboarding_wizards")
        .select("*")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (wizardError) throw wizardError;
      if (!wizard) return null;

      const { data: steps, error: stepsError } = await supabase
        .from("onboarding_steps")
        .select("*")
        .eq("wizard_id", wizard.id)
        .eq("is_active", true)
        .order("order_index", { ascending: true });

      if (stepsError) throw stepsError;

      const stepIds = steps?.map((s) => s.id) || [];
      const { data: fields, error: fieldsError } = await supabase
        .from("onboarding_fields")
        .select("*")
        .in("step_id", stepIds)
        .eq("is_active", true)
        .order("order_index", { ascending: true });

      if (fieldsError) throw fieldsError;

      const stepsWithFields: OnboardingStepWithFields[] = (steps || []).map(
        (step) => ({
          ...step,
          component_type: step.component_type as OnboardingStep["component_type"],
          fields: (fields || []).filter((f) => f.step_id === step.id).map(f => ({
            ...f,
            validation_rules: (f.validation_rules || null) as Record<string, unknown> | null,
          })),
        })
      );

      return {
        ...wizard,
        steps: stepsWithFields,
      } as OnboardingWizardWithSteps;
    },
  });
}

export function useWizardMutations() {
  const queryClient = useQueryClient();

  const createWizard = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      const { data: wizard, error } = await supabase
        .from("onboarding_wizards")
        .insert({
          name: data.name,
          description: data.description,
        })
        .select()
        .single();

      if (error) throw error;
      return wizard;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-wizards"] });
      toast.success("Wizard created");
    },
    onError: (error) => {
      toast.error(`Failed to create wizard: ${error.message}`);
    },
  });

  const updateWizard = useMutation({
    mutationFn: async (data: {
      id: string;
      name?: string;
      description?: string;
      is_active?: boolean;
    }) => {
      const { id, ...updates } = data;
      const { error } = await supabase
        .from("onboarding_wizards")
        .update(updates)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-wizards"] });
      queryClient.invalidateQueries({
        queryKey: ["onboarding-wizard", variables.id],
      });
      toast.success("Wizard updated");
    },
    onError: (error) => {
      toast.error(`Failed to update wizard: ${error.message}`);
    },
  });

  const deleteWizard = useMutation({
    mutationFn: async (wizardId: string) => {
      const { error } = await supabase
        .from("onboarding_wizards")
        .delete()
        .eq("id", wizardId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-wizards"] });
      toast.success("Wizard deleted");
    },
    onError: (error) => {
      toast.error(`Failed to delete wizard: ${error.message}`);
    },
  });

  const activateWizard = useMutation({
    mutationFn: async (wizardId: string) => {
      // Deactivate all other wizards
      await supabase
        .from("onboarding_wizards")
        .update({ is_active: false })
        .neq("id", wizardId);

      // Activate this wizard
      const { error } = await supabase
        .from("onboarding_wizards")
        .update({ is_active: true })
        .eq("id", wizardId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["onboarding-wizards"] });
      queryClient.invalidateQueries({ queryKey: ["active-onboarding-wizard"] });
      toast.success("Wizard activated");
    },
    onError: (error) => {
      toast.error(`Failed to activate wizard: ${error.message}`);
    },
  });

  return {
    createWizard,
    updateWizard,
    deleteWizard,
    activateWizard,
  };
}

export function useStepMutations() {
  const queryClient = useQueryClient();

  const createStep = useMutation({
    mutationFn: async (data: {
      wizard_id: string;
      step_key: string;
      title: string;
      description?: string;
      order_index: number;
      is_required?: boolean;
      component_type?: "form" | "confirmation" | "custom";
      custom_component_path?: string;
      icon?: string;
      estimated_minutes?: number;
      weight?: number;
    }) => {
      const { data: step, error } = await supabase
        .from("onboarding_steps")
        .insert(data)
        .select()
        .single();

      if (error) throw error;
      return step;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["onboarding-wizard", variables.wizard_id],
      });
      toast.success("Step created");
    },
    onError: (error) => {
      toast.error(`Failed to create step: ${error.message}`);
    },
  });

  const updateStep = useMutation({
    mutationFn: async (data: {
      id: string;
      wizard_id: string;
      title?: string;
      description?: string;
      order_index?: number;
      is_required?: boolean;
      is_active?: boolean;
      component_type?: "form" | "confirmation" | "custom";
      custom_component_path?: string;
      icon?: string;
      estimated_minutes?: number;
      weight?: number;
    }) => {
      const { id, wizard_id, ...updates } = data;
      const { error } = await supabase
        .from("onboarding_steps")
        .update(updates)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["onboarding-wizard", variables.wizard_id],
      });
      toast.success("Step updated");
    },
    onError: (error) => {
      toast.error(`Failed to update step: ${error.message}`);
    },
  });

  const deleteStep = useMutation({
    mutationFn: async (data: { id: string; wizard_id: string }) => {
      const { error } = await supabase
        .from("onboarding_steps")
        .delete()
        .eq("id", data.id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["onboarding-wizard", variables.wizard_id],
      });
      toast.success("Step deleted");
    },
    onError: (error) => {
      toast.error(`Failed to delete step: ${error.message}`);
    },
  });

  const reorderSteps = useMutation({
    mutationFn: async (data: {
      wizard_id: string;
      steps: { id: string; order_index: number }[];
    }) => {
      for (const step of data.steps) {
        const { error } = await supabase
          .from("onboarding_steps")
          .update({ order_index: step.order_index })
          .eq("id", step.id);

        if (error) throw error;
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["onboarding-wizard", variables.wizard_id],
      });
      toast.success("Steps reordered");
    },
    onError: (error) => {
      toast.error(`Failed to reorder steps: ${error.message}`);
    },
  });

  return {
    createStep,
    updateStep,
    deleteStep,
    reorderSteps,
  };
}

export function useFieldMutations() {
  const queryClient = useQueryClient();

  const createField = useMutation({
    mutationFn: async (data: {
      step_id: string;
      wizard_id: string;
      field_key: string;
      label_override?: string;
      help_text?: string;
      is_required?: boolean;
      is_pms_lockable?: boolean;
      score_weight?: number;
      order_index: number;
      validation_rules?: Record<string, unknown>;
    }) => {
      const { wizard_id, validation_rules, ...rest } = data;
      const fieldData = {
        ...rest,
        ...(validation_rules && { validation_rules: validation_rules as unknown as Json }),
      };
      const { data: field, error } = await supabase
        .from("onboarding_fields")
        .insert(fieldData)
        .select()
        .single();

      if (error) throw error;
      return field;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["onboarding-wizard", variables.wizard_id],
      });
      toast.success("Field added");
    },
    onError: (error) => {
      toast.error(`Failed to add field: ${error.message}`);
    },
  });

  const updateField = useMutation({
    mutationFn: async (data: {
      id: string;
      wizard_id: string;
      label_override?: string;
      help_text?: string;
      is_required?: boolean;
      is_pms_lockable?: boolean;
      score_weight?: number;
      order_index?: number;
      is_active?: boolean;
      validation_rules?: Record<string, unknown>;
    }) => {
      const { id, wizard_id, validation_rules, ...rest } = data;
      const updates = {
        ...rest,
        ...(validation_rules && { validation_rules: validation_rules as unknown as Json }),
      };
      const { error } = await supabase
        .from("onboarding_fields")
        .update(updates)
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["onboarding-wizard", variables.wizard_id],
      });
      toast.success("Field updated");
    },
    onError: (error) => {
      toast.error(`Failed to update field: ${error.message}`);
    },
  });

  const deleteField = useMutation({
    mutationFn: async (data: { id: string; wizard_id: string }) => {
      const { error } = await supabase
        .from("onboarding_fields")
        .delete()
        .eq("id", data.id);

      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["onboarding-wizard", variables.wizard_id],
      });
      toast.success("Field removed");
    },
    onError: (error) => {
      toast.error(`Failed to remove field: ${error.message}`);
    },
  });

  return {
    createField,
    updateField,
    deleteField,
  };
}

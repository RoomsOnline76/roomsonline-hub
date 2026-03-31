import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  PmsMessageTemplate, PmsMessageLogEntry, PmsQueueEntry, PmsProcessQueueResult,
} from "@/types/pmsTypes";

function invoke(action: string, payload: Record<string, unknown>) {
  return supabase.functions.invoke("pms-message-dispatcher", {
    body: { action, ...payload },
  });
}

// ── Templates ────────────────────────────────────────────────────────

export function useMessageTemplates(propertyId: string | null) {
  return useQuery({
    queryKey: ["pms-message-templates", propertyId],
    queryFn: async () => {
      if (!propertyId) return [];
      const { data, error } = await invoke("list_templates", { property_id: propertyId });
      if (error) throw error;
      return (data as PmsMessageTemplate[]) || [];
    },
    enabled: !!propertyId,
  });
}

export function useUpsertTemplate(propertyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (template: Record<string, unknown>) => {
      const { data, error } = await invoke("upsert_template", { property_id: propertyId, template });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pms-message-templates", propertyId] }),
  });
}

export function useDeleteTemplate(propertyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (templateId: string) => {
      const { data, error } = await invoke("delete_template", { property_id: propertyId, template_id: templateId });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pms-message-templates", propertyId] }),
  });
}

// ── Send / Queue ─────────────────────────────────────────────────────

export function useSendMessage(propertyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { recipient_email: string; subject: string; body: string; reservation_id?: string; template_id?: string }) => {
      const { data, error } = await invoke("send_message", { property_id: propertyId, ...payload });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pms-message-log", propertyId] }),
  });
}

export function useQueueMessage(propertyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const { data, error } = await invoke("queue_message", { property_id: propertyId, ...payload });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pms-message-queue", propertyId] }),
  });
}

// ── Message Log ──────────────────────────────────────────────────────

export function useMessageLog(propertyId: string | null) {
  return useQuery({
    queryKey: ["pms-message-log", propertyId],
    queryFn: async () => {
      if (!propertyId) return [];
      const { data, error } = await invoke("get_message_log", { property_id: propertyId });
      if (error) throw error;
      return (data as PmsMessageLogEntry[]) || [];
    },
    enabled: !!propertyId,
  });
}

// ── Queue ────────────────────────────────────────────────────────────

export function useMessageQueue(propertyId: string | null) {
  return useQuery({
    queryKey: ["pms-message-queue", propertyId],
    queryFn: async () => {
      if (!propertyId) return [];
      const { data, error } = await invoke("get_queue", { property_id: propertyId });
      if (error) throw error;
      return (data as PmsQueueEntry[]) || [];
    },
    enabled: !!propertyId,
  });
}

// ── Generate Email Content (AI) ──────────────────────────────────────

export function useGenerateEmailContent(propertyId: string | null) {
  return useMutation({
    mutationFn: async (payload: { trigger_event: string; tone: string; custom_prompt?: string }) => {
      const { data, error } = await supabase.functions.invoke("experience-engine", {
        body: {
          property_id: propertyId,
          experience_type: "guest_email",
          payload: { action: "generate", ...payload },
        },
      });
      if (error) throw error;
      const result = data?.data || data;
      return result as { subject: string; body_html: string; tone_used: string } | null;
    },
  });
}

// ── Process Queue (manual trigger) ──────────────────────────────────

export function useProcessQueue(propertyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await invoke("process_queue", { property_id: propertyId });
      if (error) throw error;
      return data as PmsProcessQueueResult;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pms-message-queue", propertyId] });
      qc.invalidateQueries({ queryKey: ["pms-message-log", propertyId] });
    },
  });
}

// Available placeholders for template editor
export const MESSAGE_PLACEHOLDERS = [
  { key: "guest_name", label: "Guest Full Name" },
  { key: "guest_first_name", label: "Guest First Name" },
  { key: "guest_email", label: "Guest Email" },
  { key: "property_name", label: "Property Name" },
  { key: "check_in", label: "Check-in Date" },
  { key: "check_out", label: "Check-out Date" },
  { key: "confirmation_number", label: "Confirmation Number" },
  { key: "total_amount", label: "Total Amount" },
  { key: "nights", label: "Number of Nights" },
];

export const TRIGGER_EVENTS = [
  { value: "booking_confirmed", label: "Booking Confirmed" },
  { value: "pre_arrival", label: "Pre-Arrival" },
  { value: "check_in", label: "Check-In" },
  { value: "check_out", label: "Check-Out" },
  { value: "payment_request", label: "Payment Request" },
  { value: "cancellation", label: "Cancellation" },
  { value: "manual", label: "Manual Send" },
];

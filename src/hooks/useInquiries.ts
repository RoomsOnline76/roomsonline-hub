import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/** Native inquiry pipeline. ROL'OS owns this record; HubSpot only mirrors it. */
export const INQUIRY_STAGES = [
  "new",
  "contacted",
  "quoted",
  "provisional",
  "confirmed",
  "lost",
] as const;

export type InquiryStage = (typeof INQUIRY_STAGES)[number];

export const STAGE_LABELS: Record<InquiryStage, string> = {
  new: "New",
  contacted: "Contacted",
  quoted: "Quoted",
  provisional: "Provisional",
  confirmed: "Confirmed",
  lost: "Lost",
};

export interface Inquiry {
  id: string;
  property_id: string | null;
  portfolio_id: string | null;
  guest_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  guest_country: string | null;
  company_name: string | null;
  check_in: string | null;
  check_out: string | null;
  adults: number;
  children: number;
  status: InquiryStage;
  source: string;
  notes: string | null;
  assigned_to: string | null;
  is_trade: boolean;
  lost_reason: string | null;
  linked_booking_id: string | null;
  estimated_value: number | null;
  currency: string;
  first_response_at: string | null;
  hubspot_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface InquiryEvent {
  id: string;
  inquiry_id: string;
  event_type: string;
  from_status: InquiryStage | null;
  to_status: InquiryStage | null;
  note: string | null;
  actor_label: string | null;
  created_at: string;
}

export interface NewInquiryInput {
  guest_name: string;
  guest_email?: string;
  guest_phone?: string;
  guest_country?: string;
  company_name?: string;
  check_in?: string;
  check_out?: string;
  adults?: number;
  children?: number;
  estimated_value?: number;
  notes?: string;
  is_trade?: boolean;
  source?: string;
}

/**
 * Inquiries for one property. Loads on mount and after every mutation so the
 * board always reflects what the database actually holds.
 */
export function useInquiries(propertyId: string | null) {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!propertyId) {
      setInquiries([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("rolos_inquiries")
      .select("*")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error("[useInquiries] load failed:", error.message);
      toast.error("Could not load inquiries");
      setInquiries([]);
    } else {
      setInquiries((data || []) as Inquiry[]);
    }
    setLoading(false);
  }, [propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = useCallback(
    async (input: NewInquiryInput): Promise<Inquiry | null> => {
      if (!propertyId) return null;
      const { data: auth } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("rolos_inquiries")
        .insert({
          property_id: propertyId,
          guest_name: input.guest_name,
          guest_email: input.guest_email?.trim() || null,
          guest_phone: input.guest_phone?.trim() || null,
          guest_country: input.guest_country?.trim() || null,
          company_name: input.company_name?.trim() || null,
          check_in: input.check_in || null,
          check_out: input.check_out || null,
          adults: input.adults ?? 2,
          children: input.children ?? 0,
          estimated_value: input.estimated_value ?? null,
          notes: input.notes?.trim() || null,
          is_trade: input.is_trade ?? Boolean(input.company_name?.trim()),
          source: input.source || "manual",
          created_by: auth?.user?.id ?? null,
        })
        .select("*")
        .single();

      if (error) {
        console.error("[useInquiries] create failed:", error.message);
        toast.error(`Could not save the inquiry: ${error.message}`);
        return null;
      }

      await supabase.from("rolos_inquiry_events").insert({
        inquiry_id: data.id,
        event_type: "created",
        to_status: "new",
        note: `Captured by staff (${input.source || "manual"})`,
      });

      await load();
      return data as Inquiry;
    },
    [propertyId, load],
  );

  const update = useCallback(
    async (id: string, patch: Partial<Inquiry>): Promise<boolean> => {
      const { error } = await supabase.from("rolos_inquiries").update(patch).eq("id", id);
      if (error) {
        console.error("[useInquiries] update failed:", error.message);
        toast.error(`Could not update the inquiry: ${error.message}`);
        return false;
      }
      await load();
      return true;
    },
    [load],
  );

  const addNote = useCallback(async (id: string, note: string): Promise<boolean> => {
    const { error } = await supabase.from("rolos_inquiry_events").insert({
      inquiry_id: id,
      event_type: "note",
      note,
    });
    if (error) {
      toast.error(`Could not add the note: ${error.message}`);
      return false;
    }
    return true;
  }, []);

  const byStage = useMemo(() => {
    const map = new Map<InquiryStage, Inquiry[]>();
    for (const stage of INQUIRY_STAGES) map.set(stage, []);
    for (const inq of inquiries) map.get(inq.status)?.push(inq);
    return map;
  }, [inquiries]);

  const openCount = useMemo(
    () => inquiries.filter((i) => !["confirmed", "lost"].includes(i.status)).length,
    [inquiries],
  );

  return { inquiries, byStage, openCount, loading, reload: load, create, update, addNote };
}

/** Event trail for one inquiry — loaded on demand when the sheet opens. */
export function useInquiryEvents(inquiryId: string | null) {
  const [events, setEvents] = useState<InquiryEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!inquiryId) {
      setEvents([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("rolos_inquiry_events")
      .select("*")
      .eq("inquiry_id", inquiryId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) console.error("[useInquiryEvents] load failed:", error.message);
    setEvents((data || []) as InquiryEvent[]);
    setLoading(false);
  }, [inquiryId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { events, loading, reload: load };
}

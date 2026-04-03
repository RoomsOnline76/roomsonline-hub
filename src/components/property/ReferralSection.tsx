import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, UserPlus, Save } from "lucide-react";
import { useSalesReps } from "@/hooks/useSalesReps";
import { usePropertyReferrals, useCreateReferral, useUpdateReferral } from "@/hooks/useRepCommissions";

const LEAD_SOURCES = [
  { value: "cold_call", label: "Cold Call" },
  { value: "referral", label: "Referral" },
  { value: "event", label: "Event / Conference" },
  { value: "inbound", label: "Inbound Inquiry" },
  { value: "partner", label: "Partner" },
  { value: "social_media", label: "Social Media" },
  { value: "existing_client", label: "Existing Client" },
  { value: "other", label: "Other" },
];

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  qualified: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  converted: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  churned: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

interface ReferralSectionProps {
  propertyId: string;
}

export function ReferralSection({ propertyId }: ReferralSectionProps) {
  const { reps, isLoading: repsLoading } = useSalesReps();
  const { data: referrals, isLoading: refLoading } = usePropertyReferrals(propertyId);
  const createReferral = useCreateReferral();
  const updateReferral = useUpdateReferral();

  const existing = referrals?.[0];

  const [repId, setRepId] = useState("");
  const [leadSource, setLeadSource] = useState("other");
  const [leadNotes, setLeadNotes] = useState("");
  const [referralDate, setReferralDate] = useState(new Date().toISOString().split("T")[0]);
  const [status, setStatus] = useState("pending");

  useEffect(() => {
    if (existing) {
      setRepId(existing.rep_id);
      setLeadSource(existing.lead_source);
      setLeadNotes(existing.lead_notes || "");
      setReferralDate(existing.referral_date);
      setStatus(existing.status);
    }
  }, [existing]);

  const isLoading = repsLoading || refLoading;
  const saving = createReferral.isPending || updateReferral.isPending;

  const handleSave = () => {
    if (!repId) return;
    if (existing) {
      updateReferral.mutate({
        id: existing.id,
        rep_id: repId,
        lead_source: leadSource,
        lead_notes: leadNotes || null,
        referral_date: referralDate,
        status: status as any,
        converted_at: status === "converted" && existing.status !== "converted" ? new Date().toISOString() : existing.converted_at,
      });
    } else {
      createReferral.mutate({
        property_id: propertyId,
        rep_id: repId,
        lead_source: leadSource,
        lead_notes: leadNotes || undefined,
        referral_date: referralDate,
        status,
      });
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center justify-center">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-primary" />
          Property Referral
        </CardTitle>
        <CardDescription className="text-xs">
          Assign the sales rep who brought this property. Commission is calculated on platform revenue.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Sales Rep</Label>
            <Select value={repId} onValueChange={setRepId}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select rep..." /></SelectTrigger>
              <SelectContent>
                {reps.filter((r) => r.is_active).map((r) => (
                  <SelectItem key={r.id} value={r.id}>{r.display_name} ({r.rep_code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Lead Source</Label>
            <Select value={leadSource} onValueChange={setLeadSource}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEAD_SOURCES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Referral Date</Label>
            <Input type="date" value={referralDate} onChange={(e) => setReferralDate(e.target.value)} className="h-8 text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="qualified">Qualified</SelectItem>
                <SelectItem value="converted">Converted</SelectItem>
                <SelectItem value="churned">Churned</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        {existing && (
          <div className="flex items-center gap-2 text-xs">
            <Badge className={STATUS_COLORS[existing.status] || ""}>{existing.status}</Badge>
            {existing.clawback_until && (
              <span className="text-muted-foreground">Clawback until: {existing.clawback_until}</span>
            )}
          </div>
        )}
        <div className="space-y-1">
          <Label className="text-xs">Lead Notes</Label>
          <Textarea value={leadNotes} onChange={(e) => setLeadNotes(e.target.value)} rows={2} className="text-xs" placeholder="How was this property acquired..." />
        </div>
        <Button onClick={handleSave} disabled={saving || !repId} size="sm" className="w-full">
          {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
          {existing ? "Update" : "Assign"} Referral
        </Button>
      </CardContent>
    </Card>
  );
}

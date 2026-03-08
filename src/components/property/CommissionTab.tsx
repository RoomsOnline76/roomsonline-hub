import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DollarSign, Plus, Calendar, Check, Clock, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

interface CommissionTabProps {
  propertyId: string;
  isAdmin: boolean;
}

interface CommercialTerm {
  id: string;
  property_id: string;
  revenue_share_percent: number;
  effective_from: string;
  effective_to: string | null;
  contract_status: string | null;
  notes: string | null;
  created_at: string | null;
  created_by: string | null;
}

export function CommissionTab({ propertyId, isAdmin }: CommissionTabProps) {
  const { toast } = useToast();
  const [terms, setTerms] = useState<CommercialTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [newRate, setNewRate] = useState<number>(10);
  const [effectiveFrom, setEffectiveFrom] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");
  const [showForm, setShowForm] = useState(false);

  const fetchTerms = async () => {
    const { data, error } = await supabase
      .from("property_commercial_terms")
      .select("*")
      .eq("property_id", propertyId)
      .order("effective_from", { ascending: false });

    if (!error && data) {
      setTerms(data as CommercialTerm[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTerms();
  }, [propertyId]);

  // Find the currently active term
  const now = new Date().toISOString().split("T")[0];
  const activeTerm = terms.find(
    (t) => t.effective_from <= now && (!t.effective_to || t.effective_to >= now)
  );
  const currentRate = activeTerm?.revenue_share_percent ?? 10;

  const handleSave = async () => {
    if (!isAdmin) return;
    setSaving(true);

    try {
      const { data: userData } = await supabase.auth.getUser();

      const { error } = await supabase.from("property_commercial_terms").insert({
        property_id: propertyId,
        revenue_share_percent: newRate,
        effective_from: effectiveFrom,
        contract_status: "active",
        notes: notes || null,
        created_by: userData.user?.id || null,
      });

      if (error) throw error;

      toast({ title: "Commission rate saved", description: `${newRate}% effective from ${effectiveFrom}` });
      setShowForm(false);
      setNotes("");
      fetchTerms();
    } catch (err: any) {
      toast({ title: "Error saving", description: err.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (term: CommercialTerm) => {
    const isActive =
      term.effective_from <= now && (!term.effective_to || term.effective_to >= now);
    const isFuture = term.effective_from > now;
    const isPast = term.effective_to && term.effective_to < now;

    if (isActive)
      return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Active</Badge>;
    if (isFuture)
      return <Badge variant="outline" className="text-blue-600 border-blue-500/20"><Clock className="w-3 h-3 mr-1" />Scheduled</Badge>;
    if (isPast)
      return <Badge variant="secondary">Expired</Badge>;
    return <Badge variant="outline">{term.contract_status || "draft"}</Badge>;
  };

  if (loading) {
    return <div className="p-6 text-center text-muted-foreground text-sm">Loading commission data...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      {/* Current Rate Hero */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <DollarSign className="w-5 h-5" />
            Commission Rate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-3">
            <span className="text-5xl font-bold tabular-nums">{currentRate}%</span>
            <div className="space-y-1">
              <Badge variant={activeTerm ? "default" : "secondary"}>
                {activeTerm ? "From contract terms" : "Default rate"}
              </Badge>
              {activeTerm && (
                <p className="text-xs text-muted-foreground">
                  Effective since {format(new Date(activeTerm.effective_from), "dd MMM yyyy")}
                </p>
              )}
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-3">
            This rate is used in owner contracts and commission calculations on bookings.
          </p>
        </CardContent>
      </Card>

      {/* Add New Term */}
      {isAdmin && (
        <>
          {!showForm ? (
            <Button variant="outline" onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Set New Commission Rate
            </Button>
          ) : (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">New Commission Rate</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Revenue Share (%)</Label>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={newRate}
                      onChange={(e) => setNewRate(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <Label>Effective From</Label>
                    <Input
                      type="date"
                      value={effectiveFrom}
                      onChange={(e) => setEffectiveFrom(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label>Notes (optional)</Label>
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Reason for rate change..."
                    rows={2}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleSave} disabled={saving}>
                    <Check className="w-4 h-4 mr-2" />
                    {saving ? "Saving..." : "Save"}
                  </Button>
                  <Button variant="ghost" onClick={() => setShowForm(false)}>
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* History Table */}
      <div>
        <h3 className="font-semibold text-sm mb-3">Commission History</h3>
        {terms.length === 0 ? (
          <div className="border rounded-lg p-6 text-center text-muted-foreground text-sm">
            <AlertTriangle className="w-5 h-5 mx-auto mb-2 opacity-50" />
            No commercial terms configured. The default rate of 10% will be used.
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rate</TableHead>
                  <TableHead>Effective From</TableHead>
                  <TableHead>Effective To</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {terms.map((term) => (
                  <TableRow key={term.id}>
                    <TableCell className="font-semibold tabular-nums">{term.revenue_share_percent}%</TableCell>
                    <TableCell>{format(new Date(term.effective_from), "dd MMM yyyy")}</TableCell>
                    <TableCell>
                      {term.effective_to
                        ? format(new Date(term.effective_to), "dd MMM yyyy")
                        : <span className="text-muted-foreground">Ongoing</span>}
                    </TableCell>
                    <TableCell>{getStatusBadge(term)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {term.notes || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

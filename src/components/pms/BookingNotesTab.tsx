import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MessageSquare, AlertCircle } from "lucide-react";

interface BookingNotesTabProps {
  bookingId: string;
  guestId: string | null;
  specialRequests: string | null;
  modificationNotes: unknown;
}

interface Complaint {
  id: string;
  timestamp: string;
  booking_id: string;
  description: string;
  resolution_status: string;
  resolved_at?: string;
}

interface ModificationNote {
  action?: string;
  timestamp?: string;
  changes?: Record<string, unknown>;
}

export function BookingNotesTab({ bookingId, guestId, specialRequests, modificationNotes }: BookingNotesTabProps) {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [currentSpecialRequests, setCurrentSpecialRequests] = useState(specialRequests || "");
  const [currentModificationNotes, setCurrentModificationNotes] = useState<ModificationNote[]>(
    Array.isArray(modificationNotes) ? modificationNotes as ModificationNote[] : []
  );
  const [loading, setLoading] = useState(false);
  const [showCommentForm, setShowCommentForm] = useState(false);
  const [showComplaintForm, setShowComplaintForm] = useState(false);
  const [comment, setComment] = useState("");
  const [complaintText, setComplaintText] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadBookingNotes = async () => {
      const { data } = await supabase
        .from("bookings")
        .select("special_requests, modification_notes")
        .eq("id", bookingId)
        .maybeSingle();

      setCurrentSpecialRequests(data?.special_requests || specialRequests || "");
      setCurrentModificationNotes(Array.isArray(data?.modification_notes) ? data.modification_notes as unknown as ModificationNote[] : Array.isArray(modificationNotes) ? modificationNotes as ModificationNote[] : []);
    };

    loadBookingNotes();
  }, [bookingId, specialRequests, modificationNotes]);

  useEffect(() => {
    if (!guestId) {
      setComplaints([]);
      return;
    }
    const load = async () => {
      setLoading(true);
      const { data } = await supabase.from("rolos_guest_profiles").select("complaints").eq("id", guestId).single();
      if (data?.complaints && Array.isArray(data.complaints)) {
        setComplaints(data.complaints as unknown as Complaint[]);
      }
      setLoading(false);
    };
    load();
  }, [guestId]);

  const handleAddComment = async () => {
    if (!comment.trim()) return;
    setSaving(true);
    const { data: booking } = await supabase.from("bookings").select("special_requests").eq("id", bookingId).single();
    const existing = booking?.special_requests || "";
    const updated = existing ? `${existing}\n---\n[${new Date().toLocaleString()}] ${comment}` : `[${new Date().toLocaleString()}] ${comment}`;
    const { error } = await supabase.from("bookings").update({ special_requests: updated }).eq("id", bookingId);
    setSaving(false);
    if (error) { toast.error("Failed to save comment"); return; }
    setCurrentSpecialRequests(updated);
    toast.success("Comment added");
    setComment("");
    setShowCommentForm(false);
  };

  const handleAddComplaint = async () => {
    if (!complaintText.trim() || !guestId) return;
    setSaving(true);
    const newComplaint: Complaint = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      booking_id: bookingId,
      description: complaintText,
      resolution_status: "open",
    };
    const updatedComplaints = [...complaints, newComplaint];
    const { error } = await supabase.from("rolos_guest_profiles")
      .update({ complaints: updatedComplaints as any }).eq("id", guestId);
    setSaving(false);
    if (error) { toast.error("Failed to save complaint"); return; }
    setComplaints(updatedComplaints);
    toast.success("Complaint recorded on guest profile");
    setComplaintText("");
    setShowComplaintForm(false);
  };

  const handleResolveComplaint = async (complaintId: string) => {
    if (!guestId) return;
    const updated = complaints.map(c => c.id === complaintId ? { ...c, resolution_status: "resolved", resolved_at: new Date().toISOString() } : c);
    const { error } = await supabase.from("rolos_guest_profiles")
      .update({ complaints: updated as any }).eq("id", guestId);
    if (error) { toast.error("Failed to update"); return; }
    setComplaints(updated);
    toast.success("Complaint resolved");
  };

  return (
    <div className="space-y-4">
      {/* Action Buttons */}
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => setShowCommentForm(!showCommentForm)} className="flex-1">
          <MessageSquare className="h-3 w-3 mr-1" />Add Comment
        </Button>
        <Button size="sm" variant="outline" onClick={() => setShowComplaintForm(!showComplaintForm)} className="flex-1" disabled={!guestId}>
          <AlertCircle className="h-3 w-3 mr-1" />Log Complaint
        </Button>
      </div>

      {showCommentForm && (
        <div className="border border-border rounded-md p-3 space-y-2">
          <Textarea placeholder="Add a comment about this booking..." value={comment} onChange={e => setComment(e.target.value)} rows={3} />
          <Button size="sm" onClick={handleAddComment} disabled={saving}>{saving ? "Saving..." : "Save Comment"}</Button>
        </div>
      )}

      {showComplaintForm && guestId && (
        <div className="border border-border rounded-md p-3 space-y-2">
          <Textarea placeholder="Describe the complaint..." value={complaintText} onChange={e => setComplaintText(e.target.value)} rows={3} />
          <Button size="sm" variant="destructive" onClick={handleAddComplaint} disabled={saving}>{saving ? "Saving..." : "Log Complaint"}</Button>
        </div>
      )}

      {!guestId && (
        <p className="text-xs text-amber-600 bg-amber-500/10 p-2 rounded">No guest profile linked — complaints will be available after guest profile is created.</p>
      )}

      {/* Special Requests */}
      {currentSpecialRequests && (
        <div className="space-y-1">
          <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Special Requests / Comments</h5>
          <p className="text-sm bg-muted/50 p-3 rounded-md whitespace-pre-wrap">{currentSpecialRequests}</p>
        </div>
      )}

      {/* Modification History */}
      {currentModificationNotes.length > 0 && (
        <div className="space-y-1">
          <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Modification History</h5>
          <div className="space-y-1.5">
            {currentModificationNotes.slice(-5).reverse().map((note, i) => (
              <div key={i} className="text-xs bg-muted/30 p-2 rounded">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className="text-[10px] capitalize">{note.action || "update"}</Badge>
                  <span className="text-muted-foreground">{note.timestamp ? new Date(note.timestamp).toLocaleString() : ""}</span>
                </div>
                {note.changes && Object.entries(note.changes).map(([k, v]) => (
                  <p key={k} className="text-muted-foreground mt-0.5">{k.replace(/_/g, " ")}: {String(v)}</p>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <Separator />

      {/* Complaints on Guest Profile */}
      <div className="space-y-1">
        <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <AlertCircle className="h-3 w-3" />Guest Complaints ({complaints.filter(c => c.resolution_status === "open").length} open)
        </h5>
        {loading ? <p className="text-xs text-muted-foreground">Loading...</p> : complaints.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">No complaints recorded.</p>
        ) : (
          <div className="space-y-1.5">
            {complaints.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map(c => (
              <div key={c.id} className={`text-xs p-2 rounded border ${c.resolution_status === "open" ? "border-red-500/30 bg-red-500/5" : "border-border bg-muted/30"}`}>
                <div className="flex items-center justify-between mb-1">
                  <Badge variant={c.resolution_status === "open" ? "destructive" : "secondary"} className="text-[10px]">{c.resolution_status}</Badge>
                  <span className="text-muted-foreground">{new Date(c.timestamp).toLocaleDateString()}</span>
                </div>
                <p>{c.description}</p>
                {c.resolution_status === "open" && (
                  <Button size="sm" variant="ghost" className="text-[10px] h-6 mt-1" onClick={() => handleResolveComplaint(c.id)}>Mark Resolved</Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

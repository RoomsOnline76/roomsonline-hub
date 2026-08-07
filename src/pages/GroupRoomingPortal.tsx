import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, UsersRound } from "lucide-react";
import { usePageSEO } from "@/hooks/usePageSEO";

interface PortalBlock {
  id: string;
  blocked_count: number;
  picked_up_count: number;
  start_date: string;
  end_date: string;
  status: string;
  room_type?: { name: string } | null;
}

interface PortalRow {
  id: string | null;
  block_id: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  adults: number;
  children: number;
  room_preference: string;
  locked: boolean;
}

interface LoadResponse {
  group: { id: string; name: string; check_in_date: string | null; check_out_date: string | null; cutoff_date: string | null };
  property_name: string | null;
  blocks: PortalBlock[];
  rows: Array<{
    id: string;
    block_id: string | null;
    guest_name: string | null;
    guest_email: string | null;
    guest_phone: string | null;
    adults: number | null;
    children: number | null;
    room_preference: string | null;
    booking_id: string | null;
  }>;
}

export default function GroupRoomingPortal() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<LoadResponse | null>(null);
  const [rows, setRows] = useState<PortalRow[]>([]);

  usePageSEO({
    title: data?.group?.name ? `Rooming list — ${data.group.name}` : "Group rooming list",
    description: "Complete the guest names for the rooms held for your group booking.",
    noIndex: true,
  });

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    const { data: res, error: fnErr } = await supabase.functions.invoke("group-portal", {
      body: { action: "load", token },
    });
    if (fnErr || (res as { error?: unknown })?.error) {
      const detail = (res as { error?: unknown })?.error;
      setError(typeof detail === "string" ? detail : "This rooming-list link is not valid or has expired.");
      setLoading(false);
      return;
    }
    const payload = res as LoadResponse;
    setData(payload);
    setRows(
      payload.rows
        .filter((r) => r.block_id)
        .map((r) => ({
          id: r.id,
          block_id: r.block_id as string,
          guest_name: r.guest_name || "",
          guest_email: r.guest_email || "",
          guest_phone: r.guest_phone || "",
          adults: r.adults ?? 1,
          children: r.children ?? 0,
          room_preference: r.room_preference || "",
          locked: !!r.booking_id,
        })),
    );
    setLoading(false);
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const openBlocks = useMemo(
    () => (data?.blocks || []).filter((b) => b.status !== "released"),
    [data],
  );

  const usage = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) map.set(r.block_id, (map.get(r.block_id) || 0) + 1);
    return map;
  }, [rows]);

  const addRow = (blockId: string) => {
    setRows((prev) => [
      ...prev,
      { id: null, block_id: blockId, guest_name: "", guest_email: "", guest_phone: "", adults: 1, children: 0, room_preference: "", locked: false },
    ]);
  };

  const save = async () => {
    if (!token) return;
    const invalid = rows.find((r) => !r.guest_name.trim());
    if (invalid) {
      toast.error("Every room needs a guest name");
      return;
    }
    setSaving(true);
    const { data: res, error: fnErr } = await supabase.functions.invoke("group-portal", {
      body: {
        action: "save",
        token,
        rows: rows.map((r) => ({
          id: r.id,
          block_id: r.block_id,
          guest_name: r.guest_name.trim(),
          guest_email: r.guest_email.trim() || null,
          guest_phone: r.guest_phone.trim() || null,
          adults: r.adults,
          children: r.children,
          room_preference: r.room_preference.trim() || null,
        })),
      },
    });
    setSaving(false);
    const detail = (res as { error?: unknown } | null)?.error;
    if (fnErr || detail) {
      toast.error("Could not save the rooming list", {
        description: typeof detail === "string" ? detail : fnErr?.message,
      });
      return;
    }
    const rejected = (res as { rejected?: { guest_name: string; reason: string }[] }).rejected || [];
    toast.success("Rooming list saved", {
      description: rejected.length ? `${rejected.length} row(s) skipped — no rooms left in that block.` : undefined,
    });
    void load();
  };

  if (loading) {
    return (
      <main className="container max-w-3xl py-12 space-y-4">
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-40 w-full" />
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="container max-w-xl py-20 text-center space-y-3">
        <h1 className="text-2xl font-semibold">Rooming list unavailable</h1>
        <p className="text-muted-foreground">{error || "This link is no longer active. Please contact the property."}</p>
      </main>
    );
  }

  return (
    <main className="container max-w-3xl py-10 space-y-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <UsersRound className="h-4 w-4" />
          {data.property_name || "Group booking"}
        </div>
        <h1 className="text-3xl font-semibold">{data.group.name} — rooming list</h1>
        <p className="text-muted-foreground text-sm">
          Add the guest for each room held for your group.
          {data.group.cutoff_date ? ` Please complete this before ${data.group.cutoff_date}.` : ""}
        </p>
      </header>

      {openBlocks.length === 0 && (
        <Card><CardContent className="py-10 text-center text-muted-foreground">No rooms are currently held for this group.</CardContent></Card>
      )}

      {openBlocks.map((block) => {
        const used = usage.get(block.id) || 0;
        const full = used >= block.blocked_count;
        return (
          <Card key={block.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-lg">{block.room_type?.name || "Room"}</CardTitle>
                  <CardDescription>
                    {block.start_date} → {block.end_date}
                  </CardDescription>
                </div>
                <Badge variant={full ? "secondary" : "outline"}>{used} / {block.blocked_count} named</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {rows.map((row, index) =>
                row.block_id !== block.id ? null : (
                  <div key={`${block.id}-${index}`} className="rounded-lg border p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Room {index + 1}</span>
                      {row.locked ? (
                        <Badge variant="secondary">Confirmed</Badge>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label>Guest name</Label>
                        <Input
                          value={row.guest_name}
                          disabled={row.locked}
                          onChange={(e) => setRows((prev) => prev.map((r, i) => (i === index ? { ...r, guest_name: e.target.value } : r)))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Email</Label>
                        <Input
                          type="email"
                          value={row.guest_email}
                          disabled={row.locked}
                          onChange={(e) => setRows((prev) => prev.map((r, i) => (i === index ? { ...r, guest_email: e.target.value } : r)))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Phone</Label>
                        <Input
                          value={row.guest_phone}
                          disabled={row.locked}
                          onChange={(e) => setRows((prev) => prev.map((r, i) => (i === index ? { ...r, guest_phone: e.target.value } : r)))}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label>Adults</Label>
                        <Select
                          value={String(row.adults)}
                          disabled={row.locked}
                          onValueChange={(v) => setRows((prev) => prev.map((r, i) => (i === index ? { ...r, adults: parseInt(v, 10) } : r)))}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[1, 2, 3, 4, 5, 6].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Children</Label>
                        <Select
                          value={String(row.children)}
                          disabled={row.locked}
                          onValueChange={(v) => setRows((prev) => prev.map((r, i) => (i === index ? { ...r, children: parseInt(v, 10) } : r)))}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {[0, 1, 2, 3, 4].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5 sm:col-span-2">
                        <Label>Room preference</Label>
                        <Input
                          placeholder="e.g. twin beds, ground floor"
                          value={row.room_preference}
                          disabled={row.locked}
                          onChange={(e) => setRows((prev) => prev.map((r, i) => (i === index ? { ...r, room_preference: e.target.value } : r)))}
                        />
                      </div>
                    </div>
                  </div>
                ),
              )}
              <Button type="button" variant="outline" size="sm" disabled={full} onClick={() => addRow(block.id)}>
                <Plus className="h-4 w-4 mr-1" /> Add guest
              </Button>
            </CardContent>
          </Card>
        );
      })}

      {openBlocks.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save rooming list"}</Button>
        </div>
      )}
    </main>
  );
}

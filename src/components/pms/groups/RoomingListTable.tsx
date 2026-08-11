import { useRef, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Upload, Plus, UserCheck, Trash2, ExternalLink } from "lucide-react";
import { callGroupsApi } from "@/lib/groupsApi";
import type { GroupBlock } from "./GroupBlockGrid";
import type { RoomingLine } from "./GroupPickupDialog";

export interface RoomingRow extends RoomingLine {
  status: string;
  booking_id: string | null;
  room_type_id: string | null;
}

interface RoomingListTableProps {
  propertyId: string;
  groupId: string;
  rows: RoomingRow[];
  blocks: GroupBlock[];
  readOnly: boolean;
  onRefresh: () => void;
  onPickup: (row: RoomingRow) => void;
}

interface ParsedCsvRow {
  guest_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  arrival_date: string | null;
  departure_date: string | null;
  room_preference: string | null;
  special_requests: string | null;
  block_id: string | null;
  room_type_id: string | null;
}

const HEADER_ALIASES: Record<string, keyof ParsedCsvRow> = {
  name: "guest_name",
  guest: "guest_name",
  guest_name: "guest_name",
  email: "guest_email",
  guest_email: "guest_email",
  phone: "guest_phone",
  guest_phone: "guest_phone",
  arrival: "arrival_date",
  arrival_date: "arrival_date",
  check_in: "arrival_date",
  departure: "departure_date",
  departure_date: "departure_date",
  check_out: "departure_date",
  preference: "room_preference",
  room_preference: "room_preference",
  notes: "special_requests",
  requests: "special_requests",
  special_requests: "special_requests",
  room_type: "room_type_id",
};

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function parseCsv(text: string, blocks: GroupBlock[]): ParsedCsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, "_"));

  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: ParsedCsvRow = {
      guest_name: "",
      guest_email: null,
      guest_phone: null,
      arrival_date: null,
      departure_date: null,
      room_preference: null,
      special_requests: null,
      block_id: null,
      room_type_id: null,
    };
    headers.forEach((h, i) => {
      const key = HEADER_ALIASES[h];
      const value = (cells[i] || "").trim();
      if (!key || !value) return;
      if (key === "room_type_id") {
        const match = blocks.find((b) => (b.room_type?.name || "").toLowerCase() === value.toLowerCase());
        if (match) {
          row.room_type_id = match.room_type_id;
          row.block_id = match.id;
        }
      } else {
        row[key] = value as never;
      }
    });
    return row;
  }).filter((r) => r.guest_name);
}

export default function RoomingListTable({
  propertyId,
  groupId,
  rows,
  blocks,
  readOnly,
  onRefresh,
  onPickup,
}: RoomingListTableProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [newName, setNewName] = useState("");
  const [importing, setImporting] = useState(false);

  const addLine = async () => {
    const name = newName.trim();
    if (!name) return;
    const { error } = await supabase.from("rolos_group_reservations" as never).insert({
      group_id: groupId,
      guest_name: name,
      status: "pending",
    } as never);
    if (error) {
      toast.error("Failed to add guest", { description: error.message });
      return;
    }
    setNewName("");
    onRefresh();
  };

  const removeLine = async (row: RoomingRow) => {
    if (row.booking_id) {
      toast.error("This line has a booking — cancel the booking instead");
      return;
    }
    const { error } = await supabase.from("rolos_group_reservations" as never).delete().eq("id", row.id);
    if (error) {
      toast.error("Failed to remove line", { description: error.message });
      return;
    }
    onRefresh();
  };

  const handleFile = async (file: File) => {
    setImporting(true);
    try {
      const parsed = parseCsv(await file.text(), blocks);
      if (!parsed.length) {
        toast.error("No usable rows found — expected a header row with at least a Name column");
        return;
      }
      const result = await callGroupsApi<{ imported: number; rejected: { guest_name: string; reason: string }[] }>(
        "group_import_rooming_list",
        { property_id: propertyId, group_id: groupId, rows: parsed },
      );
      toast.success(`Imported ${result.imported} guest${result.imported === 1 ? "" : "s"}`, {
        description: result.rejected?.length ? `${result.rejected.length} skipped (no inventory left)` : undefined,
      });
      onRefresh();
    } catch (err) {
      toast.error("Import failed", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="space-y-3">
      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Guest name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 min-w-[160px]"
          />
          <Button size="sm" disabled={!newName.trim()} onClick={addLine}>
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
          <Button size="sm" variant="outline" disabled={importing} onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1" /> {importing ? "Importing…" : "Import CSV"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
      )}
      {!readOnly && (
        <p className="text-[11px] text-muted-foreground">
          CSV columns: Name, Email, Phone, Arrival, Departure, Room Type, Preference, Notes. Rows beyond the held inventory are
          skipped.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No rooming list entries yet</p>
      ) : (
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Guest</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Status</TableHead>
                {!readOnly && <TableHead className="w-24" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const block = blocks.find((b) => b.id === r.block_id) || null;
                const remaining = block ? block.blocked_count - block.picked_up_count : 0;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">
                      <div className="font-medium">{r.guest_name || "—"}</div>
                      {r.guest_email && <div className="text-xs text-muted-foreground">{r.guest_email}</div>}
                      {r.room_preference && <div className="text-xs text-muted-foreground">Pref: {r.room_preference}</div>}
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {r.arrival_date && r.departure_date
                        ? `${format(new Date(r.arrival_date), "MMM d")} – ${format(new Date(r.departure_date), "MMM d")}`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={r.status === "picked_up" ? "default" : "outline"} className="text-[10px] capitalize">
                        {r.status.replace("_", " ")}
                      </Badge>
                    </TableCell>
                    {!readOnly && (
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {r.booking_id ? (
                            <Button asChild variant="ghost" size="icon" className="h-7 w-7">
                              <a href={`/rolos/bookings?booking=${r.booking_id}`} title="Open booking">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </Button>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                title={block ? "Pick up room" : "Assign a room block first"}
                                disabled={!block || remaining <= 0}
                                onClick={() => onPickup(r)}
                              >
                                <UserCheck className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeLine(r)}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

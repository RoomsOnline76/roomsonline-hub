import { useEffect, useState, useCallback, useMemo } from "react";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  CheckCircle, Sparkles, Wrench, RefreshCw, Plus, AlertTriangle, ShieldCheck, ChevronLeft, ChevronRight, LayoutGrid, Building2, ChevronDown, ChevronUp, BedDouble,
} from "lucide-react";


import { callPmsApi } from "@/hooks/usePmsApi";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ── Types ──────────────────────────────────────────────────────────────────

interface Room {
  id: string;
  property_id: string;
  room_number: string;
  room_name: string | null;
  floor: number | null;
  status: string;
  room_type_id: string | null;
}

interface RoomType {
  id: string;
  name: string;
  property_id: string;
}

interface HKTask {
  id: string;
  room_id: string;
  task_type: string;
  priority: string;
  status: string;
  notes: string | null;
  assigned_to: string | null;
}

interface MaintenanceRequest {
  id: string;
  room_id: string | null;
  issue_type: string | null;
  priority: string | null;
  description: string;
  status: string | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  completion_notes: string | null;
  room_ready_confirmed: boolean;
  completed_date: string | null;
}

const ISSUE_TYPES = [
  "plumbing", "electrical", "hvac", "furniture", "appliance", "structural", "other",
];

const PRIORITIES = ["low", "normal", "high", "emergency"];
const STATUSES_OPEN = ["reported", "assigned", "in_progress"];

const PRIORITY_BADGE: Record<string, string> = {
  emergency: "bg-destructive text-destructive-foreground",
  high: "bg-destructive/80 text-destructive-foreground",
  normal: "bg-amber-500 text-white",
  low: "bg-muted text-muted-foreground",
};

const STATUS_BORDER: Record<string, string> = {
  available: "border-l-emerald-500",
  occupied: "border-l-blue-500",
  dirty: "border-l-amber-500",
  maintenance: "border-l-red-500",
  out_of_order: "border-l-destructive",
  in_house: "border-l-blue-500",
};


// ── Component ──────────────────────────────────────────────────────────────

export default function PMSHousekeeping() {
  const { propertyId, properties, switchProperty, loading: propertyLoading } = usePmsPropertyId();
  const currentIndex = properties.findIndex((p) => p.id === propertyId);
  const goToProperty = (offset: number) => {
    if (properties.length === 0) return;
    const next = (currentIndex + offset + properties.length) % properties.length;
    switchProperty(properties[next].id);
  };

  const [viewMode, setViewMode] = useState<"portfolio" | "single">("single");
  const [autoDefaulted, setAutoDefaulted] = useState(false);
  useEffect(() => {
    if (!autoDefaulted && properties.length > 1) {
      setViewMode("portfolio");
      setAutoDefaulted(true);
    }
  }, [properties.length, autoDefaulted]);

  const isPortfolio = viewMode === "portfolio" && properties.length > 1;
  const activePropertyIds = useMemo(
    () => (isPortfolio ? properties.map((p) => p.id) : propertyId ? [propertyId] : []),
    [isPortfolio, properties, propertyId]
  );

  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [hkTasks, setHkTasks] = useState<HKTask[]>([]);
  const [maintenanceReqs, setMaintenanceReqs] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [showCreateDocket, setShowCreateDocket] = useState(false);
  const [docketRoomId, setDocketRoomId] = useState("");
  const [docketIssueType, setDocketIssueType] = useState("");
  const [docketPriority, setDocketPriority] = useState("normal");
  const [docketDescription, setDocketDescription] = useState("");
  const [docketMarkUnavailable, setDocketMarkUnavailable] = useState(false);
  const [docketEstCost, setDocketEstCost] = useState("");
  const [saving, setSaving] = useState(false);

  // Resolve dialog
  const [resolveReq, setResolveReq] = useState<MaintenanceRequest | null>(null);
  const [resolveNotes, setResolveNotes] = useState("");
  // Per-property toggle to expand the otherwise-collapsed "Ready" column.
  const [readyExpanded, setReadyExpanded] = useState<Record<string, boolean>>({});


  // ── Fetch all data ────────────────────────────────────────────────────

  const [usingFallback, setUsingFallback] = useState(false);

  const fetchAll = useCallback(async () => {
    if (activePropertyIds.length === 0) return;
    setLoading(true);
    const roomsQ = (supabase.from("rolos_rooms") as any).select("id, property_id, room_number, room_name, floor, status, room_type_id").in("property_id", activePropertyIds);
    const typesQ = (supabase.from("rolos_room_types") as any).select("id, name, property_id").in("property_id", activePropertyIds);
    const tasksQ = (supabase.from("rolos_housekeeping_tasks") as any).select("id, room_id, task_type, priority, status, notes, assigned_to").in("property_id", activePropertyIds);
    const maintQ = (supabase.from("rolos_maintenance_requests") as any).select("id, room_id, issue_type, priority, description, status, estimated_cost, actual_cost, completion_notes, room_ready_confirmed, completed_date").in("property_id", activePropertyIds);
    const [roomsRes, typesRes, tasksRes, maintRes] = await Promise.all([roomsQ, typesQ, tasksQ, maintQ]);

    const fetchedRoomTypes = (typesRes.data || []) as RoomType[];
    setRoomTypes(fetchedRoomTypes);
    setHkTasks((tasksRes.data || []) as HKTask[]);
    setMaintenanceReqs((maintRes.data || []) as MaintenanceRequest[]);

    const fetchedRooms = (roomsRes.data || []) as Room[];
    if (fetchedRooms.length === 0 && fetchedRoomTypes.length > 0 && !isPortfolio) {
      // Fallback: derive synthetic rooms from room types (single-property only)
      const syntheticRooms: Room[] = fetchedRoomTypes.map((rt) => ({
        id: `fallback-${rt.id}`,
        property_id: rt.property_id,
        room_number: rt.name,
        room_name: rt.name,
        floor: null,
        status: "available",
        room_type_id: rt.id,
      }));
      setRooms(syntheticRooms);
      setUsingFallback(true);
    } else {
      setRooms(fetchedRooms);
      setUsingFallback(false);
    }
    setLoading(false);
  }, [activePropertyIds, isPortfolio]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Auto-refresh every 30s
  useEffect(() => {
    if (!propertyId) return;
    const interval = setInterval(fetchAll, 30_000);
    return () => clearInterval(interval);
  }, [propertyId, fetchAll]);

  // ── Helpers ───────────────────────────────────────────────────────────

  const roomLabel = (roomId: string) => {
    const r = rooms.find(rm => rm.id === roomId);
    return r ? r.room_number : "—";
  };

  const roomTypeName = (roomTypeId: string | null) => {
    if (!roomTypeId) return "";
    return roomTypes.find(rt => rt.id === roomTypeId)?.name || "";
  };

  // ── Actions ───────────────────────────────────────────────────────────

  const completeCleanTask = async (taskId: string) => {
    try {
      await callPmsApi("complete_housekeeping_task", { task_id: taskId });
      toast.success("Cleaning task completed — room available");
      fetchAll();
    } catch (e: any) { toast.error(e.message); }
  };

  const createMaintenanceDocket = async () => {
    if (!propertyId || !docketRoomId || !docketDescription.trim()) {
      toast.error("Room and description required");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("rolos_maintenance_requests").insert({
        property_id: propertyId,
        room_id: docketRoomId,
        issue_type: docketIssueType || null,
        priority: docketPriority,
        description: docketDescription.trim(),
        estimated_cost: docketEstCost ? parseFloat(docketEstCost) : null,
        status: "reported",
      });
      if (error) throw error;
      // Only set room to maintenance/out_of_order if user opted to mark unavailable
      if (docketMarkUnavailable) {
        await supabase.from("rolos_rooms").update({ status: "maintenance" }).eq("id", docketRoomId);
      }
      toast.success("Maintenance docket created");
      setShowCreateDocket(false);
      resetDocketForm();
      fetchAll();
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const resolveMaintenanceRequest = async () => {
    if (!resolveReq || !resolveNotes.trim()) {
      toast.error("Completion notes required");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("rolos_maintenance_requests").update({
        status: "resolved",
        completion_notes: resolveNotes.trim(),
        completed_date: new Date().toISOString(),
      }).eq("id", resolveReq.id);
      if (error) throw error;
      toast.success("Maintenance resolved — confirm room readiness below");
      setResolveReq(null);
      setResolveNotes("");
      fetchAll();
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const toggleRoomReady = async (req: MaintenanceRequest, checked: boolean) => {
    try {
      const { error } = await supabase.from("rolos_maintenance_requests").update({
        room_ready_confirmed: checked,
      }).eq("id", req.id);
      if (error) throw error;
      // Update room status based on checkbox
      if (req.room_id) {
        await supabase.from("rolos_rooms").update({
          status: checked ? "available" : "out_of_order",
        }).eq("id", req.room_id);
      }
      toast.success(checked ? "Room marked as ready" : "Room marked unavailable");
      fetchAll();
    } catch (e: any) { toast.error(e.message); }
  };

  const resetDocketForm = () => {
    setDocketRoomId("");
    setDocketIssueType("");
    setDocketPriority("normal");
    setDocketDescription("");
    setDocketEstCost("");
    setDocketMarkUnavailable(false);
  };

  // ── Derived data ──────────────────────────────────────────────────────

  const tasksForRoom = (roomId: string) => hkTasks.filter(t => t.room_id === roomId);
  const openMaintenanceForRoom = (roomId: string) =>
    maintenanceReqs.filter(m => m.room_id === roomId && (STATUSES_OPEN.includes(m.status || "") || (m.status === "resolved" && !m.room_ready_confirmed)));

  // ── Render ────────────────────────────────────────────────────────────

  if (propertyLoading) return <p className="text-muted-foreground">Loading property…</p>;
  if (!isPortfolio && !propertyId) return <p className="text-muted-foreground">Select a property first.</p>;

  const propertySections = isPortfolio
    ? properties.map((p) => ({ id: p.id, name: p.name, rooms: rooms.filter((r) => r.property_id === p.id) }))
    : [{ id: propertyId!, name: properties.find((p) => p.id === propertyId)?.name || "", rooms }];

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Housekeeping Board</h1>
          <div className="flex flex-wrap items-center gap-2">
            {properties.length > 1 && (
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => goToProperty(-1)} title="Previous property">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Select value={propertyId ?? undefined} onValueChange={(v) => switchProperty(v)}>
                  <SelectTrigger className="h-8 w-[220px]">
                    <SelectValue placeholder="Select property" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => goToProperty(1)} title="Next property">
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground ml-1">
                  {currentIndex >= 0 ? currentIndex + 1 : "—"} / {properties.length}
                </span>
              </div>
            )}
            {properties.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewMode(viewMode === "portfolio" ? "single" : "portfolio")}
                title={viewMode === "portfolio" ? "Switch to single property" : "Switch to portfolio view"}
              >
                {viewMode === "portfolio" ? <Building2 className="h-4 w-4 mr-1" /> : <LayoutGrid className="h-4 w-4 mr-1" />}
                {viewMode === "portfolio" ? "Portfolio" : "Single"}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />Refresh
            </Button>
            <Button size="sm" onClick={() => setShowCreateDocket(true)}>
              <Plus className="h-4 w-4 mr-1" />Maintenance Docket
            </Button>
          </div>
        </div>

        {/* Fallback banner */}
        {usingFallback && (
          <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
            <CardContent className="py-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
              <p className="text-xs text-amber-700 dark:text-amber-400">No physical rooms configured. Showing room types as fallback. Add rooms in the Room Inventory page for full housekeeping tracking.</p>
            </CardContent>
          </Card>
        )}

        {/* Per-property boards */}
        {propertySections.map((section) => {
          const dirtyRooms = section.rooms.filter(r => r.status === "dirty");
          const maintenanceRooms = section.rooms.filter(r => r.status === "maintenance" || r.status === "out_of_order");
          const cleanRooms = section.rooms.filter(r => r.status === "available");
          return (
        <div key={section.id} className="space-y-3">
          {isPortfolio && (
            <div className="flex items-center gap-2 sticky top-0 z-10 bg-background/95 backdrop-blur py-2 border-b">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold">{section.name}</h2>
              <Badge variant="outline" className="text-xs">{section.rooms.length} rooms</Badge>
            </div>
          )}
        <div className="grid md:grid-cols-3 gap-6">
          {/* ─── Needs Cleaning ─────────────────────── */}
          <div className="space-y-3">
            <h2 className="font-semibold text-amber-700 flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> Needs Cleaning ({dirtyRooms.length})
            </h2>
            {dirtyRooms.map(room => {
              const tasks = tasksForRoom(room.id);
              const openDockets = openMaintenanceForRoom(room.id);
              return (
                <Card key={room.id} className={`border-l-4 ${STATUS_BORDER[room.status]}`}>
                  <CardContent className="py-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold">{room.room_number}</p>
                        <p className="text-xs text-muted-foreground">{roomTypeName(room.room_type_id)}</p>
                      </div>
                      <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">dirty</Badge>
                    </div>
                    {/* Active cleaning tasks */}
                    {tasks.map(task => (
                      <div key={task.id} className="flex items-center justify-between gap-2 pt-1 border-t border-border">
                        <div className="text-xs">
                          <Badge variant="outline" className="text-xs mr-1">{task.task_type}</Badge>
                          <Badge className={`text-xs ${PRIORITY_BADGE[task.priority] || ""}`}>{task.priority}</Badge>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => completeCleanTask(task.id)}>
                          <CheckCircle className="h-3 w-3 mr-1" />Done
                        </Button>
                      </div>
                    ))}
                    {tasks.length === 0 && (
                      <div className="flex items-center justify-between pt-1 border-t border-border">
                        <p className="text-xs text-muted-foreground italic">No active task — room marked dirty</p>
                        <Button size="sm" variant="outline" onClick={async () => {
                          const { error } = await supabase.from("rolos_rooms").update({ status: "available" }).eq("id", room.id);
                          if (error) { toast.error(error.message); return; }
                          toast.success("Room marked clean");
                          fetchAll();
                        }}>
                          <CheckCircle className="h-3 w-3 mr-1" />Mark Clean
                        </Button>
                      </div>
                    )}
                    {/* Open maintenance dockets on dirty rooms */}
                    {openDockets.map(req => (
                      <div key={req.id} className="border-t border-border pt-2 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle className="h-3 w-3 text-destructive" />
                          <span className="text-xs font-medium capitalize">{req.issue_type || "General"}</span>
                          {req.priority && (
                            <Badge className={`text-xs ${PRIORITY_BADGE[req.priority] || ""}`}>{req.priority}</Badge>
                          )}
                          <Badge variant="outline" className="text-xs ml-auto">{req.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{req.description}</p>
                        {req.status === "resolved" && (
                          <div className="bg-muted/50 p-2 rounded space-y-1.5">
                            {req.completion_notes && (
                              <p className="text-xs"><span className="font-medium">Notes:</span> {req.completion_notes}</p>
                            )}
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id={`ready-dirty-${req.id}`}
                                checked={req.room_ready_confirmed}
                                onCheckedChange={(checked) => toggleRoomReady(req, !!checked)}
                              />
                              <Label htmlFor={`ready-dirty-${req.id}`} className="text-xs cursor-pointer flex items-center gap-1">
                                <ShieldCheck className="h-3 w-3" /> Room ready after repairs
                              </Label>
                            </div>
                          </div>
                        )}
                        {STATUSES_OPEN.includes(req.status || "") && (
                          <Button size="sm" variant="outline" className="w-full" onClick={() => { setResolveReq(req); setResolveNotes(""); }}>
                            <CheckCircle className="h-3 w-3 mr-1" />Mark Resolved
                          </Button>
                        )}
                      </div>
                    ))}
                    {/* Report issue button for dirty rooms */}
                    <Button size="sm" variant="ghost" className="w-full text-xs" onClick={() => { setDocketRoomId(room.id); setShowCreateDocket(true); }}>
                      <Plus className="h-3 w-3 mr-1" />Report Issue
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
            {dirtyRooms.length === 0 && <p className="text-sm text-muted-foreground">All clean!</p>}
          </div>

          {/* ─── Maintenance ────────────────────────── */}
          <div className="space-y-3">
            <h2 className="font-semibold text-red-700 flex items-center gap-2">
              <Wrench className="h-4 w-4" /> Maintenance ({maintenanceRooms.length})
            </h2>
            {maintenanceRooms.map(room => {
              const reqs = openMaintenanceForRoom(room.id);
              return (
                <Card key={room.id} className={`border-l-4 ${STATUS_BORDER[room.status]}`}>
                  <CardContent className="py-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold">{room.room_number}</p>
                        <p className="text-xs text-muted-foreground">{roomTypeName(room.room_type_id)}</p>
                      </div>
                      <Badge variant="destructive" className="text-xs">{room.status}</Badge>
                    </div>
                    {reqs.map(req => (
                      <div key={req.id} className="border-t border-border pt-2 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle className="h-3 w-3 text-destructive" />
                          <span className="text-xs font-medium capitalize">{req.issue_type || "General"}</span>
                          {req.priority && (
                            <Badge className={`text-xs ${PRIORITY_BADGE[req.priority] || ""}`}>{req.priority}</Badge>
                          )}
                          <Badge variant="outline" className="text-xs ml-auto">{req.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{req.description}</p>
                        {req.estimated_cost != null && (
                          <p className="text-xs text-muted-foreground">Est. cost: ${req.estimated_cost.toFixed(2)}</p>
                        )}

                        {/* Resolved: show completion notes + room ready checkbox */}
                        {req.status === "resolved" && (
                          <div className="bg-muted/50 p-2 rounded space-y-1.5">
                            {req.completion_notes && (
                              <p className="text-xs"><span className="font-medium">Notes:</span> {req.completion_notes}</p>
                            )}
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id={`ready-${req.id}`}
                                checked={req.room_ready_confirmed}
                                onCheckedChange={(checked) => toggleRoomReady(req, !!checked)}
                              />
                              <Label htmlFor={`ready-${req.id}`} className="text-xs cursor-pointer flex items-center gap-1">
                                <ShieldCheck className="h-3 w-3" /> Room ready after repairs
                              </Label>
                            </div>
                          </div>
                        )}

                        {/* Open: show resolve button */}
                        {STATUSES_OPEN.includes(req.status || "") && (
                          <Button size="sm" variant="outline" className="w-full" onClick={() => { setResolveReq(req); setResolveNotes(""); }}>
                            <CheckCircle className="h-3 w-3 mr-1" />Mark Resolved
                          </Button>
                        )}
                      </div>
                    ))}
                    {reqs.length === 0 && (
                      <p className="text-xs text-muted-foreground italic">No open dockets</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {maintenanceRooms.length === 0 && <p className="text-sm text-muted-foreground">No issues.</p>}
          </div>

          {/* ─── Ready ──────────────────────────────── */}
          {(() => {
            const expanded = !!readyExpanded[section.id];
            // Always show rooms with open dockets in full — they need attention.
            const readyWithDockets = cleanRooms.filter(r => openMaintenanceForRoom(r.id).length > 0);
            const readyClean = cleanRooms.filter(r => openMaintenanceForRoom(r.id).length === 0);
            return (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-emerald-700 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" /> Ready ({cleanRooms.length})
                  </h2>
                  {readyClean.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setReadyExpanded(prev => ({ ...prev, [section.id]: !expanded }))}
                    >
                      {expanded ? <><ChevronUp className="h-3 w-3 mr-1" />Collapse</> : <><ChevronDown className="h-3 w-3 mr-1" />Expand</>}
                    </Button>
                  )}
                </div>

                {/* Always-full cards for ready rooms that still have open dockets */}
                {readyWithDockets.map(room => {
                  const openDockets = openMaintenanceForRoom(room.id);
                  return (
                    <Card key={room.id} className={`border-l-4 ${STATUS_BORDER[room.status]}`}>
                      <CardContent className="py-3 space-y-1.5">
                        <p className="font-bold">{room.room_number}</p>
                        <p className="text-xs text-muted-foreground">{roomTypeName(room.room_type_id)}</p>
                        <div className="mt-1 space-y-2">
                          <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded p-1.5">
                            <AlertTriangle className="h-3 w-3 text-amber-600 shrink-0" />
                            <span className="text-xs text-amber-700 dark:text-amber-400">
                              {openDockets.length} open docket{openDockets.length > 1 ? "s" : ""}
                            </span>
                          </div>
                          {openDockets.map(req => (
                            <div key={req.id} className="border-t border-border pt-2 space-y-1.5">
                              <div className="flex items-center gap-1.5">
                                <AlertTriangle className="h-3 w-3 text-destructive" />
                                <span className="text-xs font-medium capitalize">{req.issue_type || "General"}</span>
                                {req.priority && (
                                  <Badge className={`text-xs ${PRIORITY_BADGE[req.priority] || ""}`}>{req.priority}</Badge>
                                )}
                                <Badge variant="outline" className="text-xs ml-auto">{req.status}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">{req.description}</p>
                              {req.status === "resolved" && (
                                <div className="bg-muted/50 p-2 rounded space-y-1.5">
                                  {req.completion_notes && (
                                    <p className="text-xs"><span className="font-medium">Notes:</span> {req.completion_notes}</p>
                                  )}
                                  <div className="flex items-center gap-2">
                                    <Checkbox
                                      id={`ready-clean-${req.id}`}
                                      checked={req.room_ready_confirmed}
                                      onCheckedChange={(checked) => toggleRoomReady(req, !!checked)}
                                    />
                                    <Label htmlFor={`ready-clean-${req.id}`} className="text-xs cursor-pointer flex items-center gap-1">
                                      <ShieldCheck className="h-3 w-3" /> Room ready after repairs
                                    </Label>
                                  </div>
                                </div>
                              )}
                              {STATUSES_OPEN.includes(req.status || "") && (
                                <Button size="sm" variant="outline" className="w-full" onClick={() => { setResolveReq(req); setResolveNotes(""); }}>
                                  <CheckCircle className="h-3 w-3 mr-1" />Mark Resolved
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}

                {/* Collapsed compact view for clean-and-clear ready rooms */}
                {readyClean.length > 0 && !expanded && (
                  <Card className="border-l-4 border-l-emerald-500">
                    <CardContent className="py-3">
                      <p className="text-xs text-muted-foreground mb-2">
                        {readyClean.length} room{readyClean.length === 1 ? "" : "s"} clean &amp; ready
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {readyClean.map(room => (
                          <Badge
                            key={room.id}
                            variant="outline"
                            className="text-xs font-medium border-emerald-300 text-emerald-700 dark:text-emerald-400"
                            title={roomTypeName(room.room_type_id)}
                          >
                            {room.room_number}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Expanded — original full card per ready room */}
                {readyClean.length > 0 && expanded && readyClean.map(room => (
                  <Card key={room.id} className={`border-l-4 ${STATUS_BORDER[room.status]}`}>
                    <CardContent className="py-3 space-y-1.5">
                      <p className="font-bold">{room.room_number}</p>
                      <p className="text-xs text-muted-foreground">{roomTypeName(room.room_type_id)}</p>
                    </CardContent>
                  </Card>
                ))}

                {cleanRooms.length === 0 && <p className="text-sm text-muted-foreground">No ready rooms.</p>}
              </div>
            );
          })()}
        </div>

        </div>
          );
        })}
      </div>

      {/* ─── Create Maintenance Docket Dialog ────────────────────────────── */}
      <Dialog open={showCreateDocket} onOpenChange={setShowCreateDocket}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Maintenance Docket</DialogTitle>
            <DialogDescription>Log a maintenance issue for a room. The room stays available unless you mark it unavailable.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Room *</Label>
              <Select value={docketRoomId} onValueChange={setDocketRoomId}>
                <SelectTrigger><SelectValue placeholder="Select room" /></SelectTrigger>
                <SelectContent>
                  {rooms.map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.room_number}{r.room_name ? ` — ${r.room_name}` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Issue Type</Label>
                <Select value={docketIssueType} onValueChange={setDocketIssueType}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {ISSUE_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={docketPriority} onValueChange={setDocketPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Description *</Label>
              <Textarea value={docketDescription} onChange={e => setDocketDescription(e.target.value)} placeholder="Describe the issue…" />
            </div>
            <div>
              <Label>Estimated Cost</Label>
              <Input type="number" step="0.01" value={docketEstCost} onChange={e => setDocketEstCost(e.target.value)} placeholder="0.00" />
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <Checkbox
                id="docket-mark-unavailable"
                checked={docketMarkUnavailable}
                onCheckedChange={(checked) => setDocketMarkUnavailable(!!checked)}
              />
              <Label htmlFor="docket-mark-unavailable" className="text-sm cursor-pointer">
                Mark room as unavailable (takes room offline)
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateDocket(false); resetDocketForm(); }}>Cancel</Button>
            <Button onClick={createMaintenanceDocket} disabled={saving}>{saving ? "Saving…" : "Create Docket"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Resolve Maintenance Dialog ──────────────────────────────────── */}
      <Dialog open={!!resolveReq} onOpenChange={(open) => { if (!open) setResolveReq(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Maintenance — Room {resolveReq?.room_id ? roomLabel(resolveReq.room_id) : ""}</DialogTitle>
            <DialogDescription>Provide completion notes. After resolving, use the "Room Ready" checkbox to confirm the room is usable.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {resolveReq && (
              <div className="text-sm">
                <p><span className="font-medium">Issue:</span> {resolveReq.issue_type || "General"} — {resolveReq.description}</p>
              </div>
            )}
            <div>
              <Label>Completion Notes *</Label>
              <Textarea value={resolveNotes} onChange={e => setResolveNotes(e.target.value)} placeholder="What was done to fix the issue…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveReq(null)}>Cancel</Button>
            <Button onClick={resolveMaintenanceRequest} disabled={saving || !resolveNotes.trim()}>
              {saving ? "Saving…" : "Mark Resolved"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Loader2, PlugZap, RefreshCw, Repeat, Search } from "lucide-react";
import { RuBookingReadbackCard } from "./RuBookingReadbackCard";

/**
 * Rentals United reservation ingestion diagnostics.
 *
 * Two certification checks live here:
 *  - Idempotency / RLNM replay: the same reservation is ingested twice through the shared
 *    ingest path used by both the live-notification handler and the 30-minute poll. Exactly
 *    one booking must exist afterwards (the synthetic test booking is removed again).
 *  - Creator mapping: every RU `Creator` account seen on imported bookings must resolve to
 *    a ROL'OS sales channel, otherwise a channel booking is misreported as a direct one.
 */

interface PropertyOption {
  id: string;
  name: string;
}

interface IngestPass {
  pass: number;
  outcome: string;
  deduped: boolean;
  booking_id: string | null;
  channel_label: string | null;
  note: string | null;
  error: string | null;
}

interface IdempotencyResult {
  passed: boolean;
  booking_count: number;
  ru_reservation_id: string;
  ru_property_id: string;
  dates: { from: string; to: string };
  passes: IngestPass[];
  cancel_replay: { first: string; second: string; idempotent: boolean } | null;
}

interface CreatorRow {
  creator: string;
  bookings: number;
  channel_key: string | null;
  channel_label: string | null;
  ru_channel_id: string | null;
  mapped: boolean;
}

interface MappingRow {
  creator_username: string;
  channel_key: string;
  channel_label: string;
  ru_channel_id: string | null;
  is_active: boolean;
}

interface ReservationDetailResult {
  passed: boolean;
  skipped?: boolean;
  reason?: string | null;
  error?: string | null;
  ru_reservation_id: string;
  mismatches: string[];
  reservation: {
    ru_reservation_id: string | null;
    ru_property_id: string | null;
    date_from: string | null;
    date_to: string | null;
    guest_name: string | null;
    total: number | null;
    creator: string | null;
  } | null;
  booking: {
    guest_name: string | null;
    check_in_date: string | null;
    check_out_date: string | null;
    total_amount: number | null;
  } | null;
}

export function RuReservationsPanel({ properties }: { properties: PropertyOption[] }) {
  const [propertyId, setPropertyId] = useState<string>("");
  const [mode, setMode] = useState<"reservation_idempotency_test" | "rlnm_replay_test">("reservation_idempotency_test");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<IdempotencyResult | null>(null);

  const [detailId, setDetailId] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<ReservationDetailResult | null>(null);



  const [loadingCreators, setLoadingCreators] = useState(false);
  const [creators, setCreators] = useState<CreatorRow[]>([]);
  const [mappings, setMappings] = useState<MappingRow[]>([]);

  useEffect(() => {
    if (!propertyId && properties.length > 0) setPropertyId(properties[0].id);
  }, [properties, propertyId]);

  const loadCreators = useCallback(async () => {
    setLoadingCreators(true);
    try {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: { action: "creator_mapping_check" },
      });
      if (error || !data?.success) throw new Error(error?.message || data?.error?.message || "Creator check failed");
      setCreators((data.observed_creators ?? []) as CreatorRow[]);
      setMappings((data.mappings ?? []) as MappingRow[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load channel creator mapping");
    } finally {
      setLoadingCreators(false);
    }
  }, []);

  useEffect(() => {
    loadCreators();
  }, [loadCreators]);

  const runIdempotency = useCallback(async () => {
    if (!propertyId) return;
    setRunning(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: { action: mode, property_id: propertyId },
      });
      if (error || !data?.success) throw new Error(error?.message || data?.error?.message || "Test failed");
      setResult(data as IdempotencyResult);
      if (data.passed) toast.success("Ingestion is idempotent — one booking for one reservation");
      else toast.error(`Idempotency check failed (${data.booking_count} booking rows)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      setRunning(false);
    }
  }, [mode, propertyId]);

  const runDetail = useCallback(async () => {
    const trimmed = detailId.trim();
    if (!trimmed && !propertyId) return;
    setDetailLoading(true);
    setDetail(null);
    try {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: {
          action: "reservation_detail_test",
          ...(propertyId ? { property_id: propertyId } : {}),
          ...(trimmed ? { reservation_id: trimmed } : {}),
        },
      });
      if (error || !data?.success) throw new Error(error?.message || data?.error?.message || "Reservation lookup failed");
      const res = data as ReservationDetailResult;
      setDetail(res);
      if (res.skipped) toast.info(res.reason ?? "Nothing to compare yet");
      else if (res.passed) toast.success("Channel reservation matches the stored booking");
      else toast.error(res.error ?? "Channel reservation does not match the stored booking");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reservation lookup failed");
    } finally {
      setDetailLoading(false);
    }
  }, [detailId, propertyId]);

  const unmappedCount = useMemo(() => creators.filter((c) => !c.mapped).length, [creators]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Repeat className="h-4 w-4 text-primary" />
            Reservation idempotency &amp; notification replay
          </CardTitle>
          <CardDescription>
            Ingests one synthetic reservation twice through the shared path used by the live-notification
            handler and the 30-minute poll. Exactly one booking must result. The test uses dates ~2 years
            out, never blocks availability, and deletes its own booking afterwards.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1 space-y-1">
              <span className="text-xs text-muted-foreground">Property</span>
              <Select value={propertyId} onValueChange={setPropertyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a property" />
                </SelectTrigger>
                <SelectContent>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-72 space-y-1">
              <span className="text-xs text-muted-foreground">Test</span>
              <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="reservation_idempotency_test">Duplicate ingest (poll + notification)</SelectItem>
                  <SelectItem value="rlnm_replay_test">Replay incl. cancellation</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={runIdempotency} disabled={running || !propertyId}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
              Run test
            </Button>
          </div>

          {result && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex items-center gap-2">
                {result.passed ? (
                  <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> Idempotent</Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> Failed</Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {result.ru_reservation_id} · RU listing {result.ru_property_id} · {result.dates.from} → {result.dates.to} ·
                  {" "}{result.booking_count} booking row(s)
                </span>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pass</TableHead>
                    <TableHead>Outcome</TableHead>
                    <TableHead>Deduplicated</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Detail</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.passes.map((p) => (
                    <TableRow key={p.pass}>
                      <TableCell>{p.pass}</TableCell>
                      <TableCell><Badge variant="outline">{p.outcome}</Badge></TableCell>
                      <TableCell>{p.deduped ? "Yes" : "No"}</TableCell>
                      <TableCell>{p.channel_label ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{p.error ?? p.note ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {result.cancel_replay && (
                <p className="text-xs text-muted-foreground">
                  Cancellation replay: {result.cancel_replay.first} → {result.cancel_replay.second}{" "}
                  {result.cancel_replay.idempotent ? "(idempotent)" : "(not idempotent)"}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" />
            Reservation detail by ID
          </CardTitle>
          <CardDescription>
            Pulls a single reservation straight from the channel (Pull_GetReservationByID_RQ) and compares
            it with the stored booking. Read-only — nothing is written. Leave the ID blank to check the most
            recent channel reservation for the selected property.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <div className="flex-1 space-y-1">
              <span className="text-xs text-muted-foreground">Channel reservation ID (optional)</span>
              <Input
                value={detailId}
                onChange={(e) => setDetailId(e.target.value)}
                placeholder="e.g. 88123456"
              />
            </div>
            <Button variant="outline" onClick={runDetail} disabled={detailLoading || (!propertyId && !detailId.trim())}>
              {detailLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Fetch from channel
            </Button>
          </div>

          {detail && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2">
                {detail.skipped ? (
                  <Badge variant="outline">Nothing to compare</Badge>
                ) : detail.passed ? (
                  <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> Matches</Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> Mismatch</Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {detail.reason ?? detail.error ?? `Reservation ${detail.ru_reservation_id}`}
                </span>
              </div>

              {detail.reservation && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Field</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead>ROL'OS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell>Guest</TableCell>
                      <TableCell>{detail.reservation.guest_name ?? "—"}</TableCell>
                      <TableCell>{detail.booking?.guest_name ?? "—"}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Check-in</TableCell>
                      <TableCell>{detail.reservation.date_from ?? "—"}</TableCell>
                      <TableCell>{detail.booking?.check_in_date ?? "—"}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Check-out</TableCell>
                      <TableCell>{detail.reservation.date_to ?? "—"}</TableCell>
                      <TableCell>{detail.booking?.check_out_date ?? "—"}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Total</TableCell>
                      <TableCell>{detail.reservation.total ?? "—"}</TableCell>
                      <TableCell>{detail.booking?.total_amount ?? "—"}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Channel listing / creator</TableCell>
                      <TableCell>
                        {detail.reservation.ru_property_id ?? "—"}
                        {detail.reservation.creator ? ` · ${detail.reservation.creator}` : ""}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">—</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              )}

              {detail.mismatches?.length > 0 && (
                <ul className="list-disc pl-5 text-xs text-muted-foreground">
                  {detail.mismatches.map((m) => <li key={m}>{m}</li>)}
                </ul>
              )}
            </div>
          )}
        </CardContent>
      </Card>



      <RuBookingReadbackCard propertyId={propertyId} />

      <Card>
        <CardHeader className="pb-3 flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Channel creator mapping</CardTitle>
            <CardDescription>
              Rentals United names the sales-channel account that created each reservation. These
              mappings turn that account into the channel shown on the booking.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={loadCreators} disabled={loadingCreators}>
            {loadingCreators ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {unmappedCount > 0 && (
            <p className="text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {unmappedCount} creator account(s) seen on bookings are not labelled yet.
            </p>
          )}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Creator seen on bookings</TableHead>
                <TableHead>Bookings</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {creators.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-sm text-muted-foreground">
                    No Rentals United bookings carrying a creator account yet.
                  </TableCell>
                </TableRow>
              ) : (
                creators.map((c) => (
                  <TableRow key={c.creator}>
                    <TableCell className="font-medium">{c.creator}</TableCell>
                    <TableCell>{c.bookings}</TableCell>
                    <TableCell>{c.channel_label ?? "—"}</TableCell>
                    <TableCell>
                      {c.mapped ? (
                        <Badge variant="outline" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Mapped</Badge>
                      ) : (
                        <Badge variant="destructive">Unmapped</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          <div className="space-y-2">
            <span className="text-xs font-medium text-muted-foreground">Registered mappings</span>
            <div className="flex flex-wrap gap-2">
              {mappings.map((m) => (
                <Badge key={m.creator_username} variant={m.is_active ? "secondary" : "outline"}>
                  {m.creator_username} → {m.channel_label}
                  {m.ru_channel_id ? ` (#${m.ru_channel_id})` : ""}
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * NightsBridge Booking Import — property-scoped ingestion of the NightsBridge
 * "Client Summary / Bookings Report" export (history + future reservations).
 *
 * All parsing and writing happens in the `nb-import-bookings` edge function; this card
 * only handles file selection, the dry-run preview and the result log.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { queueChannelRatesSync } from "@/lib/channelContentSync";

interface Props {
  propertyId: string;
  propertyName?: string;
}

interface PreviewRow {
  row: number;
  nbid: string | null;
  action: "create" | "update";
  guest_name: string;
  check_in_date: string;
  check_out_date: string;
  nights: number;
  room_name: string | null;
  room_matched: boolean;
  adults: number;
  children: number;
  total_price: number;
  currency: string;
  status: string;
  payment_status: string;
  booking_channel: string;
  raw_status: string;
  is_history: boolean;
}

interface ImportSummary {
  total_rows: number;
  parsed: number;
  created: number;
  updated: number;
  skipped: number;
  /** Rows dropped because the operator excluded their unmatched room name. */
  excluded?: number;

  errors: number;
  unmapped_rooms: string[];
  /** Stays still ahead of today — these must also block availability on the channel. */
  future_stays?: number;
  /** Arrival span of the file, so a history-only export is obvious before importing. */
  min_arrival?: string | null;
  max_arrival?: string | null;
  /** Chunked live writes. */
  written?: number;
  row_done?: number;
  has_more?: boolean;
}

/** One recorded import run (preview or live) for this property. */
interface ImportRun {
  id: string;
  created_at: string;
  file_name: string | null;
  mode: string;
  summary: Partial<ImportSummary> | null;
  min_arrival: string | null;
  max_arrival: string | null;
  future_stays: number | null;
  unmapped_rooms: string[] | null;
}


/** Result of the post-import repair pass over bookings that never matched a unit. */
interface RepairResponse {
  ok: boolean;
  error?: string;
  mode: "repair";
  dry_run: boolean;
  repaired: number;
  unmapped_total: number;
  unnamed: number;
  groups: { key: string; room_name: string; count: number }[];
  suspect_dates: { id: string; check_in_date: string; check_out_date: string; nights: number }[];
  rooms: { id: string; label: string }[];
}


interface ImportResponse {
  ok: boolean;
  error?: string;
  dry_run: boolean;
  summary: ImportSummary;
  errors: { row: number; nbid: string | null; message: string }[];
  skipped: { row: number; nbid: string | null; message: string }[];
  rooms?: { id: string; label: string }[];
  preview: PreviewRow[];
}

const MAX_BYTES = 10 * 1024 * 1024;

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? "").split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;


const money = (amount: number, currency: string) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: currency || "ZAR", maximumFractionDigits: 0 }).format(amount);

/** Operator decisions for unmatched NightsBridge room names (sent to the backend as-is). */
const EXCLUDE = "__exclude__";
const UNASSIGNED = "__unassigned__";


/** Rows written per live call — keeps a large export well inside the function timeout. */
const WRITE_CHUNK = 250;

export function NightsBridgeBookingImport({ propertyId, propertyName }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<"dry" | "import" | null>(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [dragging, setDragging] = useState(false);
  const [repair, setRepair] = useState<RepairResponse | null>(null);
  const [repairBusy, setRepairBusy] = useState(false);
  const [repairOverrides, setRepairOverrides] = useState<Record<string, string>>({});
  /** Persistent outcome of the last live import — stays until dismissed. */
  const [outcome, setOutcome] = useState<
    | { kind: "saved"; created: number; updated: number; skipped: number; excluded: number; errors: number; future: number }
    | { kind: "failed"; message: string; written: number }
    | null
  >(null);
  const [history, setHistory] = useState<ImportRun[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const rooms = useMemo(() => result?.rooms ?? [], [result]);
  const unmapped = useMemo(() => result?.summary?.unmapped_rooms ?? [], [result]);
  const validated = Boolean(result?.dry_run && result.ok);

  const loadHistory = useCallback(async () => {
    const { data } = await supabase
      .from("nb_import_runs")
      .select("id, created_at, file_name, mode, summary, min_arrival, max_arrival, future_stays, unmapped_rooms")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })
      .limit(12);
    setHistory((data ?? []) as unknown as ImportRun[]);
  }, [propertyId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  /** True when the newest recorded action was a preview that was never followed by a live import. */
  const previewOnly = useMemo(() => history.length > 0 && history[0].mode === "preview", [history]);


  const pickFile = useCallback((next: File | null) => {
    if (!next) return;
    if (!/\.(xlsx|xls|csv)$/i.test(next.name)) {
      toast.error("Only .xlsx, .xls or .csv exports are supported");
      return;
    }
    if (next.size > MAX_BYTES) {
      toast.error("That file is larger than 10 MB");
      return;
    }
    setFile(next);
    setResult(null);
    setOverrides({});
    toast.success(`${next.name} attached (${formatSize(next.size)}) — validate to preview`);
  }, []);

  /* ---------------------------------------------------------------- repair pass ---
   * Bookings imported before a room name was mapped carry no unit, so they never reach the
   * room plan or per-unit metrics. The NightsBridge room name survives on the booking note,
   * so they can be mapped after the fact without re-uploading the export.
   */
  const refreshRepair = useCallback(async () => {
    setRepairBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke<RepairResponse>("nb-import-bookings", {
        body: { property_id: propertyId, mode: "repair", dry_run: true },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "Could not read unmapped bookings");
      setRepair(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read unmapped bookings");
    } finally {
      setRepairBusy(false);
    }
  }, [propertyId]);

  const applyRepair = useCallback(async () => {
    const chosen = Object.fromEntries(Object.entries(repairOverrides).filter(([, v]) => Boolean(v)));
    if (!Object.keys(chosen).length) {
      toast.error("Choose a unit for at least one room name");
      return;
    }
    setRepairBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke<RepairResponse>("nb-import-bookings", {
        body: { property_id: propertyId, mode: "repair", dry_run: false, room_overrides: chosen },
      });
      if (error) throw new Error(error.message);
      if (!data?.ok) throw new Error(data?.error || "Repair failed");
      toast.success(`Mapped ${data.repaired} booking${data.repaired === 1 ? "" : "s"} to units`);
      setRepairOverrides({});
      await refreshRepair();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Repair failed");
    } finally {
      setRepairBusy(false);
    }
  }, [propertyId, repairOverrides, refreshRepair]);


  const run = useCallback(
    async (dryRun: boolean, overrideMap?: Record<string, string>) => {
      if (!file) return;
      const effective = overrideMap ?? overrides;
      setBusy(dryRun ? "dry" : "import");
      setProgress(8);
      const tick = window.setInterval(() => setProgress((p) => (p < 88 ? p + 4 : p)), 500);
      try {
        const fileBase64 = await toBase64(file);
        setProgress(30);
        const { data, error } = await supabase.functions.invoke<ImportResponse>("nb-import-bookings", {
          body: {
            property_id: propertyId,
            file_name: file.name,
            file_base64: fileBase64,
            dry_run: dryRun,
            room_overrides: Object.fromEntries(Object.entries(effective).filter(([, v]) => Boolean(v))),
          },
        });
        if (error) throw new Error(error.message);
        if (!data?.ok) throw new Error(data?.error || "Import failed");
        setProgress(100);
        setResult(data);
        const excluded = data.summary.excluded ?? 0;
        if (dryRun) {
          toast.success(
            `Validated ${data.summary.parsed} of ${data.summary.total_rows} rows — ${data.summary.created} new, ${data.summary.updated} updates` +
              (excluded ? `, ${excluded} excluded` : ""),
          );
        } else {
          toast.success(
            `Imported: ${data.summary.created} created, ${data.summary.updated} updated` +
              (excluded ? `, ${excluded} excluded` : ""),
          );
          // Imported future stays are real occupancy — push availability so the channel stops selling them.
          if ((data.summary.future_stays ?? 0) > 0) {
            void queueChannelRatesSync(propertyId, "nb_import").then((outcome) => {
              if (outcome?.queued || outcome?.accepted) {
                toast.success("Availability update sent to the channel manager");
              }
            });
          }
          void refreshRepair();
        }

      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Import failed");
      } finally {
        window.clearInterval(tick);
        setBusy(null);
        window.setTimeout(() => setProgress(0), 800);
      }
    },
    [file, overrides, propertyId],
  );

  /**
   * Applying a decision invalidates the previous dry run, so re-validate immediately with
   * the new map (state updates are async — pass it through explicitly).
   */
  const applyOverrides = useCallback(
    (next: Record<string, string>) => {
      setOverrides(next);
      void run(true, next);
    },
    [run],
  );


  const downloadLog = useCallback(() => {
    if (!result) return;
    const lines = [
      "type,row,nbid,message",
      ...result.errors.map((e) => `error,${e.row},"${e.nbid ?? ""}","${e.message.replace(/"/g, "'")}"`),
      ...result.skipped.map((s) => `skipped,${s.row},"${s.nbid ?? ""}","${s.message.replace(/"/g, "'")}"`),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nightsbridge-import-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              NightsBridge Booking Import
            </CardTitle>
            <CardDescription>
              Upload the NightsBridge Client Summary / Bookings Report export to load history and future
              reservations {propertyName ? `for ${propertyName}` : ""} into ROL'OS. Re-imports are safe — rows are
              keyed by NBID.
            </CardDescription>
          </div>
          <Badge variant="outline">NightsBridge only</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Dropzone / attached-file confirmation */}
        {file ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/40 bg-accent/50 p-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <div>
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatSize(file.size)} · attached and ready to validate
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() => inputRef.current?.click()}
              >
                Change file
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy !== null}
                onClick={() => {
                  setFile(null);
                  setResult(null);
                  setOverrides({});
                  if (inputRef.current) inputRef.current.value = "";
                }}
                className="gap-1.5"
              >
                <X className="h-3.5 w-3.5" />
                Remove
              </Button>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
          </div>
        ) : (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pickFile(e.dataTransfer.files?.[0] ?? null);
            }}
            onClick={() => inputRef.current?.click()}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
              dragging ? "border-primary bg-accent" : "border-border hover:border-primary/50"
            }`}
          >
            <Upload className="h-5 w-5 text-muted-foreground" />
            <p className="text-sm font-medium">Drop the export here, or click to choose</p>
            <p className="text-xs text-muted-foreground">.xlsx, .xls or .csv — up to 10 MB</p>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={file && !validated ? "default" : "outline"}
            size="sm"
            disabled={!file || busy !== null}
            onClick={() => run(true)}
          >
            {busy === "dry" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Validate (dry run)
          </Button>
          <Button
            variant={validated ? "default" : "outline"}
            size="sm"
            disabled={!file || busy !== null || !validated}
            onClick={() => run(false)}
          >
            {busy === "import" ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Import
          </Button>
          {result && (result.errors.length > 0 || result.skipped.length > 0) && (
            <Button variant="ghost" size="sm" onClick={downloadLog} className="gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Error log
            </Button>
          )}
          {!validated && file && (
            <span className="text-xs text-muted-foreground">Validate first, then import.</span>
          )}
        </div>


        {progress > 0 && <Progress value={progress} className="h-1.5" />}

        {/* Summary */}
        {result && (
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">{result.summary.total_rows} rows</Badge>
            <Badge variant="secondary">{result.summary.parsed} mapped</Badge>
            <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
              {result.dry_run ? `${result.summary.created} new` : `${result.summary.created} created`}
            </Badge>
            <Badge variant="outline">{result.summary.updated} {result.dry_run ? "to update" : "updated"}</Badge>
            <Badge variant="outline">{result.summary.skipped} skipped</Badge>
            {(result.summary.excluded ?? 0) > 0 && (
              <Badge variant="outline" className="border-amber-500 text-amber-700 dark:text-amber-400">
                {result.summary.excluded} excluded (unknown room)
              </Badge>
            )}
            {result.summary.errors > 0 ? (
              <Badge variant="destructive">{result.summary.errors} errors</Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                <CheckCircle2 className="h-3 w-3" /> no errors
              </Badge>
            )}
          </div>
        )}

        {/* Unmapped rooms */}
        {validated && unmapped.length > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Unmatched room names</AlertTitle>
            <AlertDescription className="space-y-2">
              <p className="text-xs">
                These NightsBridge room names don't match a ROL'OS room. Map the ones you care about, import the
                rest unassigned, or exclude their rows entirely. Every choice re-runs the dry run so the preview
                below reflects exactly what will be imported.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 text-xs"
                  disabled={busy !== null}
                  onClick={() => {
                    const next = { ...overrides };
                    unmapped.forEach((name) => {
                      next[name] = EXCLUDE;
                    });
                    applyOverrides(next);
                  }}
                >
                  Skip all unknown rooms
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 text-xs"
                  disabled={busy !== null}
                  onClick={() => {
                    const next = { ...overrides };
                    unmapped.forEach((name) => {
                      next[name] = UNASSIGNED;
                    });
                    applyOverrides(next);
                  }}
                >
                  Import all unassigned
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 text-xs text-muted-foreground"
                  disabled={busy !== null || Object.keys(overrides).length === 0}
                  onClick={() => applyOverrides({})}
                >
                  Clear all
                </Button>
              </div>
              <div className="space-y-2">
                {unmapped.map((name) => (
                  <div key={name} className="flex items-center gap-2">
                    <span className="w-40 shrink-0 truncate text-xs font-medium">{name}</span>
                    <Select
                      value={overrides[name] ?? ""}
                      disabled={busy !== null}
                      onValueChange={(v) => applyOverrides({ ...overrides, [name]: v })}
                    >
                      <SelectTrigger className="h-8 w-64 text-xs">
                        <SelectValue placeholder="Choose a ROL'OS room, or skip" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={EXCLUDE} className="text-xs">
                          Skip — exclude these rows
                        </SelectItem>
                        <SelectItem value={UNASSIGNED} className="text-xs">
                          Import unassigned (no room)
                        </SelectItem>
                        {rooms.map((r) => (
                          <SelectItem key={r.id} value={r.id} className="text-xs">
                            {r.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {overrides[name] === EXCLUDE && (
                      <span className="text-[10px] text-amber-700 dark:text-amber-400">rows excluded</span>
                    )}
                    {overrides[name] === UNASSIGNED && (
                      <span className="text-[10px] text-muted-foreground">will import unassigned</span>
                    )}
                    {overrides[name] && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        disabled={busy !== null}
                        onClick={() => {
                          const next = { ...overrides };
                          delete next[name];
                          applyOverrides(next);
                        }}
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                ))}
              </div>

            </AlertDescription>
          </Alert>
        )}

        {/* Preview */}
        {validated && result!.preview.length > 0 && (
          <div className="rounded-md border">
            <ScrollArea className="h-80">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16 text-xs">Row</TableHead>
                    <TableHead className="text-xs">Action</TableHead>
                    <TableHead className="text-xs">Guest</TableHead>
                    <TableHead className="text-xs">Dates</TableHead>
                    <TableHead className="text-xs">Room</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-right text-xs">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result!.preview.map((p) => (
                    <TableRow key={`${p.row}-${p.nbid ?? ""}`}>
                      <TableCell className="text-xs text-muted-foreground">{p.row}</TableCell>
                      <TableCell>
                        <Badge variant={p.action === "create" ? "secondary" : "outline"} className="text-[10px]">
                          {p.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {p.guest_name}
                        {p.is_history && <span className="ml-1 text-[10px] text-muted-foreground">(history)</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs">
                        {p.check_in_date} → {p.check_out_date}
                      </TableCell>
                      <TableCell className="text-xs">
                        {p.room_name ?? "—"}
                        {p.room_name && !p.room_matched && (
                          overrides[p.room_name] === UNASSIGNED ? (
                            <Badge variant="outline" className="ml-1 text-[10px] text-muted-foreground">
                              unassigned
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="ml-1 text-[10px]">unmatched</Badge>
                          )
                        )}
                      </TableCell>
                      <TableCell className="text-xs">
                        {p.status} / {p.payment_status}
                      </TableCell>
                      <TableCell className="text-right text-xs">{money(p.total_price, p.currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}

        {/* Errors */}
        {result && result.errors.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>{result.errors.length} rows could not be imported</AlertTitle>
            <AlertDescription>
              <ul className="mt-1 space-y-0.5 text-xs">
                {result.errors.slice(0, 8).map((e, i) => (
                  <li key={i}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
              {result.errors.length > 8 && (
                <p className="mt-1 text-xs">Download the error log for the full list.</p>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Fix unmapped rooms — repairs bookings already in the database */}
        <div className="rounded-lg border border-border p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Fix unmapped rooms</p>
              <p className="text-xs text-muted-foreground">
                Imported bookings that never matched a unit are missing from the room plan and per-unit
                metrics. Map them here — no re-upload needed.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void refreshRepair()} disabled={repairBusy}>
              {repairBusy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
              {repair ? "Re-check" : "Check imported bookings"}
            </Button>
          </div>

          {repair && (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap gap-2 text-xs">
                <Badge variant={repair.unmapped_total > 0 ? "destructive" : "secondary"}>
                  {repair.unmapped_total} without a unit
                </Badge>
                {repair.unnamed > 0 && (
                  <Badge variant="outline">{repair.unnamed} with no room name on record</Badge>
                )}
                {repair.suspect_dates.length > 0 && (
                  <Badge variant="outline">{repair.suspect_dates.length} implausible date ranges</Badge>
                )}
              </div>

              {repair.groups.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {repair.unmapped_total === 0
                    ? "Every imported booking is mapped to a unit."
                    : "No recoverable room names — these bookings need to be re-imported."}
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    {repair.groups.map((group) => (
                      <div key={group.key} className="flex flex-wrap items-center gap-2">
                        <span className="min-w-[160px] text-xs font-medium">{group.room_name}</span>
                        <Badge variant="outline" className="text-[10px]">{group.count} bookings</Badge>
                        <Select
                          value={repairOverrides[group.room_name] ?? ""}
                          onValueChange={(value) =>
                            setRepairOverrides((prev) => ({ ...prev, [group.room_name]: value }))
                          }
                        >
                          <SelectTrigger className="h-8 w-[220px] text-xs">
                            <SelectValue placeholder="Map to unit…" />
                          </SelectTrigger>
                          <SelectContent>
                            {repair.rooms.map((room) => (
                              <SelectItem key={room.id} value={room.id}>
                                {room.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                  <Button size="sm" onClick={() => void applyRepair()} disabled={repairBusy}>
                    {repairBusy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-2 h-3.5 w-3.5" />}
                    Apply mapping
                  </Button>
                </>
              )}

              {repair.suspect_dates.length > 0 && (
                <div className="rounded-md border border-border p-2">
                  <p className="text-xs font-medium">Check these date ranges</p>
                  <ul className="mt-1 space-y-0.5 text-[11px] text-muted-foreground">
                    {repair.suspect_dates.slice(0, 6).map((row) => (
                      <li key={row.id}>
                        {row.check_in_date} → {row.check_out_date} ({row.nights} nights)
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

      </CardContent>
    </Card>
  );
}

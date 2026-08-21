import { useCallback, useMemo, useReducer, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Check, ChevronLeft, ChevronRight, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { usePageSEO } from "@/hooks/usePageSEO";
import { useReportProperties, type ReportProperty } from "@/hooks/useReportProperties";
import { useReportRunMutations } from "@/hooks/useReportRuns";
import { FileDropZone, type DropZoneFileState } from "@/components/reports/FileDropZone";
import { uploadSourceFiles } from "@/lib/reportUpload";

type Step = 1 | 2 | 3;

interface WizardState {
  step: Step;
  property: ReportProperty | null;
  asOfDate: string;
  title: string;
  titleEdited: boolean;
  files: File[];
}

type WizardAction =
  | { type: "step"; step: Step }
  | { type: "property"; property: ReportProperty }
  | { type: "asOfDate"; value: string }
  | { type: "title"; value: string }
  | { type: "addFiles"; files: File[] }
  | { type: "removeFile"; index: number };

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const defaultTitle = (dateIso: string): string => {
  const parsed = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "Bi-Monthly Revenue Review";
  const formatted = parsed.toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return `Bi-Monthly Revenue Review – ${formatted}`;
};

const initialState: WizardState = {
  step: 1,
  property: null,
  asOfDate: todayIso(),
  title: defaultTitle(todayIso()),
  titleEdited: false,
  files: [],
};

function reducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "step":
      return { ...state, step: action.step };
    case "property":
      return { ...state, property: action.property, step: 2 };
    case "asOfDate":
      return {
        ...state,
        asOfDate: action.value,
        title: state.titleEdited ? state.title : defaultTitle(action.value),
      };
    case "title":
      return { ...state, title: action.value, titleEdited: true };
    case "addFiles":
      return { ...state, files: [...state.files, ...action.files] };
    case "removeFile":
      return { ...state, files: state.files.filter((_, i) => i !== action.index) };
    default:
      return state;
  }
}

const STEPS: { step: Step; label: string }[] = [
  { step: 1, label: "Property" },
  { step: 2, label: "Details" },
  { step: 3, label: "Files" },
];

export default function ReportsNewRun() {
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(reducer, initialState);
  const [search, setSearch] = useState("");
  const [fileStates, setFileStates] = useState<Record<number, DropZoneFileState>>({});
  const [busy, setBusy] = useState(false);
  const { properties, isLoading } = useReportProperties(search);
  const { createRun } = useReportRunMutations();

  usePageSEO({
    title: "New revenue report | Rooms Online",
    description: "Create a new consolidated revenue review run for a property.",
    noIndex: true,
  });

  const canProcess = useMemo(
    () => Boolean(state.property) && Boolean(state.asOfDate) && state.files.length > 0,
    [state.property, state.asOfDate, state.files.length],
  );

  const handleAddFiles = useCallback((incoming: File[]) => {
    dispatch({ type: "addFiles", files: incoming });
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    dispatch({ type: "removeFile", index });
    setFileStates({});
  }, []);

  const handleCreate = useCallback(async () => {
    if (!state.property || !canProcess) return;
    setBusy(true);
    setFileStates({});
    try {
      const runId = await createRun.mutateAsync({
        propertyId: state.property.id,
        asOfDate: state.asOfDate,
        title: state.title.trim() || defaultTitle(state.asOfDate),
      });

      const result = await uploadSourceFiles({
        runId,
        propertyId: state.property.id,
        files: state.files,
        onProgress: ({ index, phase, message }) =>
          setFileStates((prev) => ({ ...prev, [index]: { phase, message } })),
      });

      if (result.failed.length) {
        toast.error(`${result.failed.length} file(s) failed to upload`, {
          description: result.failed[0]?.message,
        });
      } else {
        toast.success(`Run created with ${result.uploaded} file(s)`);
      }
      navigate(`/runs/${runId}`);
    } catch (error) {
      toast.error("Could not create the run", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  }, [state, canProcess, createRun, navigate]);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">New report</h1>
        <p className="text-sm text-muted-foreground">
          Select a property, set the as-of date and upload the source files.
        </p>
      </div>

      {/* ─── Stepper ──────────────────────────────────────────── */}
      <ol className="flex flex-wrap items-center gap-2 text-sm">
        {STEPS.map((item, i) => {
          const active = state.step === item.step;
          const complete = state.step > item.step;
          return (
            <li key={item.step} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (item.step === 1 || state.property) dispatch({ type: "step", step: item.step });
                }}
                className={cn(
                  "flex items-center gap-2 rounded-full border px-3 py-1.5 transition-colors",
                  active && "border-primary text-foreground",
                  !active && "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex h-5 w-5 items-center justify-center rounded-full text-xs",
                    active || complete ? "bg-primary text-primary-foreground" : "bg-muted",
                  )}
                >
                  {complete ? <Check className="h-3 w-3" /> : item.step}
                </span>
                {item.label}
              </button>
              {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-muted-foreground" />}
            </li>
          );
        })}
      </ol>

      {/* ─── Step 1: property ─────────────────────────────────── */}
      {state.step === 1 && (
        <Card>
          <CardHeader className="pb-3 space-y-3">
            <CardTitle className="text-base font-medium">Choose a property</CardTitle>
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search properties"
                className="pl-9"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading &&
              [1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)}
            {!isLoading && properties.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">
                No active properties match that search.
              </p>
            )}
            {properties.map((property) => (
              <button
                key={property.id}
                type="button"
                onClick={() => dispatch({ type: "property", property })}
                className="w-full flex items-center gap-3 rounded-md border px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
              >
                {property.logoUrl ? (
                  <img
                    src={property.logoUrl}
                    alt={`${property.name} logo`}
                    loading="lazy"
                    className="h-9 w-9 rounded object-contain bg-muted"
                  />
                ) : (
                  <span className="h-9 w-9 rounded bg-muted flex items-center justify-center">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                  </span>
                )}
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate">{property.name}</span>
                  {property.city && (
                    <span className="block text-xs text-muted-foreground truncate">
                      {property.city}
                    </span>
                  )}
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ─── Step 2: details ──────────────────────────────────── */}
      {state.step === 2 && state.property && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Run details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-3 rounded-md border px-3 py-2.5">
              <span className="text-sm font-medium flex-1 truncate">{state.property.name}</span>
              <Badge variant="secondary" className="font-normal">
                NightsBridge
              </Badge>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="as-of-date">As-of date</Label>
                <Input
                  id="as-of-date"
                  type="date"
                  value={state.asOfDate}
                  onChange={(e) => dispatch({ type: "asOfDate", value: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  The date the on-the-books snapshot is taken.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="run-title">Report title</Label>
                <Input
                  id="run-title"
                  value={state.title}
                  onChange={(e) => dispatch({ type: "title", value: e.target.value })}
                />
              </div>
            </div>

            <div className="flex justify-between">
              <Button variant="ghost" onClick={() => dispatch({ type: "step", step: 1 })}>
                <ChevronLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button
                onClick={() => dispatch({ type: "step", step: 3 })}
                disabled={!state.asOfDate}
              >
                Continue
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── Step 3: files ────────────────────────────────────── */}
      {state.step === 3 && state.property && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">Source files</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <FileDropZone
              files={state.files}
              states={fileStates}
              disabled={busy}
              onFilesAdded={handleAddFiles}
              onRemove={handleRemoveFile}
            />
            <div className="flex justify-between">
              <Button
                variant="ghost"
                onClick={() => dispatch({ type: "step", step: 2 })}
                disabled={busy}
              >
                <ChevronLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <Button onClick={() => void handleCreate()} disabled={!canProcess || busy}>
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create run
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

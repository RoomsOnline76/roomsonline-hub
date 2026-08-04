import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Loader2, Sparkles, ImageIcon, PenSquare } from "lucide-react";
import { toast } from "sonner";

interface PropertyOption {
  id: string;
  name: string;
  slug: string | null;
}

type ToolKey = "editorial" | "images";

/** Pull the JSON error body out of a FunctionsHttpError so failures name themselves. */
const readFunctionError = async (error: unknown): Promise<string | null> => {
  const response = (error as { context?: Response })?.context;
  if (!response || typeof response.text !== "function") return null;
  try {
    const text = await response.text();
    if (!text) return null;
    try {
      const parsed = JSON.parse(text) as { error?: string; message?: string };
      return parsed.error || parsed.message || text.slice(0, 300);
    } catch {
      return text.slice(0, 300);
    }
  } catch {
    return null;
  }
};

const AdminTobiTools = () => {
  const navigate = useNavigate();
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [loadingProperties, setLoadingProperties] = useState(true);
  const [propertyId, setPropertyId] = useState<string>("");
  const [running, setRunning] = useState<ToolKey | null>(null);
  const [results, setResults] = useState<Partial<Record<ToolKey, unknown>>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, slug")
        .eq("is_active", true)
        .order("name");
      if (cancelled) return;
      if (error) {
        toast.error("Could not load properties");
      } else {
        setProperties((data ?? []) as PropertyOption[]);
      }
      setLoadingProperties(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedProperty = useMemo(
    () => properties.find((p) => p.id === propertyId) ?? null,
    [properties, propertyId],
  );

  const invoke = async (tool: ToolKey, fn: string, body: Record<string, unknown>) => {
    setRunning(tool);
    try {
      const { data, error } = await supabase.functions.invoke(fn, { body });
      if (error) {
        // supabase.functions.invoke only reports "non-2xx"; read the body for the real reason.
        const detail = await readFunctionError(error);
        throw new Error(detail || error.message);
      }
      if (data && typeof data === "object" && "error" in (data as Record<string, unknown>)) {
        throw new Error(String((data as Record<string, unknown>).error));
      }
      setResults((prev) => ({ ...prev, [tool]: data }));
      toast.success("TOBI finished the run");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Run failed";
      toast.error(message);
      setResults((prev) => ({ ...prev, [tool]: { error: message } }));
    } finally {
      setRunning(null);
    }
  };

  const runBulkEditorial = () =>
    invoke("editorial", "bulk-editorial-generate", {});

  const runImageValidation = async () => {
    if (!propertyId) {
      toast.error("Select a property first");
      return;
    }
    setRunning("images");
    try {
      const { data: property, error } = await supabase
        .from("properties")
        .select("images, amenities")
        .eq("id", propertyId)
        .maybeSingle();
      if (error) throw error;

      const rawImages = (property?.images ?? []) as unknown;
      const imageUrls = Array.isArray(rawImages)
        ? rawImages
            .map((img) => (typeof img === "string" ? img : (img as { url?: string })?.url))
            .filter((url): url is string => Boolean(url))
        : [];

      if (imageUrls.length === 0) {
        toast.error("This property has no images to validate");
        setRunning(null);
        return;
      }

      const amenities = (property?.amenities ?? {}) as Record<string, unknown>;
      const currentAmenities = Object.values(amenities)
        .flatMap((group) => (Array.isArray(group) ? group : []))
        .filter((item): item is string => typeof item === "string");

      setRunning(null);
      await invoke("images", "validate-images-against-data", {
        property_id: propertyId,
        image_urls: imageUrls.slice(0, 12),
        current_amenities: currentAmenities,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read property images");
      setRunning(null);
    }
  };

  const renderResult = (tool: ToolKey) => {
    const result = results[tool];
    if (!result) return null;
    return (
      <pre className="mt-4 max-h-64 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
        {JSON.stringify(result, null, 2)}
      </pre>
    );
  };

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Go back"
            onClick={() => navigate("/admin")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Sparkles className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-semibold tracking-tight">TOBI Utilities</h1>
          <Badge variant="secondary">Admin</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Manual runs for the content and media tools that previously had no interface. All model
          selection is centralised, so these use the cheapest capable option for each task.
        </p>
      </header>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Property context</CardTitle>
          <CardDescription>Used by the image and integration tools.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label>Property</Label>
            <Select value={propertyId} onValueChange={setPropertyId} disabled={loadingProperties}>
              <SelectTrigger className="max-w-md">
                <SelectValue placeholder={loadingProperties ? "Loading…" : "Select a property"} />
              </SelectTrigger>
              <SelectContent>
                {properties.map((property) => (
                  <SelectItem key={property.id} value={property.id}>
                    {property.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <PenSquare className="h-4 w-4" /> Editorial backfill (all properties)
          </CardTitle>
          <CardDescription>
            Estate-wide backfill: writes the five editorial fields for every active property still
            missing them, skipping any that already have copy. To run TOBI editorial for a single
            property, use the ROL Spec tab in Edit Property.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={runBulkEditorial} disabled={running !== null}>
            {running === "editorial" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Run editorial backfill
          </Button>
          {renderResult("editorial")}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ImageIcon className="h-4 w-4" /> Image / data consistency check
          </CardTitle>
          <CardDescription>
            Reads the gallery images and reports features visible in photos that are missing from the
            property record, and listed features that no photo supports.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={runImageValidation} disabled={running !== null || !propertyId}>
            {running === "images" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Validate images
            {selectedProperty ? ` — ${selectedProperty.name}` : ""}
          </Button>
          {renderResult("images")}
        </CardContent>
      </Card>

    </div>
  );
};

export default AdminTobiTools;

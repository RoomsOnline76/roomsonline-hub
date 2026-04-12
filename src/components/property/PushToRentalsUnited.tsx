import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Upload,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Image,
  MapPin,
  Home,
  BedDouble,
  Pencil,
  Save,
  X,
} from "lucide-react";

interface PushToRentalsUnitedProps {
  propertyId: string;
  propertyName: string;
}

interface ValidationResult {
  images_count: number;
  amenities_count: number;
  rooms_count: number;
  has_coordinates: boolean;
  meets_minimum_images: boolean;
  meets_minimum_amenities: boolean;
}

interface PushError {
  code: string;
  message: string;
}

export function PushToRentalsUnited({ propertyId, propertyName }: PushToRentalsUnitedProps) {
  const [loading, setLoading] = useState(false);
  const [dryRunning, setDryRunning] = useState(false);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [ruPropertyId, setRuPropertyId] = useState<string | null>(null);
  const [error, setError] = useState<PushError | null>(null);
  const [lastChecked, setLastChecked] = useState<string | null>(null);

  const runDryRun = async () => {
    setDryRunning(true);
    setError(null);
    setValidation(null);

    try {
      const { data, error: fnErr } = await supabase.functions.invoke("push-property-to-ru", {
        body: { property_id: propertyId, dry_run: true },
      });

      if (fnErr) throw new Error(fnErr.message);

      if (!data.success) {
        setError(data.error);
        return;
      }

      setValidation(data.validation);
      setRuPropertyId(data.ru_property_id);
      setLastChecked(new Date().toLocaleTimeString());

      if (data.validation.meets_minimum_images && data.validation.meets_minimum_amenities && data.validation.has_coordinates) {
        toast.success("Property is ready to push to Rentals United");
      } else {
        toast.warning("Property needs attention before pushing to RU");
      }
    } catch (err) {
      setError({ code: "EXCEPTION", message: err instanceof Error ? err.message : "Unknown error" });
      toast.error("Failed to validate property");
    } finally {
      setDryRunning(false);
    }
  };

  const pushToRU = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fnErr } = await supabase.functions.invoke("push-property-to-ru", {
        body: { property_id: propertyId },
      });

      if (fnErr) throw new Error(fnErr.message);

      if (!data.success) {
        setError(data.error);
        toast.error(data.error?.message || "Push failed");
        return;
      }

      setRuPropertyId(data.rentalsunited_property_id);
      toast.success(`Property pushed to Rentals United (ID: ${data.rentalsunited_property_id})`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError({ code: "EXCEPTION", message });
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const isReady = validation && validation.meets_minimum_images && validation.meets_minimum_amenities && validation.has_coordinates && validation.rooms_count > 0;

  const issues = validation ? [
    !validation.meets_minimum_images && {
      icon: Image,
      tab: "images",
      label: `Need at least 10 images (currently ${validation.images_count})`,
    },
    !validation.meets_minimum_amenities && {
      icon: Home,
      tab: "info-facilities",
      label: `Need at least 10 amenities (currently ${validation.amenities_count})`,
    },
    !validation.has_coordinates && {
      icon: MapPin,
      tab: "general",
      label: "Property must have latitude and longitude coordinates",
    },
    validation.rooms_count === 0 && {
      icon: BedDouble,
      tab: "rooms",
      label: "Property must have at least 1 room type",
    },
  ].filter(Boolean) as { icon: any; tab: string; label: string }[] : [];

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm">Push to Rentals United</CardTitle>
            {ruPropertyId && (
              <Badge variant="outline" className="text-xs">
                RU ID: {ruPropertyId}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={runDryRun}
              disabled={dryRunning || loading}
            >
              {dryRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3" />}
              {dryRunning ? "Checking..." : "Validate"}
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={pushToRU}
              disabled={loading || dryRunning || (validation !== null && !isReady)}
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              {loading ? "Pushing..." : "Push to RU"}
            </Button>
          </div>
        </div>
      </CardHeader>

      {(validation || error) && (
        <CardContent className="pt-0 pb-3 px-4 space-y-2">
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle className="text-xs font-medium">{error.code}</AlertTitle>
              <AlertDescription className="text-xs">{error.message}</AlertDescription>
            </Alert>
          )}

          {validation && isReady && (
            <Alert className="border-green-500/30 bg-green-500/5">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertTitle className="text-xs font-medium text-green-700">Ready to push</AlertTitle>
              <AlertDescription className="text-xs text-green-600">
                {validation.images_count} images · {validation.amenities_count} amenities · {validation.rooms_count} rooms · Coordinates set
              </AlertDescription>
            </Alert>
          )}

          {validation && !isReady && issues.length > 0 && (
            <Alert variant="destructive" className="border-amber-500/30 bg-amber-500/5">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-xs font-medium text-amber-700">
                Missing requirements — fix these in the property editor:
              </AlertTitle>
              <AlertDescription>
                <ul className="mt-1 space-y-1">
                  {issues.map((issue, i) => (
                    <li key={i} className="flex items-center gap-2 text-xs text-amber-700">
                      <issue.icon className="h-3 w-3 flex-shrink-0" />
                      <span>{issue.label}</span>
                      <Badge variant="outline" className="text-[10px] h-4 px-1">
                        {issue.tab} tab
                      </Badge>
                    </li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {lastChecked && (
            <p className="text-[10px] text-muted-foreground text-right">Last checked: {lastChecked}</p>
          )}
        </CardContent>
      )}
    </Card>
  );
}

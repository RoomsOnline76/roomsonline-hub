import { useEffect, useState, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft } from "lucide-react";

export default function HyperGuestReflectionInspector() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [data, setData] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setError("Missing token");
      return;
    }
    const { data: out, error: err } = await supabase.functions.invoke("hyperguest-cert-portal", {
      body: { action: "reflection", token },
    });
    if (err) {
      setError(err.message);
      return;
    }
    if (!out?.success) {
      setError(out?.error ?? "Unable to load reflection");
      return;
    }
    setData(out.reflection);
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <div className="container max-w-2xl mx-auto py-16">
        <Card>
          <CardHeader>
            <CardTitle>Reflection unavailable</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-destructive">{error}</CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="container max-w-5xl mx-auto py-10 space-y-4">
        <Skeleton className="h-10 w-1/3" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const s = data.sections ?? {};

  return (
    <div className="container max-w-5xl mx-auto py-10 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-serif tracking-tight">Reflection Inspector</h1>
          <p className="text-muted-foreground text-sm mt-1">
            How sandbox hotel <Badge variant="secondary">{data.sandbox_hotel_id}</Badge> data appears inside ROLOS.
            {data.property_name && <> — Property: <strong>{data.property_name}</strong></>}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to={`/hyperguest/certification?token=${token}`}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to certification
          </Link>
        </Button>
      </div>

      {data.warning && (
        <Card className="border-amber-500/40">
          <CardContent className="py-4 text-sm text-amber-700">{data.warning}</CardContent>
        </Card>
      )}

      <Tabs defaultValue="cancel" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="cancel">Cancellation policies</TabsTrigger>
          <TabsTrigger value="board">Board bases</TabsTrigger>
          <TabsTrigger value="taxes">Taxes &amp; fees</TabsTrigger>
          <TabsTrigger value="remarks">Remarks</TabsTrigger>
          <TabsTrigger value="special">Special requests</TabsTrigger>
          <TabsTrigger value="photos">Photos</TabsTrigger>
          <TabsTrigger value="facilities">Facilities</TabsTrigger>
        </TabsList>

        <TabsContent value="cancel">
          <Card>
            <CardHeader><CardTitle className="text-base">Cancellation policies</CardTitle></CardHeader>
            <CardContent>
              <pre className="text-xs bg-muted/40 p-3 rounded overflow-auto max-h-[500px]">
                {JSON.stringify(s.cancellation_policies, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="board">
          <Card>
            <CardHeader><CardTitle className="text-base">Board bases per rate</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(s.board_bases ?? []).map((b: any) => (
                <div key={b.code} className="flex items-center justify-between border rounded-md px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium">{b.name}</div>
                    <div className="text-xs text-muted-foreground font-mono">{b.code}</div>
                  </div>
                  <div className="flex gap-1.5">
                    {b.board && <Badge variant="outline">{b.board}</Badge>}
                    {b.non_refundable && <Badge variant="destructive">NRF</Badge>}
                    {b.package && <Badge>Package</Badge>}
                  </div>
                </div>
              ))}
              {(s.board_bases ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">No rates cached yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="taxes">
          <Card>
            <CardHeader><CardTitle className="text-base">Taxes &amp; fees</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(s.taxes_fees ?? []).map((c: any, i: number) => (
                <div key={i} className="flex items-center justify-between border rounded-md px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.charge_type} · {c.basis} · {c.inclusive ? "Inclusive" : "Exclusive"} · {c.mandatory ? "Mandatory" : "Optional"}
                    </div>
                  </div>
                  <div className="text-sm font-mono">
                    {c.amount} {c.currency}
                  </div>
                </div>
              ))}
              {(s.taxes_fees ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">No charges configured.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="remarks">
          <Card>
            <CardHeader><CardTitle className="text-base">Rate remarks</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {(s.remarks ?? []).map((r: any, i: number) => (
                <div key={i} className="border rounded-md px-3 py-2 text-sm">
                  <div className="font-medium">{r.rate}</div>
                  <p className="text-muted-foreground whitespace-pre-wrap">{r.text}</p>
                </div>
              ))}
              {(s.remarks ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">No remarks present on cached rates.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="special">
          <Card>
            <CardHeader><CardTitle className="text-base">Special requests</CardTitle></CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {s.special_requests?.note}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="photos">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Photos <span className="text-xs text-muted-foreground font-normal ml-2">(min {s.photos?.min_resolution})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-sm font-medium mb-2">Property images</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {((s.photos?.property_images as any[]) ?? []).slice(0, 12).map((img: any, i: number) => (
                    <img
                      key={i}
                      src={typeof img === "string" ? img : img?.url}
                      alt=""
                      loading="lazy"
                      className="aspect-[3/2] object-cover rounded border"
                    />
                  ))}
                </div>
              </div>
              {((s.photos?.room_images as any[]) ?? []).map((rm: any, i: number) => (
                <div key={i}>
                  <h3 className="text-sm font-medium mb-2">{rm.room}</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {(rm.images ?? []).slice(0, 8).map((img: any, j: number) => (
                      <img
                        key={j}
                        src={typeof img === "string" ? img : img?.url}
                        alt=""
                        loading="lazy"
                        className="aspect-[3/2] object-cover rounded border"
                      />
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="facilities">
          <Card>
            <CardHeader><CardTitle className="text-base">Facilities</CardTitle></CardHeader>
            <CardContent>
              <pre className="text-xs bg-muted/40 p-3 rounded overflow-auto max-h-[500px]">
                {JSON.stringify(s.facilities, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

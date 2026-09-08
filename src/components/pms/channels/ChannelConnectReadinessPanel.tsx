import { useMemo, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, HelpCircle, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { CHANNEL_CONNECT_SPECS, connectSpecFor } from "@/config/channelConnectRequirements";
import { gradeChannelConnect, connectSummary, type PhotoProbe } from "@/lib/channelConnectReadiness";
import { useChannelConnectFacts } from "@/hooks/useChannelConnectFacts";
import { ChannelLogo } from "@/components/pms/channels/ChannelLogo";

/**
 * Pre-flight checklist for connecting a channel.
 *
 * A channel checks its own minimum requirements the moment "Get connected" is pressed and
 * refuses with a bare eligibility message when one fails. This panel grades the same
 * requirements from ROL'OS data first, so every blocker is named — and fixable — before
 * the owner starts the connection wizard.
 */
export function ChannelConnectReadinessPanel({
  propertyId,
  onOpenSection,
}: {
  propertyId: string;
  onOpenSection?: (section: string, focusKey?: string) => void;
}) {
  const [channelKey, setChannelKey] = useState(CHANNEL_CONNECT_SPECS[0].key);
  const [expanded, setExpanded] = useState(true);
  const [probes, setProbes] = useState<Record<string, PhotoProbe>>({});
  const [probing, setProbing] = useState(false);
  const { data: listings, isLoading } = useChannelConnectFacts(propertyId);

  const spec = connectSpecFor(channelKey);

  const graded = useMemo(
    () =>
      (listings ?? []).map((facts) => {
        const withProbes = { ...facts, probes };
        const verdicts = gradeChannelConnect(spec, withProbes);
        return { facts: withProbes, verdicts, summary: connectSummary(verdicts) };
      }),
    [listings, spec, probes],
  );

  const allPhotos = useMemo(
    () => Array.from(new Set((listings ?? []).flatMap((l) => l.photos))),
    [listings],
  );

  const measurePhotos = useCallback(async () => {
    setProbing(true);
    const results = await Promise.all(
      allPhotos.map(
        (url) =>
          new Promise<PhotoProbe>((resolve) => {
            const img = new Image();
            const done = (reachable: boolean) =>
              resolve({ url, reachable, width: img.naturalWidth || 0, height: img.naturalHeight || 0 });
            img.onload = () => done(true);
            img.onerror = () => done(false);
            img.src = url;
          }),
      ),
    );
    setProbes(Object.fromEntries(results.map((r) => [r.url, r])));
    setProbing(false);
  }, [allPhotos]);

  const blockers = graded.reduce((sum, g) => sum + g.summary.failing.length, 0);
  const eligible = graded.length > 0 && blockers === 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">Before you connect a channel</CardTitle>
          <div className="flex items-center gap-2">
            {!isLoading && (
              <Badge variant={eligible ? "default" : "destructive"}>
                {eligible ? "Ready to connect" : `${blockers} to fix`}
              </Badge>
            )}
            <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Each channel checks its own minimum requirements the moment you press connect, and stops with an
          eligibility message if one is missing. Clear this list first and the connection wizard will open.
        </p>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {CHANNEL_CONNECT_SPECS.map((s) => (
              <Button
                key={s.key}
                size="sm"
                variant={s.key === channelKey ? "default" : "outline"}
                onClick={() => setChannelKey(s.key)}
                className="gap-2"
              >
                <ChannelLogo channelName={s.key} size="sm" />
                {s.label}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={measurePhotos} disabled={probing || !allPhotos.length}>
              {probing ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
              Check the photos ({allPhotos.length})
            </Button>
            <span className="text-xs text-muted-foreground">
              Confirms every photo can be downloaded and is at least {spec.minPhotoWidth} × {spec.minPhotoHeight}.
            </span>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Checking this property…</p>
          ) : (
            graded.map((g, idx) => (
              <div key={g.facts.ruListingId ?? idx} className="rounded-lg border">
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <p className="text-sm font-medium">{g.facts.listingLabel}</p>
                  <p className="text-xs text-muted-foreground">
                    {g.summary.passed}/{g.summary.total} met
                    {g.facts.ruListingId ? ` · listing ${g.facts.ruListingId}` : " · not published yet"}
                  </p>
                </div>
                <ul className="divide-y">
                  {g.verdicts.map((v) => (
                    <li key={v.id} className="flex items-start gap-3 px-3 py-2">
                      {v.status === "pass" ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      ) : v.status === "fail" ? (
                        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                      ) : (
                        <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{v.title}</p>
                        <p className="text-xs text-muted-foreground">{v.detail}</p>
                        {v.status !== "pass" && (
                          <p className="mt-1 text-xs text-muted-foreground">{v.rule}</p>
                        )}
                      </div>
                      {v.status === "fail" && onOpenSection && (
                        <Button size="sm" variant="outline" onClick={() => onOpenSection(v.section, v.focusKey)}>
                          Fix
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </CardContent>
      )}
    </Card>
  );
}

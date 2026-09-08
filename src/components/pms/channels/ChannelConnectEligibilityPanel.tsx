/**
 * Sales-channel connect scorecard.
 *
 * Read-only and non-blocking: it never gates the wizard, it only tells the operator what
 * the channel is about to refuse and takes them straight to the control. Everything is
 * measured from local ROL'OS data — the Channel Manager frame is never read or scraped.
 */

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, ArrowRight, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CONNECT_CHANNELS,
  gradeConnectEligibility,
  type ConnectChannelId,
  type ConnectFailure,
} from "@/config/channelConnectRequirements";
import type { RequirementSubject } from "@/config/propertyFieldRequirements";

interface Props {
  subject: RequirementSubject | null | undefined;
  /** Deep-link into the authoring control. Omit to hide the "Show me" buttons. */
  onShowMe?: (section: string, focusKey: string, unit?: string) => void;
  /** Staff-only rows (partner certification, channel enablement) are hidden from owners. */
  includeStaff?: boolean;
  onRecheck?: () => void;
  refreshing?: boolean;
  className?: string;
}

const FailureRow = ({
  failure,
  onShowMe,
}: {
  failure: ConnectFailure;
  onShowMe?: Props["onShowMe"];
}) => (
  <li className="rounded-md border border-border bg-card p-3">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-foreground">{failure.title}</span>
          {failure.unit ? (
            <Badge variant="outline" className="text-[11px]">
              {failure.unit}
            </Badge>
          ) : null}
          {failure.advisory ? (
            <Badge variant="secondary" className="text-[11px]">
              Recommended
            </Badge>
          ) : null}
          {failure.staffOnly ? (
            <Badge variant="secondary" className="text-[11px]">
              Our team
            </Badge>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{failure.requirement}</p>
        <p className="text-xs font-medium text-destructive">{failure.shortfall}</p>
      </div>
      {onShowMe && !failure.staffOnly ? (
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={() => onShowMe(failure.section, failure.focusKey, failure.unit)}
        >
          Show me
          <ArrowRight className="ml-1 h-3.5 w-3.5" />
        </Button>
      ) : null}
    </div>
  </li>
);

export function ChannelConnectEligibilityPanel({
  subject,
  onShowMe,
  includeStaff = false,
  onRecheck,
  refreshing = false,
  className,
}: Props) {
  const [channel, setChannel] = useState<ConnectChannelId>("all");

  const grade = useMemo(
    () => gradeConnectEligibility(channel, subject, { includeStaff }),
    [channel, subject, includeStaff],
  );

  const blocking = grade.failing.filter((f) => !f.advisory && !f.staffOnly);
  const others = grade.failing.filter((f) => f.advisory || f.staffOnly);
  const selected = CONNECT_CHANNELS.find((c) => c.id === channel);

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">What this sales channel will check</CardTitle>
          <div className="flex items-center gap-2">
            {blocking.length > 0 ? (
              <Badge variant="destructive">{blocking.length} to fix</Badge>
            ) : (
              <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Ready</Badge>
            )}
            {onRecheck ? (
              <Button size="sm" variant="ghost" onClick={onRecheck} disabled={refreshing}>
                <RefreshCw className={`mr-1 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                Re-check
              </Button>
            ) : null}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          This does not stop you connecting — it is what we can check here before the channel
          answers. Anything listed below is what the channel usually refuses on.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {CONNECT_CHANNELS.map((option) => (
            <Button
              key={option.id}
              size="sm"
              variant={option.id === channel ? "default" : "outline"}
              onClick={() => setChannel(option.id)}
            >
              {option.label}
            </Button>
          ))}
        </div>

        {selected?.help ? (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {selected.help}
          </p>
        ) : null}

        {!subject ? (
          <p className="text-sm text-muted-foreground">Loading the listing…</p>
        ) : blocking.length === 0 && others.length === 0 ? (
          <div className="flex items-start gap-2 rounded-md border border-emerald-600/40 bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Everything we can check here is in place. If the channel still refuses, the reason
              sits on their side and we will read it back for you.
            </span>
          </div>
        ) : (
          <>
            {blocking.length > 0 ? (
              <ul className="space-y-2">
                {blocking.map((failure) => (
                  <FailureRow key={failure.key} failure={failure} onShowMe={onShowMe} />
                ))}
              </ul>
            ) : (
              <div className="flex items-start gap-2 rounded-md border border-emerald-600/40 bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Nothing required is outstanding for this channel.</span>
              </div>
            )}

            {others.length > 0 ? (
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Worth adding — not a reason to be refused
                </p>
                <ul className="space-y-2">
                  {others.map((failure) => (
                    <FailureRow key={failure.key} failure={failure} onShowMe={onShowMe} />
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default ChannelConnectEligibilityPanel;

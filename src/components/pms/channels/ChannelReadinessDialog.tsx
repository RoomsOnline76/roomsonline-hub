import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ArrowRight, CheckCircle2, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { ruCheckDeepLink } from "@/config/channelRegistry";
import { getChannelLabel } from "./ChannelLogo";
import type { ChannelReadiness } from "@/hooks/useChannelReadiness";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelName: string;
  propertyId: string;
  readiness: ChannelReadiness;
}

export function ChannelReadinessDialog({ open, onOpenChange, channelName, propertyId, readiness }: Props) {
  const { failing, advisory, score, outstanding } = readiness;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{getChannelLabel(channelName)} — readiness to connect</DialogTitle>
          <DialogDescription>
            {outstanding === 0
              ? "Every mandatory distribution requirement is met. This channel can be connected."
              : `${outstanding} mandatory requirement${outstanding === 1 ? "" : "s"} still outstanding (${score}% complete). Jump straight to the field that needs attention.`}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[52vh] pr-3">
          <div className="space-y-4">
            {failing.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Must be completed
                </h4>
                {failing.map((check, i) => (
                  <div
                    key={`${check.key}-${check.unit ?? ""}-${i}`}
                    className="flex items-start gap-3 rounded-md border border-border p-3"
                  >
                    <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {check.label}
                        {check.unit && <span className="text-muted-foreground"> · {check.unit}</span>}
                      </p>
                      {check.detail && (
                        <p className="text-xs text-muted-foreground mt-0.5">{check.detail}</p>
                      )}
                      {check.fix_hint && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">{check.fix_hint}</p>
                      )}
                    </div>
                    <Button asChild size="sm" variant="outline" className="shrink-0">
                      <Link to={ruCheckDeepLink(propertyId, check.key)} onClick={() => onOpenChange(false)}>
                        Fix <ArrowRight className="h-3.5 w-3.5 ml-1" />
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {failing.length === 0 && (
              <div className="flex items-center gap-2 rounded-md border border-border p-3">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <p className="text-sm text-foreground">All mandatory requirements met.</p>
              </div>
            )}

            {advisory.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Recommended — improves channel quality
                </h4>
                {advisory.map((check, i) => (
                  <div
                    key={`adv-${check.key}-${check.unit ?? ""}-${i}`}
                    className="flex items-start gap-3 rounded-md border border-dashed border-border p-3"
                  >
                    <Badge variant="outline" className="text-[10px] shrink-0">Nice to have</Badge>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-foreground">{check.label}</p>
                      {check.detail && (
                        <p className="text-xs text-muted-foreground mt-0.5">{check.detail}</p>
                      )}
                    </div>
                    <Button asChild size="sm" variant="ghost" className="shrink-0">
                      <Link to={ruCheckDeepLink(propertyId, check.key)} onClick={() => onOpenChange(false)}>
                        Open
                      </Link>
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

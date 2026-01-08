import { ReactNode } from "react";
import { Lock, ExternalLink } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface PMSManagedFieldProps {
  children: ReactNode;
  isManaged: boolean;
  systemName?: string;
  fieldName?: string;
  dashboardUrl?: string;
  className?: string;
}

const systemDashboardUrls: Record<string, string> = {
  hostfully: 'https://platform.hostfully.com',
  benson: '',
  nightsbridge: 'https://www.nightsbridge.com',
  checkfront: '',
  cloudbeds: 'https://hotels.cloudbeds.com',
};

export function PMSManagedField({
  children,
  isManaged,
  systemName = 'PMS',
  fieldName,
  dashboardUrl,
  className,
}: PMSManagedFieldProps) {
  if (!isManaged) {
    return <>{children}</>;
  }

  const displaySystemName = systemName.charAt(0).toUpperCase() + systemName.slice(1).toLowerCase();
  const resolvedDashboardUrl = dashboardUrl || systemDashboardUrls[systemName.toLowerCase()];

  return (
    <div className={cn("relative", className)}>
      <div className="pointer-events-none opacity-60">
        {children}
      </div>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="absolute inset-0 flex items-center justify-center bg-background/50 cursor-not-allowed">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-md text-sm text-muted-foreground">
                <Lock className="h-3.5 w-3.5" />
                <span>Managed by {displaySystemName}</span>
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs">
            <div className="space-y-2">
              <p>
                {fieldName ? `"${fieldName}" is` : 'This field is'} managed by {displaySystemName}.
                Changes must be made in your {displaySystemName} dashboard.
              </p>
              {resolvedDashboardUrl && (
                <a
                  href={resolvedDashboardUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  Open {displaySystemName}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

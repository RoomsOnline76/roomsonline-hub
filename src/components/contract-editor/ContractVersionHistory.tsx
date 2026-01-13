import { format } from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Play, Eye, CheckCircle, Clock, Archive } from "lucide-react";
import { ContractTemplateVersion } from "@/hooks/useContractTemplates";

interface ContractVersionHistoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versions: ContractTemplateVersion[];
  currentVersionId: string | null;
  onSelectVersion: (versionId: string) => void;
  onActivateVersion: (versionId: string) => Promise<void>;
}

const STATUS_CONFIG = {
  draft: {
    icon: Clock,
    label: "Draft",
    variant: "secondary" as const,
  },
  active: {
    icon: CheckCircle,
    label: "Active",
    variant: "default" as const,
  },
  deprecated: {
    icon: Archive,
    label: "Deprecated",
    variant: "outline" as const,
  },
  archived: {
    icon: Archive,
    label: "Archived",
    variant: "outline" as const,
  },
};

export function ContractVersionHistory({
  open,
  onOpenChange,
  versions,
  currentVersionId,
  onSelectVersion,
  onActivateVersion,
}: ContractVersionHistoryProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[400px] sm:w-[540px]">
        <SheetHeader>
          <SheetTitle>Version History</SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-120px)] mt-6">
          <div className="space-y-4 pr-4">
            {versions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No versions yet.</p>
                <p className="text-sm">
                  Save your first draft to create version 1.
                </p>
              </div>
            ) : (
              versions.map((version) => {
                const config = STATUS_CONFIG[version.status];
                const StatusIcon = config.icon;
                const isCurrent = version.id === currentVersionId;

                return (
                  <div
                    key={version.id}
                    className={`p-4 rounded-lg border ${
                      isCurrent
                        ? "border-primary bg-primary/5"
                        : "hover:bg-muted/50"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className={`p-2 rounded-full ${
                            version.status === "active"
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : "bg-muted"
                          }`}
                        >
                          <StatusIcon className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              Version {version.version_number}
                            </span>
                            <Badge variant={config.variant}>
                              {config.label}
                            </Badge>
                            {isCurrent && (
                              <Badge variant="outline" className="text-xs">
                                Current
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Created{" "}
                            {format(new Date(version.created_at), "PPp")}
                          </p>
                          {version.activated_at && (
                            <p className="text-xs text-muted-foreground">
                              Activated{" "}
                              {format(new Date(version.activated_at), "PPp")}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2 mt-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onSelectVersion(version.id)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                      {version.status === "draft" && (
                        <Button
                          size="sm"
                          onClick={() => onActivateVersion(version.id)}
                        >
                          <Play className="h-4 w-4 mr-1" />
                          Activate
                        </Button>
                      )}
                    </div>

                    {/* Variable count summary */}
                    <div className="mt-3 text-xs text-muted-foreground">
                      {Object.keys(version.variables_schema).length} variables
                      defined
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

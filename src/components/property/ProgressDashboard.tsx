import { useNavigate, useParams } from "react-router-dom";
import { usePropertyProgress, ListingStatus, Blocker } from "@/hooks/usePropertyProgress";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { 
  CheckCircle2, 
  Circle, 
  ChevronDown, 
  ChevronRight,
  AlertTriangle,
  XCircle,
  ArrowRight,
  Sparkles,
  FileSignature,
  ClipboardList,
  Eye,
  Rocket,
  Loader2,
  RefreshCw,
  ExternalLink,
  Shield
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const STATUS_ICONS: Record<ListingStatus, React.ComponentType<any>> = {
  draft_pre_contract: Circle,
  contract_sent: FileSignature,
  contract_signed: FileSignature,
  onboarding_active: ClipboardList,
  review_pending: Eye,
  activation_ready: Sparkles,
  review_failed: AlertTriangle,
  rejected: XCircle,
  live: Rocket,
  inactive: Circle
};

interface ProgressDashboardProps {
  propertyId?: string;
  embedded?: boolean;
}

export function ProgressDashboard({ propertyId: propId, embedded = false }: ProgressDashboardProps) {
  const params = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const propertyId = propId || params.id || "";
  
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [blockersOpen, setBlockersOpen] = useState(true);
  
  const progress = usePropertyProgress(propertyId);

  // Request review mutation
  const requestReviewMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("properties")
        .update({ listing_status: 'review_pending' })
        .eq("id", propertyId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Review requested! An admin will review your property soon.");
      progress.refetch();
      queryClient.invalidateQueries({ queryKey: ['property-progress', propertyId] });
    },
    onError: (error) => {
      toast.error("Failed to request review");
      console.error(error);
    }
  });

  if (progress.isLoading) {
    return (
      <div className={cn("flex items-center justify-center", embedded ? "py-8" : "h-[60vh]")}>
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (progress.error) {
    return (
      <div className={cn("flex items-center justify-center", embedded ? "py-8" : "h-[60vh]")}>
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <XCircle className="h-12 w-12 mx-auto text-destructive mb-4" />
            <p className="text-muted-foreground">Failed to load progress data</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const content = (
    <div className="space-y-6">
      {/* Status Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Current Status Card */}
        <Card className="md:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Listing Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-2 rounded-full",
                progress.status === 'live' ? "bg-success-surface text-success" :
                progress.status === 'rejected' ? "bg-danger-surface text-destructive" :
                progress.status === 'review_pending' ? "bg-info-surface text-info" :
                "bg-warning-surface text-warning"
              )}>
                {(() => {
                  const Icon = STATUS_ICONS[progress.status];
                  return <Icon className="h-5 w-5" />;
                })()}
              </div>
              <div>
                <p className="text-lg font-semibold">{progress.completionStateDetails.label}</p>
                <p className="text-sm text-muted-foreground">
                  {progress.completionState === 'INCOMPLETE' ? 'Complete more fields to unlock activation' :
                   progress.completionState === 'REVIEWABLE' ? 'You can now request an admin review' :
                   progress.completionState === 'ELIGIBLE' ? 'Your property is eligible for activation' :
                   'Your property is showcase ready'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Score Card */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Readiness Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className={cn(
                "text-3xl font-bold",
                progress.scoreBand.label === 'ROL Platinum' || progress.scoreBand.label === 'ROL Gold' ? "text-success" :
                progress.scoreBand.label === 'ROL Silver' ? "text-warning" :
                "text-destructive"
              )}>
                {progress.score}
              </span>
              <span className="text-muted-foreground">/ 100</span>
            </div>
            <Progress 
              value={progress.score} 
              className="mt-2 h-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {progress.score >= 80 ? "Ready for review" : 
               progress.score >= 50 ? "Nearly there" : "Needs more work"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Next Action Card */}
      {progress.nextAction && progress.status !== 'live' && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-primary/10">
                  <ArrowRight className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Next Step</p>
                  <p className="text-sm text-muted-foreground">{progress.nextAction.label}</p>
                </div>
              </div>
              {progress.nextAction.stepId === 'review' ? (
                <Button 
                  size="sm"
                  onClick={() => requestReviewMutation.mutate()}
                  disabled={requestReviewMutation.isPending || !progress.canRequestReview}
                >
                  {requestReviewMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : (
                    <Eye className="h-4 w-4 mr-1" />
                  )}
                  Request Review
                </Button>
              ) : (
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => navigate(`/property-onboarding/${propertyId}`)}
                >
                  Continue Setup
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Journey Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between overflow-x-auto pb-2">
            {progress.timeline.map((step, index) => {
              const Icon = STATUS_ICONS[step.status];
              const isLast = index === progress.timeline.length - 1;
              
              return (
                <div key={step.status} className="flex items-center">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className={cn(
                          "flex flex-col items-center min-w-[60px]",
                          step.current && "scale-110"
                        )}>
                          <div className={cn(
                            "p-2 rounded-full border-2 transition-colors",
                            step.completed ? "bg-success-surface border-green-500 text-success" :
                            step.current ? "bg-primary/10 border-primary text-primary" :
                            "bg-muted border-muted-foreground/30 text-muted-foreground"
                          )}>
                            {step.completed ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : (
                              <Icon className="h-4 w-4" />
                            )}
                          </div>
                          <span className={cn(
                            "text-[10px] mt-1 text-center max-w-[60px]",
                            step.current ? "font-medium text-foreground" : "text-muted-foreground"
                          )}>
                            {step.label}
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        {step.completed ? `Completed${step.timestamp ? ` on ${new Date(step.timestamp).toLocaleDateString()}` : ''}` :
                         step.current ? 'Current stage' : 'Upcoming'}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  
                  {!isLast && (
                    <div className={cn(
                      "h-0.5 w-8 mx-1",
                      step.completed ? "bg-green-500" : "bg-muted-foreground/20"
                    )} />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Blockers & Warnings */}
      {(progress.blockers.length > 0 || progress.warnings.length > 0) && (
        <Collapsible open={blockersOpen} onOpenChange={setBlockersOpen}>
          <Card className="border-destructive/30">
            <CardHeader className="pb-2">
              <CollapsibleTrigger className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm">Issues to Resolve</CardTitle>
                  <Badge variant="destructive" className="text-[10px]">
                    {progress.blockers.length + progress.warnings.length}
                  </Badge>
                </div>
                {blockersOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </CollapsibleTrigger>
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="pt-0 space-y-2">
                {progress.blockers.map(blocker => (
                  <BlockerItem key={blocker.id} item={blocker} type="blocker" propertyId={propertyId} />
                ))}
                {progress.warnings.map(warning => (
                  <BlockerItem key={warning.id} item={warning} type="warning" propertyId={propertyId} />
                ))}
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Checklist */}
      {progress.checklistProgress.total > 0 && (
        <Collapsible open={checklistOpen} onOpenChange={setChecklistOpen}>
          <Card>
            <CardHeader className="pb-2">
              <CollapsibleTrigger className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-sm">Setup Checklist</CardTitle>
                  <Badge variant="outline" className="text-[10px]">
                    {progress.checklistProgress.completed}/{progress.checklistProgress.total}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{progress.checklistProgress.percent}%</span>
                  {checklistOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </div>
              </CollapsibleTrigger>
              <Progress value={progress.checklistProgress.percent} className="h-1.5 mt-2" />
            </CardHeader>
            <CollapsibleContent>
              <CardContent className="pt-0">
                <div className="space-y-1">
                  {progress.checklistProgress.items.map(item => (
                    <div 
                      key={item.key}
                      className="flex items-center gap-2 py-1.5 text-sm"
                    >
                      {item.completed ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      )}
                      <span className={cn(item.completed && "text-muted-foreground line-through")}>
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      {/* Actions */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate(`/property-onboarding/${propertyId}`)}
            >
              <ClipboardList className="h-4 w-4 mr-1" />
              Continue Onboarding
            </Button>
            
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => navigate(`/property/${propertyId}`)}
            >
              <ExternalLink className="h-4 w-4 mr-1" />
              Preview Listing
            </Button>
            
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => progress.refetch()}
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
            
            {progress.canRequestReview && progress.status === 'onboarding_active' && (
              <Button 
                size="sm"
                onClick={() => requestReviewMutation.mutate()}
                disabled={requestReviewMutation.isPending}
                className="ml-auto"
              >
                {requestReviewMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Shield className="h-4 w-4 mr-1" />
                )}
                Request Admin Review
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  if (embedded) {
    return content;
  }

  return (
    <AppLayout>
      <PageHeader
        title={progress.propertyName}
        subtitle="Track your property listing progress"
      />
      {content}
    </AppLayout>
  );
}

interface BlockerItemProps {
  item: Blocker;
  type: 'blocker' | 'warning';
  propertyId: string;
}

function BlockerItem({ item, type, propertyId }: BlockerItemProps) {
  const navigate = useNavigate();
  
  return (
    <div className={cn(
      "flex items-start gap-2 p-2 rounded text-sm",
      type === 'blocker' ? "bg-danger-surface dark:bg-red-950/20" : "bg-warning-surface dark:bg-amber-950/20"
    )}>
      {type === 'blocker' ? (
        <XCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
      ) : (
        <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-wrap">{item.name}</p>
        <p className="text-xs text-muted-foreground whitespace-normal break-words">{item.message}</p>
        {item.fix && (
          <p className="text-xs text-primary/80 mt-0.5 whitespace-normal break-words">{item.fix}</p>
        )}
      </div>
      {item.field && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => navigate(`/property-onboarding/${propertyId}`)}
        >
          Fix
        </Button>
      )}
    </div>
  );
}

export default ProgressDashboard;

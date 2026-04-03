import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Sheet, 
  SheetContent, 
  SheetHeader, 
  SheetTitle, 
  SheetDescription,
  SheetFooter 
} from "@/components/ui/sheet";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  ShieldCheck,
  ShieldX,
  Building2,
  User,
  Calendar,
  Clock,
  Edit,
  Eye,
  Send,
  Loader2,
  RefreshCw,
  ExternalLink,
  ChevronRight
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { QualityGateIndicator } from "./QualityGateIndicator";
import { formatDistanceToNow, format } from "date-fns";
import { useNavigate } from "react-router-dom";

interface ReviewActionPanelProps {
  propertyId: string;
  onClose: () => void;
  onComplete: () => void;
}

interface PropertyDetails {
  id: string;
  name: string;
  slug: string;
  property_type: string;
  listing_status: string;
  listing_intent: string | null;
  owner_email: string | null;
  owner_name: string | null;
  description: string | null;
  city: string | null;
  country: string | null;
  images: string[];
  created_at: string;
  updated_at: string;
}

interface ChecklistItem {
  id: string;
  phase: string;
  item_key: string;
  item_label: string;
  completed: boolean;
  auto_verified: boolean;
}

export function ReviewActionPanel({ propertyId, onClose, onComplete }: ReviewActionPanelProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rejectionReason, setRejectionReason] = useState("");
  const [fixesRequested, setFixesRequested] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Fetch property details
  const { data: property, isLoading: propertyLoading } = useQuery({
    queryKey: ["review-property", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, slug, property_type, listing_status, listing_intent, owner_email, owner_name, description, city, country, images, created_at, updated_at")
        .eq("id", propertyId)
        .single();
      
      if (error) throw error;
      return data as PropertyDetails;
    },
  });
  
  // Fetch checklist items
  const { data: checklist } = useQuery({
    queryKey: ["property-checklist", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_checklist")
        .select("id, phase, item_key, item_label, completed, auto_verified")
        .eq("property_id", propertyId)
        .order("phase", { ascending: true });
      
      if (error) throw error;
      return (data || []) as ChecklistItem[];
    },
  });
  
  // Calculate checklist progress
  const checklistProgress = checklist ? {
    total: checklist.length,
    completed: checklist.filter(c => c.completed).length,
    percentage: checklist.length > 0 
      ? Math.round((checklist.filter(c => c.completed).length / checklist.length) * 100)
      : 0
  } : null;
  
  // Handle approve action
  const handleApprove = async () => {
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('review-property', {
        body: {
          property_id: propertyId,
          action: 'approve',
          reviewer_id: user?.id,
        }
      });
      
      if (error) throw error;
      
      if (data.success) {
        toast.success("Property approved", {
          description: data.activated 
            ? "Property is now live on the website"
            : "Property is ready for activation"
        });
        onComplete();
      } else {
        toast.error("Approval failed", {
          description: data.error || "Please try again"
        });
      }
    } catch (error: any) {
      console.error('Approve error:', error);
      toast.error("Failed to approve property", {
        description: error.message
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Handle reject action
  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      toast.error("Please provide a rejection reason");
      return;
    }
    
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('review-property', {
        body: {
          property_id: propertyId,
          action: 'reject',
          reviewer_id: user?.id,
          reason: rejectionReason,
        }
      });
      
      if (error) throw error;
      
      if (data.success) {
        toast.success("Property rejected", {
          description: "Owner has been notified"
        });
        setShowRejectDialog(false);
        onComplete();
      } else {
        toast.error("Rejection failed", {
          description: data.error || "Please try again"
        });
      }
    } catch (error: any) {
      console.error('Reject error:', error);
      toast.error("Failed to reject property", {
        description: error.message
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Handle request fixes action
  const handleRequestFixes = async () => {
    if (!fixesRequested.trim()) {
      toast.error("Please describe the fixes needed");
      return;
    }
    
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('review-property', {
        body: {
          property_id: propertyId,
          action: 'request_fixes',
          reviewer_id: user?.id,
          reason: fixesRequested,
        }
      });
      
      if (error) throw error;
      
      if (data.success) {
        toast.success("Fixes requested", {
          description: "Owner has been notified and property returned to onboarding"
        });
        onComplete();
      } else {
        toast.error("Request failed", {
          description: data.error || "Please try again"
        });
      }
    } catch (error: any) {
      console.error('Request fixes error:', error);
      toast.error("Failed to request fixes", {
        description: error.message
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  // Handle override action
  const handleOverride = async () => {
    if (!overrideReason.trim()) {
      toast.error("Please provide an override reason");
      return;
    }
    
    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('review-property', {
        body: {
          property_id: propertyId,
          action: 'override',
          reviewer_id: user?.id,
          reason: overrideReason,
        }
      });
      
      if (error) throw error;
      
      if (data.success) {
        toast.success("Override applied", {
          description: "Property is now ready for activation"
        });
        setShowOverrideDialog(false);
        onComplete();
      } else {
        toast.error("Override failed", {
          description: data.error || "Please try again"
        });
      }
    } catch (error: any) {
      console.error('Override error:', error);
      toast.error("Failed to override", {
        description: error.message
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  if (propertyLoading) {
    return (
      <Sheet open onOpenChange={() => onClose()}>
        <SheetContent className="w-[500px] sm:max-w-[500px]">
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </SheetContent>
      </Sheet>
    );
  }
  
  if (!property) {
    return null;
  }
  
  const statusBadgeColor = {
    review_pending: 'bg-orange-500',
    activation_ready: 'bg-green-500',
    review_failed: 'bg-red-500',
    rejected: 'bg-red-600',
    onboarding_active: 'bg-yellow-500',
  }[property.listing_status] || 'bg-gray-500';
  
  return (
    <>
      <Sheet open onOpenChange={() => onClose()}>
        <SheetContent className="w-[500px] sm:max-w-[500px] p-0 flex flex-col">
          <SheetHeader className="p-4 border-b">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
                {property.images && property.images.length > 0 ? (
                  <img 
                    src={property.images[0]} 
                    alt={property.name} 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Building2 className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <SheetTitle className="text-base truncate">{property.name}</SheetTitle>
                <SheetDescription className="flex items-center gap-2 mt-1">
                  <Badge 
                    variant="secondary" 
                    className={`text-xs text-white ${statusBadgeColor}`}
                  >
                    {property.listing_status?.replace(/_/g, ' ')}
                  </Badge>
                  {property.listing_intent && (
                    <Badge variant="outline" className="text-xs capitalize">
                      {property.listing_intent}
                    </Badge>
                  )}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
          
          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              {/* Property Info */}
              <Card>
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{property.owner_name || 'No owner name'}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground text-xs">{property.owner_email}</span>
                  </div>
                  
                  {(property.city || property.country) && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Building2 className="h-4 w-4" />
                      <span>{[property.city, property.country].filter(Boolean).join(', ')}</span>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Created {format(new Date(property.created_at), 'MMM d, yyyy')}</span>
                    <span>·</span>
                    <Clock className="h-3.5 w-3.5" />
                    <span>Updated {formatDistanceToNow(new Date(property.updated_at), { addSuffix: true })}</span>
                  </div>
                </CardContent>
              </Card>
              
              {/* Quality Gate */}
              <Card>
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" />
                    Quality Gate
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  <QualityGateIndicator propertyId={propertyId} />
                </CardContent>
              </Card>
              
              {/* Checklist Progress */}
              {checklistProgress && checklistProgress.total > 0 && (
                <Card>
                  <CardHeader className="p-3 pb-2">
                    <CardTitle className="text-sm flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" />
                        Onboarding Checklist
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {checklistProgress.completed}/{checklistProgress.total}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <div className="w-full bg-muted rounded-full h-2 mb-3">
                      <div 
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{ width: `${checklistProgress.percentage}%` }}
                      />
                    </div>
                    
                    <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                      {checklist?.map((item) => (
                        <div 
                          key={item.id}
                          className={`flex items-center gap-2 text-xs p-1.5 rounded ${
                            item.completed ? 'text-muted-foreground' : 'text-foreground'
                          }`}
                        >
                          {item.completed ? (
                            <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                          ) : (
                            <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground flex-shrink-0" />
                          )}
                          <span className={item.completed ? 'line-through' : ''}>
                            {item.item_label}
                          </span>
                          {item.auto_verified && (
                            <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                              Auto
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {/* Quick Actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => navigate(`/admin/properties/${property.slug || property.id}`)}
                >
                  <Edit className="h-3.5 w-3.5 mr-1" />
                  Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => window.open(`/property/${property.slug || property.id}`, '_blank')}
                >
                  <Eye className="h-3.5 w-3.5 mr-1" />
                  Preview
                </Button>
              </div>
              
              <Separator />
              
              {/* Request Fixes */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Request Fixes</Label>
                <Textarea
                  placeholder="Describe what needs to be fixed before this property can be approved..."
                  value={fixesRequested}
                  onChange={(e) => setFixesRequested(e.target.value)}
                  className="text-xs min-h-[80px]"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={handleRequestFixes}
                  disabled={isSubmitting || !fixesRequested.trim()}
                >
                  {isSubmitting ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5 mr-1" />
                  )}
                  Send to Owner
                </Button>
              </div>
            </div>
          </ScrollArea>
          
          <SheetFooter className="p-4 border-t bg-muted/50">
            <div className="flex gap-2 w-full">
              <Button
                variant="destructive"
                size="sm"
                className="flex-1"
                onClick={() => setShowRejectDialog(true)}
                disabled={isSubmitting}
              >
                <XCircle className="h-3.5 w-3.5 mr-1" />
                Reject
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowOverrideDialog(true)}
                disabled={isSubmitting}
              >
                <AlertTriangle className="h-3.5 w-3.5 mr-1" />
                Override
              </Button>
              
              <Button
                variant="default"
                size="sm"
                className="flex-1"
                onClick={handleApprove}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <CheckCircle className="h-3.5 w-3.5 mr-1" />
                )}
                Approve
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      
      {/* Reject Dialog */}
      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Property</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently reject the property application. The owner will be notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="py-2">
            <Label className="text-sm">Rejection Reason</Label>
            <Textarea
              placeholder="Explain why this property is being rejected..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              className="mt-2 text-xs"
            />
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleReject();
              }}
              disabled={isSubmitting || !rejectionReason.trim()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4 mr-1" />
              )}
              Reject Property
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Override Dialog */}
      <AlertDialog open={showOverrideDialog} onOpenChange={setShowOverrideDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Admin Override
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will bypass quality gate requirements and mark the property as ready for activation. 
              Use this only when you've manually verified the property meets requirements.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="py-2">
            <Label className="text-sm">Override Reason (Required)</Label>
            <Textarea
              placeholder="Explain why you're overriding the quality gate..."
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              className="mt-2"
            />
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleOverride();
              }}
              disabled={isSubmitting || !overrideReason.trim()}
              className="bg-yellow-600 text-white hover:bg-yellow-700"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4 mr-1" />
              )}
              Apply Override
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

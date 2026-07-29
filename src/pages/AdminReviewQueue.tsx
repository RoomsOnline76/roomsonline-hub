import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  ClipboardCheck, 
  Building2, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Eye,
  Edit,
  ChevronRight,
  Search,
  Filter,
  Loader2,
  ShieldCheck,
  ShieldX,
  RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ReviewActionPanel } from "@/components/property/ReviewActionPanel";
import { QualityGateIndicator } from "@/components/property/QualityGateIndicator";
import { formatDistanceToNow } from "date-fns";

type ListingStatus = 
  | 'draft_pre_contract' 
  | 'contract_sent' 
  | 'contract_signed' 
  | 'onboarding_active' 
  | 'review_pending' 
  | 'activation_ready' 
  | 'review_failed'
  | 'rejected'
  | 'live' 
  | 'inactive';

interface PropertyForReview {
  id: string;
  name: string;
  slug: string;
  property_type: string;
  listing_status: ListingStatus;
  listing_intent: string | null;
  owner_email: string | null;
  owner_name: string | null;
  created_at: string;
  updated_at: string;
  images: string[];
  onboarding_score?: number;
}

const STATUS_CONFIG: Record<ListingStatus, { label: string; color: string; icon: React.ComponentType<any> }> = {
  draft_pre_contract: { label: 'Draft', color: 'bg-gray-500', icon: Clock },
  contract_sent: { label: 'Contract Sent', color: 'bg-blue-500', icon: Clock },
  contract_signed: { label: 'Contract Signed', color: 'bg-indigo-500', icon: CheckCircle },
  onboarding_active: { label: 'Onboarding', color: 'bg-yellow-500', icon: RefreshCw },
  review_pending: { label: 'Pending Review', color: 'bg-orange-500', icon: ClipboardCheck },
  activation_ready: { label: 'Ready to Activate', color: 'bg-green-500', icon: ShieldCheck },
  review_failed: { label: 'Review Failed', color: 'bg-red-500', icon: ShieldX },
  rejected: { label: 'Rejected', color: 'bg-red-600', icon: XCircle },
  live: { label: 'Live', color: 'bg-emerald-500', icon: CheckCircle },
  inactive: { label: 'Inactive', color: 'bg-gray-400', icon: XCircle },
};

export default function AdminReviewQueue() {
  const navigate = useNavigate();
  const { user, isAdmin, isDev } = useAuth();
  const queryClient = useQueryClient();
  
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [intentFilter, setIntentFilter] = useState<string>("all");
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  
  // Status groupings — kept in one place so cards, filters and counts agree.
  const STATUS_GROUPS = {
    pending: ['review_pending'] as ListingStatus[],
    ready: ['activation_ready'] as ListingStatus[],
    attention: ['review_failed', 'rejected'] as ListingStatus[],
    onboarding: ['draft_pre_contract', 'contract_sent', 'contract_signed', 'onboarding_active'] as ListingStatus[],
  };
  const QUEUE_STATUSES: ListingStatus[] = [
    ...STATUS_GROUPS.pending,
    ...STATUS_GROUPS.ready,
    ...STATUS_GROUPS.attention,
    ...STATUS_GROUPS.onboarding,
  ];

  const includeInactive = statusFilter === 'inactive';

  // Fetch properties for review
  const { data: properties, isLoading, isFetching, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["review-queue-properties", includeInactive],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, slug, property_type, listing_status, listing_intent, owner_email, owner_name, created_at, updated_at, images")
        .is("permanently_deleted_at", null)
        .eq("is_active", true)
        .in("listing_status", includeInactive ? ['inactive' as ListingStatus] : QUEUE_STATUSES)
        .order("updated_at", { ascending: false });
      
      if (error) throw error;
      return (data || []) as PropertyForReview[];
    },
    enabled: isAdmin || isDev,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });
  
  // Filtered properties
  const filteredProperties = useMemo(() => {
    if (!properties) return [];
    
    return properties.filter(p => {
      // Search filter - searches all visible columns
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = p.name?.toLowerCase().includes(query);
        const matchesOwner = p.owner_name?.toLowerCase().includes(query) || p.owner_email?.toLowerCase().includes(query);
        const statusConfig = STATUS_CONFIG[p.listing_status];
        const matchesStatus = statusConfig?.label.toLowerCase().includes(query);
        const matchesIntent = p.listing_intent?.toLowerCase().includes(query);
        const matchesPropertyType = p.property_type?.toLowerCase().includes(query);
        const matchesUpdated = formatDistanceToNow(new Date(p.updated_at), { addSuffix: true }).toLowerCase().includes(query);
        
        if (!matchesName && !matchesOwner && !matchesStatus && !matchesIntent && !matchesPropertyType && !matchesUpdated) return false;
      }
      
      // Status filter (group keys filter to a set of statuses)
      if (statusFilter !== "all" && statusFilter !== "inactive") {
        const group = STATUS_GROUPS[statusFilter as keyof typeof STATUS_GROUPS];
        if (group) {
          if (!group.includes(p.listing_status)) return false;
        } else if (p.listing_status !== statusFilter) {
          return false;
        }
      }
      
      // Intent filter
      if (intentFilter !== "all" && p.listing_intent !== intentFilter) return false;
      
      return true;
    });
  }, [properties, searchQuery, statusFilter, intentFilter]);
  
  // Counts always reflect the full queue, never the active filters
  const counts = useMemo(() => {
    const all = properties || [];
    const inGroup = (g: ListingStatus[]) => all.filter(p => g.includes(p.listing_status)).length;
    return {
      total: all.length,
      pending: inGroup(STATUS_GROUPS.pending),
      ready: inGroup(STATUS_GROUPS.ready),
      attention: inGroup(STATUS_GROUPS.attention),
      onboarding: inGroup(STATUS_GROUPS.onboarding),
    };
  }, [properties]);

  const handleRefresh = async () => {
    // Quality scores are cached per property for 30s — clear them too.
    queryClient.invalidateQueries({ queryKey: ["activation-readiness"] });
    const res = await refetch();
    toast.success(`Queue refreshed — ${res.data?.length ?? 0} properties`);
  };

  
  const handleReviewComplete = () => {
    refetch();
    setSelectedPropertyId(null);
  };
  
  const getInitials = (name: string | null, email: string | null) => {
    if (name) {
      return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    }
    if (email) {
      return email.substring(0, 2).toUpperCase();
    }
    return '??';
  };
  
  const renderPropertyRow = (property: PropertyForReview) => {
    const statusConfig = STATUS_CONFIG[property.listing_status] || STATUS_CONFIG.draft_pre_contract;
    const StatusIcon = statusConfig.icon;
    
    return (
      <TableRow key={property.id} className="group hover:bg-muted/50">
        <TableCell className="py-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md overflow-hidden bg-muted flex items-center justify-center">
              {property.images && property.images.length > 0 ? (
                <img 
                  src={property.images[0]} 
                  alt={property.name} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <Building2 className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div>
              <p className="font-medium text-sm">{property.name}</p>
              <p className="text-xs text-muted-foreground">{property.property_type || 'Not specified'}</p>
            </div>
          </div>
        </TableCell>
        
        <TableCell className="py-2">
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-[10px]">
                {getInitials(property.owner_name, property.owner_email)}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="text-xs font-medium">{property.owner_name || 'No name'}</p>
              <p className="text-[10px] text-muted-foreground">{property.owner_email || 'No email'}</p>
            </div>
          </div>
        </TableCell>
        
        <TableCell className="py-2">
          <Badge variant="outline" className="text-xs capitalize">
            {property.listing_intent || 'Not set'}
          </Badge>
        </TableCell>
        
        <TableCell className="py-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge 
                  variant="secondary" 
                  className={`text-xs text-white ${statusConfig.color}`}
                >
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {statusConfig.label}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                Updated {formatDistanceToNow(new Date(property.updated_at), { addSuffix: true })}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </TableCell>
        
        <TableCell className="py-2">
          <QualityGateIndicator propertyId={property.id} compact />
        </TableCell>
        
        <TableCell className="py-2 text-right">
          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => navigate(`/property/${property.slug || property.id}`)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>View Showcase</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => navigate(`/admin/properties/${property.slug || property.id}`)}
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit Property</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            <Button
              variant="default"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setSelectedPropertyId(property.id)}
            >
              Review
              <ChevronRight className="h-3 w-3 ml-1" />
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  };
  
  if (!isAdmin && !isDev) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[60vh]">
          <Card className="max-w-md">
            <CardContent className="pt-6 text-center">
              <ShieldX className="h-12 w-12 mx-auto text-destructive mb-4" />
              <h2 className="text-lg font-semibold mb-2">Access Denied</h2>
              <p className="text-muted-foreground text-sm">
                You don't have permission to access the review queue.
              </p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }
  
  return (
    <AppLayout>
      <PageHeader
        title="Property Review Queue"
        subtitle="Review and approve properties for activation"
        actions={
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {dataUpdatedAt ? `Updated ${formatDistanceToNow(new Date(dataUpdatedAt), { addSuffix: true })}` : ""}
            </span>
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        }

      />
      
      {/* Filters */}
      <Card className="mb-4">
        <CardContent className="py-3">
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search all columns..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px] h-8 text-sm">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="review_pending">Pending Review</SelectItem>
                <SelectItem value="activation_ready">Ready to Activate</SelectItem>
                <SelectItem value="review_failed">Review Failed</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="onboarding_active">In Onboarding</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={intentFilter} onValueChange={setIntentFilter}>
              <SelectTrigger className="w-[140px] h-8 text-sm">
                <SelectValue placeholder="All Intents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Intents</SelectItem>
                <SelectItem value="accommodation">Accommodation</SelectItem>
                <SelectItem value="venue">Venue</SelectItem>
                <SelectItem value="hybrid">Hybrid</SelectItem>
                <SelectItem value="experience">Experience</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      
      {/* Status Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Pending Review</p>
                <p className="text-2xl font-bold text-orange-600">{pendingReview.length}</p>
              </div>
              <ClipboardCheck className="h-8 w-8 text-orange-400" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Ready to Activate</p>
                <p className="text-2xl font-bold text-green-600">{readyToActivate.length}</p>
              </div>
              <ShieldCheck className="h-8 w-8 text-green-400" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Needs Attention</p>
                <p className="text-2xl font-bold text-red-600">{needsAttention.length}</p>
              </div>
              <AlertTriangle className="h-8 w-8 text-red-400" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">In Onboarding</p>
                <p className="text-2xl font-bold text-yellow-600">{inOnboarding.length}</p>
              </div>
              <RefreshCw className="h-8 w-8 text-yellow-400" />
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Properties Table */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm">Properties ({filteredProperties.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filteredProperties.length === 0 ? (
            <div className="text-center py-12">
              <ClipboardCheck className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <h3 className="text-sm font-medium mb-1">No Properties to Review</h3>
              <p className="text-xs text-muted-foreground">
                {searchQuery || statusFilter !== "all" || intentFilter !== "all" 
                  ? "Try adjusting your filters"
                  : "All properties have been reviewed"}
              </p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="h-9">
                  <TableHead className="text-xs">Property</TableHead>
                  <TableHead className="text-xs">Owner</TableHead>
                  <TableHead className="text-xs">Intent</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Quality</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProperties.map(renderPropertyRow)}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      
      {/* Review Action Panel (Slide-over) */}
      {selectedPropertyId && (
        <ReviewActionPanel
          propertyId={selectedPropertyId}
          onClose={() => setSelectedPropertyId(null)}
          onComplete={handleReviewComplete}
        />
      )}
    </AppLayout>
  );
}

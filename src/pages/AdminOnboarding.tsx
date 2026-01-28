import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, addDays, isBefore } from "date-fns";
import {
  Search,
  Plus,
  MoreHorizontal,
  Send,
  Copy,
  Clock,
  Check,
  AlertCircle,
  ExternalLink,
  Building2,
  RefreshCw,
  XCircle,
  CalendarPlus,
  Circle,
  Globe,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";

// Types
type OnboardingStatus = 
  | "not_started"
  | "in_progress"
  | "token_expired"
  | "completed"
  | "live";

interface TokenData {
  id: string;
  token: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
  owner_email: string;
  property_id: string;
}

interface PropertyData {
  id: string;
  name: string;
  owner_email: string | null;
  listing_status: string | null;
  show_on_website: boolean;
  amenities: Record<string, unknown> | null;
  description: string | null;
  short_description: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  price_per_night: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  images: string[] | null;
  hero_video_url: string | null;
}

interface PropertyOnboardingRow {
  id: string;
  name: string;
  owner_email: string | null;
  listing_status: string | null;
  show_on_website: boolean;
  onboarding_score: number;
  fieldCompletionScore: number;
  effectiveProgress: number;
  token: TokenData | null;
}

// Calculate field completion percentage based on key property fields
const calculateFieldCompletion = (prop: PropertyData): number => {
  const amenities = prop.amenities || {};
  
  const fields = [
    { filled: !!prop.name, weight: 1 },
    { filled: !!prop.description, weight: 2 },
    { filled: !!prop.short_description, weight: 1 },
    { filled: !!prop.owner_email, weight: 1 },
    { filled: !!prop.address, weight: 1 },
    { filled: !!prop.city, weight: 1 },
    { filled: !!prop.country, weight: 1 },
    { filled: prop.price_per_night !== null && prop.price_per_night > 0, weight: 2 },
    { filled: prop.bedrooms !== null && prop.bedrooms > 0, weight: 1 },
    { filled: prop.bathrooms !== null && prop.bathrooms > 0, weight: 1 },
    { filled: Array.isArray(prop.images) && prop.images.length > 0, weight: 2 },
    { filled: !!prop.hero_video_url || !!(amenities as Record<string, unknown>).hero_image_url, weight: 2 },
    { filled: !!(amenities as Record<string, unknown>).check_in_time, weight: 1 },
    { filled: !!(amenities as Record<string, unknown>).check_out_time, weight: 1 },
    { filled: !!(amenities as Record<string, unknown>).cancellation_policy, weight: 1 },
    // Check amenities for additional required fields
    { filled: !!(amenities as Record<string, unknown>).telephone || !!((amenities as Record<string, unknown>).contact as Record<string, unknown>)?.telephone, weight: 1 },
  ];

  const totalWeight = fields.reduce((sum, f) => sum + f.weight, 0);
  const filledWeight = fields.reduce((sum, f) => sum + (f.filled ? f.weight : 0), 0);
  
  return Math.round((filledWeight / totalWeight) * 100);
};

type StatusFilter = "all" | OnboardingStatus;

// Helper function to derive onboarding status
const getOnboardingStatus = (row: PropertyOnboardingRow): OnboardingStatus => {
  if (row.show_on_website) return "live";
  if (!row.token) return "not_started";
  if (row.token.used_at) return "completed";
  if (isBefore(new Date(row.token.expires_at), new Date())) return "token_expired";
  return "in_progress";
};

// Status Badge Component
const StatusBadge = ({ status }: { status: OnboardingStatus }) => {
  switch (status) {
    case "not_started":
      return (
        <Badge variant="outline" className="gap-1">
          <Circle className="h-3 w-3" />
          Not Started
        </Badge>
      );
    case "in_progress":
      return (
        <Badge variant="outline" className="gap-1 border-amber-500 text-amber-600">
          <Clock className="h-3 w-3" />
          In Progress
        </Badge>
      );
    case "token_expired":
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          Expired
        </Badge>
      );
    case "completed":
      return (
        <Badge variant="default" className="gap-1">
          <Check className="h-3 w-3" />
          Completed
        </Badge>
      );
    case "live":
      return (
        <Badge className="gap-1 bg-emerald-500 text-white border-emerald-500">
          <Globe className="h-3 w-3" />
          Live
        </Badge>
      );
  }
};

export default function AdminOnboarding() {
  const navigate = useNavigate();
  const [propertyRows, setPropertyRows] = useState<PropertyOnboardingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showCompleted, setShowCompleted] = useState(false);

  // Send modal state
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [sendEmail, setSendEmail] = useState("");
  const [sending, setSending] = useState(false);

  // Extend modal state
  const [extendModalOpen, setExtendModalOpen] = useState(false);
  const [extendRow, setExtendRow] = useState<PropertyOnboardingRow | null>(null);
  const [extendDays, setExtendDays] = useState("30");
  const [extending, setExtending] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load all properties (non-deleted) with fields needed for completion calculation
      const { data: propData, error: propError } = await supabase
        .from("properties")
        .select("id, name, owner_email, listing_status, show_on_website, amenities, description, short_description, address, city, country, price_per_night, bedrooms, bathrooms, images, hero_video_url")
        .is("permanently_deleted_at", null)
        .order("created_at", { ascending: false });

      if (propError) throw propError;

      // Load all tokens (to map to properties)
      const { data: tokenData, error: tokenError } = await supabase
        .from("property_onboarding_tokens")
        .select("*")
        .order("created_at", { ascending: false });

      if (tokenError) throw tokenError;

      // Build property-centric view - use most recent token per property
      const tokensByProperty = new Map<string, TokenData>();
      tokenData?.forEach((t) => {
        // Only set if not already set (first one is most recent due to order)
        if (!tokensByProperty.has(t.property_id)) {
          tokensByProperty.set(t.property_id, t);
        }
      });

      const enrichedProperties: PropertyOnboardingRow[] = (propData || []).map((prop) => {
        const amenities = prop.amenities as Record<string, unknown> | null;
        const onboardingScore = typeof amenities?.onboarding_score === "number" 
          ? amenities.onboarding_score 
          : 0;
        
        // Calculate field completion from property data
        const fieldCompletionScore = calculateFieldCompletion({
          id: prop.id,
          name: prop.name,
          owner_email: prop.owner_email,
          listing_status: prop.listing_status,
          show_on_website: prop.show_on_website || false,
          amenities,
          description: prop.description,
          short_description: prop.short_description,
          address: prop.address,
          city: prop.city,
          country: prop.country,
          price_per_night: prop.price_per_night,
          bedrooms: prop.bedrooms,
          bathrooms: prop.bathrooms,
          images: prop.images as string[] | null,
          hero_video_url: prop.hero_video_url,
        });
        
        // Use the higher of wizard score or field completion
        const effectiveProgress = Math.max(onboardingScore, fieldCompletionScore);
        
        return {
          id: prop.id,
          name: prop.name,
          owner_email: prop.owner_email,
          listing_status: prop.listing_status,
          show_on_website: prop.show_on_website || false,
          onboarding_score: onboardingScore,
          fieldCompletionScore,
          effectiveProgress,
          token: tokensByProperty.get(prop.id) || null,
        };
      });

      setPropertyRows(enrichedProperties);
    } catch (error: any) {
      toast.error(error.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  // Filtered properties based on search, status filter, and show completed toggle
  const filteredProperties = useMemo(() => {
    let result = propertyRows;

    // Hide completed/live unless toggle is on
    if (!showCompleted) {
      result = result.filter((r) => {
        const status = getOnboardingStatus(r);
        return status !== "completed" && status !== "live";
      });
    }

    // Status filter
    if (statusFilter !== "all") {
      result = result.filter((r) => getOnboardingStatus(r) === statusFilter);
    }

    // Search filter (cross-column)
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((r) => {
        const status = getOnboardingStatus(r);
        const tokenSentDate = r.token 
          ? format(new Date(r.token.created_at), "MMM d, yyyy").toLowerCase() 
          : "";
        const progressStr = String(r.onboarding_score || 0);

        return (
          r.name.toLowerCase().includes(query) ||
          r.owner_email?.toLowerCase().includes(query) ||
          status.replace("_", " ").includes(query) ||
          tokenSentDate.includes(query) ||
          progressStr.includes(query)
        );
      });
    }

    return result;
  }, [propertyRows, showCompleted, statusFilter, searchQuery]);

  // Stats calculated from all properties (not filtered)
  const stats = useMemo(() => ({
    total: propertyRows.length,
    notStarted: propertyRows.filter((r) => getOnboardingStatus(r) === "not_started").length,
    inProgress: propertyRows.filter((r) => getOnboardingStatus(r) === "in_progress").length,
    expired: propertyRows.filter((r) => getOnboardingStatus(r) === "token_expired").length,
    completed: propertyRows.filter((r) => getOnboardingStatus(r) === "completed").length,
    live: propertyRows.filter((r) => getOnboardingStatus(r) === "live").length,
  }), [propertyRows]);

  const handleSendOnboarding = async () => {
    if (!selectedPropertyId || !sendEmail) {
      toast.error("Property and email are required");
      return;
    }

    try {
      setSending(true);
      const { error } = await supabase.functions.invoke("send-onboarding-email", {
        body: { property_id: selectedPropertyId, owner_email: sendEmail },
      });

      if (error) throw error;

      toast.success("Onboarding email sent successfully");
      setSendModalOpen(false);
      setSelectedPropertyId("");
      setSendEmail("");
      loadData();
    } catch (error: any) {
      toast.error(error.message || "Failed to send onboarding email");
    } finally {
      setSending(false);
    }
  };

  const handleIssueToken = (row: PropertyOnboardingRow) => {
    setSelectedPropertyId(row.id);
    setSendEmail(row.owner_email || "");
    setSendModalOpen(true);
  };

  const handleResendOnboarding = async (row: PropertyOnboardingRow) => {
    if (!row.owner_email) {
      toast.error("No owner email configured for this property");
      return;
    }

    try {
      const { error } = await supabase.functions.invoke("send-onboarding-email", {
        body: { property_id: row.id, owner_email: row.owner_email },
      });

      if (error) throw error;
      toast.success("Onboarding email sent successfully");
      loadData();
    } catch (error: any) {
      toast.error(error.message || "Failed to send onboarding email");
    }
  };

  const handleCopyLink = (row: PropertyOnboardingRow) => {
    if (!row.token) {
      toast.error("No token exists for this property");
      return;
    }
    const link = `${window.location.origin}/onboarding/${row.token.token}`;
    navigator.clipboard.writeText(link);
    toast.success("Link copied to clipboard");
  };

  const handleInvalidateToken = async (row: PropertyOnboardingRow) => {
    if (!row.token) return;

    try {
      const { error } = await supabase
        .from("property_onboarding_tokens")
        .update({ expires_at: new Date().toISOString() })
        .eq("id", row.token.id);

      if (error) throw error;
      toast.success("Token invalidated");
      loadData();
    } catch (error: any) {
      toast.error(error.message || "Failed to invalidate token");
    }
  };

  const handleExtendToken = async () => {
    if (!extendRow?.token) return;

    try {
      setExtending(true);
      const newExpiry = addDays(new Date(), parseInt(extendDays));

      const { error } = await supabase
        .from("property_onboarding_tokens")
        .update({ expires_at: newExpiry.toISOString() })
        .eq("id", extendRow.token.id);

      if (error) throw error;

      toast.success("Token expiry extended");
      setExtendModalOpen(false);
      setExtendRow(null);
      loadData();
    } catch (error: any) {
      toast.error(error.message || "Failed to extend token");
    } finally {
      setExtending(false);
    }
  };

  const statusFilters: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "not_started", label: "Not Started" },
    { key: "in_progress", label: "In Progress" },
    { key: "token_expired", label: "Expired" },
    { key: "completed", label: "Completed" },
    { key: "live", label: "Live" },
  ];

  return (
    <AppLayout>
      <PageHeader
        title="Onboarding Management"
        subtitle="Track and manage property onboarding across all lifecycle stages"
        actions={
          <Button onClick={() => setSendModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Send Onboarding
          </Button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 xl:gap-6 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Not Started</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-muted-foreground">{stats.notStarted}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{stats.inProgress}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Expired</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{stats.expired}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-primary">{stats.completed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Live</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-emerald-600">{stats.live}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search properties, emails, status..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {statusFilters.map((filter) => (
            <Button
              key={filter.key}
              variant={statusFilter === filter.key ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(filter.key)}
            >
              {filter.label}
            </Button>
          ))}
          <div className="flex items-center gap-2 ml-4 pl-4 border-l border-border">
            <Switch
              id="show-completed"
              checked={showCompleted}
              onCheckedChange={setShowCompleted}
            />
            <Label htmlFor="show-completed" className="text-sm text-muted-foreground whitespace-nowrap">
              Show Completed & Live
            </Label>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="border border-border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Property</TableHead>
              <TableHead>Owner Email</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Progress</TableHead>
              <TableHead>Token Sent</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Loading properties...
                </TableCell>
              </TableRow>
            ) : filteredProperties.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  {propertyRows.length === 0 
                    ? "No properties found" 
                    : showCompleted 
                      ? "No properties match your filters"
                      : "No active onboarding. Toggle 'Show Completed & Live' to see all."}
                </TableCell>
              </TableRow>
            ) : (
              filteredProperties.map((row) => {
                const status = getOnboardingStatus(row);
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <button
                        onClick={() => navigate(`/admin/properties/${row.id}`)}
                        className="font-medium hover:text-primary hover:underline text-left"
                      >
                        {row.name}
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.owner_email || <span className="italic">Not set</span>}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={status} />
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2 min-w-32">
                        <Progress value={row.effectiveProgress} className="h-2" />
                        <span className="text-sm text-muted-foreground w-10">
                          {row.effectiveProgress}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {row.token 
                        ? format(new Date(row.token.created_at), "MMM d, yyyy")
                        : <span className="text-muted-foreground">Never</span>}
                    </TableCell>
                    <TableCell>
                      {row.token ? (
                        <span className={isBefore(new Date(row.token.expires_at), new Date()) ? "text-destructive" : ""}>
                          {format(new Date(row.token.expires_at), "MMM d, yyyy")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="bg-popover">
                          {/* Issue/Resend token based on status */}
                          {status === "not_started" ? (
                            <DropdownMenuItem onClick={() => handleIssueToken(row)}>
                              <Send className="h-4 w-4 mr-2" />
                              Issue Onboarding Token
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => handleResendOnboarding(row)}>
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Re-issue Token
                            </DropdownMenuItem>
                          )}

                          {/* Copy link (only if token exists) */}
                          {row.token && (
                            <DropdownMenuItem onClick={() => handleCopyLink(row)}>
                              <Copy className="h-4 w-4 mr-2" />
                              Copy Link
                            </DropdownMenuItem>
                          )}

                          {/* Extend expiry (only for active/expired tokens) */}
                          {row.token && (status === "in_progress" || status === "token_expired") && (
                            <DropdownMenuItem
                              onClick={() => {
                                setExtendRow(row);
                                setExtendModalOpen(true);
                              }}
                            >
                              <CalendarPlus className="h-4 w-4 mr-2" />
                              Extend Expiry
                            </DropdownMenuItem>
                          )}

                          <DropdownMenuItem onClick={() => navigate(`/admin/properties/${row.id}`)}>
                            <Building2 className="h-4 w-4 mr-2" />
                            View Property
                          </DropdownMenuItem>

                          {row.token && (
                            <DropdownMenuItem asChild>
                              <a
                                href={`/admin/audit?table_name=property_onboarding_tokens&search_text=${row.owner_email || row.name}`}
                                target="_blank"
                              >
                                <ExternalLink className="h-4 w-4 mr-2" />
                                Audit Trail
                              </a>
                            </DropdownMenuItem>
                          )}

                          {/* Invalidate (only for active tokens) */}
                          {status === "in_progress" && row.token && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => handleInvalidateToken(row)}
                              >
                                <XCircle className="h-4 w-4 mr-2" />
                                Invalidate Token
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Send Onboarding Modal */}
      <Dialog open={sendModalOpen} onOpenChange={setSendModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Onboarding Invitation</DialogTitle>
            <DialogDescription>
              Send an onboarding invitation to a property owner. They will receive an email with a link to complete the wizard.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="property">Property *</Label>
              <Select
                value={selectedPropertyId}
                onValueChange={(value) => {
                  setSelectedPropertyId(value);
                  const prop = propertyRows.find((p) => p.id === value);
                  if (prop?.owner_email) {
                    setSendEmail(prop.owner_email);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select a property" />
                </SelectTrigger>
                <SelectContent>
                  {propertyRows.map((prop) => (
                    <SelectItem key={prop.id} value={prop.id}>
                      {prop.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Owner Email *</Label>
              <Input
                id="email"
                type="email"
                placeholder="owner@example.com"
                value={sendEmail}
                onChange={(e) => setSendEmail(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSendOnboarding} disabled={sending || !selectedPropertyId || !sendEmail}>
              {sending ? "Sending..." : "Send Invitation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extend Token Modal */}
      <Dialog open={extendModalOpen} onOpenChange={setExtendModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend Token Expiry</DialogTitle>
            <DialogDescription>
              Extend the expiry date for the onboarding token.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Property</Label>
              <p className="text-sm text-muted-foreground">{extendRow?.name}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="days">Extend by</Label>
              <Select value={extendDays} onValueChange={setExtendDays}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="60">60 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExtendModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleExtendToken} disabled={extending}>
              {extending ? "Extending..." : "Extend Expiry"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

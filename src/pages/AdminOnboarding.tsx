import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
import { format, isAfter, isBefore, addDays } from "date-fns";
import {
  Search,
  Plus,
  MoreHorizontal,
  Send,
  Copy,
  Link,
  Clock,
  Check,
  AlertCircle,
  ExternalLink,
  Sparkles,
  Building2,
  RefreshCw,
  XCircle,
  CalendarPlus,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";

interface OnboardingToken {
  id: string;
  property_id: string;
  owner_email: string;
  token: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  created_by: string | null;
  property_name?: string;
  onboarding_score?: number;
}

interface Property {
  id: string;
  name: string;
  owner_email: string | null;
  amenities: any;
}

type StatusFilter = "all" | "active" | "expired" | "used";

export default function AdminOnboarding() {
  const navigate = useNavigate();
  const [tokens, setTokens] = useState<OnboardingToken[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  // Send modal
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [sendEmail, setSendEmail] = useState("");
  const [sending, setSending] = useState(false);

  // Extend modal
  const [extendModalOpen, setExtendModalOpen] = useState(false);
  const [extendToken, setExtendToken] = useState<OnboardingToken | null>(null);
  const [extendDays, setExtendDays] = useState("30");
  const [extending, setExtending] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load tokens
      const { data: tokenData, error: tokenError } = await supabase
        .from("property_onboarding_tokens")
        .select("*")
        .order("created_at", { ascending: false });

      if (tokenError) throw tokenError;

      // Load properties
      const { data: propData, error: propError } = await supabase
        .from("properties")
        .select("id, name, owner_email, amenities")
        .is("permanently_deleted_at", null);

      if (propError) throw propError;

      // Map property data to tokens
      const propsMap = new Map(propData?.map((p) => [p.id, p]) || []);
      const enrichedTokens: OnboardingToken[] = (tokenData || []).map((token) => {
        const prop = propsMap.get(token.property_id);
        const amenities = prop?.amenities as Record<string, unknown> | null;
        return {
          ...token,
          property_name: prop?.name || "Unknown Property",
          onboarding_score: typeof amenities?.onboarding_score === 'number' ? amenities.onboarding_score : 0,
        };
      });

      setTokens(enrichedTokens);
      setProperties(propData || []);
    } catch (error: any) {
      toast.error(error.message || "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const getTokenStatus = (token: OnboardingToken): "active" | "expired" | "used" => {
    if (token.used_at) return "used";
    if (isBefore(new Date(token.expires_at), new Date())) return "expired";
    return "active";
  };

  const filteredTokens = useMemo(() => {
    let result = tokens;

    if (statusFilter !== "all") {
      result = result.filter((t) => getTokenStatus(t) === statusFilter);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.owner_email.toLowerCase().includes(query) ||
          t.property_name?.toLowerCase().includes(query)
      );
    }

    return result;
  }, [tokens, statusFilter, searchQuery]);

  const stats = useMemo(() => {
    return {
      total: tokens.length,
      active: tokens.filter((t) => getTokenStatus(t) === "active").length,
      expired: tokens.filter((t) => getTokenStatus(t) === "expired").length,
      used: tokens.filter((t) => getTokenStatus(t) === "used").length,
    };
  }, [tokens]);

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

  const handleResendOnboarding = async (token: OnboardingToken) => {
    try {
      const { error } = await supabase.functions.invoke("send-onboarding-email", {
        body: { property_id: token.property_id, owner_email: token.owner_email },
      });

      if (error) throw error;
      toast.success("Onboarding email resent successfully");
      loadData();
    } catch (error: any) {
      toast.error(error.message || "Failed to resend onboarding email");
    }
  };

  const handleCopyLink = (token: OnboardingToken) => {
    const link = `${window.location.origin}/onboarding/${token.token}`;
    navigator.clipboard.writeText(link);
    toast.success("Link copied to clipboard");
  };

  const handleInvalidateToken = async (token: OnboardingToken) => {
    try {
      // Set expires_at to past to invalidate
      const { error } = await supabase
        .from("property_onboarding_tokens")
        .update({ expires_at: new Date().toISOString() })
        .eq("id", token.id);

      if (error) throw error;
      toast.success("Token invalidated");
      loadData();
    } catch (error: any) {
      toast.error(error.message || "Failed to invalidate token");
    }
  };

  const handleExtendToken = async () => {
    if (!extendToken) return;

    try {
      setExtending(true);
      const newExpiry = addDays(new Date(), parseInt(extendDays));
      
      const { error } = await supabase
        .from("property_onboarding_tokens")
        .update({ 
          expires_at: newExpiry.toISOString()
        })
        .eq("id", extendToken.id);

      if (error) throw error;

      toast.success("Token expiry extended");
      setExtendModalOpen(false);
      setExtendToken(null);
      loadData();
    } catch (error: any) {
      toast.error(error.message || "Failed to extend token");
    } finally {
      setExtending(false);
    }
  };

  const StatusBadge = ({ token }: { token: OnboardingToken }) => {
    const status = getTokenStatus(token);
    
    if (status === "used") {
      return (
        <Badge variant="default" className="gap-1">
          <Check className="h-3 w-3" />
          Used
        </Badge>
      );
    }
    if (status === "expired") {
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          Expired
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="gap-1 border-green-500 text-green-600">
        <Clock className="h-3 w-3" />
        Active
      </Badge>
    );
  };

  const propertiesWithoutTokens = useMemo(() => {
    const tokenPropertyIds = new Set(tokens.map((t) => t.property_id));
    return properties.filter((p) => !tokenPropertyIds.has(p.id));
  }, [properties, tokens]);

  return (
    <AppLayout>
      <PageHeader
        title="Onboarding Management"
        subtitle="Manage property onboarding tokens and track owner completion"
        actions={
          <Button onClick={() => setSendModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Send Onboarding
          </Button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Tokens</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{stats.active}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Used</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-blue-600">{stats.used}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Expired</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{stats.expired}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by property or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          {(["all", "active", "used", "expired"] as StatusFilter[]).map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(status)}
              className="capitalize"
            >
              {status}
            </Button>
          ))}
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
              <TableHead>Created</TableHead>
              <TableHead>Expires</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Loading tokens...
                </TableCell>
              </TableRow>
            ) : filteredTokens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No onboarding tokens found
                </TableCell>
              </TableRow>
            ) : (
              filteredTokens.map((token) => (
                <TableRow key={token.id}>
                  <TableCell>
                    <button
                      onClick={() => navigate(`/admin/properties/${token.property_id}`)}
                      className="font-medium hover:text-primary hover:underline"
                    >
                      {token.property_name}
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{token.owner_email}</TableCell>
                  <TableCell>
                    <StatusBadge token={token} />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 min-w-32">
                      <Progress value={token.onboarding_score || 0} className="h-2" />
                      <span className="text-sm text-muted-foreground w-10">
                        {token.onboarding_score || 0}%
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {format(new Date(token.created_at), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>
                    <span className={isBefore(new Date(token.expires_at), new Date()) ? "text-destructive" : ""}>
                      {format(new Date(token.expires_at), "MMM d, yyyy")}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleCopyLink(token)}>
                          <Copy className="h-4 w-4 mr-2" />
                          Copy Link
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleResendOnboarding(token)}>
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Resend Email
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => {
                            setExtendToken(token);
                            setExtendModalOpen(true);
                          }}
                        >
                          <CalendarPlus className="h-4 w-4 mr-2" />
                          Extend Expiry
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => navigate(`/admin/properties/${token.property_id}`)}>
                          <Building2 className="h-4 w-4 mr-2" />
                          View Property
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <a
                            href={`/admin/audit?table_name=property_onboarding_tokens&search_text=${token.owner_email}`}
                            target="_blank"
                          >
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Audit Trail
                          </a>
                        </DropdownMenuItem>
                        {getTokenStatus(token) === "active" && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleInvalidateToken(token)}
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
              ))
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
              <Select value={selectedPropertyId} onValueChange={(value) => {
                setSelectedPropertyId(value);
                const prop = properties.find(p => p.id === value);
                if (prop?.owner_email) {
                  setSendEmail(prop.owner_email);
                }
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a property" />
                </SelectTrigger>
                <SelectContent>
                  {properties.map((prop) => (
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
              <p className="text-sm text-muted-foreground">{extendToken?.property_name}</p>
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

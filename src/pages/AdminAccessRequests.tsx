import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Check, X, Clock, UserPlus, Shield, Search, Eye, Globe, Monitor, EyeOff, Handshake, Radar } from "lucide-react";
import { AddUserModal } from "@/components/AddUserModal";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface AccessRequest {
  id: string;
  full_name: string;
  email: string;
  message: string | null;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  source_ip: string | null;
  user_agent: string | null;
  referrer_url: string | null;
  source_page: string | null;
}

function parseUserAgent(ua: string | null): string {
  if (!ua) return "Unknown";
  if (ua.includes("Chrome") && !ua.includes("Edg")) return "Chrome";
  if (ua.includes("Edg")) return "Edge";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
  return "Other";
}

function getSourceLabel(page: string | null, referrer: string | null): string {
  if (page) {
    if (page.includes("/connect")) return "Connect Portal";
    if (page.includes("/auth")) return "Auth Page";
    return page;
  }
  if (referrer) {
    try {
      const url = new URL(referrer);
      return url.pathname || referrer;
    } catch {
      return referrer;
    }
  }
  return "Direct";
}

export default function AdminAccessRequests() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<AccessRequest | null>(null);
  const [selectedRole, setSelectedRole] = useState<"admin" | "user" | "sales_rep" | "agent">("user");
  const [searchTerm, setSearchTerm] = useState("");
  const [showDeclined, setShowDeclined] = useState(false);
  const [detailRequest, setDetailRequest] = useState<AccessRequest | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      navigate("/auth");
    }
  }, [user, isAdmin, authLoading, navigate]);

  useEffect(() => {
    if (isAdmin) loadRequests();
  }, [isAdmin]);

  const loadRequests = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("access_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading requests:", error);
      toast({ title: "Error", description: "Failed to load access requests", variant: "destructive" });
    } else {
      setRequests((data as AccessRequest[]) || []);
    }
    setLoading(false);
  };

  const handleApprove = (request: AccessRequest, role: "admin" | "user" | "sales_rep" | "agent") => {
    setSelectedRequest(request);
    setSelectedRole(role);
    setAddUserOpen(true);
  };

  const handleDecline = async (requestId: string) => {
    const { error } = await supabase
      .from("access_requests")
      .update({ status: "declined", reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
      .eq("id", requestId);

    if (error) {
      toast({ title: "Error", description: "Failed to decline request", variant: "destructive" });
    } else {
      toast({ title: "Request declined", description: "The access request has been declined" });
      loadRequests();
    }
  };

  const handleUserAdded = async () => {
    if (selectedRequest) {
      await supabase
        .from("access_requests")
        .update({ status: "approved", reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
        .eq("id", selectedRequest.id);
    }
    setAddUserOpen(false);
    setSelectedRequest(null);
    loadRequests();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="text-status-warning border-status-warning"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case "approved":
        return <Badge variant="default" className="bg-status-healthy"><Check className="h-3 w-3 mr-1" />Approved</Badge>;
      case "declined":
        return <Badge variant="destructive"><X className="h-3 w-3 mr-1" />Declined</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const pendingCount = requests.filter(r => r.status === "pending").length;
  const declinedCount = requests.filter(r => r.status === "declined").length;

  const filteredRequests = useMemo(() => {
    let filtered = requests;

    // Hide declined unless toggled on
    if (!showDeclined) {
      filtered = filtered.filter(r => r.status !== "declined");
    }

    if (!searchTerm.trim()) return filtered;

    const term = searchTerm.toLowerCase();
    return filtered.filter(request => {
      const submittedDate = format(new Date(request.created_at), "MMM d, yyyy HH:mm").toLowerCase();
      return (
        request.full_name.toLowerCase().includes(term) ||
        request.email.toLowerCase().includes(term) ||
        (request.message?.toLowerCase().includes(term) || false) ||
        request.status.toLowerCase().includes(term) ||
        submittedDate.includes(term) ||
        (request.source_ip?.includes(term) || false) ||
        (request.source_page?.toLowerCase().includes(term) || false)
      );
    });
  }, [requests, searchTerm, showDeclined]);

  if (authLoading || loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </AppLayout>
    );
  }

  if (!isAdmin) return null;

  return (
    <AppLayout>
      <PageHeader title="Access Requests" subtitle={`${pendingCount} pending`} />

      {/* Search + Show Declined toggle */}
      <div className="mb-3 flex items-center gap-4">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search all columns..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="show-declined" checked={showDeclined} onCheckedChange={setShowDeclined} />
          <Label htmlFor="show-declined" className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1">
            {showDeclined ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
            Declined ({declinedCount})
          </Label>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3">
        <Card>
          <CardContent className="py-2 px-3">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold">{pendingCount}</span>
              <span className="text-xs text-muted-foreground">Pending</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-2 px-3">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold">{requests.filter(r => r.status === "approved").length}</span>
              <span className="text-xs text-muted-foreground">Approved</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-2 px-3">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold">{declinedCount}</span>
              <span className="text-xs text-muted-foreground">Declined</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="py-2 px-4">
          <div className="flex items-baseline gap-2">
            <CardTitle className="text-sm">All Requests</CardTitle>
            <CardDescription className="text-xs">— Review and manage access requests</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="py-2 px-4">
          {filteredRequests.length === 0 ? (
            <p className="text-center text-muted-foreground text-xs py-4">
              {searchTerm ? "No requests match your search" : "No access requests yet"}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="h-8">
                  <TableHead className="py-1 text-xs">Name</TableHead>
                  <TableHead className="py-1 text-xs">Email</TableHead>
                  <TableHead className="py-1 text-xs">Message</TableHead>
                  <TableHead className="py-1 text-xs">Source</TableHead>
                  <TableHead className="py-1 text-xs">Status</TableHead>
                  <TableHead className="py-1 text-xs">Submitted</TableHead>
                  <TableHead className="text-right py-1 text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.map((request) => (
                  <TableRow key={request.id} className="h-10">
                    <TableCell className="font-medium text-xs py-1">{request.full_name}</TableCell>
                    <TableCell className="text-xs py-1">{request.email}</TableCell>
                    <TableCell className="max-w-[200px] text-xs py-1">
                      {request.message ? (
                        <HoverCard>
                          <HoverCardTrigger asChild>
                            <span className="truncate block cursor-pointer hover:text-primary transition-colors">
                              {request.message.length > 60 ? request.message.slice(0, 60) + "…" : request.message}
                            </span>
                          </HoverCardTrigger>
                          <HoverCardContent className="w-80 text-xs">
                            <p className="whitespace-pre-wrap">{request.message}</p>
                          </HoverCardContent>
                        </HoverCard>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs py-1">
                      <HoverCard>
                        <HoverCardTrigger asChild>
                          <Badge variant="outline" className="cursor-pointer text-[10px] gap-1">
                            <Globe className="h-2.5 w-2.5" />
                            {getSourceLabel(request.source_page, request.referrer_url)}
                          </Badge>
                        </HoverCardTrigger>
                        <HoverCardContent className="w-72 text-xs space-y-1.5">
                          <p className="font-medium text-foreground">Origin Details</p>
                          <div className="space-y-1 text-muted-foreground">
                            {request.source_ip && (
                              <p><span className="font-medium text-foreground">IP:</span> {request.source_ip}</p>
                            )}
                            {request.user_agent && (
                              <p className="flex items-center gap-1">
                                <Monitor className="h-3 w-3 inline" />
                                <span className="font-medium text-foreground">Browser:</span> {parseUserAgent(request.user_agent)}
                              </p>
                            )}
                            {request.referrer_url && (
                              <p><span className="font-medium text-foreground">Referrer:</span> {request.referrer_url}</p>
                            )}
                            {request.source_page && (
                              <p><span className="font-medium text-foreground">Page:</span> {request.source_page}</p>
                            )}
                            {!request.source_ip && !request.user_agent && !request.referrer_url && !request.source_page && (
                              <p className="italic">No origin data recorded</p>
                            )}
                          </div>
                        </HoverCardContent>
                      </HoverCard>
                    </TableCell>
                    <TableCell className="py-1">{getStatusBadge(request.status)}</TableCell>
                    <TableCell className="text-xs py-1">{format(new Date(request.created_at), "MMM d, yyyy HH:mm")}</TableCell>
                    <TableCell className="text-right py-1">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={() => setDetailRequest(request)}
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                        {request.status === "pending" && (
                          <>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="default" className="h-6 text-xs px-2">
                                  <UserPlus className="h-3 w-3 mr-1" />
                                  Approve
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => handleApprove(request, "user")}>
                                  <UserPlus className="h-3 w-3 mr-2" />As Owner
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleApprove(request, "admin")}>
                                  <Shield className="h-3 w-3 mr-2" />As Admin
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleApprove(request, "sales_rep")}>
                                  <Handshake className="h-3 w-3 mr-2" />As Sales Rep
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleApprove(request, "agent")}>
                                  <Radar className="h-3 w-3 mr-2" />As Agent
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-6 text-xs px-2"
                              onClick={() => handleDecline(request.id)}
                            >
                              <X className="h-3 w-3 mr-1" />Decline
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!detailRequest} onOpenChange={(open) => !open && setDetailRequest(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm">Access Request Details</DialogTitle>
          </DialogHeader>
          {detailRequest && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-[100px_1fr] gap-y-2 gap-x-3">
                <span className="text-muted-foreground font-medium">Name</span>
                <span>{detailRequest.full_name}</span>
                <span className="text-muted-foreground font-medium">Email</span>
                <span>{detailRequest.email}</span>
                <span className="text-muted-foreground font-medium">Status</span>
                <span>{getStatusBadge(detailRequest.status)}</span>
                <span className="text-muted-foreground font-medium">Submitted</span>
                <span>{format(new Date(detailRequest.created_at), "MMM d, yyyy HH:mm")}</span>
                {detailRequest.reviewed_at && (
                  <>
                    <span className="text-muted-foreground font-medium">Reviewed</span>
                    <span>{format(new Date(detailRequest.reviewed_at), "MMM d, yyyy HH:mm")}</span>
                  </>
                )}
              </div>

              {detailRequest.message && (
                <div>
                  <p className="text-muted-foreground font-medium mb-1">Message</p>
                  <p className="bg-muted/50 rounded p-2 text-xs whitespace-pre-wrap">{detailRequest.message}</p>
                </div>
              )}

              <div>
                <p className="text-muted-foreground font-medium mb-1">Origin</p>
                <div className="bg-muted/50 rounded p-2 text-xs space-y-1">
                  <p><span className="font-medium">Source:</span> {getSourceLabel(detailRequest.source_page, detailRequest.referrer_url)}</p>
                  {detailRequest.source_ip && <p><span className="font-medium">IP:</span> {detailRequest.source_ip}</p>}
                  {detailRequest.user_agent && <p><span className="font-medium">Browser:</span> {parseUserAgent(detailRequest.user_agent)}</p>}
                  {detailRequest.referrer_url && <p><span className="font-medium">Referrer:</span> {detailRequest.referrer_url}</p>}
                  {!detailRequest.source_ip && !detailRequest.user_agent && !detailRequest.referrer_url && !detailRequest.source_page && (
                    <p className="italic text-muted-foreground">No origin data recorded</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AddUserModal
        open={addUserOpen}
        onOpenChange={setAddUserOpen}
        role={selectedRole as any}
        onUserAdded={handleUserAdded}
        defaultEmail={selectedRequest?.email}
        defaultName={selectedRequest?.full_name}
      />
    </AppLayout>
  );
}

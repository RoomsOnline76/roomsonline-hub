import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Check, X, Clock, UserPlus } from "lucide-react";
import { AddUserModal } from "@/components/AddUserModal";

interface AccessRequest {
  id: string;
  full_name: string;
  email: string;
  message: string | null;
  status: string;
  created_at: string;
  reviewed_at: string | null;
}

export default function AdminAccessRequests() {
  const { user, isAdmin, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<AccessRequest | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin)) {
      navigate("/auth");
    }
  }, [user, isAdmin, authLoading, navigate]);

  useEffect(() => {
    if (isAdmin) {
      loadRequests();
    }
  }, [isAdmin]);

  const loadRequests = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("access_requests")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading requests:", error);
      toast({
        title: "Error",
        description: "Failed to load access requests",
        variant: "destructive",
      });
    } else {
      setRequests(data || []);
    }
    setLoading(false);
  };

  const handleApprove = (request: AccessRequest) => {
    setSelectedRequest(request);
    setAddUserOpen(true);
  };

  const handleDecline = async (requestId: string) => {
    const { error } = await supabase
      .from("access_requests")
      .update({
        status: "declined",
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    if (error) {
      toast({
        title: "Error",
        description: "Failed to decline request",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Request declined",
        description: "The access request has been declined",
      });
      loadRequests();
    }
  };

  const handleUserAdded = async () => {
    if (selectedRequest) {
      await supabase
        .from("access_requests")
        .update({
          status: "approved",
          reviewed_by: user?.id,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", selectedRequest.id);
    }
    setAddUserOpen(false);
    setSelectedRequest(null);
    loadRequests();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge variant="outline" className="text-amber-600 border-amber-600"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case "approved":
        return <Badge variant="default" className="bg-green-600"><Check className="h-3 w-3 mr-1" />Approved</Badge>;
      case "declined":
        return <Badge variant="destructive"><X className="h-3 w-3 mr-1" />Declined</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const pendingCount = requests.filter(r => r.status === "pending").length;

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
      <PageHeader
        title="Access Requests"
        subtitle={`${pendingCount} pending`}
      />

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
                <span className="text-lg font-bold">{requests.filter(r => r.status === "declined").length}</span>
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
            {requests.length === 0 ? (
              <p className="text-center text-muted-foreground text-xs py-4">No access requests yet</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="h-8">
                    <TableHead className="py-1 text-xs">Name</TableHead>
                    <TableHead className="py-1 text-xs">Email</TableHead>
                    <TableHead className="py-1 text-xs">Message</TableHead>
                    <TableHead className="py-1 text-xs">Status</TableHead>
                    <TableHead className="py-1 text-xs">Submitted</TableHead>
                    <TableHead className="text-right py-1 text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((request) => (
                    <TableRow key={request.id} className="h-10">
                      <TableCell className="font-medium text-xs py-1">{request.full_name}</TableCell>
                      <TableCell className="text-xs py-1">{request.email}</TableCell>
                      <TableCell className="max-w-xs truncate text-xs py-1">{request.message || "—"}</TableCell>
                      <TableCell className="py-1">{getStatusBadge(request.status)}</TableCell>
                      <TableCell className="text-xs py-1">{format(new Date(request.created_at), "MMM d, yyyy HH:mm")}</TableCell>
                      <TableCell className="text-right py-1">
                        {request.status === "pending" && (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="default"
                              className="h-6 text-xs px-2"
                              onClick={() => handleApprove(request)}
                            >
                              <UserPlus className="h-3 w-3 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              className="h-6 text-xs px-2"
                              onClick={() => handleDecline(request.id)}
                            >
                              <X className="h-3 w-3 mr-1" />
                              Decline
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
        </CardContent>
      </Card>

      <AddUserModal
        open={addUserOpen}
        onOpenChange={setAddUserOpen}
        role="user"
        onUserAdded={handleUserAdded}
        defaultEmail={selectedRequest?.email}
        defaultName={selectedRequest?.full_name}
      />
    </AppLayout>
  );
}

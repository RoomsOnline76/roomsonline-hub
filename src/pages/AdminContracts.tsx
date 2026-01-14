import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Search,
  Plus,
  MoreHorizontal,
  Send,
  RefreshCw,
  Download,
  Eye,
  FileSignature,
  Check,
  Clock,
  AlertCircle,
  Shield,
  FileText,
  History,
  ExternalLink,
  Loader2,
  Building2,
} from "lucide-react";
import { ContractOverrideModal } from "@/components/contract/ContractOverrideModal";
import { Label } from "@/components/ui/label";
import { Link } from "react-router-dom";

interface OwnerContract {
  id: string;
  owner_email: string;
  owner_name: string | null;
  status: string;
  version: number;
  template_version: string;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  signed_by_name: string | null;
  signed_by_email: string | null;
  signed_by_designation: string | null;
  signature_image_url: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  signature_data: any;
  pdf_url: string | null;
  unsigned_pdf_url: string | null;
  override_at: string | null;
  override_by: string | null;
  override_reason: string | null;
  created_at: string | null;
}

interface LinkedProperty {
  id: string;
  name: string;
}

type StatusFilter = "all" | "pending" | "sent" | "viewed" | "signed" | "overridden";

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pending: { label: "Pending", icon: Clock, variant: "secondary" },
  sent: { label: "Sent", icon: Send, variant: "outline" },
  viewed: { label: "Viewed", icon: Eye, variant: "outline" },
  signed: { label: "Signed", icon: Check, variant: "default" },
  overridden: { label: "Overridden", icon: Shield, variant: "destructive" },
};

export default function AdminContracts() {
  const [contracts, setContracts] = useState<OwnerContract[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  
  // Modal states
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendEmail, setSendEmail] = useState("");
  const [sendName, setSendName] = useState("");
  const [sending, setSending] = useState(false);
  
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideContract, setOverrideContract] = useState<OwnerContract | null>(null);
  const [overriding, setOverriding] = useState(false);
  
  const [signaturePreviewOpen, setSignaturePreviewOpen] = useState(false);
  const [signatureUrl, setSignatureUrl] = useState<string | null>(null);
  
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [historyEmail, setHistoryEmail] = useState<string | null>(null);
  const [historyContracts, setHistoryContracts] = useState<OwnerContract[]>([]);
  
  // Property validation for new contracts
  const [validatingEmail, setValidatingEmail] = useState(false);
  const [linkedProperties, setLinkedProperties] = useState<LinkedProperty[]>([]);
  const [noPropertiesWarning, setNoPropertiesWarning] = useState(false);

  useEffect(() => {
    loadContracts();
  }, []);

  const loadContracts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("owner_contracts")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setContracts(data || []);
    } catch (error: any) {
      toast.error(error.message || "Failed to load contracts");
    } finally {
      setLoading(false);
    }
  };

  const filteredContracts = useMemo(() => {
    let result = contracts;

    // Get relevant contract per owner - prioritize signed/overridden contracts
    const latestByOwner = new Map<string, OwnerContract>();
    for (const contract of contracts) {
      const existing = latestByOwner.get(contract.owner_email);
      
      if (!existing) {
        // No contract yet for this owner
        latestByOwner.set(contract.owner_email, contract);
      } else if (contract.status === 'signed' || contract.status === 'overridden') {
        // Prioritize signed/overridden contracts
        if (existing.status !== 'signed' && existing.status !== 'overridden') {
          // Current is signed/overridden, existing is not - use current
          latestByOwner.set(contract.owner_email, contract);
        } else if (contract.status === 'signed' && existing.status === 'signed') {
          // Both signed - use most recently signed
          if (contract.signed_at && existing.signed_at && new Date(contract.signed_at) > new Date(existing.signed_at)) {
            latestByOwner.set(contract.owner_email, contract);
          }
        } else if (contract.status === 'overridden' && existing.status === 'overridden') {
          // Both overridden - use most recent version
          if (contract.version > existing.version) {
            latestByOwner.set(contract.owner_email, contract);
          }
        }
      } else if (existing.status !== 'signed' && existing.status !== 'overridden') {
        // Neither is signed/overridden - use higher version
        if (contract.version > existing.version) {
          latestByOwner.set(contract.owner_email, contract);
        }
      }
      // If existing is signed/overridden and current is not, keep existing
    }
    result = Array.from(latestByOwner.values());

    if (statusFilter !== "all") {
      result = result.filter((c) => c.status === statusFilter);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.owner_email.toLowerCase().includes(query) ||
          c.owner_name?.toLowerCase().includes(query)
      );
    }

    return result;
  }, [contracts, statusFilter, searchQuery]);

  const stats = useMemo(() => {
    // Use the same logic as filteredContracts for accurate stats
    const latestByOwner = new Map<string, OwnerContract>();
    for (const contract of contracts) {
      const existing = latestByOwner.get(contract.owner_email);
      
      if (!existing) {
        latestByOwner.set(contract.owner_email, contract);
      } else if (contract.status === 'signed' || contract.status === 'overridden') {
        if (existing.status !== 'signed' && existing.status !== 'overridden') {
          latestByOwner.set(contract.owner_email, contract);
        } else if (contract.status === 'signed' && existing.status === 'signed') {
          if (contract.signed_at && existing.signed_at && new Date(contract.signed_at) > new Date(existing.signed_at)) {
            latestByOwner.set(contract.owner_email, contract);
          }
        } else if (contract.status === 'overridden' && existing.status === 'overridden') {
          if (contract.version > existing.version) {
            latestByOwner.set(contract.owner_email, contract);
          }
        }
      } else if (existing.status !== 'signed' && existing.status !== 'overridden') {
        if (contract.version > existing.version) {
          latestByOwner.set(contract.owner_email, contract);
        }
      }
    }
    const latest = Array.from(latestByOwner.values());
    
    return {
      total: latest.length,
      signed: latest.filter((c) => c.status === "signed").length,
      pending: latest.filter((c) => ["pending", "sent", "viewed"].includes(c.status)).length,
      overridden: latest.filter((c) => c.status === "overridden").length,
    };
  }, [contracts]);

  const handleSendContract = async () => {
    if (!sendEmail) {
      toast.error("Email is required");
      return;
    }

    try {
      setSending(true);
      const { error } = await supabase.functions.invoke("send-owner-contract", {
        body: { owner_email: sendEmail, owner_name: sendName || undefined },
      });

      if (error) throw error;

      toast.success("Contract sent successfully");
      setSendModalOpen(false);
      setSendEmail("");
      setSendName("");
      loadContracts();
    } catch (error: any) {
      toast.error(error.message || "Failed to send contract");
    } finally {
      setSending(false);
    }
  };

  const handleResendContract = async (contract: OwnerContract) => {
    try {
      const { error } = await supabase.functions.invoke("send-owner-contract", {
        body: { owner_email: contract.owner_email, owner_name: contract.owner_name || undefined },
      });

      if (error) throw error;
      toast.success("Contract resent successfully");
      loadContracts();
    } catch (error: any) {
      toast.error(error.message || "Failed to resend contract");
    }
  };

  const handleOverrideConfirm = async (reason: string) => {
    if (!overrideContract) return;

    try {
      setOverriding(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase.from("owner_contracts").insert({
        owner_email: overrideContract.owner_email,
        owner_name: overrideContract.owner_name,
        status: "overridden",
        version: overrideContract.version + 1,
        template_version: overrideContract.template_version,
        override_at: new Date().toISOString(),
        override_by: user?.email || "admin",
        override_reason: reason,
      });

      if (error) throw error;

      toast.success("Contract overridden successfully");
      setOverrideModalOpen(false);
      setOverrideContract(null);
      loadContracts();
    } catch (error: any) {
      toast.error(error.message || "Failed to override contract");
    } finally {
      setOverriding(false);
    }
  };

  const handleViewSignature = (contract: OwnerContract) => {
    // Prioritize base64 data URL for reliable display
    const sigUrl = (contract.signature_data?.dataUrl as string) || contract.signature_image_url;
    setSignatureUrl(sigUrl || null);
    setSignaturePreviewOpen(true);
  };

  const validateOwnerEmail = async (email: string) => {
    if (!email || !email.includes("@")) {
      setLinkedProperties([]);
      setNoPropertiesWarning(false);
      return;
    }
    
    setValidatingEmail(true);
    try {
      const { data: properties, error } = await supabase
        .from("properties")
        .select("id, name")
        .eq("owner_email", email.toLowerCase().trim())
        .is("permanently_deleted_at", null);
      
      if (error) throw error;
      
      setLinkedProperties(properties || []);
      setNoPropertiesWarning(!properties || properties.length === 0);
    } catch (error) {
      console.error("Error validating email:", error);
      setLinkedProperties([]);
      setNoPropertiesWarning(true);
    } finally {
      setValidatingEmail(false);
    }
  };

  const resetSendModal = () => {
    setSendEmail("");
    setSendName("");
    setLinkedProperties([]);
    setNoPropertiesWarning(false);
  };

  const handleViewHistory = async (email: string) => {
    const history = contracts.filter((c) => c.owner_email === email).sort((a, b) => b.version - a.version);
    setHistoryEmail(email);
    setHistoryContracts(history);
    setHistoryDrawerOpen(true);
  };

  const StatusBadge = ({ status }: { status: string }) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
    const Icon = config.icon;
    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="h-3 w-3" />
        {config.label}
      </Badge>
    );
  };

  return (
    <AppLayout>
      <PageHeader
        title="Contracts Management"
        subtitle="Manage owner contracts and track signing status"
        actions={
          <Button onClick={() => setSendModalOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Send Contract
          </Button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Owners</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Signed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{stats.signed}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Overridden</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{stats.overridden}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by email or name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          {(["all", "signed", "sent", "viewed", "pending", "overridden"] as StatusFilter[]).map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(status)}
            >
              {status === "all" ? "All" : STATUS_CONFIG[status]?.label || status}
            </Button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="border border-border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Owner</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Sent</TableHead>
              <TableHead>Viewed</TableHead>
              <TableHead>Signed</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  Loading contracts...
                </TableCell>
              </TableRow>
            ) : filteredContracts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  No contracts found
                </TableCell>
              </TableRow>
            ) : (
              filteredContracts.map((contract) => (
                <TableRow key={contract.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{contract.owner_name || "—"}</p>
                      <p className="text-sm text-muted-foreground">{contract.owner_email}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={contract.status} />
                  </TableCell>
                  <TableCell>v{contract.version}</TableCell>
                  <TableCell>
                    {contract.sent_at ? format(new Date(contract.sent_at), "MMM d, yyyy") : "—"}
                  </TableCell>
                  <TableCell>
                    {contract.viewed_at ? format(new Date(contract.viewed_at), "MMM d, yyyy") : "—"}
                  </TableCell>
                  <TableCell>
                    {contract.signed_at ? (
                      <div>
                        <p>{format(new Date(contract.signed_at), "MMM d, yyyy")}</p>
                        <p className="text-xs text-muted-foreground">{contract.signed_by_name}</p>
                      </div>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {contract.status !== "signed" && contract.status !== "overridden" && (
                          <DropdownMenuItem onClick={() => handleResendContract(contract)}>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Resend Contract
                          </DropdownMenuItem>
                        )}
                        {(contract.signature_data?.dataUrl || contract.signature_image_url) && (
                          <DropdownMenuItem onClick={() => handleViewSignature(contract)}>
                            <FileSignature className="h-4 w-4 mr-2" />
                            View Signature
                          </DropdownMenuItem>
                        )}
                        {contract.pdf_url && (
                          <DropdownMenuItem asChild>
                            <a href={contract.pdf_url} target="_blank" rel="noopener noreferrer">
                              <Download className="h-4 w-4 mr-2" />
                              Download Signed PDF
                            </a>
                          </DropdownMenuItem>
                        )}
                        {contract.unsigned_pdf_url && (
                          <DropdownMenuItem asChild>
                            <a href={contract.unsigned_pdf_url} target="_blank" rel="noopener noreferrer">
                              <FileText className="h-4 w-4 mr-2" />
                              Download Unsigned PDF
                            </a>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => handleViewHistory(contract.owner_email)}>
                          <History className="h-4 w-4 mr-2" />
                          View History
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <a href={`/admin/audit?table_name=owner_contracts&search_text=${contract.owner_email}`} target="_blank">
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Audit Trail
                          </a>
                        </DropdownMenuItem>
                        {contract.status !== "signed" && contract.status !== "overridden" && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => {
                                setOverrideContract(contract);
                                setOverrideModalOpen(true);
                              }}
                            >
                              <Shield className="h-4 w-4 mr-2" />
                              Override Contract
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

      {/* Send Contract Modal */}
      <Dialog open={sendModalOpen} onOpenChange={(open) => {
        setSendModalOpen(open);
        if (!open) resetSendModal();
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send New Contract</DialogTitle>
            <DialogDescription>
              Send a contract to an owner. They will receive an email with a signing link.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email">Owner Email *</Label>
              <div className="relative">
                <Input
                  id="email"
                  type="email"
                  placeholder="owner@example.com"
                  value={sendEmail}
                  onChange={(e) => setSendEmail(e.target.value)}
                  onBlur={() => validateOwnerEmail(sendEmail)}
                />
                {validatingEmail && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="name">Owner Name (optional)</Label>
              <Input
                id="name"
                placeholder="John Smith"
                value={sendName}
                onChange={(e) => setSendName(e.target.value)}
              />
            </div>

            {/* Property validation feedback */}
            {noPropertiesWarning && !validatingEmail && sendEmail && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <p className="font-medium">No properties linked to this email</p>
                  <p className="text-sm mt-1">
                    Before sending a contract, ensure at least one property has this owner email set.
                  </p>
                  <Button size="sm" variant="outline" className="mt-3" asChild>
                    <Link to="/admin/onboarding" target="_blank">
                      <Building2 className="h-4 w-4 mr-2" />
                      Create Property
                    </Link>
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {linkedProperties.length > 0 && (
              <div className="bg-muted/30 rounded-lg p-3 border border-border">
                <p className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Check className="h-4 w-4 text-green-600" />
                  Properties to be covered ({linkedProperties.length}):
                </p>
                <ul className="text-sm text-muted-foreground space-y-1 ml-6">
                  {linkedProperties.map(p => (
                    <li key={p.id}>• {p.name}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setSendModalOpen(false);
              resetSendModal();
            }}>
              Cancel
            </Button>
            <Button 
              onClick={handleSendContract} 
              disabled={sending || !sendEmail || noPropertiesWarning || linkedProperties.length === 0}
            >
              {sending ? "Sending..." : "Send Contract"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Override Modal */}
      <ContractOverrideModal
        open={overrideModalOpen}
        onOpenChange={setOverrideModalOpen}
        onConfirm={handleOverrideConfirm}
        propertyName={overrideContract?.owner_email || ""}
        isLoading={overriding}
      />

      {/* Signature Preview Modal */}
      <Dialog open={signaturePreviewOpen} onOpenChange={setSignaturePreviewOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Signature Preview</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center p-4 bg-muted/30 rounded-lg">
            {signatureUrl && (
              <img src={signatureUrl} alt="Signature" className="max-h-48 object-contain" />
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* History Drawer */}
      <Dialog open={historyDrawerOpen} onOpenChange={setHistoryDrawerOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Contract History</DialogTitle>
            <DialogDescription>{historyEmail}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {historyContracts.map((contract) => (
              <div key={contract.id} className="p-4 border rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Version {contract.version}</span>
                    <StatusBadge status={contract.status} />
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {contract.created_at && format(new Date(contract.created_at), "MMM d, yyyy HH:mm")}
                  </span>
                </div>
                {contract.status === "overridden" && contract.override_reason && (
                  <div className="text-sm bg-destructive/10 p-2 rounded">
                    <p className="font-medium text-destructive">Override Reason:</p>
                    <p>{contract.override_reason}</p>
                    <p className="text-xs text-muted-foreground mt-1">By: {contract.override_by}</p>
                  </div>
                )}
                {contract.status === "signed" && (
                  <div className="text-sm text-muted-foreground">
                    Signed by: {contract.signed_by_name} ({contract.signed_by_designation})
                  </div>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

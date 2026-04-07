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
  Handshake,
  XCircle,
  Ban,
} from "lucide-react";
import { ContractOverrideModal } from "@/components/contract/ContractOverrideModal";
import { Label } from "@/components/ui/label";

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

type StatusFilter = "all" | "pending" | "sent" | "viewed" | "signed" | "overridden" | "revoked";

const STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  pending: { label: "Pending", icon: Clock, variant: "secondary" },
  sent: { label: "Sent", icon: Send, variant: "outline" },
  viewed: { label: "Viewed", icon: Eye, variant: "outline" },
  signed: { label: "Signed", icon: Check, variant: "default" },
  overridden: { label: "Overridden", icon: Shield, variant: "destructive" },
  revoked: { label: "Revoked", icon: XCircle, variant: "destructive" },
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
  const [selectedContractType, setSelectedContractType] = useState<"standard" | "rolos" | "referral">("standard");
  
  // Contract templates
  const [contractTemplates, setContractTemplates] = useState<{ id: string; name: string }[]>([]);
  
  // Property search states
  const [propertySearch, setPropertySearch] = useState("");
  const [propertyResults, setPropertyResults] = useState<{ id: string; name: string; slug: string | null; is_archived: boolean; owner_email: string | null }[]>([]);
  const [searchingProperties, setSearchingProperties] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<{ id: string; name: string; is_archived: boolean } | null>(null);
  const [showUnarchivePrompt, setShowUnarchivePrompt] = useState(false);
  const [unarchiving, setUnarchiving] = useState(false);
  const [propertyDropdownOpen, setPropertyDropdownOpen] = useState(false);
  
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

  // Revoke modal states
  const [revokeModalOpen, setRevokeModalOpen] = useState(false);
  const [revokeContract, setRevokeContract] = useState<OwnerContract | null>(null);
  const [revokeReason, setRevokeReason] = useState("");
  const [revoking, setRevoking] = useState(false);

  // Properties lookup for table column
  const [propertiesByOwner, setPropertiesByOwner] = useState<Record<string, string[]>>({});

  useEffect(() => {
    loadContracts();
    loadContractTemplates();
  }, []);

  const loadContractTemplates = async () => {
    try {
      const { data, error } = await supabase
        .from("contract_templates")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      
      if (error) throw error;
      setContractTemplates(data || []);
    } catch (error) {
      console.error("Failed to load contract templates:", error);
    }
  };

  const loadContracts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("owner_contracts")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setContracts(data || []);

      // Load properties for all owner emails
      const ownerEmails = [...new Set((data || []).map(c => c.owner_email))];
      if (ownerEmails.length > 0) {
        const { data: props } = await supabase
          .from("properties")
          .select("owner_email, name")
          .in("owner_email", ownerEmails)
          .is("permanently_deleted_at", null);

        const grouped: Record<string, string[]> = {};
        (props || []).forEach(p => {
          if (!grouped[p.owner_email!]) grouped[p.owner_email!] = [];
          const name = p.name?.toLowerCase();
          if (!grouped[p.owner_email!].some(n => n.toLowerCase() === name)) {
            grouped[p.owner_email!].push(p.name);
          }
        });
        setPropertiesByOwner(grouped);
      }
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
      result = result.filter((c) => {
        const statusLabel = STATUS_CONFIG[c.status]?.label.toLowerCase() || c.status.toLowerCase();
        const versionStr = `v${c.version}`;
        const sentDate = c.sent_at ? format(new Date(c.sent_at), "MMM d, yyyy").toLowerCase() : "";
        const signedDate = c.signed_at ? format(new Date(c.signed_at), "MMM d, yyyy").toLowerCase() : "";
        const ownerProps = (propertiesByOwner[c.owner_email] || []).join(", ").toLowerCase();
        
        return (
          c.owner_email.toLowerCase().includes(query) ||
          c.owner_name?.toLowerCase().includes(query) ||
          statusLabel.includes(query) ||
          versionStr.includes(query) ||
          c.template_version.toLowerCase().includes(query) ||
          sentDate.includes(query) ||
          signedDate.includes(query) ||
          ownerProps.includes(query)
        );
      });
    }

    return result;
  }, [contracts, statusFilter, searchQuery, propertiesByOwner]);

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
      revoked: latest.filter((c) => c.status === "revoked").length,
    };
  }, [contracts]);

  const handleSendContract = async () => {
    if (!sendEmail) {
      toast.error("Email is required");
      return;
    }

    try {
      setSending(true);
      
      // Determine which template to use based on contract type
      const templateId = selectedContractType === "rolos" 
        ? "b2c3d4e5-f6a7-4890-bcde-f12345678901"
        : selectedContractType === "referral"
        ? "c3d4e5f6-a7b8-4901-cdef-234567890123"
        : "f47ac10b-58cc-4372-a567-0e02b2c3d479";
      
      const { error } = await supabase.functions.invoke("send-owner-contract", {
        body: { 
          owner_email: sendEmail, 
          owner_name: sendName || undefined,
          property_id: selectedProperty?.id || undefined,
          template_id: templateId,
          contract_type: selectedContractType,
        },
      });

      if (error) throw error;

      toast.success(`${selectedContractType === "rolos" ? "ROL'OS PMS" : selectedContractType === "referral" ? "Referral Partner" : "Standard"} contract sent successfully`);
      setSendModalOpen(false);
      setSendEmail("");
      setSendName("");
      setSelectedContractType("standard");
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
        override_by: user?.id || null,
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
    setPropertySearch("");
    setPropertyResults([]);
    setSelectedProperty(null);
    setShowUnarchivePrompt(false);
    setPropertyDropdownOpen(false);
    setSelectedContractType("standard");
  };

  const searchProperties = async (query: string) => {
    if (!query || query.length < 2) {
      setPropertyResults([]);
      setPropertyDropdownOpen(false);
      return;
    }
    setSearchingProperties(true);
    try {
      // Use ilike with wildcards for fuzzy matching
      const pattern = `%${query.replace(/\s+/g, '%')}%`;
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, slug, owner_email, permanently_deleted_at")
        .ilike("name", pattern)
        .order("name")
        .limit(15);

      if (error) throw error;

      const results = (data || []).map(p => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        is_archived: !!p.permanently_deleted_at,
        owner_email: p.owner_email,
      }));
      setPropertyResults(results);
      setPropertyDropdownOpen(results.length > 0);
    } catch (err) {
      console.error("Property search error:", err);
      setPropertyResults([]);
    } finally {
      setSearchingProperties(false);
    }
  };

  // Debounced property search
  useEffect(() => {
    if (!propertySearch || propertySearch.length < 2) {
      setPropertyResults([]);
      setPropertyDropdownOpen(false);
      return;
    }
    const timer = setTimeout(() => searchProperties(propertySearch), 300);
    return () => clearTimeout(timer);
  }, [propertySearch]);

  const handleSelectProperty = (property: typeof propertyResults[0]) => {
    setSelectedProperty({ id: property.id, name: property.name, is_archived: property.is_archived });
    setPropertySearch(property.name);
    setPropertyDropdownOpen(false);

    if (property.is_archived) {
      setShowUnarchivePrompt(true);
    } else {
      setShowUnarchivePrompt(false);
    }

    // If property has an owner_email, auto-fill
    if (property.owner_email && !sendEmail) {
      setSendEmail(property.owner_email);
      validateOwnerEmail(property.owner_email);
    }
  };

  const handleUnarchiveProperty = async () => {
    if (!selectedProperty) return;
    setUnarchiving(true);
    try {
      const { error } = await supabase
        .from("properties")
        .update({ permanently_deleted_at: null })
        .eq("id", selectedProperty.id);

      if (error) throw error;
      toast.success(`"${selectedProperty.name}" has been unarchived`);
      setSelectedProperty({ ...selectedProperty, is_archived: false });
      setShowUnarchivePrompt(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to unarchive property");
    } finally {
      setUnarchiving(false);
    }
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 xl:gap-6 mb-6">
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
            placeholder="Search all columns..."
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

      {/* Send Contract Modal - Simplified for contract-first workflow */}
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
            {/* Property Name Search */}
            <div className="space-y-2">
              <Label htmlFor="propertyName">Property Name</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="propertyName"
                  placeholder="Search existing properties..."
                  value={propertySearch}
                  onChange={(e) => {
                    setPropertySearch(e.target.value);
                    if (selectedProperty) {
                      setSelectedProperty(null);
                      setShowUnarchivePrompt(false);
                    }
                  }}
                  className="pl-9"
                />
                {searchingProperties && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
                {/* Search results dropdown */}
                {propertyDropdownOpen && propertySearch.length >= 2 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-lg shadow-lg max-h-[200px] overflow-y-auto z-[100]">
                    {propertyResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSelectProperty(p)}
                        className="w-full flex items-center justify-between gap-2 px-3 py-2 hover:bg-muted transition-colors text-left border-b border-border/50 last:border-b-0"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{p.name}</p>
                          {p.owner_email && (
                            <p className="text-xs text-muted-foreground truncate">{p.owner_email}</p>
                          )}
                        </div>
                        {p.is_archived && (
                          <Badge variant="secondary" className="text-xs flex-shrink-0">Archived</Badge>
                        )}
                      </button>
                    ))}
                    {/* "New property" option at the bottom */}
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProperty({ id: '', name: propertySearch, is_archived: false });
                        setPropertyDropdownOpen(false);
                        setShowUnarchivePrompt(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted transition-colors text-left border-t border-border bg-muted/30"
                    >
                      <Plus className="h-4 w-4 text-primary flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-primary">New property: "{propertySearch}"</p>
                        <p className="text-xs text-muted-foreground">None of the above – create as new</p>
                      </div>
                    </button>
                  </div>
                )}
                {/* Show "new property" option when search has no results */}
                {!propertyDropdownOpen && !searchingProperties && propertySearch.length >= 2 && propertyResults.length === 0 && !selectedProperty && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-lg shadow-lg z-[100]">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedProperty({ id: '', name: propertySearch, is_archived: false });
                        setShowUnarchivePrompt(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted transition-colors text-left"
                    >
                      <Plus className="h-4 w-4 text-primary flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-primary">New property: "{propertySearch}"</p>
                        <p className="text-xs text-muted-foreground">No matches found – will be created during onboarding</p>
                      </div>
                    </button>
                  </div>
                )}
              </div>
              {selectedProperty && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Check className="h-3 w-3 text-green-600" />
                  {selectedProperty.id ? 'Linked to existing' : 'New property'}: <span className="font-medium">{selectedProperty.name}</span>
                </p>
              )}
            </div>

            {/* Unarchive prompt */}
            {showUnarchivePrompt && selectedProperty?.is_archived && (
              <Alert className="border-amber-200 bg-amber-50">
                <AlertCircle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800">
                  <p className="font-medium">This property is archived</p>
                  <p className="text-sm mt-1">
                    "{selectedProperty.name}" was previously archived. Would you like to restore it?
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={handleUnarchiveProperty}
                    disabled={unarchiving}
                  >
                    {unarchiving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                    Unarchive Property
                  </Button>
                </AlertDescription>
              </Alert>
            )}

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

            {/* Contract Type Selector */}
            <div className="space-y-2">
              <Label>Contract Type *</Label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedContractType("standard")}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    selectedContractType === "standard"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/50"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">Standard</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Listing & Distribution
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedContractType("rolos")}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    selectedContractType === "rolos"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/50"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Building2 className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">ROL'OS PMS</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    PMS system access
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedContractType("referral")}
                  className={`p-3 rounded-lg border-2 text-left transition-all ${
                    selectedContractType === "referral"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/50"
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Handshake className="h-4 w-4 text-primary" />
                    <span className="font-medium text-sm">Referral</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Partner agreement
                  </p>
                </button>
              </div>
            </div>
            {noPropertiesWarning && !validatingEmail && sendEmail && !selectedProperty && (
              <Alert className="bg-amber-50 border-amber-200">
                <Building2 className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800">
                  <p className="font-medium">New Owner Onboarding</p>
                  <p className="text-sm mt-1">
                    A new user account will be created. The owner will provide property details when signing the contract.
                  </p>
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
              disabled={sending || !sendEmail}
            >
              {sending ? "Sending..." : noPropertiesWarning ? "Send & Create Owner" : "Send Contract"}
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

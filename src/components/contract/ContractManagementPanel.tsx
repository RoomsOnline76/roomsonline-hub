import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ContractStatusBadge } from "./ContractStatusBadge";
import { ContractOverrideModal } from "./ContractOverrideModal";
import { useOwnerContract } from "@/hooks/useOwnerContract";
import { useAuth } from "@/hooks/useAuth";
import { FileText, Send, RefreshCw, Download, Shield, AlertTriangle, Building2, Server } from "lucide-react";
import { format } from "date-fns";
import { generateSignedContractHTML, generatePdfFromDynamicTemplate, PropertyContractDetails, SignatureData, ContractMetadata, CoveredProperty } from "@/lib/contractAgreementText";
import { supabase } from "@/integrations/supabase/client";
import { renderContractWithVariables } from "@/hooks/useContractTemplates";
import { resolveBillingContractVariables, billingVariablesToMap } from "@/lib/contractBillingVariables";
import { resolveRepContractVariables } from "@/lib/repContractVariables";

interface ContractManagementPanelProps {
  propertyId: string;
  propertyName?: string;
  ownerEmail?: string;
  ownerName?: string;
  showOnWebsite?: boolean;
  isRolProperty?: boolean;
}

export function ContractManagementPanel({
  propertyId,
  propertyName,
  ownerEmail,
  ownerName,
  showOnWebsite = false,
  isRolProperty = false,
}: ContractManagementPanelProps) {
  const { isAdmin, isDev, isFearlessLeader } = useAuth();
  const {
    contract,
    isLoading,
    sendContract,
    overrideContract,
    resendContract,
    hasValidContract,
    ownerProperties,
  } = useOwnerContract(ownerEmail);

  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [contractTypeModalOpen, setContractTypeModalOpen] = useState(false);
  const [selectedContractType, setSelectedContractType] = useState<'standard' | 'rolos'>(
    isRolProperty ? 'rolos' : 'standard'
  );

  const handleSendContract = () => {
    if (!ownerEmail) {
      return;
    }
    // If ROL property, show contract type selection modal
    if (isRolProperty && !contract) {
      setContractTypeModalOpen(true);
    } else {
      sendContract.mutate({ ownerName, contractType: selectedContractType });
    }
  };

  const handleConfirmSend = () => {
    sendContract.mutate({ ownerName, contractType: selectedContractType });
    setContractTypeModalOpen(false);
  };

  const handleOverride = (reason: string) => {
    overrideContract.mutate({ reason }, {
      onSuccess: () => setOverrideModalOpen(false),
    });
  };

  const canSend = !!ownerEmail;
  const showWarning = showOnWebsite && !hasValidContract;

  // Generate and download contract as branded HTML (printable) - uses dynamic template if available
  const handleDownloadContract = async () => {
    if (!contract || contract.status !== "signed") return;

    // Build property details for contract generation
    const propertyDetails: PropertyContractDetails = {
      name: ownerProperties[0]?.name || ownerName || "Property Owner",
      registeredName: ownerName || ownerEmail || "Property Owner",
      email: ownerEmail,
    };

    const signatureData: SignatureData = {
      signedByName: contract.signed_by_name || "Unknown",
      signedByEmail: contract.signed_by_email || "",
      signedByDesignation: contract.signed_by_designation || undefined,
      // Use dataUrl from signature_data (base64) for reliable PDF display
      signatureImageUrl: (contract.signature_data as any)?.dataUrl || contract.signature_image_url || "",
      signedAt: contract.signed_at || new Date().toISOString(),
    };

    const metadata: ContractMetadata = {
      contractId: contract.id,
      downloadedAt: new Date().toISOString(),
      version: contract.version,
    };

    let htmlContent: string;

    // Try to fetch dynamic template content if template_version_id exists
    if (contract.template_version_id) {
      try {
        const { data: templateVersion } = await supabase
          .from('contract_template_versions')
          .select('content_markdown')
          .eq('id', contract.template_version_id)
          .single();

        if (templateVersion?.content_markdown) {
          // Build covered properties list for template
          const propertiesListHtml = ownerProperties.length > 0
            ? `<div class="covered-properties-list">
                <p><strong>Properties covered by this agreement:</strong></p>
                <ul>
                  ${ownerProperties.map(p => `<li><strong>${p.name}</strong></li>`).join('')}
                </ul>
              </div>`
            : '<p><em>No properties currently linked to this owner.</em></p>';

          // Get owner business details from first property's amenities
          const amenities = ownerProperties[0]?.amenities as Record<string, any> | undefined;
          const ownerVariables: Record<string, string> = {
            covered_properties_list: propertiesListHtml,
            owner_registered_name: amenities?.registered_business_name || ownerName || 'N/A',
            owner_registration_number: amenities?.registration_number || amenities?.banking?.property_registration || 'N/A',
            owner_vat_number: amenities?.vat_number || amenities?.banking?.vat_number || 'N/A',
            owner_telephone: amenities?.telephone || amenities?.contact?.telephone || 'N/A',
            owner_mobile: amenities?.mobile_number || 'N/A',
            owner_email: ownerEmail || 'N/A',
            owner_physical_address: amenities?.address_details?.physical_address || `${ownerProperties[0]?.address || ''}, ${ownerProperties[0]?.city || ''}, ${ownerProperties[0]?.country || ''}`.replace(/^, |, $/g, '') || 'N/A',
            owner_postal_address: amenities?.postal_address || amenities?.address_details?.postal_address || 'N/A',
            owner_key_representative: amenities?.key_representative || ownerName || 'N/A',
          };

          // Enrich with billing-driven variables (portfolio-aware, global defaults as base)
          const propertyIds = ownerProperties.map(p => p.id).filter(Boolean);
          if (propertyIds.length > 0) {
            try {
              const billingVars = await resolveBillingContractVariables(propertyIds);
              Object.assign(ownerVariables, billingVariablesToMap(billingVars));
              // Legacy listing-agreement placeholders share the resolved listing rate
              ownerVariables.commission_percentage = billingVars.listing_commission_rate;
              ownerVariables.listing_commission_percentage = billingVars.listing_commission_rate;
              ownerVariables.pms_commission_percentage = billingVars.pms_commission_rate;
              // Also map v2 template fields
              ownerVariables.property_name = amenities?.registered_business_name || ownerName || ownerProperties[0]?.name || 'N/A';
              ownerVariables.registered_business_name = amenities?.registered_business_name || 'N/A';
              ownerVariables.registration_number = amenities?.registration_number || 'N/A';
              ownerVariables.vat_number = amenities?.vat_number || 'N/A';
              ownerVariables.physical_address = ownerVariables.owner_physical_address;
              ownerVariables.key_representative = ownerVariables.owner_key_representative;
              ownerVariables.contact_email = ownerEmail || 'N/A';
              ownerVariables.contact_phone = amenities?.telephone || 'N/A';
              ownerVariables.effective_date = new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
              ownerVariables.signatory_name = '';
              ownerVariables.signatory_designation = '';
              ownerVariables.signature_date = new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' });
            } catch (e) {
              console.error('Failed to resolve billing variables:', e);
            }
          }

          // Referral / sales-rep agreements: fill commission economics from the rep tier
          if (/\{\{(first_year_rate|residual_rate|rep_code)\}\}/.test(templateVersion.content_markdown)) {
            try {
              const repResult = await resolveRepContractVariables({ email: ownerEmail });
              if (repResult) Object.assign(ownerVariables, repResult.variables);
            } catch (e) {
              console.error('Failed to resolve rep contract variables:', e);
            }
          }

          // Render template with variables
          const renderedMarkdown = renderContractWithVariables(
            templateVersion.content_markdown,
            ownerVariables
          );

          // Convert markdown to HTML
          const renderedHtml = convertMarkdownToHtml(renderedMarkdown);

          // Use dynamic template generator
          htmlContent = generatePdfFromDynamicTemplate(
            renderedHtml,
            signatureData,
            metadata
          );
        } else {
          // Fallback to hardcoded generator
          htmlContent = generateSignedContractHTML(
            propertyDetails, 
            signatureData, 
            metadata, 
            ownerProperties.map(p => ({ name: p.name }))
          );
        }
      } catch (error) {
        console.error('Failed to fetch template:', error);
        // Fallback to hardcoded generator
        htmlContent = generateSignedContractHTML(
          propertyDetails, 
          signatureData, 
          metadata, 
          ownerProperties.map(p => ({ name: p.name }))
        );
      }
    } else {
      // No template version - use hardcoded generator
      htmlContent = generateSignedContractHTML(
        propertyDetails, 
        signatureData, 
        metadata, 
        ownerProperties.map(p => ({ name: p.name }))
      );
    }
    
    // Open in new window for print
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
    }
  };

  // Simple markdown to HTML converter (same as ContractSign.tsx)
  function convertMarkdownToHtml(markdown: string): string {
    const ESCAPED_PIPE_PLACEHOLDER = '___PIPE___';
    
    return markdown
      .replace(/\\\|/g, ESCAPED_PIPE_PLACEHOLDER)
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 style="margin-top: 24px; margin-bottom: 12px; font-size: 1.25rem; font-weight: 600;">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 style="margin-bottom: 16px; font-size: 1.5rem; font-weight: 700; text-align: center;">$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/^---$/gm, '<hr style="margin: 16px 0; border: none; border-top: 1px solid #e5e7eb;" />')
      .replace(/\|(.+)\|/g, (match, content) => {
        if (content.includes('---')) return '';
        const cells = content.split('|').map((cell: string) => cell.trim());
        const isHeader = content.includes('Field') || content.includes('Value');
        const tag = isHeader ? 'th' : 'td';
        const isBankRow = content.includes('Bank account');
        const labelStyle = `padding: 8px; border: 1px solid #e5e7eb; text-align: left;${isBankRow ? ' vertical-align: top;' : ''}`;
        const valueStyle = `padding: 8px; border: 1px solid #e5e7eb; text-align: left;`;
        return `<tr>${cells.map((cell: string, idx: number) => {
          const style = idx === 0 ? labelStyle : valueStyle;
          const formattedCell = cell.replace(new RegExp(ESCAPED_PIPE_PLACEHOLDER, 'g'), '<br/>');
          return `<${tag} style="${style}">${formattedCell}</${tag}>`;
        }).join('')}</tr>`;
      })
      .replace(/(<tr>.*?<\/tr>\s*)+/gs, '<table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">$&</table>')
      .replace(new RegExp(ESCAPED_PIPE_PLACEHOLDER, 'g'), '|')
      .replace(/^- (.+)$/gm, '<li style="margin-left: 20px;">$1</li>')
      .replace(/^(\d+\.\d+) (.+)$/gm, '<p style="margin-left: 20px; margin-bottom: 8px;"><strong>$1</strong> $2</p>')
      .replace(/^(?!<[h|t|l|p|u|d|hr])(.+)$/gm, '<p style="margin-bottom: 12px; line-height: 1.6;">$1</p>')
      .replace(/<p[^>]*>\s*<\/p>/g, '');
  }

  return (
    <>
      <Card>
        <CardHeader className="py-2 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Owner Contract Status
            {contract && (
              <ContractStatusBadge
                status={contract.status}
                signedAt={contract.signed_at}
                sentAt={contract.sent_at}
                overrideReason={contract.override_reason}
                overrideAt={contract.override_at}
              />
            )}
            {!contract && !isLoading && (
              <ContractStatusBadge status={null} />
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="py-2 px-4 space-y-3">
          {/* Warning for live properties without contract */}
          {showWarning && (
            <Alert variant="destructive" className="py-2">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                This property is visible on the website WITHOUT a signed contract.
                This poses legal and financial risks.
              </AlertDescription>
            </Alert>
          )}

          {/* Properties covered by this contract */}
          {ownerProperties.length > 0 && (
            <div className="text-xs text-muted-foreground border rounded-md p-2 bg-muted/30">
              <div className="flex items-center gap-1 font-medium text-foreground mb-1">
                <Building2 className="h-3 w-3" />
                Properties Covered ({ownerProperties.length})
              </div>
              <div className="flex flex-wrap gap-1">
                {ownerProperties.slice(0, 5).map((prop) => (
                  <span key={prop.id} className="inline-block px-1.5 py-0.5 bg-background rounded text-[10px]">
                    {prop.name}
                  </span>
                ))}
                {ownerProperties.length > 5 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{ownerProperties.length - 5} more
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Contract Details */}
          {contract && (
            <div className="text-xs space-y-1 text-muted-foreground">
              {contract.status === "signed" && (
                <>
                  <p>Signed by: <span className="text-foreground">{contract.signed_by_name}</span></p>
                  {contract.signed_by_designation && (
                    <p>Designation: <span className="text-foreground">{contract.signed_by_designation}</span></p>
                  )}
                  <p>Signed on: <span className="text-foreground">{contract.signed_at ? format(new Date(contract.signed_at), "dd MMM yyyy 'at' HH:mm") : "N/A"}</span></p>
                </>
              )}
              {contract.status === "sent" && contract.sent_at && (
                <p>Sent on: <span className="text-foreground">{format(new Date(contract.sent_at), "dd MMM yyyy 'at' HH:mm")}</span></p>
              )}
              {contract.status === "overridden" && (
                <>
                  <p>Overridden on: <span className="text-foreground">{contract.override_at ? format(new Date(contract.override_at), "dd MMM yyyy") : "N/A"}</span></p>
                  <p>Reason: <span className="text-foreground italic">{contract.override_reason}</span></p>
                </>
              )}
              <p>Version: <span className="text-foreground">{contract.version}</span></p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-2">
            {/* Send Contract Button */}
            {(!contract || contract.status === "declined") && (
              <Button
                size="sm"
                onClick={handleSendContract}
                disabled={!canSend || sendContract.isPending}
                className="h-7 text-xs gap-1"
              >
                {sendContract.isPending ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <Send className="h-3 w-3" />
                )}
                Send Contract
              </Button>
            )}

            {/* Resend Button */}
            {(contract?.status === "sent" || contract?.status === "viewed") && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => resendContract.mutate()}
                disabled={resendContract.isPending}
                className="h-7 text-xs gap-1"
              >
                {resendContract.isPending ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                Resend
              </Button>
            )}

            {/* Download Signed Contract */}
            {contract?.status === "signed" && (
              <>
                {contract.pdf_url ? (
                  <Button
                    size="sm"
                    variant="outline"
                    asChild
                    className="h-7 text-xs gap-1"
                  >
                    <a href={contract.pdf_url} target="_blank" rel="noopener noreferrer">
                      <Download className="h-3 w-3" />
                      Download PDF
                    </a>
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDownloadContract}
                    className="h-7 text-xs gap-1"
                  >
                    <Download className="h-3 w-3" />
                    Download Contract
                  </Button>
                )}
              </>
            )}

            {/* For overridden contracts, show note */}
            {contract?.status === "overridden" && (
              <span className="text-xs text-muted-foreground italic">
                Contract requirement overridden — no PDF available
              </span>
            )}

            {/* Admin Override */}
            {(isAdmin || isDev || isFearlessLeader) && !hasValidContract && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setOverrideModalOpen(true)}
                className="h-7 text-xs gap-1 text-orange-600 hover:text-orange-700 border-orange-300 hover:bg-orange-50"
              >
                <Shield className="h-3 w-3" />
                Override
              </Button>
            )}
          </div>

          {/* No owner email warning */}
          {!ownerEmail && (
            <p className="text-xs text-muted-foreground">
              Set an owner email above to send the contract.
            </p>
          )}
        </CardContent>
      </Card>

      <ContractOverrideModal
        open={overrideModalOpen}
        onOpenChange={setOverrideModalOpen}
        onConfirm={handleOverride}
        propertyName={ownerEmail ? `Owner: ${ownerEmail}` : propertyName}
        isLoading={overrideContract.isPending}
      />

      {/* Contract Type Selection Modal for ROL Properties */}
      <Dialog open={contractTypeModalOpen} onOpenChange={setContractTypeModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Select Contract Type</DialogTitle>
            <DialogDescription>
              Choose the appropriate contract type for this property owner.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <button
              type="button"
              onClick={() => setSelectedContractType("standard")}
              className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                selectedContractType === "standard"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/50"
              }`}
            >
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Standard Agreement</p>
                  <p className="text-sm text-muted-foreground">
                    Accommodation Listing & Distribution Agreement only
                  </p>
                </div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setSelectedContractType("rolos")}
              className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                selectedContractType === "rolos"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/50"
              }`}
            >
              <div className="flex items-center gap-3">
                <Server className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">ROL'OS PMS Partnership</p>
                  <p className="text-sm text-muted-foreground">
                    Includes PMS system access, data handling & support terms
                  </p>
                </div>
              </div>
            </button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setContractTypeModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleConfirmSend} disabled={sendContract.isPending}>
              {sendContract.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  Send Contract
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

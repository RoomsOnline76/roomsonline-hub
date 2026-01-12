import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ContractStatusBadge } from "./ContractStatusBadge";
import { ContractOverrideModal } from "./ContractOverrideModal";
import { usePropertyContract } from "@/hooks/usePropertyContract";
import { useAuth } from "@/hooks/useAuth";
import { FileText, Send, RefreshCw, Download, Shield, AlertTriangle, ExternalLink } from "lucide-react";
import { format } from "date-fns";

interface ContractManagementPanelProps {
  propertyId: string;
  propertyName?: string;
  ownerEmail?: string;
  ownerName?: string;
  showOnWebsite?: boolean;
}

export function ContractManagementPanel({
  propertyId,
  propertyName,
  ownerEmail,
  ownerName,
  showOnWebsite = false,
}: ContractManagementPanelProps) {
  const { isAdmin, isDev } = useAuth();
  const {
    contract,
    isLoading,
    sendContract,
    overrideContract,
    resendContract,
    hasValidContract,
  } = usePropertyContract(propertyId);

  const [overrideModalOpen, setOverrideModalOpen] = useState(false);

  const handleSendContract = () => {
    if (!ownerEmail) {
      return;
    }
    sendContract.mutate({ ownerEmail, ownerName });
  };

  const handleOverride = (reason: string) => {
    overrideContract.mutate({ reason }, {
      onSuccess: () => setOverrideModalOpen(false),
    });
  };

  const canSend = !!ownerEmail;
  const showWarning = showOnWebsite && !hasValidContract;

  return (
    <>
      <Card>
        <CardHeader className="py-2 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Contract Status
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

            {/* Download Signed PDF */}
            {contract?.status === "signed" && contract.pdf_url && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(contract.pdf_url!, "_blank")}
                className="h-7 text-xs gap-1"
              >
                <Download className="h-3 w-3" />
                Download PDF
              </Button>
            )}

            {/* Admin Override */}
            {(isAdmin || isDev) && !hasValidContract && (
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
        propertyName={propertyName}
        isLoading={overrideContract.isPending}
      />
    </>
  );
}

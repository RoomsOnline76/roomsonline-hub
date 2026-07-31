import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { SignatureCanvas } from "@/components/contract/SignatureCanvas";
import { Loader2, CheckCircle2, FileText } from "lucide-react";
import { toast } from "sonner";
import { generateSignedRepAgreementHTML } from "@/lib/repAgreementText";
import type { RepCommissionTerms } from "@/lib/repContractTerms";

interface PortalRep {
  id: string;
  display_name: string;
  rep_code: string;
  email: string;
  phone: string | null;
}

interface PortalContract {
  id: string;
  status: string;
  signed_at: string | null;
  signer_name: string | null;
  signed_html: string | null;
  terms_snapshot: RepCommissionTerms | null;
}

export default function RepContractSign() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [contract, setContract] = useState<PortalContract | null>(null);
  const [rep, setRep] = useState<PortalRep | null>(null);

  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!token) return;
      setLoading(true);
      const { data, error: fnError } = await supabase.functions.invoke("rep-contract-portal", {
        body: { action: "get", token },
      });
      if (fnError || data?.error) {
        setError("This agreement link is not valid or has expired.");
      } else {
        setContract(data.contract);
        setRep(data.rep);
        setSignerName(data.rep?.display_name || "");
        setSignerEmail(data.rep?.email || "");
      }
      setLoading(false);
    };
    load();
  }, [token]);

  const isSigned = contract?.status === "signed";
  const isRevoked = contract?.status === "revoked";

  const terms = contract?.terms_snapshot ?? null;
  const canSubmit = useMemo(
    () => !!signerName.trim() && !!signerEmail.trim() && !!signature && accepted && !submitting,
    [signerName, signerEmail, signature, accepted, submitting],
  );

  const handleSign = async () => {
    if (!token || !rep || !contract || !terms || !signature) return;
    setSubmitting(true);
    const signedHtml = generateSignedRepAgreementHTML(
      { display_name: rep.display_name, rep_code: rep.rep_code, email: rep.email, phone: rep.phone },
      terms,
      contract.signed_html || "",
      {
        signedByName: signerName,
        signedByEmail: signerEmail,
        signatureImageUrl: signature,
        signedAt: new Date().toISOString(),
      },
    );

    const { data, error: fnError } = await supabase.functions.invoke("rep-contract-portal", {
      body: {
        action: "sign",
        token,
        signer_name: signerName,
        signer_email: signerEmail,
        signature_image: signature,
        signed_html: signedHtml,
      },
    });
    setSubmitting(false);

    if (fnError || data?.error) {
      toast.error("Could not sign the agreement", { description: data?.error || fnError?.message });
      return;
    }
    toast.success("Agreement signed");
    setContract({ ...contract, status: "signed", signed_at: data.signed_at, signed_html: signedHtml });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !contract || !rep) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="text-base">Agreement unavailable</CardTitle>
            <CardDescription>{error || "This agreement could not be found."}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  Sales Representative Agreement
                </CardTitle>
                <CardDescription>
                  {rep.display_name} · {rep.rep_code}
                </CardDescription>
              </div>
              {isSigned && (
                <Badge className="bg-success-surface text-success">
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Signed
                </Badge>
              )}
              {isRevoked && <Badge variant="destructive">Revoked</Badge>}
            </div>
          </CardHeader>
          <CardContent>
            <div
              className="prose prose-sm max-w-none dark:prose-invert"
              dangerouslySetInnerHTML={{ __html: contract.signed_html || "" }}
            />
          </CardContent>
        </Card>

        {!isSigned && !isRevoked && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Sign the agreement</CardTitle>
              <CardDescription className="text-xs">
                Your signature confirms acceptance of the commission terms above.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">Full name</Label>
                  <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email address</Label>
                  <Input type="email" value={signerEmail} onChange={(e) => setSignerEmail(e.target.value)} />
                </div>
              </div>
              <SignatureCanvas onSignatureChange={setSignature} disabled={submitting} />
              <div className="flex items-start gap-2">
                <Checkbox
                  id="rep-accept"
                  checked={accepted}
                  onCheckedChange={(v) => setAccepted(v === true)}
                />
                <Label htmlFor="rep-accept" className="text-xs leading-relaxed font-normal">
                  I have read and accept the commission terms, residual period and clawback conditions set out in
                  this agreement.
                </Label>
              </div>
              <Button className="w-full" disabled={!canSubmit} onClick={handleSign}>
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Sign agreement
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SignatureCanvas } from "@/components/contract/SignatureCanvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { FileText, Send, Check, AlertTriangle, Clock, Download, Loader2 } from "lucide-react";
import rolLogo from "@/assets/rol-logo.png";

interface ContractData {
  id: string;
  property_id: string;
  status: string;
  token_expires_at: string | null;
  unsigned_pdf_url: string | null;
  property?: {
    name: string;
  };
}

export default function ContractSign() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [contract, setContract] = useState<ContractData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [signeeName, setSigneeName] = useState("");
  const [signeeEmail, setSigneeEmail] = useState("");
  const [signeeDesignation, setSigneeDesignation] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Load contract data
  useEffect(() => {
    async function loadContract() {
      if (!token) {
        setError("Invalid signing link");
        setLoading(false);
        return;
      }

      try {
        // Fetch contract by signing token
        const { data, error: fetchError } = await supabase
          .from("property_contracts")
          .select(`
            id,
            property_id,
            status,
            token_expires_at,
            unsigned_pdf_url,
            sent_to_email
          `)
          .eq("signing_token", token)
          .single();

        if (fetchError || !data) {
          setError("Contract not found or link has expired");
          setLoading(false);
          return;
        }

        // Check if already signed
        if (data.status === "signed") {
          setError("This contract has already been signed");
          setLoading(false);
          return;
        }

        // Check if token expired
        if (data.token_expires_at && new Date(data.token_expires_at) < new Date()) {
          setError("This signing link has expired. Please contact RoomsOnline for a new link.");
          setLoading(false);
          return;
        }

        // Fetch property name
        const { data: property } = await supabase
          .from("properties")
          .select("name")
          .eq("id", data.property_id)
          .single();

        // Pre-fill email if available
        if (data.sent_to_email) {
          setSigneeEmail(data.sent_to_email);
        }

        setContract({
          ...data,
          property: property || undefined,
        });

        // Mark as viewed
        await supabase
          .from("property_contracts")
          .update({ viewed_at: new Date().toISOString(), status: "viewed" })
          .eq("id", data.id)
          .eq("status", "sent");

      } catch (err) {
        console.error("Error loading contract:", err);
        setError("Failed to load contract");
      } finally {
        setLoading(false);
      }
    }

    loadContract();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!contract || !signatureDataUrl || !signeeName || !signeeEmail || !agreedToTerms) {
      toast.error("Please complete all required fields");
      return;
    }

    setSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke("process-signature", {
        body: {
          contract_id: contract.id,
          signing_token: token,
          signee_name: signeeName,
          signee_email: signeeEmail,
          signee_designation: signeeDesignation,
          signature_data_url: signatureDataUrl,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Contract signed successfully!");
      
      // Show success state
      setContract(prev => prev ? { ...prev, status: "signed" } : null);

    } catch (err) {
      console.error("Error signing contract:", err);
      toast.error("Failed to submit signature. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const isFormValid = signeeName && signeeEmail && signatureDataUrl && agreedToTerms;

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading contract...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="text-center">
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h1 className="text-xl font-semibold mb-2">Unable to Load Contract</h1>
              <p className="text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state (after signing)
  if (contract?.status === "signed") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <h1 className="text-xl font-semibold mb-2">Contract Signed Successfully!</h1>
              <p className="text-muted-foreground mb-6">
                Thank you for signing the contract for {contract.property?.name || "your property"}.
                A copy has been sent to your email.
              </p>
              <Button onClick={() => window.close()} variant="outline">
                Close this page
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Main signing form
  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={rolLogo} alt="RoomsOnline" className="h-8" />
            <span className="text-lg font-semibold">Contract Signing</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            Secure signing
          </div>
        </div>
      </header>

      <main className="container py-8 max-w-2xl">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">
              Property Agreement Contract
            </CardTitle>
            <CardDescription>
              {contract?.property?.name || "Property Contract"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Contract Preview */}
            {contract?.unsigned_pdf_url && (
              <div className="space-y-2">
                <Label>Contract Document</Label>
                <div className="border rounded-lg bg-muted/30 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileText className="h-8 w-8 text-primary" />
                      <div>
                        <p className="font-medium">RoomsOnline Property Agreement</p>
                        <p className="text-sm text-muted-foreground">PDF Document</p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(contract.unsigned_pdf_url!, "_blank")}
                    >
                      <Download className="h-4 w-4 mr-2" />
                      View PDF
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Please review the contract before signing below.
                </p>
              </div>
            )}

            <Separator />

            {/* Signing Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Signee Details */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="signee-name">
                    Full Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="signee-name"
                    value={signeeName}
                    onChange={(e) => setSigneeName(e.target.value)}
                    placeholder="John Smith"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signee-email">
                    Email Address <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="signee-email"
                    type="email"
                    value={signeeEmail}
                    onChange={(e) => setSigneeEmail(e.target.value)}
                    placeholder="john@example.com"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="signee-designation">
                  Designation / Title (Optional)
                </Label>
                <Input
                  id="signee-designation"
                  value={signeeDesignation}
                  onChange={(e) => setSigneeDesignation(e.target.value)}
                  placeholder="Owner, Director, Manager, etc."
                />
              </div>

              {/* Signature */}
              <SignatureCanvas
                onSignatureChange={setSignatureDataUrl}
                disabled={submitting}
              />

              {/* Agreement Checkbox */}
              <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                <Checkbox
                  id="agree-terms"
                  checked={agreedToTerms}
                  onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
                  className="mt-0.5"
                />
                <Label htmlFor="agree-terms" className="text-sm font-normal leading-relaxed cursor-pointer">
                  I have read and agree to the terms of this contract. I confirm that I am
                  authorized to sign on behalf of the property and that the information
                  provided is accurate.
                </Label>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                size="lg"
                className="w-full"
                disabled={!isFormValid || submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Sign Contract
                  </>
                )}
              </Button>
            </form>

            {/* Footer Note */}
            <p className="text-xs text-center text-muted-foreground">
              By signing, you agree to receive a copy of the signed contract via email.
              This electronic signature is legally binding.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

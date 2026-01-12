import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SignatureCanvas } from "@/components/contract/SignatureCanvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { Send, Check, AlertTriangle, Clock, Loader2, Mail, ChevronDown, ChevronUp, FileText } from "lucide-react";
import rolLogo from "@/assets/rol-logo.png";
import { generateContractHTML, generateSignedContractHTML, PropertyContractDetails, SignatureData } from "@/lib/contractAgreementText";

interface PropertyData {
  id: string;
  name: string;
  owner_name: string | null;
  owner_email: string | null;
  address: string;
  city: string;
  country: string;
  amenities: any;
}

interface ContractData {
  id: string;
  property_id: string;
  status: string;
  token_expires_at: string | null;
  unsigned_pdf_url: string | null;
  pdf_url: string | null;
  sent_to_email: string | null;
  signed_at: string | null;
  signed_by_name: string | null;
  signed_by_email: string | null;
  signed_by_designation: string | null;
  signature_image_url: string | null;
  property?: PropertyData;
}

export default function ContractSign() {
  const { token } = useParams<{ token: string }>();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [contract, setContract] = useState<ContractData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [agreementExpanded, setAgreementExpanded] = useState(true);

  // Form state
  const [signeeName, setSigneeName] = useState("");
  const [signeeEmail, setSigneeEmail] = useState("");
  const [signeeDesignation, setSigneeDesignation] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Email for review state
  const [emailForReview, setEmailForReview] = useState("");

  // Build property details for contract
  const propertyDetails: PropertyContractDetails | undefined = contract?.property ? {
    name: contract.property.name,
    registeredName: contract.property.amenities?.registered_business_name || contract.property.name,
    registrationNumber: contract.property.amenities?.registration_number,
    vatNumber: contract.property.amenities?.vat_number,
    telephone: contract.property.amenities?.telephone,
    mobileNumber: contract.property.amenities?.mobile_number || contract.property.amenities?.telephone,
    email: contract.property.amenities?.contact_email || contract.property.owner_email || undefined,
    physicalAddress: [contract.property.address, contract.property.city, contract.property.country].filter(Boolean).join(", "),
    postalAddress: contract.property.amenities?.postal_address,
    keyRepresentative: contract.property.owner_name || undefined,
  } : undefined;

  // Load contract data
  useEffect(() => {
    async function loadContract() {
      if (!token) {
        setError("Invalid signing link");
        setLoading(false);
        return;
      }

      try {
        const { data, error: fetchError } = await supabase
          .from("property_contracts")
          .select(`
            id,
            property_id,
            status,
            token_expires_at,
            unsigned_pdf_url,
            pdf_url,
            sent_to_email,
            signed_at,
            signed_by_name,
            signed_by_email,
            signed_by_designation,
            signature_image_url
          `)
          .eq("signing_token", token)
          .single();

        if (fetchError || !data) {
          // Token not found - could be invalid or already used (nullified after signing)
          setError("This link is invalid or has already been used. Please request another link from RoomsOnline.");
          setLoading(false);
          return;
        }

        if (data.token_expires_at && new Date(data.token_expires_at) < new Date()) {
          setError("This signing link has expired. Please request another link from RoomsOnline.");
          setLoading(false);
          return;
        }

        // Fetch full property details including amenities
        const { data: property } = await supabase
          .from("properties")
          .select("id, name, owner_name, owner_email, address, city, country, amenities")
          .eq("id", data.property_id)
          .single();

        if (data.sent_to_email) {
          setSigneeEmail(data.sent_to_email);
          setEmailForReview(data.sent_to_email);
        }

        setContract({
          ...data,
          property: property || undefined,
        });

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
          property_details: propertyDetails,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success("Contract signed successfully!");
      setContract(prev => prev ? { ...prev, status: "signed" } : null);

    } catch (err) {
      console.error("Error signing contract:", err);
      toast.error("Failed to submit signature. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEmailForReview = async () => {
    if (!emailForReview || !contract) {
      toast.error("Please enter a valid email address");
      return;
    }

    setSendingEmail(true);

    try {
      const signingUrl = window.location.href;
      
      const { data, error } = await supabase.functions.invoke("email-contract-copy", {
        body: {
          contract_id: contract.id,
          email: emailForReview,
          property_name: contract.property?.name || "Your Property",
          signing_url: signingUrl,
          property_details: propertyDetails,
        },
      });

      if (error) throw error;

      toast.success(`Contract sent to ${emailForReview}`);
    } catch (err) {
      console.error("Error sending contract email:", err);
      toast.error("Failed to send email. Please try again.");
    } finally {
      setSendingEmail(false);
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
              <img src={rolLogo} alt="RoomsOnline" className="h-10 mx-auto mb-6" />
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h1 className="text-xl font-semibold mb-2">Unable to Load Contract</h1>
              <p className="text-muted-foreground mb-6">{error}</p>
              <p className="text-sm text-muted-foreground">
                Need help? Contact <a href="mailto:info@roomsonline.co.za" className="text-primary hover:underline">info@roomsonline.co.za</a>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state (after signing) - Show the full signed contract
  if (contract?.status === "signed") {
    const signatureData: SignatureData | undefined = contract.signed_at && contract.signed_by_name && contract.signature_image_url ? {
      signedByName: contract.signed_by_name,
      signedByEmail: contract.signed_by_email || '',
      signedByDesignation: contract.signed_by_designation || undefined,
      signatureImageUrl: contract.signature_image_url,
      signedAt: contract.signed_at,
    } : undefined;

    const signedDate = contract.signed_at 
      ? new Date(contract.signed_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
      : null;

    return (
      <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background">
        {/* Header */}
        <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
          <div className="container flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={rolLogo} alt="RoomsOnline" className="h-8" />
              <span className="text-lg font-semibold hidden sm:inline">Contract Signed</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-green-600">
              <Check className="h-4 w-4" />
              Signed & Verified
            </div>
          </div>
        </header>

        <main className="container py-6 sm:py-8 max-w-3xl">
          <Card>
            <CardHeader className="text-center pb-4">
              <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <CardTitle className="text-xl sm:text-2xl">
                Contract Successfully Signed
              </CardTitle>
              <CardDescription className="text-base space-y-1">
                <span className="block font-medium">{contract.property?.name || "Property"}</span>
                {signedDate && <span className="block">Signed by {contract.signed_by_name} on {signedDate}</span>}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Signed Contract Display */}
              <div className="border rounded-lg">
                <div className="flex items-center gap-3 p-4 border-b bg-muted/30">
                  <FileText className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium">Signed Agreement</p>
                    <p className="text-sm text-muted-foreground">Full contract with signature</p>
                  </div>
                </div>
                <ScrollArea className="h-[500px] p-4">
                  <div 
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: generateSignedContractHTML(propertyDetails, signatureData) }}
                  />
                </ScrollArea>
              </div>

              {/* Download PDF if available */}
              {contract.pdf_url && (
                <Button asChild variant="outline" className="w-full">
                  <a href={contract.pdf_url} target="_blank" rel="noopener noreferrer">
                    <FileText className="h-4 w-4 mr-2" />
                    Download Signed PDF
                  </a>
                </Button>
              )}

              {/* Contact Info */}
              <p className="text-sm text-center text-muted-foreground">
                Need help? Contact <a href="mailto:info@roomsonline.co.za" className="text-primary hover:underline">info@roomsonline.co.za</a>
              </p>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  // Main signing form
  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-10">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={rolLogo} alt="RoomsOnline" className="h-8" />
            <span className="text-lg font-semibold hidden sm:inline">Contract Signing</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            Secure signing
          </div>
        </div>
      </header>

      <main className="container py-6 sm:py-8 max-w-3xl">
        <Card>
          <CardHeader className="text-center pb-4">
            <CardTitle className="text-xl sm:text-2xl">
              Property Partnership Agreement
            </CardTitle>
            <CardDescription className="text-base">
              {contract?.property?.name || "Property Contract"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Agreement Text Section */}
            <Collapsible open={agreementExpanded} onOpenChange={setAgreementExpanded}>
              <div className="border rounded-lg">
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors text-left">
                    <div className="flex items-center gap-3">
                      <FileText className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium">Full Agreement Text</p>
                        <p className="text-sm text-muted-foreground">Click to {agreementExpanded ? "collapse" : "expand"}</p>
                      </div>
                    </div>
                    {agreementExpanded ? (
                      <ChevronUp className="h-5 w-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-muted-foreground" />
                    )}
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <Separator />
                  <ScrollArea className="h-[400px] p-4">
                    <div 
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: generateContractHTML(propertyDetails) }}
                    />
                  </ScrollArea>
                </CollapsibleContent>
              </div>
            </Collapsible>

            {/* Email for Review Section */}
            <div className="bg-muted/30 border rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1 space-y-3">
                  <div>
                    <p className="font-medium text-sm">Not ready to sign yet?</p>
                    <p className="text-sm text-muted-foreground">
                      Send a copy to your email to review at your convenience.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      placeholder="your@email.com"
                      value={emailForReview}
                      onChange={(e) => setEmailForReview(e.target.value)}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleEmailForReview}
                      disabled={sendingEmail || !emailForReview}
                    >
                      {sendingEmail ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Mail className="h-4 w-4 mr-2" />
                          Send
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            <Separator />

            {/* Signing Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">Signatory Details</h3>
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

                <div className="space-y-2 mt-4">
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
              This electronic signature is legally binding under the Electronic Communications and Transactions Act 25 of 2002.
            </p>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

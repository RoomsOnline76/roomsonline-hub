import { useState, useEffect, useMemo } from "react";
import DOMPurify from "dompurify";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SignatureCanvas } from "@/components/contract/SignatureCanvas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { Send, Check, AlertTriangle, Clock, Loader2, Mail, ChevronDown, ChevronUp, FileText, Download, Building2 } from "lucide-react";
import rolLogo from "@/assets/rol-logo.png";
import { generateContractHTML, generateSignedContractHTML, generatePdfFromDynamicTemplate, PropertyContractDetails, SignatureData, CoveredProperty as ContractCoveredProperty } from "@/lib/contractAgreementText";
import { renderContractWithVariables } from "@/hooks/useContractTemplates";
import { resolveBillingContractVariables, BillingContractVariables } from "@/lib/contractBillingVariables";

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

interface CoveredProperty {
  id: string;
  name: string;
  slug: string | null;
  address?: string;
  city?: string;
  country?: string;
  property_type?: string;
  amenities?: any;
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
  signature_data?: { dataUrl?: string } | null;
  property?: PropertyData;
  properties?: CoveredProperty[]; // For owner-level contracts
  owner_name?: string | null;
  owner_email?: string | null;
  contract_type?: 'owner' | 'property';
  template_content?: string | null;
  is_new_owner?: boolean;
  requires_property_details?: boolean;
}

interface PendingPropertyData {
  property_name: string;
  property_type: string;
  address: string;
  city: string;
  country: string;
  registered_business_name?: string;
  registration_number?: string;
  vat_number?: string;
  telephone?: string;
  mobile_number?: string;
  postal_address?: string;
  key_representative?: string;
}

// Error state with more context
interface ErrorState {
  message: string;
  type: 'expired' | 'not_found' | 'already_signed' | 'generic';
  contractData?: {
    id: string;
    signed_at: string | null;
    signed_by_name: string | null;
    signed_by_email: string | null;
    signed_by_designation: string | null;
    signature_image_url: string | null;
    owner_name: string | null;
    owner_email: string | null;
  };
}

// Convert number to English words for contract text
function numberToWords(n: number): string {
  const ones = ['zero','one','two','three','four','five','six','seven','eight','nine',
    'ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
  const tens = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];
  if (n < 20) return ones[n] || String(n);
  if (n < 100) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    return tens[t] + (o ? '-' + ones[o] : '');
  }
  return String(n);
}

export default function ContractSign() {
  const { token } = useParams<{ token: string }>();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [contract, setContract] = useState<ContractData | null>(null);
  const [coveredProperties, setCoveredProperties] = useState<CoveredProperty[]>([]);
   const [commissionText, setCommissionText] = useState('ten percent (10%)');
   const [pmsCommissionText, setPmsCommissionText] = useState('two percent (2%)');
   const [billingVars, setBillingVars] = useState<BillingContractVariables | null>(null);
  const [errorState, setErrorState] = useState<ErrorState | null>(null);
  const [agreementExpanded, setAgreementExpanded] = useState(true);

  // Form state
  const [signeeName, setSigneeName] = useState("");
  const [signeeEmail, setSigneeEmail] = useState("");
  const [signeeDesignation, setSigneeDesignation] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // New owner property details form state
  const [requiresPropertyDetails, setRequiresPropertyDetails] = useState(false);
  const [pendingPropertyData, setPendingPropertyData] = useState<PendingPropertyData>({
    property_name: "",
    property_type: "",
    address: "",
    city: "",
    country: "South Africa",
  });

  // Email for review state
  const [emailForReview, setEmailForReview] = useState("");

  // Build property details for contract - use first covered property as fallback for owner contracts
  const propertyDetails: PropertyContractDetails | undefined = useMemo(() => {
    // Use contract.property if available (legacy property-level contracts)
    if (contract?.property) {
      return {
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
      };
    }
    
    // For owner-level contracts, use first covered property with amenities
    const firstProperty = coveredProperties[0];
    if (firstProperty) {
      return {
        name: firstProperty.name,
        registeredName: firstProperty.amenities?.registered_business_name || firstProperty.name,
        registrationNumber: firstProperty.amenities?.banking?.property_registration || firstProperty.amenities?.registration_number,
        vatNumber: firstProperty.amenities?.banking?.vat_number || firstProperty.amenities?.vat_number,
        telephone: firstProperty.amenities?.contact?.telephone || firstProperty.amenities?.telephone,
        mobileNumber: firstProperty.amenities?.contact?.telephone || firstProperty.amenities?.mobile_number,
        email: firstProperty.amenities?.contact?.email || contract?.owner_email || undefined,
        physicalAddress: [firstProperty.address, firstProperty.city, firstProperty.country].filter(Boolean).join(", "),
        postalAddress: firstProperty.amenities?.address_details?.postal_address || firstProperty.amenities?.postal_address,
        keyRepresentative: firstProperty.amenities?.contact?.owner || contract?.owner_name || undefined,
      };
    }
    
    return undefined;
  }, [contract, coveredProperties]);

  // Render the contract template with variables (uses dynamic template if available)
  const renderedContractHtml = useMemo(() => {
    if (!contract) return "";
    
    // If we have template content from the contract editor, render it
    if (contract.template_content) {
      // Build properties list HTML for Section 2
      const propertiesListHtml = coveredProperties.length > 0
        ? `<div class="covered-properties-list">
            <p><strong>Properties covered by this agreement:</strong></p>
            <ul>
              ${coveredProperties.map(p => {
                const location = [p.address, p.city, p.country].filter(Boolean).join(', ');
                return `<li><strong>${p.name}</strong>${p.property_type ? ` (${p.property_type})` : ''}${location ? `<br/><span style="color: #666; font-size: 0.9em;">${location}</span>` : ''}</li>`;
              }).join('')}
            </ul>
          </div>`
        : '';

      // Build variables map for template substitution
      const firstProperty = coveredProperties[0];
      const variables: Record<string, string> = {
        owner_registered_name: contract.owner_name || propertyDetails?.registeredName || 'N/A',
        owner_registration_number: propertyDetails?.registrationNumber || 'N/A',
        owner_vat_number: propertyDetails?.vatNumber || 'N/A',
        owner_telephone: propertyDetails?.telephone || 'N/A',
        owner_mobile: propertyDetails?.mobileNumber || 'N/A',
        owner_email: contract.owner_email || propertyDetails?.email || 'N/A',
        owner_physical_address: firstProperty ? [firstProperty.address, firstProperty.city, firstProperty.country].filter(Boolean).join(', ') : propertyDetails?.physicalAddress || 'N/A',
        owner_postal_address: propertyDetails?.postalAddress || 'N/A',
        owner_key_representative: contract.owner_name || propertyDetails?.keyRepresentative || 'N/A',
        commission_percentage: commissionText,
        listing_commission_percentage: commissionText,
        pms_commission_percentage: pmsCommissionText,
        covered_properties_list: propertiesListHtml,
        // v2 PMS contract billing variables
        ...(billingVars ? {
          billing_strategy_label: billingVars.billing_strategy_label,
          commission_rate: billingVars.commission_rate,
          commission_clause: billingVars.commission_clause,
          subscription_fee_monthly: billingVars.subscription_fee_monthly,
          subscription_clause: billingVars.subscription_clause,
          white_label_monthly_fee: billingVars.white_label_monthly_fee,
          white_label_clause: billingVars.white_label_clause,
          payment_facilitator_fee: billingVars.payment_facilitator_fee,
          payment_facilitator_clause: billingVars.payment_facilitator_clause,
          volume_tier_clause: billingVars.volume_tier_clause,
        } : {}),
        // Map v2 template property details fields
        property_name: contract.owner_name || propertyDetails?.registeredName || coveredProperties[0]?.name || 'N/A',
        registered_business_name: propertyDetails?.registeredName || 'N/A',
        registration_number: propertyDetails?.registrationNumber || 'N/A',
        vat_number: propertyDetails?.vatNumber || 'N/A',
        physical_address: firstProperty ? [firstProperty.address, firstProperty.city, firstProperty.country].filter(Boolean).join(', ') : propertyDetails?.physicalAddress || 'N/A',
        key_representative: contract.owner_name || propertyDetails?.keyRepresentative || 'N/A',
        contact_email: contract.owner_email || propertyDetails?.email || 'N/A',
        contact_phone: propertyDetails?.telephone || 'N/A',
        effective_date: new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' }),
        signatory_name: '',
        signatory_designation: '',
        signature_date: new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' }),
      };

      // Render markdown with variable substitution
      const renderedMarkdown = renderContractWithVariables(contract.template_content, variables);
      
      // Simple markdown to HTML conversion for the contract
      const htmlContent = convertMarkdownToHtml(renderedMarkdown);
      
      // Add logo at the top
      return `
        <div class="contract-content">
          <div style="text-align: center; margin-bottom: 24px;">
            <img src="${rolLogo}" alt="RoomsOnline" style="max-height: 48px;" />
          </div>
          ${htmlContent}
        </div>
      `;
    }
    
    // Fallback to hardcoded HTML if no template
    return generateContractHTML(
      propertyDetails,
      coveredProperties.map(p => ({
        name: p.name,
        address: p.address,
        city: p.city,
        country: p.country,
        property_type: p.property_type,
      }))
    );
  }, [contract, coveredProperties, propertyDetails]);

  // Handle PDF download for signed contracts - uses dynamic template if available
  const handleDownloadPDF = () => {
    if (!contract) return;

    // Get signature data with base64 dataUrl for reliable display
    const signatureImageSrc = (contract as any).signature_data?.dataUrl || signatureDataUrl || contract.signature_image_url || '';
    const signatureData: SignatureData | undefined = contract.signed_at && contract.signed_by_name ? {
      signedByName: contract.signed_by_name,
      signedByEmail: contract.signed_by_email || '',
      signedByDesignation: contract.signed_by_designation || undefined,
      signatureImageUrl: signatureImageSrc,
      signedAt: contract.signed_at,
    } : signeeName && signatureDataUrl ? {
      signedByName: signeeName,
      signedByEmail: signeeEmail,
      signedByDesignation: signeeDesignation || undefined,
      signatureImageUrl: signatureDataUrl,
      signedAt: new Date().toISOString(),
    } : undefined;

    const metadata = {
      contractId: contract.id,
      downloadedAt: new Date().toISOString(),
      version: 1,
    };

    let htmlContent: string;
    
    // If dynamic template is available and rendered, use it for full contract content
    if (contract.template_content && renderedContractHtml) {
      htmlContent = generatePdfFromDynamicTemplate(
        renderedContractHtml,
        signatureData,
        metadata
      );
    } else {
      // Fallback to hardcoded generator (only has 3 sections)
      htmlContent = generateSignedContractHTML(
        propertyDetails,
        signatureData,
        metadata,
        coveredProperties.map(p => ({
          name: p.name,
          address: p.address,
          city: p.city,
          country: p.country,
          property_type: p.property_type,
        }))
      );
    }
    
    // Open in new window for print
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(htmlContent);
      printWindow.document.close();
    }
  };

  // Simple markdown to HTML converter
  function convertMarkdownToHtml(markdown: string): string {
    // Placeholder for escaped pipes to preserve them during table parsing
    const ESCAPED_PIPE_PLACEHOLDER = '___PIPE___';
    
    return markdown
      // First, replace escaped pipes with placeholder
      .replace(/\\\|/g, ESCAPED_PIPE_PLACEHOLDER)
      // Headers
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 style="margin-top: 24px; margin-bottom: 12px; font-size: 1.25rem; font-weight: 600;">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 style="margin-bottom: 16px; font-size: 1.5rem; font-weight: 700; text-align: center;">$1</h1>')
      // Bold
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      // Horizontal rules
      .replace(/^---$/gm, '<hr style="margin: 16px 0; border: none; border-top: 1px solid #e5e7eb;" />')
      // Tables (simple conversion)
      .replace(/\|(.+)\|/g, (match, content) => {
        if (content.includes('---')) return ''; // Skip separator rows
        const cells = content.split('|').map((cell: string) => cell.trim());
        const isHeader = content.includes('Field') || content.includes('Value');
        const tag = isHeader ? 'th' : 'td';
        // For bank details row, use vertical-align top
        const isBankRow = content.includes('Bank account');
        const labelStyle = `padding: 8px; border: 1px solid #e5e7eb; text-align: left;${isBankRow ? ' vertical-align: top;' : ''}`;
        const valueStyle = `padding: 8px; border: 1px solid #e5e7eb; text-align: left;`;
        return `<tr>${cells.map((cell: string, idx: number) => {
          const style = idx === 0 ? labelStyle : valueStyle;
          // Replace placeholder back with visual separator (line breaks for bank details)
          const formattedCell = cell.replace(new RegExp(ESCAPED_PIPE_PLACEHOLDER, 'g'), '<br/>');
          return `<${tag} style="${style}">${formattedCell}</${tag}>`;
        }).join('')}</tr>`;
      })
      // Wrap consecutive table rows
      .replace(/(<tr>.*?<\/tr>\s*)+/gs, '<table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">$&</table>')
      // Restore any remaining placeholders (shouldn't happen, but safety)
      .replace(new RegExp(ESCAPED_PIPE_PLACEHOLDER, 'g'), '|')
      // Lists
      .replace(/^- (.+)$/gm, '<li style="margin-left: 20px;">$1</li>')
      // Numbered lists (5.1, 5.2, etc.)
      .replace(/^(\d+\.\d+) (.+)$/gm, '<p style="margin-left: 20px; margin-bottom: 8px;"><strong>$1</strong> $2</p>')
      // Paragraphs (lines not already wrapped)
      .replace(/^(?!<[h|t|l|p|u|d|hr])(.+)$/gm, '<p style="margin-bottom: 12px; line-height: 1.6;">$1</p>')
      // Clean up empty paragraphs
      .replace(/<p[^>]*>\s*<\/p>/g, '');
  }

  // Load contract data via edge function (works for unauthenticated users)
  useEffect(() => {
    async function loadContract() {
      if (!token) {
        setErrorState({ message: "Invalid signing link", type: 'not_found' });
        setLoading(false);
        return;
      }

      try {
        const { data, error: fetchError } = await supabase.functions.invoke("get-contract-by-token", {
          body: { token },
        });

        if (fetchError) {
          console.error("Edge function error:", fetchError);
          setErrorState({ message: "Failed to load contract. Please try again.", type: 'generic' });
          setLoading(false);
          return;
        }

        // Check for ALREADY_SIGNED first (returned without error field)
        if (data?.code === "ALREADY_SIGNED") {
          // Contract already signed - set full contract state for viewing/downloading
          const contractData = data.contract;
          const propertiesList = data.properties || [];
          
          setCoveredProperties(propertiesList);
          setContract({
            id: contractData.id,
            property_id: contractData.property_id || "",
            status: "signed",
            token_expires_at: null,
            unsigned_pdf_url: null,
            pdf_url: contractData.pdf_url || null,
            sent_to_email: contractData.owner_email || contractData.sent_to_email,
            signed_at: contractData.signed_at,
            signed_by_name: contractData.signed_by_name || contractData.signee_name,
            signed_by_email: contractData.signed_by_email || contractData.signee_email,
            signed_by_designation: contractData.signed_by_designation || contractData.signee_designation,
            signature_image_url: contractData.signature_image_url || null,
            signature_data: contractData.signature_data || null,
            owner_name: contractData.owner_name,
            owner_email: contractData.owner_email,
            contract_type: data.contract_type || 'owner',
            template_content: data.template_content || null,
          });
          setLoading(false);
          return;
        }

        if (data?.error) {
          if (data.code === "NOT_FOUND") {
            setErrorState({ 
              message: "This link is invalid or has already been used.", 
              type: 'not_found' 
            });
          } else if (data.code === "EXPIRED") {
            setErrorState({ 
              message: "This signing link has expired.", 
              type: 'expired' 
            });
          } else {
            setErrorState({ message: data.error, type: 'generic' });
          }
          setLoading(false);
          return;
        }

        const contractData = data.contract;
        const propertyData = data.property;
        const propertiesList = data.properties || [];
        const contractType = data.contract_type || 'property';

        // Store covered properties for owner contracts
        if (contractType === 'owner' && propertiesList.length > 0) {
          setCoveredProperties(propertiesList);
        }

        // Fetch full property details including amenities (for contract text generation)
        let fullProperty = propertyData;
        if (propertyData?.id) {
          const { data: propWithAmenities } = await supabase
            .from("properties")
            .select("id, name, owner_name, owner_email, address, city, country, amenities")
            .eq("id", propertyData.id)
            .maybeSingle();
          
          if (propWithAmenities) {
            fullProperty = propWithAmenities;
          }
        }

        // Fetch commission rate from property commercial terms
        const propertyIds = propertiesList.map((p: any) => p.id).filter(Boolean);
        if (propertyIds.length === 0 && fullProperty?.id) {
          propertyIds.push(fullProperty.id);
        }
        if (propertyIds.length > 0) {
          const now = new Date().toISOString().split("T")[0];
          // Fetch listing commission
          const { data: listingTerms } = await supabase
            .from("property_commercial_terms")
            .select("revenue_share_percent, commission_type")
            .in("property_id", propertyIds)
            .eq("commission_type", "listing")
            .lte("effective_from", now)
            .or(`effective_to.is.null,effective_to.gte.${now}`)
            .order("effective_from", { ascending: false })
            .limit(1);
          
          if (listingTerms && listingTerms.length > 0) {
            const rate = listingTerms[0].revenue_share_percent;
            const words = numberToWords(rate);
            setCommissionText(`${words} percent (${rate}%)`);
          }

          // Fetch PMS commission
          const { data: pmsTerms } = await supabase
            .from("property_commercial_terms")
            .select("revenue_share_percent, commission_type")
            .in("property_id", propertyIds)
            .eq("commission_type", "pms")
            .lte("effective_from", now)
            .or(`effective_to.is.null,effective_to.gte.${now}`)
            .order("effective_from", { ascending: false })
            .limit(1);
          
          if (pmsTerms && pmsTerms.length > 0) {
            const rate = pmsTerms[0].revenue_share_percent;
            const words = numberToWords(rate);
            setPmsCommissionText(`${words} percent (${rate}%)`);
        }

        // Fetch billing config variables for v2 PMS contract template
        const billingResult = await resolveBillingContractVariables(propertyIds);
        setBillingVars(billingResult);
        }
        const emailToUse = contractData.sent_to_email || contractData.owner_email;
        if (emailToUse) {
          setSigneeEmail(emailToUse);
          setEmailForReview(emailToUse);
        }

        // Check if this is a new owner who needs to provide property details
        const needsPropertyDetails = data.requires_property_details === true;
        setRequiresPropertyDetails(needsPropertyDetails);

        setContract({
          id: contractData.id,
          property_id: contractData.property_id || "",
          status: contractData.status,
          token_expires_at: contractData.signing_token_expires_at || contractData.token_expires_at,
          unsigned_pdf_url: contractData.unsigned_pdf_url || null,
          pdf_url: contractData.pdf_url || null,
          sent_to_email: contractData.sent_to_email || contractData.owner_email || null,
          signed_at: null,
          signed_by_name: null,
          signed_by_email: null,
          signed_by_designation: null,
          signature_image_url: null,
          property: fullProperty || undefined,
          properties: propertiesList,
          owner_name: contractData.owner_name,
          owner_email: contractData.owner_email,
          contract_type: contractType,
          template_content: data.template_content || null,
          is_new_owner: data.is_new_owner || false,
          requires_property_details: needsPropertyDetails,
        });

      } catch (err) {
        console.error("Error loading contract:", err);
        setErrorState({ message: "Failed to load contract", type: 'generic' });
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

    // Validate property details if required
    if (requiresPropertyDetails) {
      if (!pendingPropertyData.property_name || !pendingPropertyData.property_type || 
          !pendingPropertyData.address || !pendingPropertyData.city || !pendingPropertyData.country) {
        toast.error("Please complete all required property details");
        return;
      }
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
          contract_type: contract.contract_type || 'property',
          pending_property_data: requiresPropertyDetails ? pendingPropertyData : undefined,
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

  const isPropertyFormValid = !requiresPropertyDetails || (
    pendingPropertyData.property_name && pendingPropertyData.property_type &&
    pendingPropertyData.address && pendingPropertyData.city && pendingPropertyData.country
  );
  const isFormValid = signeeName && signeeEmail && signatureDataUrl && agreedToTerms && isPropertyFormValid;

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

  // Error state - with different UI based on error type
  if (errorState) {
    // Already signed - show success message with option to request download
    if (errorState.type === 'already_signed') {
      const signedDate = errorState.contractData?.signed_at 
        ? new Date(errorState.contractData.signed_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })
        : null;
      
      return (
        <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <CardContent className="pt-6">
              <div className="text-center">
                <img src={rolLogo} alt="RoomsOnline" className="h-10 mx-auto mb-6" />
                <div className="h-16 w-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="h-8 w-8 text-green-600" />
                </div>
                <h1 className="text-xl font-semibold mb-2 text-green-700">Contract Already Signed</h1>
                <p className="text-muted-foreground mb-2">
                  This contract was signed{errorState.contractData?.signed_by_name ? ` by ${errorState.contractData.signed_by_name}` : ''}{signedDate ? ` on ${signedDate}` : ''}.
                </p>
                <p className="text-sm text-muted-foreground mb-6">
                  A signed copy was sent to the email address on file.
                </p>
                <div className="space-y-3">
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => window.location.href = `mailto:sleepinafrica@roomsonline.co.za?subject=Request%20Signed%20Contract%20Copy&body=Hi%20RoomsOnline%2C%0A%0APlease%20send%20me%20another%20copy%20of%20my%20signed%20contract.%0A%0AEmail%3A%20${encodeURIComponent(errorState.contractData?.signed_by_email || errorState.contractData?.owner_email || '')}%0A%0AThank%20you.`}
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Request Copy via Email
                  </Button>
                  <p className="text-xs text-muted-foreground">
                  Need help? Contact <a href="mailto:sleepinafrica@roomsonline.co.za" className="text-primary hover:underline">sleepinafrica@roomsonline.co.za</a>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    // Expired link - show message to request new link
    if (errorState.type === 'expired') {
      return (
        <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <CardContent className="pt-6">
              <div className="text-center">
                <img src={rolLogo} alt="RoomsOnline" className="h-10 mx-auto mb-6" />
                <Clock className="h-12 w-12 text-amber-500 mx-auto mb-4" />
                <h1 className="text-xl font-semibold mb-2">Signing Link Expired</h1>
                <p className="text-muted-foreground mb-6">
                  This signing link is no longer valid. For security reasons, contract links expire after a set period.
                </p>
                <div className="space-y-3">
                  <Button
                    className="w-full"
                    onClick={() => window.location.href = `mailto:sleepinafrica@roomsonline.co.za?subject=Request%20New%20Contract%20Signing%20Link&body=Hi%20RoomsOnline%2C%0A%0AMy%20contract%20signing%20link%20has%20expired.%20Please%20send%20me%20a%20new%20link.%0A%0AThank%20you.`}
                  >
                    <Mail className="h-4 w-4 mr-2" />
                    Request New Signing Link
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Email <a href="mailto:sleepinafrica@roomsonline.co.za" className="text-primary hover:underline">sleepinafrica@roomsonline.co.za</a> and we'll send you a fresh link.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    // Not found or generic error
    return (
      <div className="min-h-screen bg-gradient-to-b from-muted/30 to-background flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="text-center">
              <img src={rolLogo} alt="RoomsOnline" className="h-10 mx-auto mb-6" />
              <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h1 className="text-xl font-semibold mb-2">Unable to Load Contract</h1>
              <p className="text-muted-foreground mb-6">{errorState.message}</p>
              <p className="text-sm text-muted-foreground">
                Need help? Contact <a href="mailto:sleepinafrica@roomsonline.co.za" className="text-primary hover:underline">sleepinafrica@roomsonline.co.za</a>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Success state (after signing) - Show the full signed contract
  if (contract?.status === "signed") {
    // Prioritize base64 dataUrl from signature_data for reliable display
    const signatureImageSrc = contract.signature_data?.dataUrl || contract.signature_image_url || '';
    const signatureData: SignatureData | undefined = contract.signed_at && contract.signed_by_name && signatureImageSrc ? {
      signedByName: contract.signed_by_name,
      signedByEmail: contract.signed_by_email || '',
      signedByDesignation: contract.signed_by_designation || undefined,
      signatureImageUrl: signatureImageSrc,
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
              {/* Signed Contract Display - uses dynamic template if available */}
              <div className="border rounded-lg">
                <div className="flex items-center gap-3 p-4 border-b bg-muted/30">
                  <FileText className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium">Signed Agreement</p>
                    <p className="text-sm text-muted-foreground">Full contract with signature</p>
                  </div>
                </div>
                <ScrollArea className="h-[500px] p-4">
                  <div className="prose prose-sm max-w-none">
                    {/* Render the full contract content (dynamic template if available) */}
                    <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderedContractHtml) }} />
                    
                    {/* Signature block */}
                    {signatureData && (
                      <div className="mt-8 p-4 border rounded-lg bg-muted/30">
                        <h3 className="text-base font-semibold mb-3">Authorized Signature</h3>
                        <div className="space-y-1 text-sm">
                          <p><span className="font-medium">Signed by:</span> {signatureData.signedByName}</p>
                          <p><span className="font-medium">Email:</span> {signatureData.signedByEmail}</p>
                          {signatureData.signedByDesignation && (
                            <p><span className="font-medium">Designation:</span> {signatureData.signedByDesignation}</p>
                          )}
                          <p><span className="font-medium">Date:</span> {new Date(signatureData.signedAt).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                        </div>
                        {signatureData.signatureImageUrl && (
                          <div className="mt-3">
                            <p className="font-medium text-sm mb-2">Signature:</p>
                            <img 
                              src={signatureData.signatureImageUrl} 
                              alt="Signature" 
                              className="max-h-24 max-w-[200px] border rounded p-2 bg-white"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>

              {/* Download PDF */}
              <Button variant="outline" className="w-full" onClick={handleDownloadPDF}>
                <Download className="h-4 w-4 mr-2" />
                Download Signed Contract (PDF)
              </Button>

              {/* Contact Info */}
              <p className="text-sm text-center text-muted-foreground">
                Need help? Contact <a href="mailto:sleepinafrica@roomsonline.co.za" className="text-primary hover:underline">sleepinafrica@roomsonline.co.za</a>
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
            <img src={rolLogo} alt="RoomsOnline" className="h-10 mx-auto mb-4" />
            <CardTitle className="text-xl sm:text-2xl">
              Property Partnership Agreement
            </CardTitle>
            <CardDescription className="text-base">
              {contract?.contract_type === 'owner' && contract.owner_name 
                ? `For: ${contract.owner_name}`
                : contract?.property?.name || "Property Contract"}
            </CardDescription>
            {/* Show covered properties for owner contracts */}
            {coveredProperties.length > 0 && (
              <div className="mt-3 text-sm text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Properties Covered by This Agreement:</p>
                <div className="flex flex-wrap justify-center gap-1.5">
                  {coveredProperties.map((prop) => (
                    <span
                      key={prop.id}
                      className="inline-block px-2 py-0.5 bg-muted rounded-md text-xs"
                    >
                      {prop.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
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
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderedContractHtml) }}
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

            {/* Property Details Form - for new owners */}
            {requiresPropertyDetails && (
              <div className="border rounded-lg p-4 bg-amber-50/50 border-amber-200">
                <h3 className="text-lg font-semibold mb-2 flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-amber-600" />
                  Property Details
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Please provide details about your property to complete the agreement.
                </p>
                <div className="grid gap-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Property Name <span className="text-destructive">*</span></Label>
                      <Input
                        value={pendingPropertyData.property_name}
                        onChange={(e) => setPendingPropertyData(p => ({ ...p, property_name: e.target.value }))}
                        placeholder="My Guest House"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Property Type <span className="text-destructive">*</span></Label>
                      <Select
                        value={pendingPropertyData.property_type}
                        onValueChange={(val) => setPendingPropertyData(p => ({ ...p, property_type: val }))}
                      >
                        <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Hotel">Hotel</SelectItem>
                          <SelectItem value="Guest House">Guest House</SelectItem>
                          <SelectItem value="Self-Catering">Self-Catering</SelectItem>
                          <SelectItem value="Bed & Breakfast">Bed & Breakfast</SelectItem>
                          <SelectItem value="Lodge">Lodge</SelectItem>
                          <SelectItem value="Boutique Hotel">Boutique Hotel</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Street Address <span className="text-destructive">*</span></Label>
                    <Input
                      value={pendingPropertyData.address}
                      onChange={(e) => setPendingPropertyData(p => ({ ...p, address: e.target.value }))}
                      placeholder="123 Main Street"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>City <span className="text-destructive">*</span></Label>
                      <Input
                        value={pendingPropertyData.city}
                        onChange={(e) => setPendingPropertyData(p => ({ ...p, city: e.target.value }))}
                        placeholder="Cape Town"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Country <span className="text-destructive">*</span></Label>
                      <Input
                        value={pendingPropertyData.country}
                        onChange={(e) => setPendingPropertyData(p => ({ ...p, country: e.target.value }))}
                        placeholder="South Africa"
                      />
                    </div>
                  </div>
                  <Separator className="my-2" />
                  <p className="text-sm font-medium">Business Registration (Optional)</p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Registered Business Name</Label>
                      <Input
                        value={pendingPropertyData.registered_business_name || ""}
                        onChange={(e) => setPendingPropertyData(p => ({ ...p, registered_business_name: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Registration Number</Label>
                      <Input
                        value={pendingPropertyData.registration_number || ""}
                        onChange={(e) => setPendingPropertyData(p => ({ ...p, registration_number: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>VAT Number</Label>
                      <Input
                        value={pendingPropertyData.vat_number || ""}
                        onChange={(e) => setPendingPropertyData(p => ({ ...p, vat_number: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Telephone</Label>
                      <Input
                        value={pendingPropertyData.telephone || ""}
                        onChange={(e) => setPendingPropertyData(p => ({ ...p, telephone: e.target.value }))}
                        placeholder="+27 21 123 4567"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Mobile Number</Label>
                      <Input
                        value={pendingPropertyData.mobile_number || ""}
                        onChange={(e) => setPendingPropertyData(p => ({ ...p, mobile_number: e.target.value }))}
                        placeholder="+27 82 123 4567"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Postal Address</Label>
                      <Input
                        value={pendingPropertyData.postal_address || ""}
                        onChange={(e) => setPendingPropertyData(p => ({ ...p, postal_address: e.target.value }))}
                        placeholder="PO Box 123, Cape Town, 8000"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Key Representative</Label>
                      <Input
                        value={pendingPropertyData.key_representative || ""}
                        onChange={(e) => setPendingPropertyData(p => ({ ...p, key_representative: e.target.value }))}
                        placeholder="Name of main contact person"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

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

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Globe, Loader2, ShieldCheck, ShieldAlert, ShieldQuestion, Copy } from "lucide-react";
import { CodeSnippetBlock } from "./CodeSnippetBlock";

interface WhiteLabelDomainPanelProps {
  propertyId: string;
  currentDomain: string | null;
  currentStatus: "unconfigured" | "pending" | "active" | "failed";
}

const CNAME_TARGET = "sleepinafrica.roomsonline.co.za";
const A_TARGET = "185.158.133.1";

const STATUS_META = {
  unconfigured: { label: "Not configured", icon: ShieldQuestion, tone: "secondary" as const },
  pending: { label: "Pending DNS", icon: Loader2, tone: "outline" as const },
  active: { label: "Active", icon: ShieldCheck, tone: "default" as const },
  failed: { label: "Failed", icon: ShieldAlert, tone: "destructive" as const },
};

export function WhiteLabelDomainPanel({ propertyId, currentDomain, currentStatus }: WhiteLabelDomainPanelProps) {
  const [domain, setDomain] = useState(currentDomain || "");
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();
  const status = STATUS_META[currentStatus] || STATUS_META.unconfigured;
  const StatusIcon = status.icon;

  useEffect(() => { setDomain(currentDomain || ""); }, [currentDomain]);

  async function save() {
    const clean = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!clean) {
      toast.error("Enter a domain like book.yourhotel.com");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("property_billing_configs")
      .update({
        white_label_domain: clean,
        white_label_domain_status: "pending",
      } as any)
      .eq("property_id", propertyId);
    setSaving(false);
    if (error) return toast.error("Could not save", { description: error.message });
    toast.success("Domain saved — now click Verify DNS");
    qc.invalidateQueries({ queryKey: ["whitelabel", propertyId] });
  }

  async function verify() {
    const clean = domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!clean) return toast.error("Save a domain first");
    setVerifying(true);
    const { data, error } = await supabase.functions.invoke("verify-whitelabel-domain", {
      body: { property_id: propertyId, domain: clean },
    });
    setVerifying(false);
    if (error) return toast.error("Verification failed", { description: error.message });
    qc.invalidateQueries({ queryKey: ["whitelabel", propertyId] });
    if (data?.status === "active") toast.success("Domain verified — WL host is live");
    else if (data?.status === "pending") toast.info("No DNS records found yet — try again in a few minutes");
    else toast.warning("DNS points elsewhere", { description: "Add the CNAME or A record shown below." });
  }

  const dnsSnippet = `Type: CNAME\nName: ${domain || "book"}\nValue: ${CNAME_TARGET}\n\n— OR (if your DNS provider doesn't allow CNAME at that name) —\n\nType: A\nName: ${domain || "book"}\nValue: ${A_TARGET}`;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Your own booking subdomain</CardTitle>
          </div>
          <Badge variant={status.tone} className="gap-1">
            <StatusIcon className={`h-3 w-3 ${currentStatus === "pending" ? "animate-spin" : ""}`} />
            {status.label}
          </Badge>
        </div>
        <CardDescription>
          Point a subdomain of your own site (for example <code>book.yourhotel.com</code>) at our hosting so the
          entire booking flow lives on your URL. Once verified, every integration snippet below automatically
          uses this domain — guests never see the ROL'OS URL.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr,auto,auto] gap-2 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">Booking subdomain</Label>
            <Input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="book.yourhotel.com"
              className="h-9"
            />
          </div>
          <Button size="sm" variant="outline" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
          </Button>
          <Button size="sm" onClick={verify} disabled={verifying || !domain}>
            {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Verify DNS
          </Button>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <Label className="text-xs">Add this DNS record at your registrar</Label>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 gap-1 text-xs"
              onClick={() => { navigator.clipboard.writeText(CNAME_TARGET); toast.success("CNAME target copied"); }}
            >
              <Copy className="h-3 w-3" /> Copy target
            </Button>
          </div>
          <CodeSnippetBlock code={dnsSnippet} language="text" title="DNS record" />
        </div>

        <p className="text-xs text-muted-foreground">
          SSL is provisioned automatically once DNS resolves. Verification usually succeeds within minutes but
          full propagation can take up to 72 hours. Reach out to support if the status stays Failed after that.
        </p>
      </CardContent>
    </Card>
  );
}

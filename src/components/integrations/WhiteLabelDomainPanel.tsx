import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Globe, Loader2, ShieldCheck, ShieldAlert, ShieldQuestion, Copy, ChevronDown, ChevronUp, CheckCircle2, Building2, AlertTriangle, ExternalLink, Trash2 } from "lucide-react";
import { CodeSnippetBlock } from "./CodeSnippetBlock";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface WhiteLabelDomainPanelProps {
  propertyId?: string;
  portfolioId?: string;
  currentDomain: string | null;
  currentStatus: "unconfigured" | "pending" | "pending_ssl" | "active" | "failed" | "dns_ok_tls_pending";
  scopeLabel?: string;
  inheritedNote?: string;
  readOnly?: boolean;
  lastError?: string | null;
}

const CNAME_TARGET = "fallback.roomsonline.co.za";

const STATUS_META = {
  unconfigured: { label: "Not configured", icon: ShieldQuestion, tone: "secondary" as const },
  pending: { label: "Pending DNS", icon: Loader2, tone: "outline" as const },
  pending_ssl: { label: "Issuing certificate…", icon: Loader2, tone: "outline" as const },
  dns_ok_tls_pending: { label: "Issuing certificate…", icon: Loader2, tone: "outline" as const },
  active: { label: "Active", icon: ShieldCheck, tone: "default" as const },
  failed: { label: "Failed", icon: ShieldAlert, tone: "destructive" as const },
};

export function WhiteLabelDomainPanel({
  propertyId,
  portfolioId,
  currentDomain,
  currentStatus,
  scopeLabel,
  inheritedNote,
  readOnly = false,
  lastError,
}: WhiteLabelDomainPanelProps) {
  const [domain, setDomain] = useState(currentDomain || "");
  const [verifying, setVerifying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [showDns, setShowDns] = useState(currentStatus !== "active");
  const [liveError, setLiveError] = useState<string | null>(lastError ?? null);
  const qc = useQueryClient();
  const pollTimer = useRef<number | null>(null);
  const status = STATUS_META[currentStatus] || STATUS_META.unconfigured;
  const StatusIcon = status.icon;
  const isActive = currentStatus === "active";
  const isProvisioning = currentStatus === "pending_ssl" || currentStatus === "dns_ok_tls_pending";
  const isPortfolioScope = !!portfolioId;

  useEffect(() => {
    setDomain(currentDomain || "");
    setShowDns(currentStatus !== "active");
    setLiveError(lastError ?? null);
  }, [currentDomain, currentStatus, lastError]);

  // Auto-poll while a certificate is being issued.
  useEffect(() => {
    if (!isProvisioning || !domain) return;
    let cancelled = false;
    const started = Date.now();
    const toastId = `wl-provisioning-${propertyId ?? portfolioId ?? domain}`;
    toast.loading("Issuing HTTPS certificate…", {
      id: toastId,
      description: "Cloudflare usually finishes within 1-2 minutes.",
    });
    const tick = async () => {
      if (cancelled) return;
      // Give up after ~10 minutes of polling.
      if (Date.now() - started > 10 * 60 * 1000) {
        toast.dismiss(toastId);
        return;
      }
      const body: Record<string, string> = { domain };
      if (portfolioId) body.portfolio_id = portfolioId;
      else if (propertyId) body.property_id = propertyId;
      try {
        const { data } = await supabase.functions.invoke("verify-whitelabel-domain", { body });
        if (cancelled) return;
        setLiveError((data as any)?.last_error ?? null);
        invalidate();
        const s = (data as any)?.status;
        if (s === "active") {
          toast.success("Domain verified — HTTPS is live", { id: toastId });
          return;
        }
        if (s === "failed") {
          toast.error("Verification failed", { id: toastId, description: (data as any)?.last_error });
          return;
        }
      } catch { /* keep polling */ }
      pollTimer.current = window.setTimeout(tick, 15_000);
    };
    pollTimer.current = window.setTimeout(tick, 15_000);
    return () => {
      cancelled = true;
      if (pollTimer.current) window.clearTimeout(pollTimer.current);
      toast.dismiss(toastId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isProvisioning, domain, portfolioId, propertyId]);


  // One-shot migration: legacy `dns_ok_tls_pending` rows were written by the
  // pre-Cloudflare-for-SaaS verifier. Re-invoke verify on mount so they either
  // flip to `active` (cert already live) or move into the new `pending_ssl`
  // lifecycle without the user needing to click.
  const migratedRef = useRef(false);
  useEffect(() => {
    if (migratedRef.current) return;
    if (currentStatus !== "dns_ok_tls_pending") return;
    const clean = (currentDomain || "").trim().toLowerCase();
    if (!clean) return;
    migratedRef.current = true;
    const body: Record<string, string> = { domain: clean };
    if (portfolioId) body.portfolio_id = portfolioId;
    else if (propertyId) body.property_id = propertyId;
    supabase.functions.invoke("verify-whitelabel-domain", { body })
      .then(({ data }) => {
        setLiveError((data as any)?.last_error ?? null);
        invalidate();
      })
      .catch(() => { /* silent — user can click Verify manually */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStatus, currentDomain, portfolioId, propertyId]);

  function invalidate() {
    if (portfolioId) qc.invalidateQueries({ queryKey: ["whitelabel-portfolio", portfolioId] });
    if (propertyId) qc.invalidateQueries({ queryKey: ["whitelabel", propertyId] });
    qc.invalidateQueries({ queryKey: ["whitelabel"] });
  }

  function cleanDomain(): string {
    return domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }

  async function save() {
    const clean = cleanDomain();
    if (!clean) {
      toast.error("Enter a domain like book.yourhotel.com");
      return;
    }
    const previous = (currentDomain || "").trim().toLowerCase();
    const isRename = !!previous && previous !== clean;
    setSaving(true);

    // If the domain changed, best-effort cleanup of the previous Cloudflare
    // Custom Hostname so we don't leave orphaned certs / origin rules behind.
    if (isRename) {
      const delBody: Record<string, string> = {};
      if (portfolioId) delBody.portfolio_id = portfolioId;
      else if (propertyId) delBody.property_id = propertyId;
      try {
        await supabase.functions.invoke("delete-whitelabel-domain", { body: delBody });
      } catch { /* non-blocking */ }
    }

    const resetPayload = {
      white_label_domain: clean,
      white_label_domain_status: "pending",
      cloudflare_custom_hostname_id: null,
      white_label_domain_last_error: null,
      custom_domain_error: null,
    } as any;

    let error;
    if (portfolioId) {
      ({ error } = await supabase
        .from("property_portfolios")
        .update(resetPayload)
        .eq("id", portfolioId));
    } else if (propertyId) {
      ({ error } = await supabase
        .from("property_billing_configs")
        .update(resetPayload)
        .eq("property_id", propertyId));
    }
    setSaving(false);
    if (error) return toast.error("Could not save", { description: error.message });

    // Reset local UI state so the panel starts clean for the new domain.
    setLiveError(null);
    setShowDns(true);
    migratedRef.current = false;
    toast.dismiss(`wl-provisioning-${propertyId ?? portfolioId ?? previous}`);
    toast.dismiss(`wl-provisioning-${propertyId ?? portfolioId ?? clean}`);

    toast.success(isRename ? "New domain saved — verification reset" : "Domain saved — now click Verify");
    invalidate();
  }

  async function verify() {
    const clean = cleanDomain();
    if (!clean) return toast.error("Save a domain first");
    setVerifying(true);
    const body: Record<string, string> = { domain: clean };
    if (portfolioId) body.portfolio_id = portfolioId;
    else if (propertyId) body.property_id = propertyId;
    const { data, error } = await supabase.functions.invoke("verify-whitelabel-domain", { body });
    setVerifying(false);
    if (error) return toast.error("Verification failed", { description: error.message });
    setLiveError((data as any)?.last_error ?? null);
    invalidate();
    const s = (data as any)?.status;
    if (s === "active") toast.success("Domain verified — HTTPS is live");
    else if (s === "pending_ssl") toast.info("DNS verified — Cloudflare is issuing your certificate (usually 1-2 minutes).");
    else if (s === "pending") toast.info("No DNS records found yet — try again in a few minutes");
    else toast.warning("DNS points elsewhere", { description: (data as any)?.last_error });
  }

  async function remove() {
    if (!confirm("Remove this custom booking subdomain? Guests will fall back to the canonical URL.")) return;
    setRemoving(true);
    const body: Record<string, string> = {};
    if (portfolioId) body.portfolio_id = portfolioId;
    else if (propertyId) body.property_id = propertyId;
    const { error } = await supabase.functions.invoke("delete-whitelabel-domain", { body });
    setRemoving(false);
    if (error) return toast.error("Could not remove", { description: error.message });
    toast.success("Custom domain removed");
    setDomain("");
    setLiveError(null);
    invalidate();
  }

  const dnsHost = (() => {
    const d = (domain || "").trim().toLowerCase();
    if (!d) return "book";
    const parts = d.split(".");
    return parts.length > 2 ? parts[0] : d;
  })();
  const dnsSnippet = `Type: CNAME\nName: ${dnsHost}\nValue: ${CNAME_TARGET}`;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isPortfolioScope ? <Building2 className="h-5 w-5 text-primary" /> : <Globe className="h-5 w-5 text-primary" />}
            <CardTitle className="text-lg">
              {scopeLabel || (isPortfolioScope ? "Portfolio booking subdomain" : "Your own booking subdomain")}
            </CardTitle>
          </div>
          <Badge variant={status.tone} className={`gap-1 ${isActive ? "bg-green-600 hover:bg-green-600 text-white" : ""} ${isProvisioning ? "border-amber-500 text-amber-700" : ""}`}>
            <StatusIcon className={`h-3 w-3 ${isProvisioning || currentStatus === "pending" ? "animate-spin" : ""}`} />
            {status.label}
          </Badge>
        </div>
        <CardDescription>
          {isPortfolioScope
            ? <>Point a subdomain (for example <code>book.yourbrand.com</code>) at our servers — we provision HTTPS for you automatically. Every property in this portfolio will use it for Smart Buttons, widgets and embeds.</>
            : <>Point a subdomain of your own site (for example <code>book.yourhotel.com</code>) at our servers — we provision HTTPS for you automatically. Once verified, every integration snippet below uses this domain.</>}
        </CardDescription>
        {inheritedNote && (
          <p className="text-xs text-muted-foreground mt-1">{inheritedNote}</p>
        )}
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
              disabled={readOnly}
            />
          </div>
          <Button size="sm" variant="outline" onClick={save} disabled={saving || readOnly}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save"}
          </Button>
          <Button size="sm" onClick={verify} disabled={verifying || !domain || readOnly}>
            {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
            Verify
          </Button>
        </div>

        {isActive && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-green-600/30 bg-green-600/10 px-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span>Domain verified — <code className="font-mono text-xs">{domain}</code> is live over HTTPS.</span>
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" asChild>
                <a href={`https://${domain}/`} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3 w-3" /> Open
                </a>
              </Button>
              <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setShowDns((v) => !v)}>
                {showDns ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {showDns ? "Hide DNS record" : "Show DNS record"}
              </Button>
            </div>
          </div>
        )}

        {isProvisioning && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm space-y-1">
            <div className="flex items-center gap-2 font-medium text-amber-800">
              <Loader2 className="h-4 w-4 animate-spin" />
              DNS verified — issuing HTTPS certificate for <code className="font-mono text-xs">{domain}</code>.
            </div>
            <p className="text-xs text-amber-900/80">
              This usually takes 1-2 minutes. This page will refresh automatically. Guests can keep booking on the canonical URL in the meantime.
            </p>
            {liveError && <p className="text-xs text-amber-900/80">{liveError}</p>}
          </div>
        )}

        {currentStatus === "failed" && liveError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {liveError}
          </div>
        )}

        {showDns && (
          <>
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
              <p className="text-xs text-muted-foreground mt-2">
                That's it — we provision the HTTPS certificate for you via Cloudflare. You don't need to run a proxy or manage TLS on your side.
              </p>
            </div>
          </>
        )}

        {(currentDomain || domain) && !readOnly && (
          <div className="flex justify-end">
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-destructive hover:text-destructive" onClick={remove} disabled={removing}>
              {removing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Remove custom domain
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

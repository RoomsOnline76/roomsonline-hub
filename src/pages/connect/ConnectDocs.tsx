import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { connectPath } from "@/lib/config";
import { motion } from "framer-motion";
import {
  Search, Copy, Check, ChevronRight, Code2, ArrowRight, FileDown,
  Key, AlertTriangle, Webhook, BookOpen, Shield, Server
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { API_ACTIONS, API_CATEGORIES, searchActions, getActionsByCategory } from "@/data/rolos-api-actions";
import type { ApiAction } from "@/data/rolos-api-actions";
import { toast } from "@/hooks/use-toast";

const fadeUp = {
  hidden: { opacity: 0, y: 12, filter: "blur(4px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)" },
};

const BASE_URL = "https://YOUR_PROJECT.supabase.co/functions/v1/roomsonline-pms-api";

type ViewMode =
  | { kind: "overview" }
  | { kind: "auth" }
  | { kind: "errors" }
  | { kind: "webhooks" }
  | { kind: "category"; key: string }
  | { kind: "action"; action: ApiAction };

const ERROR_CODES = [
  { code: "INVALID_REQUEST", description: "Malformed request or missing required fields" },
  { code: "AUTH_FAILED", description: "Invalid or missing API key" },
  { code: "ACCESS_DENIED", description: "API key does not have permission for this property" },
  { code: "NOT_FOUND", description: "Requested resource not found" },
  { code: "AVAILABILITY_CHANGED", description: "Availability changed since last check" },
  { code: "BOOKING_REJECTED", description: "Booking cannot be created (stop sell, capacity, etc.)" },
  { code: "ROOMS_NOT_READY", description: "Room(s) not ready for check-in (dirty, maintenance, etc.)" },
  { code: "CONFLICT", description: "Operation conflicts with current state" },
  { code: "MODIFICATION_NOT_SUPPORTED", description: "Requested modification is not possible" },
  { code: "CANCELLATION_NOT_SUPPORTED", description: "Reservation cannot be cancelled" },
  { code: "INTERNAL_ADAPTER_ERROR", description: "Server-side adapter error" },
  { code: "PMS_UNAVAILABLE", description: "Backend PMS service unavailable" },
];

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast({ title: "Copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative rounded-lg border bg-muted/30 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b">
        <span className="text-xs text-muted-foreground font-mono">{language}</span>
        <button onClick={handleCopy} className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="p-3 overflow-x-auto text-xs leading-relaxed"><code>{code}</code></pre>
    </div>
  );
}

function ActionDetail({ action, onBack }: { action: ApiAction; onBack: () => void }) {
  const [tab, setTab] = useState<"curl" | "js" | "php">("curl");
  const codeExamples: Record<string, string | undefined> = {
    curl: action.curlExample,
    js: action.jsExample,
    php: action.phpExample,
  };
  return (
    <div className="space-y-6">
      <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
        ← Back
      </button>
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-mono font-medium">POST</span>
          <code className="text-xs font-mono text-muted-foreground">action: "{action.action}"</code>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            {API_CATEGORIES.find(c => c.key === action.category)?.label}
          </span>
        </div>
        <h2 className="text-xl font-bold tracking-tight">{action.title}</h2>
        <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{action.description}</p>
      </div>
      {action.params.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Parameters</h3>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-left">
                  <th className="px-3 py-2 font-medium text-xs">Name</th>
                  <th className="px-3 py-2 font-medium text-xs">Type</th>
                  <th className="px-3 py-2 font-medium text-xs">Required</th>
                  <th className="px-3 py-2 font-medium text-xs">Description</th>
                </tr>
              </thead>
              <tbody>
                {action.params.map((p) => (
                  <tr key={p.name} className="border-t">
                    <td className="px-3 py-2 font-mono text-xs text-primary">{p.name}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{p.type}</td>
                    <td className="px-3 py-2 text-xs">{p.required ? <span className="text-primary font-medium">Yes</span> : "No"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{p.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {Object.values(codeExamples).some(Boolean) && (
        <div>
          <h3 className="text-sm font-semibold mb-2">Code Examples</h3>
          <div className="flex gap-1 mb-2">
            {(["curl", "js", "php"] as const).map((t) =>
              codeExamples[t] ? (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded font-medium transition-colors",
                    tab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t === "curl" ? "cURL" : t === "js" ? "JavaScript" : "PHP"}
                </button>
              ) : null
            )}
          </div>
          {codeExamples[tab] && <CodeBlock code={codeExamples[tab]!} language={tab} />}
        </div>
      )}
      <div>
        <h3 className="text-sm font-semibold mb-2">Example Response</h3>
        <CodeBlock code={action.responseExample} language="json" />
      </div>
    </div>
  );
}

function OverviewPanel() {
  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold tracking-tight">ROL'OS Developer REST API</h2>
        <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed max-w-2xl">
          Version 3.1. Unified action-based API for availability, reservations, rates, guests, folios, housekeeping, webhooks and more.
          Every request is a POST with an <code className="font-mono text-xs bg-muted px-1 rounded">action</code> field.
          The on-page reference is authoritative.
        </p>
      </div>
      <div className="rounded-lg border bg-muted/20 p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Server className="h-4 w-4 text-primary" /> Base URL
        </div>
        <code className="block text-xs font-mono break-all text-muted-foreground">{BASE_URL}</code>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-lg border p-4 flex gap-3">
          <Key className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-sm">Authentication</div>
            <div className="text-xs text-muted-foreground mt-0.5">x-api-key header on every request</div>
          </div>
        </div>
        <div className="rounded-lg border p-4 flex gap-3">
          <AlertTriangle className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-sm">Error Codes</div>
            <div className="text-xs text-muted-foreground mt-0.5">Standard error shape and codes</div>
          </div>
        </div>
        <div className="rounded-lg border p-4 flex gap-3">
          <Webhook className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-sm">Webhooks</div>
            <div className="text-xs text-muted-foreground mt-0.5">HMAC-signed event deliveries</div>
          </div>
        </div>
        <Link to={connectPath("/connect/docs/quickstart")} className="rounded-lg border p-4 hover:border-primary/30 hover:shadow-sm transition-all flex gap-3">
          <BookOpen className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <div>
            <div className="font-medium text-sm">Quickstart</div>
            <div className="text-xs text-muted-foreground mt-0.5">Zero to first booking in 5 steps</div>
          </div>
        </Link>
      </div>
      <div>
        <h3 className="text-sm font-semibold mb-3">Architecture note</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          The current architecture follows the adapter pattern. Each PMS has its own isolated edge function.
          All PMS data maps to common tables via the <code className="font-mono text-xs bg-muted px-1 rounded">pms_mappings</code> translation layer.
          Calendar and booking UI stay PMS-agnostic. Adding a new PMS requires a new edge function and credentials entry — zero changes to calendar or dashboard.
        </p>
      </div>
    </div>
  );
}

function AuthPanel() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Authentication</h2>
        <p className="text-muted-foreground mt-1.5 text-sm">All requests require an <code className="font-mono text-xs bg-muted px-1 rounded">x-api-key</code> header. Contact ROL'OS to obtain your API key.</p>
      </div>
      <div>
        <h3 className="text-sm font-semibold mb-2">Request format</h3>
        <p className="text-sm text-muted-foreground mb-3">Every call is <strong>POST</strong> with a JSON body containing an <code className="font-mono text-xs">action</code> field and typically a <code className="font-mono text-xs">propertyId</code> (UUID).</p>
        <CodeBlock
          language="bash"
          code={`curl -X POST "${BASE_URL}" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{
    "action": "health_check"
  }'`}
        />
      </div>
      <div>
        <h3 className="text-sm font-semibold mb-2">Response envelope</h3>
        <CodeBlock
          language="json"
          code={JSON.stringify({
            success: true,
            data: {},
            error: null,
            source: "roomsonline",
            action: "health_check"
          }, null, 2)}
        />
      </div>
    </div>
  );
}

function ErrorsPanel() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Error Codes</h2>
        <p className="text-muted-foreground mt-1.5 text-sm">On failure the envelope returns <code className="font-mono text-xs bg-muted px-1 rounded">success: false</code> and an <code className="font-mono text-xs bg-muted px-1 rounded">error</code> object with <code className="font-mono text-xs">code</code> and <code className="font-mono text-xs">message</code>.</p>
      </div>
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50 text-left">
              <th className="px-3 py-2 font-medium text-xs">Code</th>
              <th className="px-3 py-2 font-medium text-xs">Description</th>
            </tr>
          </thead>
          <tbody>
            {ERROR_CODES.map((e) => (
              <tr key={e.code} className="border-t">
                <td className="px-3 py-2 font-mono text-xs text-primary whitespace-nowrap">{e.code}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{e.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WebhooksPanel() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Webhooks</h2>
        <p className="text-muted-foreground mt-1.5 text-sm">
          Register HTTPS endpoints to receive real-time booking events. Every delivery includes an HMAC-SHA256 signature in the <code className="font-mono text-xs bg-muted px-1 rounded">X-ROL-Signature</code> header.
        </p>
      </div>
      <div>
        <h3 className="text-sm font-semibold mb-2">Supported events</h3>
        <div className="flex flex-wrap gap-1.5">
          {["booking.created", "booking.modified", "booking.cancelled", "booking.checked_in", "booking.checked_out", "*"].map((ev) => (
            <code key={ev} className="text-xs font-mono px-2 py-1 rounded bg-muted">{ev}</code>
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold mb-2">Payload shape</h3>
        <CodeBlock
          language="json"
          code={JSON.stringify({
            event: "booking.created",
            property_id: "uuid",
            payload: {
              booking_id: "uuid",
              guest_name: "John Doe",
              arrival_date: "2026-04-01",
              departure_date: "2026-04-05",
              status: "confirmed",
              total_amount: 4500,
              rooms: []
            },
            timestamp: "2026-03-21T10:00:00Z",
            delivery_id: "uuid"
          }, null, 2)}
        />
      </div>
      <div>
        <h3 className="text-sm font-semibold mb-2">Signature verification (Node.js)</h3>
        <CodeBlock
          language="javascript"
          code={`const crypto = require('crypto');
const signature = req.headers['x-rol-signature'];
const expected = crypto
  .createHmac('sha256', YOUR_WEBHOOK_SECRET)
  .update(JSON.stringify(req.body))
  .digest('hex');
if (signature !== expected) {
  return res.status(401).json({ error: 'Invalid signature' });
}`}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Failed deliveries are retried up to 3 times. Use <code className="font-mono">get_webhook_logs</code> to inspect status, attempts and errors.
      </p>
    </div>
  );
}

export default function ConnectDocs() {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>({ kind: "overview" });

  const filteredActions = useMemo(() => {
    if (search) return searchActions(search);
    if (view.kind === "category") return getActionsByCategory(view.key);
    return API_ACTIONS;
  }, [search, view]);

  const selectAction = (action: ApiAction) => {
    setView({ kind: "action", action });
    setSearch("");
  };

  const sidebarItem = (
    active: boolean,
    onClick: () => void,
    icon: React.ReactNode,
    label: string,
    count?: number
  ) => (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-2 text-sm rounded-md flex items-center justify-between transition-colors",
        active ? "bg-primary/5 text-primary font-medium" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      )}
    >
      <span className="flex items-center gap-2">
        {icon}
        {label}
      </span>
      {count !== undefined && <span className="text-xs tabular-nums">{count}</span>}
    </button>
  );

  return (
    <div className="min-h-screen">
      <section className="bg-gradient-to-b from-primary/5 to-background pt-12 pb-8 border-b">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Shield className="h-5 w-5 text-primary" />
                <span className="text-xs font-medium text-primary uppercase tracking-wider">Developer</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">API Reference</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                {API_ACTIONS.length}+ actions · Version 3.1 · Action-based REST
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="/docs/ROLOS-Developer-REST-API-v3.1.docx" download>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <FileDown className="h-3.5 w-3.5" /> Download API Doc
                </Button>
              </a>
              <Link to={connectPath("/connect/docs/quickstart")}>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <ArrowRight className="h-3.5 w-3.5" /> Quickstart
                </Button>
              </Link>
              <Link to={connectPath("/connect/docs/wordpress")}>
                <Button variant="outline" size="sm">WordPress</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          <aside className="hidden lg:block w-64 shrink-0">
            <div className="sticky top-24 space-y-6">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    if (e.target.value) setView({ kind: "overview" });
                  }}
                  placeholder="Search actions..."
                  className="pl-8 h-9 text-sm"
                />
              </div>
              <nav className="space-y-0.5">
                <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Guides</p>
                {sidebarItem(view.kind === "overview" && !search, () => { setView({ kind: "overview" }); setSearch(""); }, <BookOpen className="h-3.5 w-3.5" />, "Overview")}
                {sidebarItem(view.kind === "auth", () => { setView({ kind: "auth" }); setSearch(""); }, <Key className="h-3.5 w-3.5" />, "Authentication")}
                {sidebarItem(view.kind === "errors", () => { setView({ kind: "errors" }); setSearch(""); }, <AlertTriangle className="h-3.5 w-3.5" />, "Error Codes")}
                {sidebarItem(view.kind === "webhooks", () => { setView({ kind: "webhooks" }); setSearch(""); }, <Webhook className="h-3.5 w-3.5" />, "Webhooks")}
              </nav>
              <nav className="space-y-0.5">
                <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Actions</p>
                {API_CATEGORIES.map((cat) => {
                  const count = getActionsByCategory(cat.key).length;
                  const active = view.kind === "category" && view.key === cat.key && !search;
                  return sidebarItem(
                    active,
                    () => { setView({ kind: "category", key: cat.key }); setSearch(""); },
                    <span className="text-sm">{cat.icon}</span>,
                    cat.label,
                    count
                  );
                })}
              </nav>
            </div>
          </aside>

          <div className="flex-1 min-w-0">
            {view.kind === "action" ? (
              <motion.div initial="hidden" animate="visible" variants={fadeUp} transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
                <ActionDetail action={view.action} onBack={() => setView({ kind: "category", key: view.action.category })} />
              </motion.div>
            ) : search || view.kind === "category" ? (
              <div>
                <div className="lg:hidden mb-4 space-y-3">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search actions..." className="pl-8 h-9 text-sm" />
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4">
                    {API_CATEGORIES.map((cat) => (
                      <button
                        key={cat.key}
                        onClick={() => { setView({ kind: "category", key: cat.key }); setSearch(""); }}
                        className={cn(
                          "text-xs px-2.5 py-1.5 rounded-full whitespace-nowrap transition-colors",
                          view.kind === "category" && view.key === cat.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                        )}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>
                {view.kind === "category" && !search && (
                  <h2 className="text-lg font-semibold mb-4">
                    {API_CATEGORIES.find(c => c.key === view.key)?.icon}{" "}
                    {API_CATEGORIES.find(c => c.key === view.key)?.label}
                  </h2>
                )}
                <div className="space-y-2">
                  {filteredActions.map((action) => (
                    <motion.button
                      key={action.action}
                      onClick={() => selectAction(action)}
                      className="w-full text-left rounded-lg border p-4 hover:shadow-sm hover:border-primary/30 transition-all flex items-start justify-between gap-4"
                      initial="hidden" whileInView="visible" viewport={{ once: true }}
                      variants={fadeUp} transition={{ duration: 0.25 }}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <code className="text-xs font-mono text-primary">{action.action}</code>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {API_CATEGORIES.find(c => c.key === action.category)?.label}
                          </span>
                        </div>
                        <h3 className="font-medium text-sm">{action.title}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{action.description}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                    </motion.button>
                  ))}
                </div>
                {filteredActions.length === 0 && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Code2 className="h-8 w-8 mx-auto mb-3 opacity-40" />
                    <p className="text-sm">No actions found for "{search}"</p>
                  </div>
                )}
              </div>
            ) : view.kind === "auth" ? (
              <motion.div initial="hidden" animate="visible" variants={fadeUp} transition={{ duration: 0.35 }}>
                <AuthPanel />
              </motion.div>
            ) : view.kind === "errors" ? (
              <motion.div initial="hidden" animate="visible" variants={fadeUp} transition={{ duration: 0.35 }}>
                <ErrorsPanel />
              </motion.div>
            ) : view.kind === "webhooks" ? (
              <motion.div initial="hidden" animate="visible" variants={fadeUp} transition={{ duration: 0.35 }}>
                <WebhooksPanel />
              </motion.div>
            ) : (
              <motion.div initial="hidden" animate="visible" variants={fadeUp} transition={{ duration: 0.35 }}>
                <OverviewPanel />
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

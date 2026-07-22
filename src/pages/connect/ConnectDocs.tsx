import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { connectPath } from "@/lib/config";
import { motion } from "framer-motion";
import { Search, Copy, Check, ChevronRight, Code2, ArrowRight, FileDown } from "lucide-react";
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

function ActionDetail({ action }: { action: ApiAction }) {
  const [tab, setTab] = useState<"curl" | "js" | "php">("curl");

  const codeExamples: Record<string, string | undefined> = {
    curl: action.curlExample,
    js: action.jsExample,
    php: action.phpExample,
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">{action.title}</h2>
        <p className="text-muted-foreground mt-1">{action.description}</p>
        <div className="mt-3 flex items-center gap-2">
          <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary font-mono">POST</span>
          <code className="text-xs text-muted-foreground font-mono">action: "{action.action}"</code>
        </div>
      </div>

      {/* Parameters */}
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

      {/* Code examples */}
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

      {/* Response */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Example Response</h3>
        <CodeBlock code={action.responseExample} language="json" />
      </div>
    </div>
  );
}

export default function ConnectDocs() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedAction, setSelectedAction] = useState<ApiAction | null>(null);

  const filteredActions = useMemo(() => {
    if (search) return searchActions(search);
    if (selectedCategory) return getActionsByCategory(selectedCategory);
    return API_ACTIONS;
  }, [search, selectedCategory]);

  const handleSelectAction = (action: ApiAction) => {
    setSelectedAction(action);
    setSelectedCategory(null);
    setSearch("");
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <section className="bg-gradient-to-b from-primary/5 to-background pt-12 pb-8 border-b">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">API Reference</h1>
              <p className="text-muted-foreground mt-1">{API_ACTIONS.length}+ actions for complete property management</p>
              <p className="text-xs text-muted-foreground mt-2 max-w-2xl">
                Tip: fetch everything in one call with the Portfolio API — <code className="font-mono bg-muted px-1 rounded">GET /functions/v1/booking-portfolio-api?portfolio=&lt;slug&gt;&amp;include_static_content=true</code> returns <code className="font-mono">cancellation_policies</code>, <code className="font-mono">reservation_policies</code>, <code className="font-mono">policy_rate_plan_links</code>, <code className="font-mono">payment_methods</code> and <code className="font-mono">contacts</code> on every property. The on-page reference is authoritative; the downloadable .docx may trail.
              </p>
            </div>
            <div className="flex gap-2">
              <a href="/docs/ROLOS-Developer-REST-API-v3.docx" download>
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
                <Button variant="outline" size="sm" className="gap-1.5">
                  WordPress Guide
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Sidebar */}
          <aside className="hidden lg:block w-64 shrink-0">
            <div className="sticky top-24">
              <div className="relative mb-4">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setSelectedAction(null); }}
                  placeholder="Search actions..."
                  className="pl-8 h-9 text-sm"
                />
              </div>

              <nav className="space-y-1">
                {API_CATEGORIES.map((cat) => {
                  const count = getActionsByCategory(cat.key).length;
                  return (
                    <button
                      key={cat.key}
                      onClick={() => { setSelectedCategory(cat.key); setSelectedAction(null); setSearch(""); }}
                      className={cn(
                        "w-full text-left px-3 py-2 text-sm rounded-md flex items-center justify-between transition-colors",
                        selectedCategory === cat.key && !selectedAction
                          ? "bg-primary/5 text-primary font-medium"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <span>{cat.icon}</span> {cat.label}
                      </span>
                      <span className="text-xs">{count}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {selectedAction ? (
              <motion.div
                initial="hidden" animate="visible" variants={fadeUp}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              >
                <button
                  onClick={() => setSelectedAction(null)}
                  className="text-sm text-muted-foreground hover:text-foreground mb-4 flex items-center gap-1"
                >
                  ← Back to list
                </button>
                <ActionDetail action={selectedAction} />
              </motion.div>
            ) : (
              <div>
                {/* Mobile search */}
                <div className="lg:hidden mb-4">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search actions..."
                      className="pl-8 h-9 text-sm"
                    />
                  </div>
                </div>

                {/* Mobile categories */}
                <div className="lg:hidden flex gap-1.5 overflow-x-auto pb-3 mb-4 -mx-4 px-4">
                  {API_CATEGORIES.map((cat) => (
                    <button
                      key={cat.key}
                      onClick={() => { setSelectedCategory(selectedCategory === cat.key ? null : cat.key); }}
                      className={cn(
                        "text-xs px-2.5 py-1.5 rounded-full whitespace-nowrap transition-colors",
                        selectedCategory === cat.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      )}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                <div className="space-y-2">
                  {filteredActions.map((action) => (
                    <motion.button
                      key={action.action}
                      onClick={() => handleSelectAction(action)}
                      className="w-full text-left rounded-lg border p-4 hover:shadow-sm hover:border-primary/30 transition-all flex items-start justify-between gap-4"
                      initial="hidden" whileInView="visible" viewport={{ once: true }}
                      variants={fadeUp} transition={{ duration: 0.3 }}
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
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

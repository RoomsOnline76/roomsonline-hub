import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CodeSnippetBlock } from "./CodeSnippetBlock";
import { CheckCircle2, Download, Upload, Power, Settings, KeyRound, RefreshCw, Blocks, LayoutGrid, Code2 } from "lucide-react";

/**
 * WordPressVisualWalkthrough
 * ---------------------------------------------
 * Visual, step-by-step install & usage guide for the ROL'OS WordPress plugin.
 * Uses HTML/Tailwind "browser chrome" mockups (no external images) so it
 * renders faithfully in every theme and on mobile.
 */

interface Props {
  apiEndpoint?: string;
  apiKeyHint?: string;
  shortcode?: string;
  gridShortcode?: string;
  portfolioShortcode?: string | null;
  brandColor?: string;
  /** Compact mode strips the outer card padding for use on public marketing pages. */
  compact?: boolean;
}

// ── shared mini "wp-admin" chrome ────────────────────────────────────────────
function WpFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border overflow-hidden bg-background shadow-sm">
      <div className="flex items-center gap-1.5 bg-muted/70 px-3 py-1.5 border-b border-border">
        <span className="h-2 w-2 rounded-full bg-destructive/60" />
        <span className="h-2 w-2 rounded-full bg-yellow-400/70" />
        <span className="h-2 w-2 rounded-full bg-primary/60" />
        <span className="ml-2 text-[10px] font-mono text-muted-foreground truncate">{title}</span>
      </div>
      <div className="p-3 text-xs">{children}</div>
    </div>
  );
}

function StepRow({
  step,
  icon: Icon,
  title,
  description,
  visual,
}: {
  step: number;
  icon: React.ElementType;
  title: string;
  description: React.ReactNode;
  visual: React.ReactNode;
}) {
  return (
    <div className="grid md:grid-cols-[1.1fr_1fr] gap-4 md:gap-6 items-start">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <span className="h-7 w-7 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center">
            {step}
          </span>
          <Icon className="h-4 w-4 text-primary" />
          <h4 className="text-sm font-semibold">{title}</h4>
        </div>
        <div className="text-sm text-muted-foreground space-y-2 md:pl-9">{description}</div>
      </div>
      <div className="md:pl-0">{visual}</div>
    </div>
  );
}

export function WordPressVisualWalkthrough({
  apiEndpoint = "https://<your-rolos-instance>/functions/v1/wordpress-plugin-api",
  apiKeyHint = "rol_••••••••••••••••••••••••••••",
  shortcode = '[rolos_booking property="your-slug" property_id="…"]',
  gridShortcode = '[rolos_property_grid limit="12" columns="3"]',
  portfolioShortcode = null,
  brandColor = "#E91E8C",
  compact = false,
}: Props) {
  const [tab, setTab] = useState("gutenberg");

  const Wrapper = compact
    ? ({ children }: { children: React.ReactNode }) => <div className="space-y-8">{children}</div>
    : ({ children }: { children: React.ReactNode }) => <Card className="p-4 sm:p-6 space-y-8">{children}</Card>;

  return (
    <Wrapper>
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-base font-semibold">Install & configure — visual walkthrough</h3>
          <Badge variant="outline" className="text-[10px]">6 steps · ~3 min</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Every step below shows exactly what you'll see inside <code className="text-xs bg-muted px-1 rounded">wp-admin</code>.
        </p>
      </div>

      {/* ── Steps ─────────────────────────────────────────────────────────── */}
      <div className="space-y-8">
        <StepRow
          step={1}
          icon={Download}
          title="Download the plugin ZIP"
          description={
            <>
              <p>
                Click <strong>Download Full Plugin (.zip)</strong> above. You'll get{" "}
                <code className="text-xs bg-muted px-1 rounded">rolos-plugin.zip</code> — do <em>not</em> unzip it.
              </p>
            </>
          }
          visual={
            <WpFrame title="rolos-plugin.zip">
              <div className="flex items-center gap-3 py-4">
                <div className="h-10 w-10 rounded bg-primary/10 flex items-center justify-center">
                  <Download className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <div className="font-mono text-[11px]">rolos-plugin.zip</div>
                  <div className="text-[10px] text-muted-foreground">~180 KB · 10 files</div>
                </div>
                <span className="ml-auto text-[10px] text-primary font-medium">✓ Downloaded</span>
              </div>
            </WpFrame>
          }
        />

        <StepRow
          step={2}
          icon={Upload}
          title="Upload in WordPress"
          description={
            <>
              <p>
                In your WP admin, open <strong>Plugins → Add New → Upload Plugin</strong>, choose the ZIP, then click{" "}
                <strong>Install Now</strong>.
              </p>
            </>
          }
          visual={
            <WpFrame title="wp-admin › Plugins › Add New">
              <div className="text-[11px] text-muted-foreground mb-2">If you have a plugin in .zip format, upload it here.</div>
              <div className="flex items-center gap-2 mb-3">
                <span className="px-2 py-1 rounded border border-border bg-muted text-[10px]">Choose File</span>
                <span className="text-[10px] font-mono truncate">rolos-plugin.zip</span>
              </div>
              <div className="inline-block px-3 py-1.5 rounded bg-primary text-primary-foreground text-[11px] font-medium ring-2 ring-primary/30">
                Install Now →
              </div>
            </WpFrame>
          }
        />

        <StepRow
          step={3}
          icon={Power}
          title="Activate the plugin"
          description={
            <p>
              After install, click <strong>Activate Plugin</strong>. You'll see a green{" "}
              <em>"Plugin activated"</em> banner and <strong>ROL'OS</strong> will appear in your left sidebar.
            </p>
          }
          visual={
            <WpFrame title="wp-admin › Plugins">
              <div className="border-l-4 border-primary bg-primary/5 px-3 py-2 text-[11px] mb-3">
                Plugin <strong>activated</strong>.
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <Blocks className="h-3 w-3 text-primary" />
                <span className="font-medium">ROL'OS</span>
                <Badge variant="secondary" className="text-[9px] py-0 px-1.5">new</Badge>
              </div>
            </WpFrame>
          }
        />

        <StepRow
          step={4}
          icon={Settings}
          title="Open Settings → ROL'OS"
          description={
            <p>
              A one-time <strong>Connection Wizard</strong> opens automatically on first activation. If it doesn't,
              go to <strong>Settings → ROL'OS</strong> in the left sidebar.
            </p>
          }
          visual={
            <WpFrame title="wp-admin › Settings › ROL'OS">
              <div className="grid grid-cols-[80px_1fr] gap-2 text-[10px]">
                <div className="space-y-1 border-r border-border pr-2">
                  <div className="text-muted-foreground">General</div>
                  <div className="text-muted-foreground">Writing</div>
                  <div className="text-muted-foreground">Reading</div>
                  <div className="px-1 py-0.5 rounded bg-primary/10 text-primary font-medium ring-1 ring-primary/40">
                    ROL'OS
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="font-semibold">ROL'OS Connection</div>
                  <div className="text-muted-foreground">Enter your API endpoint and key.</div>
                  <div className="h-4 rounded bg-muted" />
                  <div className="h-4 rounded bg-muted" />
                </div>
              </div>
            </WpFrame>
          }
        />

        <StepRow
          step={5}
          icon={KeyRound}
          title="Paste API Endpoint + API Key"
          description={
            <>
              <p>Copy both values from the <strong>API</strong> tab (right next to WordPress) and paste them here:</p>
              <div className="rounded border border-border bg-muted/40 p-2 space-y-1 text-xs">
                <div>
                  <span className="text-muted-foreground">Endpoint: </span>
                  <code className="font-mono break-all">{apiEndpoint}</code>
                </div>
                <div>
                  <span className="text-muted-foreground">API Key: </span>
                  <code className="font-mono">{apiKeyHint}</code>
                </div>
              </div>
              <p className="text-xs">
                The plugin sends the key as an <code className="bg-muted px-1 rounded">x-api-key</code> header on every
                request — no OAuth, no admin password.
              </p>
            </>
          }
          visual={
            <WpFrame title="ROL'OS › Connection">
              <div className="space-y-2">
                <div>
                  <div className="text-[10px] text-muted-foreground mb-0.5">API Endpoint</div>
                  <div className="rounded border border-primary/40 px-2 py-1 font-mono text-[10px] ring-2 ring-primary/20 truncate">
                    {apiEndpoint}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground mb-0.5">API Key</div>
                  <div className="rounded border border-primary/40 px-2 py-1 font-mono text-[10px] ring-2 ring-primary/20">
                    {apiKeyHint}
                  </div>
                </div>
                <div className="pt-1">
                  <span className="inline-block px-3 py-1 rounded bg-primary text-primary-foreground text-[11px] font-medium">
                    Connect & Start Sync
                  </span>
                </div>
              </div>
            </WpFrame>
          }
        />

        <StepRow
          step={6}
          icon={RefreshCw}
          title="Sync properties & verify"
          description={
            <>
              <p>
                On success you'll see a green <strong>Connected</strong> pill and your rooms populate as WordPress
                custom posts under <strong>ROL'OS Properties</strong>.
              </p>
              <p className="text-xs">Cron re-syncs every 12 hours; hit <strong>Sync Now</strong> anytime to force a refresh.</p>
            </>
          }
          visual={
            <WpFrame title="ROL'OS › Status">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                <span className="text-[11px] font-medium">Connected</span>
                <Badge variant="outline" className="text-[9px]">last sync: just now</Badge>
              </div>
              <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                <div className="rounded bg-muted/60 p-1.5 text-center">
                  <div className="font-semibold">12</div>
                  <div className="text-muted-foreground">Rooms</div>
                </div>
                <div className="rounded bg-muted/60 p-1.5 text-center">
                  <div className="font-semibold">4</div>
                  <div className="text-muted-foreground">Rates</div>
                </div>
                <div className="rounded bg-muted/60 p-1.5 text-center">
                  <div className="font-semibold">365</div>
                  <div className="text-muted-foreground">Days ARI</div>
                </div>
              </div>
            </WpFrame>
          }
        />
      </div>

      {/* ── Usage tabs ────────────────────────────────────────────────────── */}
      <div>
        <div className="mb-3">
          <h3 className="text-base font-semibold">Add a booking widget to any page</h3>
          <p className="text-sm text-muted-foreground">Pick the editor you use — the result is identical.</p>
        </div>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="gutenberg" className="text-xs gap-1.5"><Blocks className="h-3 w-3" />Gutenberg</TabsTrigger>
            <TabsTrigger value="elementor" className="text-xs gap-1.5"><LayoutGrid className="h-3 w-3" />Elementor</TabsTrigger>
            <TabsTrigger value="shortcode" className="text-xs">Shortcode</TabsTrigger>
            <TabsTrigger value="php" className="text-xs gap-1.5"><Code2 className="h-3 w-3" />PHP</TabsTrigger>
          </TabsList>

          {/* Gutenberg */}
          <TabsContent value="gutenberg" className="mt-4 grid md:grid-cols-2 gap-4">
            <WpFrame title="Block inserter">
              <div className="text-[10px] text-muted-foreground mb-1.5">Search for a block</div>
              <div className="rounded border border-border px-2 py-1 mb-2 font-mono text-[10px]">rolos ␣</div>
              <div className="space-y-1">
                {[
                  { name: "ROL'OS Booking Widget", desc: "Full booking engine" },
                  { name: "ROL'OS Property Card", desc: "Showcase card" },
                  { name: "ROL'OS Property Explorer", desc: "Grid + filters" },
                ].map((b, i) => (
                  <div key={b.name} className={`flex items-center gap-2 rounded px-2 py-1 ${i === 0 ? "bg-primary/10 ring-1 ring-primary/30" : "bg-muted/40"}`}>
                    <div className="h-5 w-5 rounded bg-primary/20 flex items-center justify-center">
                      <Blocks className="h-2.5 w-2.5 text-primary" />
                    </div>
                    <div>
                      <div className="text-[10px] font-medium">{b.name}</div>
                      <div className="text-[9px] text-muted-foreground">{b.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </WpFrame>
            <WpFrame title="Rendered on your page">
              <div className="rounded border border-border p-2">
                <div className="grid grid-cols-2 gap-1.5 mb-2">
                  <div className="rounded bg-muted h-6" />
                  <div className="rounded bg-muted h-6" />
                </div>
                <div className="rounded bg-muted h-6 mb-2" />
                <div
                  className="rounded text-center py-1.5 text-[10px] font-semibold text-white"
                  style={{ backgroundColor: brandColor }}
                >
                  Check Availability
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">
                Colour, fonts, and radius follow your property's brand tokens automatically.
              </p>
            </WpFrame>
          </TabsContent>

          {/* Elementor */}
          <TabsContent value="elementor" className="mt-4 grid md:grid-cols-2 gap-4">
            <WpFrame title="Elementor › Widgets › ROL'OS">
              <div className="grid grid-cols-3 gap-1.5">
                {["Booking", "Property Card", "Availability"].map((w) => (
                  <div key={w} className="rounded border border-border p-1.5 text-center">
                    <div className="h-6 w-6 mx-auto rounded bg-primary/10 flex items-center justify-center mb-1">
                      <LayoutGrid className="h-3 w-3 text-primary" />
                    </div>
                    <div className="text-[9px] font-medium">{w}</div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-2">Drag any widget onto the canvas.</p>
            </WpFrame>
            <WpFrame title="Widget settings panel">
              <div className="space-y-1.5 text-[10px]">
                <div className="flex justify-between"><span className="text-muted-foreground">Layout</span><span>Horizontal</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Brand colour</span>
                  <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded" style={{ backgroundColor: brandColor }} />{brandColor}</span>
                </div>
                <div className="flex justify-between"><span className="text-muted-foreground">Button text</span><span>Book now</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Height</span><span>Auto</span></div>
              </div>
            </WpFrame>
          </TabsContent>

          {/* Shortcode */}
          <TabsContent value="shortcode" className="mt-4 space-y-3">
            <CodeSnippetBlock code={shortcode} language="text" title="Single-property booking widget" />
            <CodeSnippetBlock code={gridShortcode} language="text" title="Property grid (multi-property)" />
            {portfolioShortcode && (
              <CodeSnippetBlock code={portfolioShortcode} language="text" title="Portfolio booking (siblings unified)" />
            )}
            <p className="text-xs text-muted-foreground">
              Paste any of these into a Classic Editor block, a page-builder HTML widget, or a theme template with{" "}
              <code className="bg-muted px-1 rounded">do_shortcode()</code>.
            </p>
          </TabsContent>

          {/* PHP */}
          <TabsContent value="php" className="mt-4 space-y-3">
            <CodeSnippetBlock
              code={`<?php\n// In your theme template (e.g. single-property.php)\necho do_shortcode( '${shortcode}' );\n`}
              language="php"
              title="Embed via do_shortcode()"
            />
            <CodeSnippetBlock
              code={`<?php\n// Programmatic API call from PHP\n$response = wp_remote_post( 'YOUR_ENDPOINT/wordpress-plugin-api', [\n  'headers' => [\n    'Content-Type' => 'application/json',\n    'x-api-key'    => 'YOUR_API_KEY',\n  ],\n  'body' => wp_json_encode([\n    'action'     => 'get_availability',\n    'check_in'   => '2026-08-01',\n    'check_out'  => '2026-08-05',\n  ]),\n]);\n$data = json_decode( wp_remote_retrieve_body( $response ), true );\n`}
              language="php"
              title="Direct API call from a custom theme"
            />
          </TabsContent>
        </Tabs>
      </div>
    </Wrapper>
  );
}

export default WordPressVisualWalkthrough;

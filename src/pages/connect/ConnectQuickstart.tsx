import { Link } from "react-router-dom";
import { connectPath } from "@/lib/config";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "@/hooks/use-toast";

const fadeUp = {
  hidden: { opacity: 0, y: 16, filter: "blur(4px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)" },
};

function CopyBlock({ code, title }: { code: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    toast({ title: "Copied" });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <button onClick={handleCopy} className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-sm bg-muted/20"><code>{code}</code></pre>
    </div>
  );
}

const STEPS = [
  {
    step: 1,
    title: "Get Your API Credentials",
    desc: "Request API access through the Connect portal. You'll receive a property ID and API key.",
    code: `# Your credentials
API_URL="https://YOUR_PROJECT.supabase.co/functions/v1/roomsonline-pms-api"
API_KEY="rol_your_api_key_here"
PROPERTY_ID="your-property-uuid"`,
    lang: "bash",
  },
  {
    step: 2,
    title: "Health Check",
    desc: "Verify your credentials are working. This should return a healthy status.",
    code: `curl -X POST "$API_URL" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: $API_KEY" \\
  -d '{
    "action": "health_check"
  }'`,
    lang: "cURL",
  },
  {
    step: 3,
    title: "Fetch Room Types",
    desc: "Get the list of room types configured for your property.",
    code: `curl -X POST "$API_URL" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: $API_KEY" \\
  -d '{
    "action": "get_room_types",
    "property_id": "'$PROPERTY_ID'"
  }'`,
    lang: "cURL",
  },
  {
    step: 4,
    title: "Check Availability",
    desc: "Query real-time availability for a date range. Returns available room types with pricing.",
    code: `curl -X POST "$API_URL" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: $API_KEY" \\
  -d '{
    "action": "fetch_availability",
    "property_id": "'$PROPERTY_ID'",
    "check_in": "2026-04-01",
    "check_out": "2026-04-05",
    "adults": 2
  }'`,
    lang: "cURL",
  },
  {
    step: 5,
    title: "Create Your First Reservation",
    desc: "Book a room! This validates availability, calculates pricing, and creates a folio automatically.",
    code: `curl -X POST "$API_URL" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: $API_KEY" \\
  -d '{
    "action": "create_reservation",
    "property_id": "'$PROPERTY_ID'",
    "room_type_id": "ROOM_TYPE_UUID",
    "check_in_date": "2026-04-01",
    "check_out_date": "2026-04-05",
    "guest_name": "Themba Nkosi",
    "guest_email": "themba@example.com",
    "adults": 2
  }'`,
    lang: "cURL",
  },
];

export default function ConnectQuickstart() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-primary/5 to-background pt-10 pb-8 sm:pt-16 sm:pb-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden" animate="visible" variants={fadeUp}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <Link to={connectPath("/connect/docs")} className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block">
              ← API Reference
            </Link>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Quickstart Guide</h1>
            <p className="mt-3 text-lg text-muted-foreground max-w-2xl">
              Go from zero to your first booking in 5 steps. This guide takes about 10 minutes.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Steps */}
      <section className="py-12">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 space-y-12">
          {STEPS.map((step, i) => (
            <motion.div
              key={step.step}
              initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}
              variants={fadeUp} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="relative"
            >
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold shrink-0">
                  {step.step}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold">{step.title}</h2>
                  <p className="text-sm text-muted-foreground mt-1 mb-4">{step.desc}</p>
                  <CopyBlock code={step.code} title={step.lang} />
                </div>
              </div>
              {i < STEPS.length - 1 && (
                <div className="absolute left-[15px] top-10 w-px h-[calc(100%-16px)] bg-border" />
              )}
            </motion.div>
          ))}
        </div>
      </section>

      {/* Next steps */}
      <section className="py-10 sm:py-12 lg:py-16 border-t">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold mb-3">You're Ready to Build</h2>
          <p className="text-muted-foreground mb-6">
            Explore the full API reference for all 50+ actions — including static content, cancellation & reservation policies, payment methods and contact details — or install the WordPress plugin for instant integration.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link to={connectPath("/connect/docs")}><Button size="lg" className="gap-2">Full API Reference <ArrowRight className="h-4 w-4" /></Button></Link>
            <Link to={connectPath("/connect/docs/wordpress")}><Button variant="outline" size="lg">WordPress Guide</Button></Link>
          </div>
        </div>
      </section>
    </div>
  );
}

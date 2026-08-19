import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { connectPath } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { usePageSEO } from "@/hooks/usePageSEO";
import {
  ArrowRight,
  Check,
  Download,
  Users,
  Building2,
  Handshake,
  MessageSquare,
  ClipboardCheck,
  Star,
  RefreshCw,
  ShieldCheck,
  Lock,
  Plug,
  KeyRound,
  Activity,
  Sparkles,
  TrendingDown,
  FileSpreadsheet,
  EyeOff,
  Repeat,
  Clock,
  Gift,
} from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 16, filter: "blur(4px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)" },
};

const BROCHURE_HREF = "/docs/ROLOS-HubSpot-CRM-Brochure.pdf";

const PAIN_POINTS = [
  {
    icon: Lock,
    title: "Guest data is trapped",
    desc: "Every stay, every rate, every preference sits inside the reservation system. Your CRM never sees it, so your marketing talks to strangers.",
  },
  {
    icon: FileSpreadsheet,
    title: "Sales runs on spreadsheets",
    desc: "Enquiries live in an inbox, agents live in a spreadsheet, and follow-ups happen when somebody remembers. Nothing is a pipeline.",
  },
  {
    icon: EyeOff,
    title: "Nobody knows who produced the revenue",
    desc: "Which agent actually sends business? Which guest is worth a win-back call? Without operational truth, a CRM is a guessing machine.",
  },
];

const FOUNDATION = [
  "Reservations, stays and cancellations",
  "Website and portfolio enquiries",
  "Lifetime spend, stay count and last stay date",
  "Trade partner vs direct guest classification",
  "Digital check-in details and guest preferences",
  "Post-departure feedback and ratings",
];

const HUBSPOT_SURFACE = [
  "Contacts with real stay history",
  "Companies for trade partners and agents",
  "Deals that move as bookings move",
  "Enquiry pipeline from New to Lost",
  "Lists and segments that build themselves",
  "Sequences, campaigns and reporting",
];

const STEPS = [
  {
    step: "1",
    icon: Plug,
    title: "Turn it on",
    desc: "The HubSpot add-on is off by default. An owner opts in from ROL Account settings or the onboarding wizard — one portal per owner, covering the whole portfolio.",
  },
  {
    step: "2",
    icon: KeyRound,
    title: "Paste your token",
    desc: "Create a HubSpot private app token with CRM read/write scopes and paste it in. ROL'OS encrypts it server-side; it is never sent back to the browser.",
  },
  {
    step: "3",
    icon: ShieldCheck,
    title: "Test the connection",
    desc: "Before anything is saved, ROL'OS calls HubSpot with your token and confirms the portal answers. A failed token is refused, not stored.",
  },
  {
    step: "4",
    icon: RefreshCw,
    title: "Let the sweep run",
    desc: "A delta sweep runs every 15 minutes and pushes only what changed. New bookings, cancellations and enquiries also project the moment they happen.",
  },
];

const MAPPING = [
  {
    icon: Users,
    rolos: "Guest profile",
    hubspot: "Contact",
    detail:
      "Name, email, phone, nationality, stay count, lifetime spend and last stay date — matched on email first, then normalised name, so one human is one contact.",
  },
  {
    icon: Handshake,
    rolos: "Trade partner / agent",
    hubspot: "Company",
    detail:
      "Agents, tour operators and corporates become companies with their associated contacts and the bookings they actually produced.",
  },
  {
    icon: Building2,
    rolos: "Booking",
    hubspot: "Deal",
    detail:
      "One deal per reservation, carrying the booking reference, property, arrival and departure, value and status. Modifications and cancellations move the deal.",
  },
  {
    icon: MessageSquare,
    rolos: "Enquiry",
    hubspot: "Deal in the enquiry pipeline",
    detail:
      "Website and portfolio enquiries arrive as native ROL'OS records and project into HubSpot with their stage — New through to Won or Lost.",
  },
  {
    icon: ClipboardCheck,
    rolos: "Digital check-in",
    hubspot: "Contact properties",
    detail:
      "Guest-submitted details, travel party and preferences land on the contact, so marketing and reception see the same person.",
  },
  {
    icon: Star,
    rolos: "Post-departure feedback",
    hubspot: "Contact activity",
    detail:
      "Ratings and comments captured after checkout attach to the guest, ready for reputation follow-up and win-back campaigns.",
  },
];

const SEGMENTS = [
  {
    icon: Handshake,
    title: "Trade vs Direct",
    desc: "Derived from how the booking was made, not hand-tagged. Trade partners get partner treatment; direct guests get direct campaigns.",
  },
  {
    icon: Repeat,
    title: "Repeat guests",
    desc: "Stay counts are rolled up from actual reservation history across the whole portfolio, not counted by hand.",
  },
  {
    icon: Clock,
    title: "Lapsed guests",
    desc: "Last stay date is maintained for every guest, so a low-season win-back list is a filter, not a data project.",
  },
  {
    icon: TrendingDown,
    title: "Value tiers",
    desc: "Lifetime spend is calculated from settled bookings — the difference between a loyal guest and a one-night bargain hunter.",
  },
];

const VIGNETTES = [
  {
    title: "The enquiry that never got answered",
    before: "A website enquiry sits in a shared inbox until the guest books elsewhere.",
    after:
      "The enquiry lands as a ROL'OS record, projects into HubSpot as a deal, and a sequence follows up automatically until someone wins or loses it.",
  },
  {
    title: "Low season is three weeks away",
    before: "Somebody exports a booking list and tries to guess who might come back.",
    after:
      "Filter HubSpot for guests whose last stay was 12+ months ago with above-average lifetime spend. Send the offer. Bookings arrive back in ROL'OS.",
  },
  {
    title: "The agent asking for better rates",
    before: "Nobody can say how much business the agent has actually delivered.",
    after:
      "The agent is a HubSpot company with their contacts, their deals and their production. The rate conversation becomes a numbers conversation.",
  },
  {
    title: "A guest checks out unhappy",
    before: "The complaint is mentioned at handover and forgotten by Friday.",
    after:
      "Feedback attaches to the contact, a follow-up task is created, and the recovery gesture is tracked like any other deal.",
  },
];

const TRUST = [
  "Opt-in per owner and off by default — nothing syncs until you say so",
  "Your token is encrypted server-side and never returned to the browser",
  "Verified before it is saved: an invalid token is refused",
  "Isolated adapter — it cannot touch calendars, rates or availability",
  "One-click disconnect; your ROL'OS data stays exactly where it is",
  "Included free. No add-on fee, no plan gate, no per-contact charge",
];

const FAQS = [
  {
    q: "Does the HubSpot add-on cost extra?",
    a: "No. It is included free with ROL'OS, on every property, with no plan gating and no per-contact fee. You only need a HubSpot account — their free tier works.",
  },
  {
    q: "Do I have to use HubSpot to get the CRM features?",
    a: "No. Guest profiles, enquiry pipelines, digital check-in, segmentation and post-departure feedback are all native ROL'OS features. HubSpot is an optional projection of that data for teams who already live in HubSpot.",
  },
  {
    q: "Is it one HubSpot portal per property?",
    a: "One portal per owner, covering the whole portfolio. Properties are distinguished on the records themselves, so a group can run one CRM across every lodge.",
  },
  {
    q: "How quickly does data appear in HubSpot?",
    a: "New bookings, cancellations and enquiries project as they happen. A delta sweep runs every 15 minutes as a safety net and pushes only what changed.",
  },
  {
    q: "What happens if I disconnect?",
    a: "Syncing stops immediately and the stored credentials are removed. Records already in HubSpot remain yours, and ROL'OS keeps operating exactly as before.",
  },
  {
    q: "Can it write back from HubSpot into ROL'OS?",
    a: "The add-on projects operational truth outward to HubSpot. ROL'OS remains the system of record for bookings, rates and availability — which is precisely why the CRM data stays trustworthy.",
  },
];

export default function ConnectHubSpot() {
  usePageSEO({
    title: "ROL'OS + HubSpot — Guest CRM Built on Operational Truth",
    description:
      "Connect HubSpot to ROL'OS free. Guests, trade partners, bookings and enquiries flow into HubSpot as contacts, companies and deals — segmented automatically.",
    ogType: "website",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "ROL'OS HubSpot CRM Add-on",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description:
        "Owner-level HubSpot CRM add-on for ROL'OS. Projects guests, trade partners, bookings and enquiries into HubSpot contacts, companies and deals.",
      offers: { "@type": "Offer", price: "0", priceCurrency: "ZAR" },
    },
  });

  return (
    <div>
      {/* ─── Hero ──────────────────────────────────────────────── */}
      <section className="bg-gradient-to-b from-primary/5 to-background pt-10 pb-10 sm:pt-16 sm:pb-14">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <motion.div initial="hidden" animate="visible" variants={fadeUp} transition={{ duration: 0.6 }}>
            <Badge className="mb-4 gap-1.5">
              <Gift className="h-3.5 w-3.5" />
              Included free with ROL'OS
            </Badge>
          </motion.div>
          <motion.h1
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight max-w-4xl mx-auto"
          >
            Your CRM has no idea who your guests are.{" "}
            <span className="text-primary">ROL'OS does.</span>
          </motion.h1>
          <motion.p
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            transition={{ duration: 0.7, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="mt-5 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto"
          >
            ROL'OS knows every stay, every enquiry, every rand a guest has ever spent with you.
            Connect HubSpot and all of it becomes contacts, companies and deals — segmented, current,
            and ready to sell from.
          </motion.p>
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            transition={{ duration: 0.7, delay: 0.16 }}
            className="mt-8 flex flex-col sm:flex-row gap-3 justify-center"
          >
            <Button asChild size="lg">
              <Link to={connectPath("/connect/get-started")}>
                Get started free <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <a href={BROCHURE_HREF} target="_blank" rel="noopener noreferrer">
                <Download className="mr-2 h-4 w-4" /> Download the brochure (PDF)
              </a>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* ─── The CRM problem ───────────────────────────────────── */}
      <section className="py-12 sm:py-16 border-b">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold">Why CRM projects fail at properties</h2>
            <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">
              It is almost never the CRM. It is that the CRM was never given the operational truth it needed.
            </p>
          </div>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
            className="grid sm:grid-cols-3 gap-4 sm:gap-6"
          >
            {PAIN_POINTS.map((p) => (
              <motion.div
                key={p.title}
                variants={fadeUp}
                transition={{ duration: 0.5 }}
                className="rounded-xl border bg-card p-6"
              >
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <p.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold">{p.title}</h3>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{p.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ─── The pairing ───────────────────────────────────────── */}
      <section className="py-12 sm:py-16 bg-muted/20 border-b">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold">The powerhouse pairing</h2>
            <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">
              ROL'OS is the system of record. HubSpot is where you sell. The add-on is the bridge between them.
            </p>
          </div>

          <div className="grid lg:grid-cols-[1fr_auto_1fr] gap-6 items-stretch">
            <div className="rounded-xl border bg-card p-6">
              <Badge variant="secondary" className="mb-3">
                Foundation
              </Badge>
              <h3 className="font-semibold text-lg">ROL'OS operational truth</h3>
              <ul className="mt-4 space-y-2">
                {FOUNDATION.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex lg:flex-col items-center justify-center gap-3">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <RefreshCw className="h-5 w-5 text-primary" />
              </div>
              <span className="text-xs text-muted-foreground text-center max-w-[8rem]">
                Normalised guest identity, then delta sync
              </span>
            </div>

            <div className="rounded-xl border bg-card p-6">
              <Badge variant="secondary" className="mb-3">
                Surface
              </Badge>
              <h3 className="font-semibold text-lg">HubSpot sales &amp; marketing</h3>
              <ul className="mt-4 space-y-2">
                {HUBSPOT_SURFACE.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ─── How it works ──────────────────────────────────────── */}
      <section className="py-12 sm:py-16 border-b">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-10">Connected in four steps</h2>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
            className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6"
          >
            {STEPS.map((s) => (
              <motion.div
                key={s.step}
                variants={fadeUp}
                transition={{ duration: 0.5 }}
                className="rounded-xl border bg-card p-6"
              >
                <div className="flex items-center gap-3 mb-4">
                  <span className="h-8 w-8 rounded-full bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center">
                    {s.step}
                  </span>
                  <s.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{s.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ─── Mapping ───────────────────────────────────────────── */}
      <section className="py-12 sm:py-16 bg-muted/20 border-b">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold">What lands in HubSpot</h2>
            <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">
              Every record arrives with the context that makes it useful — because the context already existed in ROL'OS.
            </p>
          </div>
          <div className="rounded-xl border bg-card divide-y overflow-hidden">
            {MAPPING.map((m) => (
              <div key={m.rolos} className="p-5 sm:p-6 grid sm:grid-cols-[1fr_1fr_2fr] gap-3 sm:gap-6 items-start">
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <m.icon className="h-4 w-4 text-primary" />
                  </div>
                  <span className="font-medium text-sm">{m.rolos}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <ArrowRight className="h-4 w-4 text-primary shrink-0" />
                  <span className="font-medium">{m.hubspot}</span>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{m.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Segmentation ──────────────────────────────────────── */}
      <section className="py-12 sm:py-16 border-b">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold">Segmentation you did not have to build</h2>
            <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">
              These flags are derived by ROL'OS from real reservation history — not typed into a CRM field by a human who might forget.
            </p>
          </div>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
            className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6"
          >
            {SEGMENTS.map((s) => (
              <motion.div
                key={s.title}
                variants={fadeUp}
                transition={{ duration: 0.5 }}
                className="rounded-xl border bg-card p-6"
              >
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <s.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold">{s.title}</h3>
                <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{s.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ─── What it makes easy ────────────────────────────────── */}
      <section className="py-12 sm:py-16 bg-muted/20 border-b">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold">What it makes easy</h2>
            <p className="text-muted-foreground mt-2">Four situations every property recognises.</p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
            {VIGNETTES.map((v) => (
              <div key={v.title} className="rounded-xl border bg-card p-6">
                <h3 className="font-semibold">{v.title}</h3>
                <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
                  <span className="font-medium text-foreground">Today: </span>
                  {v.before}
                </p>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  <span className="font-medium text-primary">With ROL'OS + HubSpot: </span>
                  {v.after}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Trust ─────────────────────────────────────────────── */}
      <section className="py-12 sm:py-16 border-b">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold">Safe, isolated, and yours to switch off</h2>
              <p className="text-muted-foreground mt-3 leading-relaxed">
                The add-on is deliberately built as an isolated adapter. It reads what ROL'OS already knows and writes
                to your HubSpot portal — and it has no path into your calendar, your rates or your availability.
                If you disconnect, your operation does not notice.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild>
                  <Link to={connectPath("/connect/get-started")}>
                    Get started free <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to={connectPath("/connect/integrations")}>See all integrations</Link>
                </Button>
              </div>
            </div>
            <ul className="grid gap-3">
              {TRUST.map((t) => (
                <li key={t} className="flex items-start gap-2.5 rounded-lg border bg-card p-4 text-sm">
                  <ShieldCheck className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">{t}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ─── FAQ ───────────────────────────────────────────────── */}
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-8">HubSpot add-on questions</h2>
          <Accordion type="single" collapsible className="w-full">
            {FAQS.map((f, i) => (
              <AccordionItem key={f.q} value={`faq-${i}`}>
                <AccordionTrigger className="text-left text-sm sm:text-base">{f.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* ─── Closing CTA ───────────────────────────────────────── */}
      <section className="py-14 sm:py-20 bg-primary text-primary-foreground">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <Sparkles className="h-8 w-8 mx-auto mb-4 opacity-90" />
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold">
            Stop running a CRM on guesswork
          </h2>
          <p className="mt-4 text-base sm:text-lg opacity-90 max-w-2xl mx-auto">
            Run your property on ROL'OS, connect HubSpot in minutes, and let your sales team work from what actually happened.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg" variant="secondary">
              <Link to={connectPath("/connect/get-started")}>
                Get started free <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-primary-foreground/40 bg-transparent hover:bg-primary-foreground/10"
            >
              <a href={BROCHURE_HREF} target="_blank" rel="noopener noreferrer">
                <Download className="mr-2 h-4 w-4" /> Download the brochure
              </a>
            </Button>
          </div>
          <p className="mt-6 text-xs opacity-75 flex items-center justify-center gap-1.5">
            <Activity className="h-3.5 w-3.5" /> Delta sync every 15 minutes · opt-in · no extra cost
          </p>
        </div>
      </section>
    </div>
  );
}

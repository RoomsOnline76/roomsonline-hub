import { Link } from "react-router-dom";
import { connectPath } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Shield,
  Sparkles,
  Building2,
  Globe,
  TrendingUp,
  CreditCard,
} from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 16, filter: "blur(4px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)" },
};

/** What the booking fee applies to — payable from day one. */
const FEE_APPLIES_TO = [
  "Bookings delivered through ROL OTA and channel listings",
  "Bookings taken through the widget, embed or WordPress booking engine",
  "Agreed per property and negotiable for volume and portfolios",
];

const FREE_POINTS = [
  "Full ROL'OS PMS and every add-on switched on for 60 days",
  "No subscription, no setup fee and no per-room charge in that period",
  "Onboarding, setup, training and support at no charge",
  "You pay only the booking fee on bookings taken through ROL'OS",
];

/** What starts being charged once the free period ends. */
const CHARGEABLE_AFTER: { item: string; note: string }[] = [
  { item: "ROL'OS PMS subscription", note: "Priced on your agreement" },
  { item: "Channel manager & OTA distribution", note: "Charged per unit" },
  { item: "White label & your own booking domain", note: "Priced on your agreement" },
  { item: "Branding pack", note: "Priced on your agreement" },
  { item: "Revenue management & yield tools", note: "Priced on your agreement" },
  { item: "Bring your own payment gateway", note: "Priced on your agreement" },
  { item: "Booking fee on ROL'OS-delivered bookings", note: "Continues as agreed" },
];


/** Grouped capability list — the promo surface for what "included" means. */
const INCLUDED_GROUPS: { icon: typeof Building2; title: string; items: string[] }[] = [
  {
    icon: Building2,
    title: "Operate",
    items: [
      "ROL'OS PMS & front desk",
      "Reservations, groups & events",
      "Rates, seasons & rate plans",
      "Packages, specials & promo codes",
      "Housekeeping & maintenance boards",
      "Night audit automation",
      "Staff roles & shift management",
      "Multi-property portfolio management",
    ],
  },
  {
    icon: Globe,
    title: "Distribute",
    items: [
      "Channel manager & OTA distribution",
      "White-label branding on your own booking domain",
      "Booking widgets, embeds & WordPress plugin",
      "Developer REST API (55+ actions)",
      "HMAC-signed webhooks",
      "PMS adapters — keep the system you already run",
      "Direct booking button for any website",
      "Guest journeys & multi-property itineraries",
    ],
  },
  {
    icon: CreditCard,
    title: "Get paid",
    items: [
      "Folio, invoicing & pro-forma documents",
      "VAT handling & tax invoices",
      "Payment gateway integration (or bring your own)",
      "Refund register with approval workflow",
      "F&B and revenue splits",
      "Portfolio reconciliation & payout statements",
      "Deposit schedules & balance tracking",
      "Reservation-only mode if you never take payment",
    ],
  },
  {
    icon: TrendingUp,
    title: "Grow",
    items: [
      "Revenue management, yield rules & rate strategies",
      "Reviews & reputation monitoring",
      "Guest CRM & segmentation",
      "HubSpot CRM add-on — free, opt-in",
      "Portfolio analytics & Revenue Pulse",
      "TOBI assistant for you and your guests",
      "Branded guest email & messaging",
      "Mobile apps for iPhone & Android",
      "Content quality & channel readiness scoring",
    ],
  },
];

const GUARANTEES = [
  "60 days free on the full stack",
  "No annual lock-in — cancel anytime",
  "Keep your data, full export included",
  "Free onboarding, training and support",
  "Add-on pricing agreed in writing before day 61",
  "Volume and portfolio terms negotiable",
];

const COMPETITOR_COSTS = [
  { item: "Basic PMS (rooms + bookings)", typical: "R 2,500 – R 5,000/mo", rolos: "Free for 60 days, then subscription" },
  { item: "Channel manager & OTA distribution", typical: "R 2,000 – R 4,000/mo", rolos: "Free for 60 days, then per unit" },
  { item: "API access & webhooks", typical: "R 1,500 – R 3,000/mo", rolos: "Included, no add-on" },
  { item: "Revenue management & yield tools", typical: "R 1,000 – R 2,500/mo", rolos: "Free for 60 days, then add-on" },
  { item: "White-label branding & own booking domain", typical: "Enterprise tier only", rolos: "Free for 60 days, then add-on" },
  { item: "Assistant / chatbot", typical: "R 800 – R 2,000/mo", rolos: "Included (TOBI)" },
  { item: "Reviews & reputation monitoring", typical: "R 600 – R 1,500/mo", rolos: "Included" },
  { item: "Revenue splits & portfolio recon", typical: "Rarely offered", rolos: "Included" },
  { item: "Setup fee", typical: "Common", rolos: "None" },
];


export default function ConnectPricing() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-primary/5 to-background pt-10 pb-8 sm:pt-16 sm:pb-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial="hidden" animate="visible" variants={fadeUp}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="inline-block px-3 py-1 text-xs font-medium rounded-full bg-primary/10 text-primary mb-4">
              60 days free · then a subscription plus your chosen add-ons
            </span>
          </motion.div>
          <motion.h1
            initial="hidden" animate="visible" variants={fadeUp}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight"
          >
            Your first 60 days are free.{" "}
            <span className="text-primary">Start earning before you start paying.</span>
          </motion.h1>
          <motion.p
            initial="hidden" animate="visible" variants={fadeUp}
            transition={{ duration: 0.7, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto"
          >
            For 60 days you run the full ROL'OS stack — PMS, channel manager, white label,
            revenue management and every add-on — with no subscription and no setup fee.
            You pay only the booking fee on bookings taken through ROL'OS. From day 61 the
            PMS subscription and the add-ons you keep are billed as set out in your agreement.
          </motion.p>

        </div>
      </section>

      {/* The single offer */}
      <section className="py-12 sm:py-16">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}
            variants={fadeUp} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background p-6 sm:p-10 relative"
          >
            <span className="absolute top-4 right-4 text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground font-medium flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Negotiable
            </span>

            <div className="grid md:grid-cols-2 gap-8 md:gap-10">
              <div>
                <h2 className="text-2xl sm:text-3xl font-bold">One plan. Everything in it.</h2>
                <div className="mt-3 flex items-baseline gap-2 flex-wrap">
                  <span className="text-3xl sm:text-4xl font-bold text-primary">R 0</span>
                  <span className="text-sm text-muted-foreground">/month, on every tier and every room count</span>
                </div>
                <ul className="mt-6 space-y-2.5">
                  {FREE_POINTS.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link to={connectPath("/connect/get-started")} className="inline-block mt-7">
                  <Button size="lg" className="gap-2">
                    Get started free <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>

              <div className="rounded-xl border bg-card p-5 sm:p-6">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  The only charge
                </h3>
                <p className="mt-2 text-xl font-bold">
                  A booking fee — <span className="text-primary">competitive and surprisingly low</span>
                </p>
                <ul className="mt-4 space-y-2.5">
                  {FEE_APPLIES_TO.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
                  The fee is agreed per property and negotiable for volume and portfolios.
                  Talk to us and we'll put it in writing before you go live.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Everything included */}
      <section className="py-10 sm:py-12 lg:py-16 border-t">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}
            variants={fadeUp} transition={{ duration: 0.6 }}
            className="text-center mb-10"
          >
            <span className="inline-block px-3 py-1 text-xs font-medium rounded-full bg-primary/10 text-primary mb-3">
              Included · Every property, every module
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold">Everything is in the box.</h2>
            <p className="text-muted-foreground mt-2 max-w-2xl mx-auto">
              White label, revenue management, PMS, channel integration, the developer API and
              the rest of the operating stack ship switched on. There are no feature paywalls
              and no upgrade tiers to climb.
            </p>
          </motion.div>

          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }}
            variants={{ visible: { transition: { staggerChildren: 0.07 } } }}
            className="grid sm:grid-cols-2 gap-5"
          >
            {INCLUDED_GROUPS.map((g) => (
              <motion.div
                key={g.title}
                variants={fadeUp}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-2xl border bg-card p-6"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <g.icon className="h-5 w-5 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold">{g.title}</h3>
                </div>
                <ul className="space-y-2.5">
                  {g.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </motion.div>

          <p className="text-xs text-muted-foreground text-center mt-6 max-w-2xl mx-auto">
            Third-party pass-through costs stay with the third party — an external revenue-management
            licence you already hold, or your own payment gateway's transaction fees, are billed at cost
            where they apply. Nothing in ROL'OS itself is charged for.
          </p>
        </div>
      </section>

      {/* What Others Charge */}
      <section className="py-10 sm:py-12 lg:py-16 border-t bg-muted/20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}
            variants={fadeUp} transition={{ duration: 0.6 }}
            className="text-center mb-10"
          >
            <h2 className="text-2xl font-bold">What Others Charge for the Same Features</h2>
            <p className="text-muted-foreground mt-2 max-w-lg mx-auto">
              Most providers sell these as tiers and add-ons. ROL'OS includes them and charges
              nothing until a booking arrives.
            </p>
          </motion.div>

          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.1 }}
            variants={fadeUp} transition={{ duration: 0.5 }}
            className="overflow-x-auto"
          >
            <table className="w-full text-sm max-w-3xl mx-auto">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-semibold">Feature</th>
                  <th className="py-3 px-4 font-semibold text-muted-foreground text-center">Typical PMS Cost</th>
                  <th className="py-3 px-4 font-semibold text-primary text-center">ROL'OS</th>
                </tr>
              </thead>
              <tbody>
                {COMPETITOR_COSTS.map((row) => (
                  <tr key={row.item} className="border-b last:border-0">
                    <td className="py-3 px-4">{row.item}</td>
                    <td className="py-3 px-4 text-center text-muted-foreground">{row.typical}</td>
                    <td className="py-3 px-4 text-center font-medium text-primary">{row.rolos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        </div>
      </section>

      {/* Risk-Free Guarantee */}
      <section className="py-10 sm:py-12 lg:py-16 border-t">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}
            variants={fadeUp} transition={{ duration: 0.6 }}
          >
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <h2 className="text-2xl font-bold mb-6">Risk-Free Guarantee</h2>
          </motion.div>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 max-w-3xl mx-auto">
            {GUARANTEES.map((g) => (
              <div key={g} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                {g}
              </div>
            ))}
          </div>
          <div className="mt-8">
            <Link to={connectPath("/connect/get-started")}>
              <Button size="lg" className="gap-2">
                Get started free <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

import { Link } from "react-router-dom";
import { connectPath } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowRight, Check, CheckCircle2, Shield, Sparkles, Palette, Globe, TrendingUp, CreditCard } from "lucide-react";
import { usePublicPricing, formatZar, type PublicPricingTier } from "@/hooks/usePublicPricing";

const fadeUp = {
  hidden: { opacity: 0, y: 16, filter: "blur(4px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)" },
};

const TIER_META = [
  {
    name: "Starter",
    desc: "For individual properties getting started — no PMS experience needed.",
    features: [
      "Booking Engine Widgets",
      "WordPress plugin",
      "Guest CRM",
      "Rate season management",
      "Revenue management & analytics",
      "Folio & billing system",
      "Housekeeping board",
      "TOBI AI assistant",
      "Night audit automation",
      "Portfolio analytics dashboard",
      "Email support",
    ],
    cta: "Start 60-Day Free Trial",
    popular: false,
    negotiable: false,
    savings: null as string | null,
  },
  {
    name: "Professional",
    desc: "For growing properties and small portfolios — enterprise features included.",
    features: [
      "Everything in Starter",
      "Portfolio aggregator",
      "Channel manager (1 OTA included)",
      "Priority support",
    ],
    cta: "Start 60-Day Free Trial",
    popular: true,
    negotiable: true,
    savings: "Channel manager alone can cost R 2,000+/mo elsewhere",
  },
  {
    name: "Enterprise",
    desc: "For hotel groups and management companies — fully customisable.",
    features: [
      "Everything in Professional",
      "Unlimited OTA channels",
      "Full API access (55+ actions)",
      "Custom API integrations",
      "Dedicated account manager",
      "SLA guarantee",
    ],
    cta: "Get Custom Quote",
    popular: false,
    negotiable: true,
    savings: "Typically 40–60% less than comparable enterprise PMS",
  },
];

function tierCaps(t: PublicPricingTier | undefined, fallback: string): string {
  if (!t) return fallback;
  const roomLabel = t.max_rooms === null || t.max_rooms === undefined
    ? "Unlimited rooms"
    : `Up to ${t.max_rooms} rooms`;
  const propLabel = t.max_properties === null || t.max_properties === undefined
    ? "unlimited properties"
    : t.max_properties === 1
      ? "1 property"
      : `up to ${t.max_properties} properties`;
  return `${roomLabel} · ${propLabel}`;
}

function tierPrice(t: PublicPricingTier | undefined, isEnterprise: boolean): { price: string; period: string } {
  if (isEnterprise || !t || t.monthly_fee === null || t.monthly_fee === undefined) {
    return { price: "Let's Talk", period: "" };
  }
  return { price: formatZar(t.monthly_fee), period: "/month" };
}

const GUARANTEES = [
  "60-day free trial on all plans",
  "Month-to-month billing — no annual lock-in",
  "R 0 setup fees",
  "Cancel anytime, keep your data",
  "Full data export included",
  "Negotiable pricing for multi-property portfolios",
];


export default function ConnectPricing() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-primary/5 to-background pt-16 pb-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial="hidden" animate="visible" variants={fadeUp}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="inline-block px-3 py-1 text-xs font-medium rounded-full bg-primary/10 text-primary mb-4">
              Negotiable Plans Available
            </span>
          </motion.div>
          <motion.h1
            initial="hidden" animate="visible" variants={fadeUp}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="text-4xl sm:text-5xl font-bold tracking-tight"
          >
            Enterprise Power.{" "}
            <span className="text-primary">Startup Pricing.</span>
          </motion.h1>
          <motion.p
            initial="hidden" animate="visible" variants={fadeUp}
            transition={{ duration: 0.7, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto"
          >
            You'll think we made a mistake on the price. No per-API-call fees.
            No hidden charges. Every plan includes what others charge extra for —
            or skip the subscription entirely with our commission-only widget option.
          </motion.p>

        </div>
      </section>

      {/* Pricing cards */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Commission-only callout — WBE / Widgets / WordPress */}
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}
            variants={fadeUp} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="mb-10 rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 via-background to-background p-6 sm:p-8 relative"
          >
            <span className="absolute top-4 right-4 text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground font-medium flex items-center gap-1">
              <Sparkles className="h-3 w-3" /> Negotiable
            </span>
            <div className="grid md:grid-cols-[1.4fr_1fr] gap-6 items-center">
              <div>
                <span className="inline-block px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase rounded-full bg-primary/10 text-primary mb-3">
                  No subscription · Commission-only
                </span>
                <h3 className="text-2xl font-bold">WBE, Widgets &amp; WordPress</h3>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-primary">From 2%</span>
                  <span className="text-sm text-muted-foreground">commission per booking</span>
                </div>
                <p className="text-sm text-muted-foreground mt-3 max-w-xl">
                  No monthly fee. Pay only when you get a booking. Perfect for properties that already
                  have a website and just want a booking engine that converts.
                </p>
                <Link to={connectPath("/connect/get-started")} className="inline-block mt-5">
                  <Button className="gap-2">
                    Talk to us <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
              <ul className="space-y-2.5">
                {[
                  "Embed the ROL booking engine (WBE) on any site",
                  "WordPress plugin + shortcodes",
                  "Availability & booking widgets",
                  "Commission negotiable for volume / portfolios",
                ].map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>

          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}
            variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
            className="grid lg:grid-cols-3 gap-6"
          >

            {TIERS.map((tier) => (
              <motion.div
                key={tier.name}
                variants={fadeUp}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className={`rounded-2xl border p-8 relative ${tier.popular ? "border-primary shadow-lg ring-1 ring-primary/20" : "bg-card"}`}
              >
                {tier.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs px-3 py-1 rounded-full bg-primary text-primary-foreground font-medium">
                    Most Popular
                  </span>
                )}
                {tier.negotiable && (
                  <span className="absolute top-4 right-4 text-xs px-2 py-0.5 rounded-full bg-accent text-accent-foreground font-medium flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> Negotiable
                  </span>
                )}
                <h3 className="text-lg font-semibold">{tier.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{tier.price}</span>
                  <span className="text-sm text-muted-foreground">{tier.period}</span>
                </div>
                <p className="text-xs font-medium text-primary mt-2">{tier.caps}</p>
                <p className="text-sm text-muted-foreground mt-2">{tier.desc}</p>

                {tier.savings && (
                  <div className="mt-3 text-xs bg-primary/10 text-primary rounded-lg px-3 py-2 font-medium">
                    💡 {tier.savings}
                  </div>
                )}

                <ul className="mt-6 space-y-2.5">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>

                <Link to={connectPath("/connect/get-started")} className="block mt-8">
                  <Button variant={tier.popular ? "default" : "outline"} className="w-full gap-2">
                    {tier.cta} <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Standard — included in every monthly plan */}
      <section className="py-16 border-t">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}
            variants={fadeUp} transition={{ duration: 0.6 }}
            className="text-center mb-10"
          >
            <span className="inline-block px-3 py-1 text-xs font-medium rounded-full bg-primary/10 text-primary mb-3">
              Standard · Included in your monthly fee
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold">What you get.</h2>
            <p className="text-muted-foreground mt-2 max-w-xl mx-auto">
              Every ROL'OS subscription — Starter, Professional and Enterprise — ships with the full
              operating stack. No feature paywalls on the essentials.
            </p>
          </motion.div>

          <motion.ul
            initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }}
            variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
            className="grid sm:grid-cols-2 gap-x-8 gap-y-3 max-w-3xl mx-auto"
          >
            {[
              "Front-desk booking system",
              "Property Management System (PMS) integration",
              "Direct booking button on your website",
              "Channel management",
              "Phone app for iPhone & Android",
              "Pay Lite (SA only — conditions apply)",
              "Free training and local support",
            ].map((item) => (
              <motion.li
                key={item}
                variants={fadeUp}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="flex items-start gap-2.5 text-sm"
              >
                <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                <span>{item}</span>
              </motion.li>
            ))}
          </motion.ul>
        </div>
      </section>

      {/* Optional Add-Ons */}
      <section className="py-16 border-t bg-muted/20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}
            variants={fadeUp} transition={{ duration: 0.6 }}
            className="text-center mb-10"
          >
            <h2 className="text-2xl font-bold">Optional Add-Ons</h2>
            <p className="text-muted-foreground mt-2 max-w-xl mx-auto">
              Bolt on only what you need. Enabled per property by your ROL admin — cancel or pause any time.
            </p>
          </motion.div>

          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }}
            variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
            className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {ADD_ONS.map((a) => (
              <motion.div
                key={a.name}
                variants={fadeUp}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-xl border bg-card p-5"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                  <a.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-sm font-semibold">{a.name}</h3>
                <p className="text-xs font-medium text-primary mt-1">{a.price}</p>
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{a.desc}</p>
              </motion.div>
            ))}
          </motion.div>

          <p className="text-xs text-muted-foreground text-center mt-6 max-w-2xl mx-auto">
            Add-ons are priced per property and configured by your ROL admin. Final pricing may be adjusted for
            multi-property portfolios.
          </p>
        </div>
      </section>

      {/* What Others Charge */}
      <section className="py-16 border-t">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}
            variants={fadeUp} transition={{ duration: 0.6 }}
            className="text-center mb-10"
          >
            <h2 className="text-2xl font-bold">What Others Charge for the Same Features</h2>
            <p className="text-muted-foreground mt-2 max-w-lg mx-auto">
              Most PMS providers sell these as expensive add-ons. ROL'OS includes them all.
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
      <section className="py-16 border-t">
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
                Start 60-Day Free Trial <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

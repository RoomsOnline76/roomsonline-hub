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

const TIER_FEATURES_XS = [
  "Booking Engine Widgets",
  "WordPress plugin",
  "Guest CRM",
  "Rate season management",
  "Revenue management & analytics",
  "Folio & billing system",
  "Housekeeping board",
  "TOBI AI assistant",
  "Night audit automation",
  "Email support",
];

const TIER_FEATURES_S = [
  "Everything in the smaller tier",
  "Portfolio analytics dashboard",
  "Channel manager (1 OTA included)",
];

const TIER_FEATURES_M = [
  "Everything in the smaller tier",
  "Additional OTA channels",
  "Priority support",
];

const TIER_FEATURES_L = [
  "Everything in the smaller tier",
  "Unlimited OTA channels",
  "Full API access (55+ actions)",
  "Dedicated account manager",
];

function tierMeta(index: number) {
  const list = [
    { name: "Starter", desc: "0–9 rooms · for individual properties getting started.", features: TIER_FEATURES_XS, popular: false },
    { name: "Medium", desc: "10–19 rooms · for growing properties adding OTAs.", features: TIER_FEATURES_S, popular: true },
    { name: "Large", desc: "20–50 rooms · for established properties and small portfolios.", features: TIER_FEATURES_M, popular: false },
    { name: "Enterprise", desc: "51+ rooms · for hotel groups and larger operations.", features: TIER_FEATURES_L, popular: false },
  ];
  return list[index];
}

function tierPrice(t: PublicPricingTier | undefined): { price: string; period: string } {
  if (!t || t.monthly_fee === null || t.monthly_fee === undefined) {
    return { price: "Let's Talk", period: "" };
  }
  return { price: formatZar(t.monthly_fee), period: "/month" };
}

function tierCaps(t: PublicPricingTier | undefined, fallback: string): string {
  if (!t) return fallback;
  const min = t.min_rooms ?? 0;
  if (t.max_rooms === null || t.max_rooms === undefined) return `${min}+ rooms`;
  return `${min}–${t.max_rooms} rooms`;
}

const GUARANTEES = [
  "60-day free trial on all plans",
  "Month-to-month billing — no annual lock-in",
  "R 0 setup fees",
  "Cancel anytime, keep your data",
  "Full data export included",
  "Billed by total room count — property count doesn't affect the fee",
];


export default function ConnectPricing() {
  const { data: pricing } = usePublicPricing();

  const rolosTiers = [...(pricing?.rolosTiers ?? [])].sort((a, b) => {
    const ar = a.max_rooms ?? Number.POSITIVE_INFINITY;
    const br = b.max_rooms ?? Number.POSITIVE_INFINITY;
    return ar - br;
  });

  const tierData = [0, 1, 2, 3].map((i) => ({
    meta: tierMeta(i),
    row: rolosTiers[i],
    fallbackCaps: ["0–9 rooms", "10–19 rooms", "20–50 rooms", "51+ rooms"][i],
  }));

  const widgetPct = pricing?.widgetFlatCommissionRate ?? 2;
  const widgetPctLabel = Number.isInteger(widgetPct) ? `${widgetPct}%` : `${widgetPct.toFixed(1)}%`;

  const ADD_ONS = [
    {
      icon: Palette,
      name: "Basic Branding",
      price: `From ${formatZar(pricing?.brandingAddonMonthly)} / month`,
      desc: "Logo, colour palette and typography applied to the hosted booking flow so it matches your website.",
    },
    {
      icon: Globe,
      name: "White-label Branding",
      price: `From ${formatZar(pricing?.whiteLabelMonthly)} / month`,
      desc: "Your own booking subdomain (e.g. book.yourdomain.com) with a full brand takeover of the guest experience.",
    },
    {
      icon: TrendingUp,
      name: "PriceLabs Revenue Management",
      price: `From ${formatZar(pricing?.pricelabsMonthly)} / month`,
      desc: "Automated dynamic pricing pushed straight into ROL'OS. Available on ROL'OS PMS properties only.",
    },
    {
      icon: CreditCard,
      name: "BYO Payment Gateway",
      price: `From ${formatZar(pricing?.byoGatewayMonthly)} / month`,
      desc: "Connect your own payment provider — funds settle directly to you, ROL does not touch the money.",
    },
  ];

  const starterPriceLabel = rolosTiers[0]?.monthly_fee ? formatZar(rolosTiers[0].monthly_fee) : "R 450";
  const COMPETITOR_COSTS = [
    { item: "Basic PMS (rooms + bookings)", typical: "R 2,500 – R 5,000/mo", rolos: `Included from ${starterPriceLabel}` },
    { item: "Channel Manager add-on", typical: "R 2,000 – R 4,000/mo", rolos: "Included from 10+ rooms" },
    { item: "API access", typical: "R 1,500 – R 3,000/mo", rolos: "Included on 51+ rooms tier" },
    { item: "Revenue management", typical: "R 1,000 – R 2,500/mo", rolos: "Included on every tier" },
    { item: "AI assistant / chatbot", typical: "R 800 – R 2,000/mo", rolos: "Included (TOBI)" },
    { item: "White-label branding", typical: "Enterprise tier only", rolos: "Available as an add-on" },
    { item: "Booking widget / WBE (commission-only)", typical: "5–15% + setup fees", rolos: `From ${widgetPctLabel} · negotiable` },
  ];


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
                  <span className="text-3xl font-bold text-primary">From {widgetPctLabel}</span>
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
            className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6"
          >

            {tierData.map(({ meta, row, fallbackCaps }) => {
              const { price, period } = tierPrice(row);
              const caps = tierCaps(row, fallbackCaps);
              return (
              <motion.div
                key={meta.name}
                variants={fadeUp}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className={`rounded-2xl border p-6 relative ${meta.popular ? "border-primary shadow-lg ring-1 ring-primary/20" : "bg-card"}`}
              >
                {meta.popular && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs px-3 py-1 rounded-full bg-primary text-primary-foreground font-medium">
                    Most Popular
                  </span>
                )}
                <h3 className="text-lg font-semibold">{meta.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{price}</span>
                  <span className="text-sm text-muted-foreground">{period}</span>
                </div>
                <p className="text-xs font-medium text-primary mt-2">{caps}</p>
                <p className="text-sm text-muted-foreground mt-2">{meta.desc}</p>

                <ul className="mt-6 space-y-2.5">
                  {meta.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>

                <Link to={connectPath("/connect/get-started")} className="block mt-8">
                  <Button variant={meta.popular ? "default" : "outline"} className="w-full gap-2">
                    Start 60-Day Free Trial <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </motion.div>
              );
            })}
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
              Every ROL'OS subscription — from the smallest tier upwards — ships with the full
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
              "Booking Engine Widgets & WordPress plugin",
              "Guest CRM",
              "Rate & season management",
              "Revenue management & analytics",
              "Folio & billing system",
              "Housekeeping board",
              "Night audit automation",
              "TOBI AI assistant",
              "Portfolio analytics dashboard",
              "Phone app for iPhone & Android",
              "Payfast (SA only — conditions apply)",
              "Free training and email support",
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

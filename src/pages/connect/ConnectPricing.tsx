import { Link } from "react-router-dom";
import { connectPath } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowRight, Check, CheckCircle2, Shield, Sparkles } from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 16, filter: "blur(4px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)" },
};

const TIERS = [
  {
    name: "Starter",
    price: "R 1,500",
    period: "/month",
    desc: "For individual properties getting started — no PMS experience needed",
    features: [
      "Up to 10 rooms",
      "1 property",
      "Full API access (40+ actions)",
      "WordPress plugin",
      "Booking engine widgets",
      "Guest CRM",
      "Housekeeping board",
      "TOBI AI assistant",
      "Email support",
    ],
    cta: "Start 60-Day Free Trial",
    popular: false,
    negotiable: false,
    savings: null,
  },
  {
    name: "Professional",
    price: "R 4,500",
    period: "/month",
    desc: "For growing properties and small portfolios — enterprise features included",
    features: [
      "Up to 50 rooms",
      "Up to 3 properties",
      "Everything in Starter",
      "Revenue management & analytics",
      "Channel manager (3 OTAs included)",
      "Night audit automation",
      "Rate season management",
      "Folio & billing system",
      "Priority support",
    ],
    cta: "Start 60-Day Free Trial",
    popular: true,
    negotiable: true,
    savings: "Channel manager alone costs R 2,000+/mo elsewhere",
  },
  {
    name: "Enterprise",
    price: "Let's Talk",
    period: "",
    desc: "For hotel groups and management companies — fully customisable",
    features: [
      "Unlimited rooms",
      "Unlimited properties",
      "Everything in Professional",
      "Portfolio analytics dashboard",
      "Unlimited OTA channels",
      "White-label branding",
      "Custom API integrations",
      "Dedicated account manager",
      "SLA guarantee",
    ],
    cta: "Get Custom Quote",
    popular: false,
    negotiable: true,
    savings: "Typically 40-60% less than comparable enterprise PMS",
  },
];

const COMPETITOR_COSTS = [
  { item: "Basic PMS (rooms + bookings)", typical: "R 2,500 – R 5,000/mo", rolos: "Included from R 1,500" },
  { item: "Channel Manager add-on", typical: "R 2,000 – R 4,000/mo", rolos: "Included" },
  { item: "API access", typical: "R 1,500 – R 3,000/mo", rolos: "Included" },
  { item: "Revenue management", typical: "R 1,000 – R 2,500/mo", rolos: "Included" },
  { item: "AI assistant / chatbot", typical: "R 800 – R 2,000/mo", rolos: "Included (TOBI)" },
  { item: "White-label branding", typical: "Enterprise tier only", rolos: "Available" },
];

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
            No hidden charges. Every plan includes what others charge extra for.
          </motion.p>
        </div>
      </section>

      {/* Pricing cards */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
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

      {/* What Others Charge */}
      <section className="py-16 border-t bg-muted/20">
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

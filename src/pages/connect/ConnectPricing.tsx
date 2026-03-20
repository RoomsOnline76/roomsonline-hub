import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowRight, Check, CheckCircle2 } from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 16, filter: "blur(4px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)" },
};

const TIERS = [
  {
    name: "Starter",
    price: "R 1,500",
    period: "/month",
    desc: "For individual properties getting started with modern PMS",
    features: [
      "Up to 10 rooms",
      "1 property",
      "Full API access (40+ actions)",
      "WordPress plugin",
      "Booking engine widgets",
      "Guest CRM",
      "Housekeeping board",
      "Email support",
    ],
    cta: "Start Free Trial",
    popular: false,
  },
  {
    name: "Professional",
    price: "R 4,500",
    period: "/month",
    desc: "For growing properties and small portfolios",
    features: [
      "Up to 50 rooms",
      "Up to 3 properties",
      "Everything in Starter",
      "Revenue management",
      "Channel manager (3 OTAs)",
      "Night audit automation",
      "Rate season management",
      "Folio & billing system",
      "Priority support",
    ],
    cta: "Start Free Trial",
    popular: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    desc: "For hotel groups and management companies",
    features: [
      "Unlimited rooms",
      "Unlimited properties",
      "Everything in Professional",
      "Portfolio analytics",
      "Unlimited OTA channels",
      "White-label branding",
      "Custom API integrations",
      "Dedicated account manager",
      "SLA guarantee",
    ],
    cta: "Contact Sales",
    popular: false,
  },
];

export default function ConnectPricing() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-primary/5 to-background pt-16 pb-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <motion.h1
            initial="hidden" animate="visible" variants={fadeUp}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="text-4xl sm:text-5xl font-bold tracking-tight"
          >
            Simple, Transparent Pricing
          </motion.h1>
          <motion.p
            initial="hidden" animate="visible" variants={fadeUp}
            transition={{ duration: 0.7, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto"
          >
            No per-API-call fees. No hidden charges. Every plan includes full API access, WordPress plugin, and 30-day free trial.
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
                <h3 className="text-lg font-semibold">{tier.name}</h3>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{tier.price}</span>
                  <span className="text-sm text-muted-foreground">{tier.period}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">{tier.desc}</p>

                <ul className="mt-6 space-y-2.5">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>

                <Link to="/connect/get-started" className="block mt-8">
                  <Button variant={tier.popular ? "default" : "outline"} className="w-full gap-2">
                    {tier.cta} <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* All plans include */}
      <section className="py-16 border-t bg-muted/20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold mb-8">All Plans Include</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto">
            {["Full API access", "WordPress plugin", "30-day free trial", "No per-call fees", "SSL encryption", "Audit logging", "Email templates", "Data export"].map((f) => (
              <div key={f} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                {f}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

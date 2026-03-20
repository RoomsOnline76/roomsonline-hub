import { Link } from "react-router-dom";
import { connectPath } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { ArrowRight, Zap, Shield, Globe, BarChart3, Code2, Blocks, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";

const fadeUp = {
  hidden: { opacity: 0, y: 16, filter: "blur(4px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)" },
};

const STATS = [
  { value: "40+", label: "API Actions" },
  { value: "6", label: "Countries" },
  { value: "99.9%", label: "Uptime" },
  { value: "<200ms", label: "Avg Response" },
];

const AUDIENCES = [
  {
    title: "Property Managers",
    desc: "A complete PMS with housekeeping, folios, night audits, revenue management, and guest CRM — purpose-built for African hospitality.",
    cta: "Explore PMS Features",
    href: "/connect/features",
    icon: Shield,
  },
  {
    title: "Web Agencies & Developers",
    desc: "40+ REST API endpoints, WordPress plugin with Gutenberg blocks, embeddable widgets, and white-label booking engines.",
    cta: "View API Docs",
    href: "/connect/docs",
    icon: Code2,
  },
];

const CAPABILITIES = [
  {
    icon: Zap,
    title: "Real-time Availability",
    desc: "Live inventory with sub-second queries across all connected properties",
  },
  {
    icon: Globe,
    title: "Multi-Property Portfolio",
    desc: "Manage multiple properties from a single dashboard with aggregated KPIs",
  },
  {
    icon: BarChart3,
    title: "Revenue Analytics",
    desc: "ADR, RevPAR, occupancy forecasting, and channel performance tracking",
  },
  {
    icon: Blocks,
    title: "WordPress Native",
    desc: "Gutenberg blocks, Elementor widgets, and WP admin dashboard integration",
  },
  {
    icon: Shield,
    title: "Enterprise Security",
    desc: "Row-level security, encrypted PII, audit logging, and role-based access",
  },
  {
    icon: Code2,
    title: "Developer-First API",
    desc: "REST API with 40+ actions, JSON schemas, and code examples in 3 languages",
  },
];

const TRUST_LOGOS = ["Hostfully", "NightsBridge", "WordPress", "Elementor"];

export default function ConnectHome() {
  return (
    <div>
      {/* ─── Hero ───────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 via-background to-background">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-20 pb-24 sm:pt-28 sm:pb-32">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
            className="max-w-3xl mx-auto text-center"
          >
            <motion.div variants={fadeUp} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
              <span className="inline-block px-3 py-1 text-xs font-medium rounded-full bg-primary/10 text-primary mb-6">
                ROL'OS API v3.0 — Available Soon !
              </span>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.08]"
              style={{ textWrap: "balance" } as React.CSSProperties}
            >
              The Native PMS & Booking Engine for African Hospitality
            </motion.h1>

            <motion.p
              variants={fadeUp}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto"
              style={{ textWrap: "pretty" } as React.CSSProperties}
            >
              One API, 40+ actions — manage rooms, rates, reservations, housekeeping, folios, and guest profiles.
              Integrate with WordPress, embed on any site, or build custom with our REST API.
            </motion.p>

            <motion.div
              variants={fadeUp}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3"
            >
              <Link to={connectPath("/connect/get-started")}>
                <Button size="lg" className="gap-2 font-medium px-6">
                  Get Started <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to={connectPath("/connect/docs")}>
                <Button variant="outline" size="lg" className="gap-2 font-medium px-6">
                  <Code2 className="h-4 w-4" /> API Reference
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ─── Stats bar ────────────────────────────────────────── */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
            className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center"
          >
            {STATS.map((stat) => (
              <motion.div key={stat.label} variants={fadeUp} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
                <p className="text-3xl font-bold text-primary">{stat.value}</p>
                <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ─── Audience cards ───────────────────────────────────── */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
            className="grid md:grid-cols-2 gap-6"
          >
            {AUDIENCES.map((a) => (
              <motion.div
                key={a.title}
                variants={fadeUp}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-2xl border bg-card p-8 hover:shadow-lg transition-shadow"
              >
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <a.icon className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{a.title}</h3>
                <p className="text-muted-foreground mb-6" style={{ textWrap: "pretty" } as React.CSSProperties}>
                  {a.desc}
                </p>
                <Link to={a.href}>
                  <Button variant="outline" className="gap-2">
                    {a.cta} <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ─── Capabilities grid ──────────────────────────────── */}
      <section className="py-20 bg-muted/20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={fadeUp}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl font-bold">Everything You Need to Build</h2>
            <p className="text-muted-foreground mt-3 max-w-xl mx-auto">
              From property management to guest-facing booking experiences — ROL'OS provides the complete toolkit.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={{ visible: { transition: { staggerChildren: 0.07 } } }}
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {CAPABILITIES.map((cap) => (
              <motion.div
                key={cap.title}
                variants={fadeUp}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-xl border bg-card p-6"
              >
                <cap.icon className="h-5 w-5 text-primary mb-3" />
                <h3 className="font-semibold mb-1">{cap.title}</h3>
                <p className="text-sm text-muted-foreground">{cap.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ─── Integration logos ──────────────────────────────── */}
      <section className="py-16 border-t">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm text-muted-foreground mb-6">Integrates with the tools you already use</p>
          <div className="flex flex-wrap items-center justify-center gap-8">
            {TRUST_LOGOS.map((name) => (
              <div key={name} className="px-4 py-2 rounded-lg bg-muted/50 text-sm font-medium text-muted-foreground">
                {name}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={fadeUp}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl bg-primary/5 border p-10 sm:p-14 text-center"
          >
            <h2 className="text-2xl sm:text-3xl font-bold mb-3">Ready to Connect?</h2>
            <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
              Start your 30-day free trial. No credit card required. Full API access from day one.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to={connectPath("/connect/get-started")}>
                <Button size="lg" className="gap-2 font-medium">
                  Start Free Trial <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to={connectPath("/connect/docs/quickstart")}>
                <Button variant="outline" size="lg" className="gap-2 font-medium">
                  Read the Quickstart
                </Button>
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> 30-day free trial
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> No credit card
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Full API access
              </span>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}

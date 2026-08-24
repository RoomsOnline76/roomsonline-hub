import { Link } from "react-router-dom";
import { connectPath } from "@/lib/config";
import { Button } from "@/components/ui/button";
import {
  ArrowRight, Zap, Shield, Globe, BarChart3, Cat, CheckCircle2,
  ClipboardList, BedDouble, CreditCard, Clock, XCircle, Check,
  Smartphone, CalendarCheck, Users
} from "lucide-react";
import { motion } from "framer-motion";

const fadeUp = {
  hidden: { opacity: 0, y: 16, filter: "blur(4px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)" },
};

const STATS = [
  { value: "R 0", label: "First 60 Days" },
  { value: "No", label: "Setup Fee in Your 60 Days" },
  { value: "24/7", label: "TOBI Assistant" },
  { value: "Flexible", label: "Negotiable Plans" },
];

const PAIN_POINTS = [
  { icon: XCircle, text: "Managing bookings on spreadsheets" },
  { icon: XCircle, text: "Confirming reservations via WhatsApp" },
  { icon: XCircle, text: "No idea what your occupancy rate is" },
  { icon: XCircle, text: "Double-bookings and lost revenue" },
  { icon: XCircle, text: "Housekeeping managed on paper" },
  { icon: XCircle, text: "Manually calculating guest invoices" },
];

const SOLUTIONS = [
  { icon: CalendarCheck, text: "Automated booking engine on your website" },
  { icon: BedDouble, text: "Real-time room availability & calendar" },
  { icon: BarChart3, text: "Revenue analytics: ADR, RevPAR, occupancy" },
  { icon: Shield, text: "Zero double-bookings, ever" },
  { icon: ClipboardList, text: "Digital housekeeping board & task management" },
  { icon: CreditCard, text: "Guest folios & invoicing in one click" },
];

const COMPARISON = [
  { feature: "Rooms & Reservations", rolos: true, others: true, othersNote: "" },
  { feature: "Channel Manager (OTAs)", rolos: true, others: false, othersNote: "R 2,000+/mo extra" },
  { feature: "TOBI Assistant", rolos: true, others: false, othersNote: "Not available" },
  { feature: "REST API (50+ actions)", rolos: true, others: false, othersNote: "R 1,500+/mo extra" },
  { feature: "WordPress Plugin", rolos: true, others: false, othersNote: "Not available" },
  { feature: "White-Label Branding", rolos: true, others: false, othersNote: "Enterprise only" },
  { feature: "Revenue Management", rolos: true, others: true, othersNote: "Limited" },
  { feature: "Night Audit Automation", rolos: true, others: false, othersNote: "Manual process" },
  { feature: "No Monthly Subscription", rolos: true, others: false, othersNote: "Fixed monthly tiers" },
];

const TRUST_LOGOS = ["Hostfully", "Benson", "Rentals United", "WordPress", "Elementor"];

export default function ConnectHome() {
  const openTobi = () => {
    const btn = document.querySelector('[aria-label="Open TOBI assistant"]') as HTMLButtonElement;
    if (btn) btn.click();
  };

  return (
    <div>
      {/* ─── Hero ───────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 via-background to-background">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-14 pb-16 sm:pt-24 sm:pb-28">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
            className="max-w-3xl mx-auto text-center"
          >
            <motion.div variants={fadeUp} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
              <span className="inline-block px-3 py-1 text-xs font-medium rounded-full bg-primary/10 text-primary mb-6">
                60 days free — then a subscription plus the add-ons you keep
              </span>
            </motion.div>

            <motion.h1
              variants={fadeUp}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1]"
              style={{ textWrap: "balance" } as React.CSSProperties}
            >
              Running Your Property on Spreadsheets?{" "}
              <span className="text-primary">There's a Better Way.</span>
            </motion.h1>

            <motion.p
              variants={fadeUp}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              className="mt-5 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto"
              style={{ textWrap: "pretty" } as React.CSSProperties}
            >
              ROL'OS gives you enterprise-grade property management at a fraction of enterprise cost.
              No PMS experience needed. No technical setup. Just sign up and start managing.
            </motion.p>

            <motion.div
              variants={fadeUp}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3"
            >
              <Link to={connectPath("/connect/get-started")} className="w-full sm:w-auto">
                <Button size="lg" className="gap-2 font-medium px-6 w-full sm:w-auto">
                  Get Started Free <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to={connectPath("/connect/features")} className="w-full sm:w-auto">
                <Button variant="outline" size="lg" className="gap-2 font-medium px-6 w-full sm:w-auto">
                  See ROL'OS in Action
                </Button>
              </Link>
            </motion.div>

            <motion.p
              variants={fadeUp}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="mt-4 text-sm text-muted-foreground"
            >
              No credit card. No lock-in contracts. Cancel anytime.
            </motion.p>
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

      {/* ─── Problem / Solution ───────────────────────────────── */}
      <section className="py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
            className="grid md:grid-cols-2 gap-4 sm:gap-6 lg:gap-8"
          >
            {/* Pain */}
            <motion.div
              variants={fadeUp}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6 sm:p-8"
            >
              <h2 className="text-xl font-bold mb-1">What You're Doing Now</h2>
              <p className="text-sm text-muted-foreground mb-6">Sound familiar?</p>
              <ul className="space-y-3">
                {PAIN_POINTS.map((p) => (
                  <li key={p.text} className="flex items-start gap-3 text-sm">
                    <p.icon className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
                    {p.text}
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* Solution */}
            <motion.div
              variants={fadeUp}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="rounded-2xl border border-primary/20 bg-primary/5 p-6 sm:p-8"
            >
              <h2 className="text-xl font-bold mb-1">What ROL'OS Gives You</h2>
              <p className="text-sm text-muted-foreground mb-6">Switched on from day one, free for your first 60 days.</p>
              <ul className="space-y-3">
                {SOLUTIONS.map((s) => (
                  <li key={s.text} className="flex items-start gap-3 text-sm">
                    <s.icon className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    {s.text}
                  </li>
                ))}
              </ul>
            </motion.div>
          </motion.div>

          {/* Social proof */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={fadeUp}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="mt-10 rounded-xl bg-muted/50 border p-6 text-center"
          >
            <p className="text-sm italic text-muted-foreground">
              "We went from a shared Google Sheet to a professional booking system in one afternoon.
              Our occupancy tracking alone saved us over 15 hours a week."
            </p>
            <p className="text-xs text-muted-foreground mt-2">— 12-room guesthouse, Western Cape</p>
          </motion.div>
        </div>
      </section>

      {/* ─── TOBI Spotlight ──────────────────────────────────── */}
      <section className="py-12 sm:py-16 lg:py-20 bg-muted/20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={fadeUp}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl border bg-card p-6 sm:p-10 lg:p-12 flex flex-col md:flex-row items-center gap-6 sm:gap-8"
          >
            <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Cat className="w-10 h-10 text-primary" />
            </div>
            <div className="flex-1 text-center md:text-left">
              <h2 className="text-xl sm:text-2xl md:text-3xl font-bold mb-2">Meet TOBI — Your 24/7 Operations Manager</h2>
              <p className="text-muted-foreground mb-4 max-w-xl" style={{ textWrap: "pretty" } as React.CSSProperties}>
                TOBI handles night audits, answers guest queries, generates revenue insights, assists with bookings,
                and never takes a day off. It's like hiring a full-time operations manager — and TOBI is part of ROL'OS at no extra charge.
              </p>
              <div className="flex flex-wrap gap-2 justify-center md:justify-start mb-6">
                {["Night Audits", "Revenue Reports", "Guest Support", "Booking Assistance", "Rate Optimization"].map((t) => (
                  <span key={t} className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-medium">{t}</span>
                ))}
              </div>
              <Button onClick={openTobi} className="gap-2">
                <Cat className="h-4 w-4" /> Try TOBI Now
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ─── More Than You Expect — Comparison ───────────────── */}
      <section className="py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={fadeUp}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="text-center mb-8 sm:mb-12"
          >
            <h2 className="text-2xl sm:text-3xl font-bold">More Than You Expect</h2>
            <p className="text-muted-foreground mt-3 max-w-xl mx-auto text-sm sm:text-base">
              Features that other PMS providers charge extra for? We include them in every plan.
            </p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.1 }}
            variants={fadeUp}
            transition={{ duration: 0.5 }}
            className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0"
          >
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-3 px-4 font-semibold">Feature</th>
                  <th className="py-3 px-4 font-semibold text-primary text-center">ROL'OS</th>
                  <th className="py-3 px-4 font-semibold text-muted-foreground text-center">Typical PMS</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((row) => (
                  <tr key={row.feature} className="border-b last:border-0">
                    <td className="py-3 px-4">{row.feature}</td>
                    <td className="py-3 px-4 text-center">
                      <Check className="h-4 w-4 text-primary mx-auto" />
                    </td>
                    <td className="py-3 px-4 text-center">
                      {row.others ? (
                        <Check className="h-4 w-4 text-muted-foreground mx-auto" />
                      ) : (
                        <span className="text-xs text-muted-foreground">{row.othersNote}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>
        </div>
      </section>

      {/* ─── Integration logos ──────────────────────────────── */}
      <section className="py-10 sm:py-14 lg:py-16 border-t bg-muted/20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm text-muted-foreground mb-6">Integrates with the tools you already use</p>
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6">
            {TRUST_LOGOS.map((name) => (
              <div key={name} className="px-4 py-2 rounded-lg bg-muted/50 text-sm font-medium text-muted-foreground">
                {name}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── CTA ────────────────────────────────────────────── */}
      <section className="py-12 sm:py-16 lg:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.3 }}
            variants={fadeUp}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-2xl bg-primary/5 border p-6 sm:p-10 lg:p-14 text-center"
          >
            <h2 className="text-xl sm:text-2xl md:text-3xl font-bold mb-3">Stop Losing Bookings. Start Managing Smarter.</h2>
            <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
              Free for your first 60 days — the full stack, no subscription, no setup fee, no
              credit card. In that period you pay only the booking fee on bookings taken through
              ROL'OS (plus card processing fees if you use our payment gateway). From day 61 the
              PMS subscription and the add-ons you keep are billed as agreed.
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3">
              <Link to={connectPath("/connect/get-started")} className="w-full sm:w-auto">
                <Button size="lg" className="gap-2 font-medium w-full sm:w-auto">
                  Get Started Free <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>

              <Link to={connectPath("/connect/pricing")} className="w-full sm:w-auto">
                <Button variant="outline" size="lg" className="gap-2 font-medium w-full sm:w-auto">
                  See Pricing
                </Button>
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> 60 days free
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> No setup fee
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Booking fee only for 60 days
              </span>

              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Cancel anytime
              </span>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
}

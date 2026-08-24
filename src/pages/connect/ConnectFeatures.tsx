import { Link } from "react-router-dom";
import { connectPath } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  CalendarCheck, Users, BarChart3, Blocks, Shield, Zap,
  Home, CreditCard, ClipboardList, BedDouble, Star, Globe,
  ArrowRight, Cat, Sun, Moon, Clock, FileText
} from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 16, filter: "blur(4px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)" },
};

const FEATURE_SECTIONS = [
  {
    title: "Property Management",
    subtitle: "Everything your front desk needs — no training manual required",
    features: [
      { icon: BedDouble, title: "Room Management", desc: "Physical rooms, room types, floor plans, and real-time status tracking. See exactly what's available at a glance." },
      { icon: CalendarCheck, title: "Reservation Engine", desc: "Create, modify, and cancel bookings with automatic inventory validation. No more double-bookings." },
      { icon: ClipboardList, title: "Housekeeping Board", desc: "Digital task assignment, priority management, room inspection workflows. Ditch the paper checklists." },
      { icon: CreditCard, title: "Folios & Billing", desc: "Guest folios with charges, payments, adjustments. One click to generate a professional invoice." },
      { icon: Wallet, title: "Payment Gateway", desc: "Take card payments on our gateway with hybrid pricing — a percentage plus a small per-transaction fee — that steps down automatically as your monthly volume grows. The schedule on the Pricing page is the one written into your contract and billed. Or bring your own merchant account." },

    ],
  },
  {
    title: "Revenue & Distribution",
    subtitle: "Maximise your revenue — see what you've been missing",
    features: [
      { icon: BarChart3, title: "Revenue Analytics", desc: "ADR, RevPAR, occupancy forecasting, and 30/60/90-day performance tracking. Know your numbers." },
      { icon: Star, title: "Rate Management", desc: "Seasonal pricing, day-of-week multipliers, rate plans with min/max stay rules. Set it and forget it." },
      { icon: Globe, title: "Channel Manager", desc: "Connect Booking.com, Airbnb, Expedia. Rate parity and commission tracking. Free for 60 days, then charged per unit." },
      { icon: Users, title: "Group Bookings", desc: "Rooming lists, allotments, cutoff dates, master folios. Handle tour groups like a pro." },
    ],
  },
  {
    title: "Integration & Customisation",
    subtitle: "Your brand, your website, your way",
    features: [
      { icon: Blocks, title: "WordPress Plugin", desc: "Gutenberg blocks for availability grids, booking widgets, and property cards. No developer needed." },
      { icon: Zap, title: "REST API", desc: "50+ endpoints covering every PMS operation — including static content, cancellation & reservation policies, payment methods, and contact details." },
      { icon: Home, title: "Embeddable Widgets", desc: "Booking bars, availability calendars, and Smart Book buttons for any website." },
      { icon: Shield, title: "White-Label", desc: "Full branding control: logos, colours, email templates, and custom domains. It looks like yours." },
      { icon: Users, title: "Guest CRM & HubSpot", desc: "Native guest profiles, enquiry pipeline and segmentation — plus a free optional HubSpot add-on that projects guests, trade partners and bookings into your portal." },
    ],
  },
];

const DAY_IN_LIFE = [
  {
    time: "07:00",
    icon: Sun,
    title: "Morning",
    desc: "Housekeeping board auto-assigns rooms based on today's departures and arrivals. Staff see their tasks on mobile.",
  },
  {
    time: "14:00",
    icon: CalendarCheck,
    title: "Check-in",
    desc: "Guest arrives — folio already created, room allocation confirmed, welcome email sent automatically.",
  },
  {
    time: "22:00",
    icon: Moon,
    title: "Evening",
    desc: "TOBI runs the night audit: posts room charges, reconciles payments, flags discrepancies. You sleep.",
  },
  {
    time: "End of Month",
    icon: FileText,
    title: "Reports",
    desc: "Revenue reports, occupancy analytics, and channel performance — ready to download. No manual work.",
  },
];

const DEMO_SCREENS = [
  { title: "Reservation Calendar", desc: "Drag-and-drop bookings, colour-coded statuses, room availability at a glance.", icon: CalendarCheck },
  { title: "Housekeeping Board", desc: "Digital task management, room priorities, staff assignments — no more paper lists.", icon: ClipboardList },
  { title: "Guest Folio", desc: "Charges, payments, adjustments. Professional invoices in one click.", icon: CreditCard },
  { title: "TOBI Chat", desc: "Ask TOBI anything — night audits, revenue insights, booking help, 24/7.", icon: Cat },
];

export default function ConnectFeatures() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-primary/5 to-background pt-10 pb-8 sm:pt-16 sm:pb-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <motion.h1
            initial="hidden" animate="visible" variants={fadeUp}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight"
          >
            Everything Your Property Needs.{" "}
            <span className="text-primary">Nothing It Doesn't.</span>
          </motion.h1>
          <motion.p
            initial="hidden" animate="visible" variants={fadeUp}
            transition={{ duration: 0.7, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto"
          >
            ROL'OS covers every aspect of property operations — from front desk to finance,
            housekeeping to distribution. No PMS experience needed.
          </motion.p>
        </div>
      </section>

      {/* Day in the Life */}
      <section className="py-12 sm:py-16 lg:py-20 bg-muted/20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}
            variants={fadeUp} transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-2xl sm:text-3xl font-bold">A Day with ROL'OS</h2>
            <p className="text-muted-foreground mt-2">See how your property runs itself.</p>
          </motion.div>

          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}
            variants={{ visible: { transition: { staggerChildren: 0.1 } } }}
            className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6"
          >
            {DAY_IN_LIFE.map((step) => (
              <motion.div
                key={step.title}
                variants={fadeUp}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-xl border bg-card p-6 text-center"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <step.icon className="h-5 w-5 text-primary" />
                </div>
                <span className="text-xs font-medium text-primary">{step.time}</span>
                <h3 className="font-semibold mt-1 mb-2">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Feature sections */}
      {FEATURE_SECTIONS.map((section, si) => (
        <section key={section.title} className={si % 2 === 0 ? "py-20" : "py-20 bg-muted/20"}>
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <motion.div
              initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}
              variants={fadeUp} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="mb-10"
            >
              <h2 className="text-2xl sm:text-3xl font-bold">{section.title}</h2>
              <p className="text-muted-foreground mt-2">{section.subtitle}</p>
            </motion.div>

            <motion.div
              initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}
              variants={{ visible: { transition: { staggerChildren: 0.07 } } }}
              className="grid sm:grid-cols-2 gap-6"
            >
              {section.features.map((f) => (
                <motion.div
                  key={f.title}
                  variants={fadeUp}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="rounded-xl border bg-card p-6 hover:shadow-md transition-shadow"
                >
                  <f.icon className="h-5 w-5 text-primary mb-3" />
                  <h3 className="font-semibold mb-1">{f.title}</h3>
                  <p className="text-sm text-muted-foreground">{f.desc}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>
      ))}

      {/* Demo Screens */}
      <section className="py-12 sm:py-16 lg:py-20 border-t">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}
            variants={fadeUp} transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-2xl sm:text-3xl font-bold">See It in Action</h2>
            <p className="text-muted-foreground mt-2">Key screens from the ROL'OS dashboard.</p>
          </motion.div>

          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}
            variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
            className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6"
          >
            {DEMO_SCREENS.map((screen) => (
              <motion.div
                key={screen.title}
                variants={fadeUp}
                transition={{ duration: 0.5 }}
                className="rounded-xl border bg-muted/30 p-6 text-center hover:shadow-md transition-shadow"
              >
                <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <screen.icon className="h-7 w-7 text-primary" />
                </div>
                <h3 className="font-semibold mb-1">{screen.title}</h3>
                <p className="text-xs text-muted-foreground">{screen.desc}</p>
              </motion.div>
            ))}
          </motion.div>

          <div className="text-center mt-8">
            <Link to={connectPath("/connect/get-started")}>
              <Button size="lg" className="gap-2">
                Get Started Free <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-10 sm:py-12 lg:py-16 border-t bg-muted/20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold mb-3">Ready to Modernise Your Property?</h2>
          <p className="text-muted-foreground mb-6">Free for 60 days on the full stack — you pay only the booking fee in that period. From day 61 the PMS subscription and the add-ons you keep are billed as agreed.</p>
          <div className="flex items-center justify-center gap-3">
            <Link to={connectPath("/connect/get-started")}><Button size="lg" className="gap-2">Get Started <ArrowRight className="h-4 w-4" /></Button></Link>
            <Link to={connectPath("/connect/pricing")}><Button variant="outline" size="lg">See Pricing</Button></Link>
          </div>
        </div>
      </section>
    </div>
  );
}

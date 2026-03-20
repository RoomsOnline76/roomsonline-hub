import { Link } from "react-router-dom";
import { connectPath } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  CalendarCheck, Users, BarChart3, Blocks, Shield, Zap,
  Home, CreditCard, ClipboardList, BedDouble, Star, Globe,
  ArrowRight
} from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 16, filter: "blur(4px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)" },
};

const FEATURE_SECTIONS = [
  {
    title: "Property Management",
    subtitle: "Everything your front desk needs",
    features: [
      { icon: BedDouble, title: "Room Management", desc: "Physical rooms, room types, floor plans, and real-time status tracking across your property." },
      { icon: CalendarCheck, title: "Reservation Engine", desc: "Create, modify, and cancel bookings with automatic inventory validation and pricing." },
      { icon: ClipboardList, title: "Housekeeping Board", desc: "Task assignment, priority management, room inspection workflows, and staff scheduling." },
      { icon: CreditCard, title: "Folios & Billing", desc: "Guest folios with charges, payments, adjustments, and automated night audit settlement." },
    ],
  },
  {
    title: "Revenue & Distribution",
    subtitle: "Maximize your revenue potential",
    features: [
      { icon: BarChart3, title: "Revenue Analytics", desc: "ADR, RevPAR, occupancy forecasting, and 30/60/90-day performance tracking." },
      { icon: Star, title: "Rate Management", desc: "Seasonal pricing, day-of-week multipliers, rate plans with min/max stay rules." },
      { icon: Globe, title: "Channel Manager", desc: "Connect Booking.com, Airbnb, Expedia, and more. Rate parity and commission tracking." },
      { icon: Users, title: "Group Bookings", desc: "Rooming lists, allotments, cutoff dates, master folios, and group billing." },
    ],
  },
  {
    title: "Integration Toolkit",
    subtitle: "Embed everywhere, customize everything",
    features: [
      { icon: Blocks, title: "WordPress Plugin", desc: "Gutenberg blocks for availability grids, booking widgets, and property cards." },
      { icon: Zap, title: "REST API", desc: "40+ endpoints covering every PMS operation. JSON schemas and code examples included." },
      { icon: Home, title: "Embeddable Widgets", desc: "Booking bars, availability calendars, and Smart Book buttons for any website." },
      { icon: Shield, title: "White-Label", desc: "Full branding control: logos, colors, email templates, and custom domains." },
    ],
  },
];

export default function ConnectFeatures() {
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
            Built for How You Actually Work
          </motion.h1>
          <motion.p
            initial="hidden" animate="visible" variants={fadeUp}
            transition={{ duration: 0.7, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto"
          >
            ROL'OS covers every aspect of property operations — from front desk to finance, housekeeping to distribution.
          </motion.p>
        </div>
      </section>

      {/* Feature sections */}
      {FEATURE_SECTIONS.map((section, si) => (
        <section key={section.title} className={si % 2 === 1 ? "bg-muted/20 py-20" : "py-20"}>
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

      {/* CTA */}
      <section className="py-16 border-t">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold mb-3">See It in Action</h2>
          <p className="text-muted-foreground mb-6">Book a demo or dive into the API docs.</p>
          <div className="flex items-center justify-center gap-3">
            <Link to={connectPath("/connect/get-started")}><Button size="lg" className="gap-2">Get Started <ArrowRight className="h-4 w-4" /></Button></Link>
            <Link to={connectPath("/connect/docs")}><Button variant="outline" size="lg">API Reference</Button></Link>
          </div>
        </div>
      </section>
    </div>
  );
}

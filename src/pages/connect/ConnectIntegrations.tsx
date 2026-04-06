import { Link } from "react-router-dom";
import { connectPath } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { ArrowRight, Check, CheckCircle2 } from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 16, filter: "blur(4px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)" },
};

const INTEGRATIONS = [
  {
    name: "ROL'OS Native",
    status: "Full Feature Set",
    desc: "The complete PMS experience. All 40+ API actions, housekeeping, folios, night audit, guest CRM, channel management, and revenue analytics.",
    features: ["All API actions", "Real-time sync", "Housekeeping", "Folios", "Night audit", "Guest CRM"],
    badge: "Recommended",
  },
  {
    name: "Hostfully",
    status: "Vacation Rentals",
    desc: "For vacation rental managers using Hostfully. Syncs property listings, availability, and reservations with automatic room type mapping.",
    features: ["Property sync", "Availability", "Reservations", "Room types", "Image sideloading"],
  },
  {
    name: "NightsBridge",
    status: "South African Market",
    desc: "Native integration with NightsBridge for the South African hospitality market. Booking session tracking and revenue attribution.",
    features: ["Booking sessions", "Revenue tracking", "Agent codes", "Currency support"],
  },
  {
    name: "Custom Adapter",
    status: "Build Your Own",
    desc: "The ROL'OS API follows an adapter pattern. Build a custom adapter for any PMS using our standardised interface and documentation.",
    features: ["Adapter pattern", "Standardised interface", "Full documentation", "Technical support"],
  },
];

const DISTRIBUTION_CHANNELS = [
  {
    name: "HyperGuest",
    flow: "ROL'OS → HyperGuest → OTAs",
    desc: "PULL-model distribution channel connecting your inventory to Booking.com, Expedia, and other major OTAs via HyperGuest's connectivity hub.",
    features: ["Live availability", "Prebook validation", "Reservation sync", "Static data push", "Multi-OTA reach"],
  },
  {
    name: "HotelBeds",
    flow: "ROL'OS → HotelBeds → Bedbank Network",
    desc: "Global bedbank distribution. Push rates and inventory to HotelBeds' network of 60,000+ travel buyers worldwide.",
    features: ["Rate distribution", "Inventory push", "Multi-currency", "Global reach", "B2B network"],
  },
  {
    name: "Rentals United",
    flow: "ROL'OS → Rentals United → 60+ Channels",
    desc: "XML-based adapter for vacation rental distribution. Connect to Airbnb, Vrbo, and 60+ rental channels through a single integration.",
    features: ["XML adapter", "Property sync", "Availability", "Dynamic pricing", "Reservations"],
  },
  {
    name: "ProfitRoom",
    flow: "ROL'OS → ProfitRoom → CRS & Engine",
    desc: "Central reservation system and booking engine integration. Sync rate plans and availability with ProfitRoom's hotel commerce platform.",
    features: ["Booking engine", "Channel manager", "Rate plans", "Availability sync", "Revenue tools"],
  },
];

const ADAPTER_STEPS = [
  { step: "1", title: "Connect", desc: "Authenticate your PMS credentials through our secure integration config." },
  { step: "2", title: "Map", desc: "ROL'OS automatically maps room types, rates, and inventory from your PMS." },
  { step: "3", title: "Sync", desc: "Real-time bidirectional sync keeps everything in perfect harmony." },
  { step: "4", title: "Build", desc: "Use the unified API to build guest-facing experiences and operations dashboards." },
];

export default function ConnectIntegrations() {
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
            Works With Your PMS
          </motion.h1>
          <motion.p
            initial="hidden" animate="visible" variants={fadeUp}
            transition={{ duration: 0.7, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto"
          >
            ROL'OS uses an adapter pattern that normalises data from any PMS into a unified API. One integration, consistent output.
          </motion.p>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16 border-b">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-center mb-10">How the Adapter Pattern Works</h2>
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}
            variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
            className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {ADAPTER_STEPS.map((s) => (
              <motion.div
                key={s.step}
                variants={fadeUp}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="text-center"
              >
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center mx-auto mb-3">
                  {s.step}
                </div>
                <h3 className="font-semibold mb-1">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Distribution Channels */}
      <section className="py-20 border-b">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold">Distribution &amp; Channel Partners</h2>
            <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
              These partners extend your reach to global OTAs and distribution networks. ROL'OS connects to them — they connect you to the world.
            </p>
          </div>
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}
            variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
            className="grid sm:grid-cols-2 gap-6"
          >
            {DISTRIBUTION_CHANNELS.map((channel) => (
              <motion.div
                key={channel.name}
                variants={fadeUp}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-xl border bg-accent/30 p-6 relative"
              >
                <span className="absolute top-4 right-4 text-xs px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground font-medium">
                  Distribution
                </span>
                <h3 className="text-lg font-semibold">{channel.name}</h3>
                <p className="text-xs text-primary font-medium mt-1 tracking-wide">{channel.flow}</p>
                <p className="text-sm text-muted-foreground mt-3 mb-4">{channel.desc}</p>
                <ul className="space-y-1.5">
                  {channel.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Integration cards */}
      <section className="py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}
            variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
            className="grid sm:grid-cols-2 gap-6"
          >
            {INTEGRATIONS.map((integration) => (
              <motion.div
                key={integration.name}
                variants={fadeUp}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-xl border bg-card p-6 relative"
              >
                {integration.badge && (
                  <span className="absolute top-4 right-4 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                    {integration.badge}
                  </span>
                )}
                <h3 className="text-lg font-semibold">{integration.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{integration.status}</p>
                <p className="text-sm text-muted-foreground mt-3 mb-4">{integration.desc}</p>
                <ul className="space-y-1.5">
                  {integration.features.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm">
                      <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 border-t">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold mb-3">Don't See Your PMS?</h2>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            We're building new adapters regularly. Get in touch and we'll discuss your integration needs.
          </p>
          <Link to={connectPath("/connect/get-started")}>
            <Button size="lg" className="gap-2">Contact Us <ArrowRight className="h-4 w-4" /></Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

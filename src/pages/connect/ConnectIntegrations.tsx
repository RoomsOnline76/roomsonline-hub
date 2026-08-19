import { Link } from "react-router-dom";
import { connectPath } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  Building2,
  Home,
  Landmark,
  Network,
  Wrench,
  Sparkles,
  Calendar,
  CreditCard,
  FileText,
  MapPin,
  Image as ImageIcon,
  ShieldCheck,
  Users,
  ArrowUpRight,
} from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 16, filter: "blur(4px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)" },
};

const INTEGRATIONS = [
  {
    name: "ROL'OS Native",
    status: "Full Feature Set",
    icon: Sparkles,
    desc: "The complete PMS experience. All 40+ API actions, housekeeping, folios, night audit, guest CRM, channel management, and revenue analytics.",
    features: ["All API actions", "Real-time sync", "Housekeeping", "Folios", "Night audit", "Guest CRM"],
    badge: "Recommended",
  },
  {
    name: "HubSpot CRM",
    status: "Owner CRM Add-on — Free",
    icon: Users,
    desc: "Project your guests, trade partners, bookings and enquiries into HubSpot as contacts, companies and deals. Opt-in per owner, encrypted tokens, delta sync every 15 minutes.",
    features: ["Contacts & companies", "Booking deals", "Enquiry pipeline", "Trade/Direct segmentation", "15-min delta sync"],
    badge: "Included Free",
  },
  {
    name: "Hostfully",
    status: "Vacation Rentals",
    icon: Home,
    desc: "For vacation rental managers using Hostfully. Syncs property listings, availability, and reservations with automatic room type mapping.",
    features: ["Property sync", "Availability", "Reservations", "Room types", "Image sideloading"],
  },
  {
    name: "Benson",
    status: "South African PMS",
    icon: Landmark,
    desc: "Native adapter for Benson-powered properties. Canonical rate hydration, 45-day rolling availability window, and background sync keep inventory live without hammering the source.",
    features: ["Rate hydration", "Availability window", "Reservation sync", "Room type mapping", "Background caching"],
  },
  {
    name: "Rentals United",
    status: "60+ Rental Channels",
    icon: Network,
    desc: "XML-based adapter for vacation rental distribution. Connect to Airbnb, Vrbo, and 60+ rental channels through a single standardised integration.",
    features: ["XML adapter", "Property sync", "Availability", "Dynamic pricing", "Reservations"],
  },
  {
    name: "Custom Adapter",
    status: "Build Your Own",
    icon: Wrench,
    desc: "The ROL'OS API follows an adapter pattern. Build a custom adapter for any PMS using our standardised interface and documentation.",
    features: ["Adapter pattern", "Standardised interface", "Full documentation", "Technical support"],
  },
];

const API_CAPABILITIES = [
  { icon: Building2, title: "Property & Rooms", desc: "Static content, room types, bed configs, capacities and amenities." },
  { icon: ImageIcon, title: "Media", desc: "Property and room images with automatic fallback pooling." },
  { icon: Calendar, title: "Rates & Availability", desc: "Live inventory, seasonal rates, and multi-plan pricing." },
  { icon: ShieldCheck, title: "Policies", desc: "Authored cancellation and reservation policies with rate-plan links." },
  { icon: CreditCard, title: "Payment Methods", desc: "Configured gateways per property, ready for checkout." },
  { icon: FileText, title: "Bookings", desc: "Create, modify and cancel reservations through a single contract." },
  { icon: MapPin, title: "Location & Contacts", desc: "Geo, address, check-in instructions and reception details." },
  { icon: Sparkles, title: "Guest Experience", desc: "Reviews, specials, add-ons and journey-ready content." },
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
      <section className="bg-gradient-to-b from-primary/5 to-background pt-10 pb-8 sm:pt-16 sm:pb-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <motion.h1
            initial="hidden" animate="visible" variants={fadeUp}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight"
          >
            One API. Every PMS.
          </motion.h1>
          <motion.p
            initial="hidden" animate="visible" variants={fadeUp}
            transition={{ duration: 0.7, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto"
          >
            ROL'OS uses an adapter pattern that normalises data from any PMS into a unified API.
            One integration, consistent output — regardless of the system behind it.
          </motion.p>
        </div>
      </section>

      {/* HubSpot spotlight */}
      <section className="pb-8 sm:pb-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-2xl border bg-card p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center gap-6">
            <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-bold">ROL'OS + HubSpot</h2>
                <span className="rounded-full bg-primary/10 text-primary text-xs font-medium px-2.5 py-1">
                  Included free
                </span>
              </div>
              <p className="mt-2 text-sm sm:text-base text-muted-foreground max-w-2xl">
                A CRM is only as good as the data behind it. ROL'OS knows every stay, every enquiry and every rand
                a guest has spent — the HubSpot add-on turns that into contacts, companies and deals that segment themselves.
              </p>
            </div>
            <Button asChild size="lg" className="shrink-0">
              <Link to={connectPath("/connect/hubspot")}>
                Explore the CRM module <ArrowUpRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-10 sm:py-12 lg:py-16 border-b">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold text-center mb-10">How the Adapter Pattern Works</h2>
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}
            variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
            className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6"
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

      {/* Native PMS Integrations */}
      <section className="py-12 sm:py-16 lg:py-20 border-b">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold">Native PMS Integrations</h2>
            <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
              Purpose-built adapters that map every PMS into the same clean, predictable API surface.
            </p>
          </div>
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }}
            variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            {INTEGRATIONS.map((integration) => {
              const Icon = integration.icon;
              return (
                <motion.div
                  key={integration.name}
                  variants={fadeUp}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="rounded-xl border bg-card p-6 relative flex flex-col"
                >
                  {integration.badge && (
                    <span className="absolute top-4 right-4 text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                      {integration.badge}
                    </span>
                  )}
                  <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-semibold">{integration.name}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">{integration.status}</p>
                  <p className="text-sm text-muted-foreground mt-3 mb-4">{integration.desc}</p>
                  <ul className="space-y-1.5 mt-auto">
                    {integration.features.map((f) => (
                      <li key={f} className="flex items-center gap-2 text-sm">
                        <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* What You Get */}
      <section className="py-12 sm:py-16 lg:py-20 border-b bg-accent/20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl font-bold">What You Get Through The Unified API</h2>
            <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
              Every adapter delivers the same core building blocks — so anything you build on ROL'OS works across every connected PMS.
            </p>
          </div>
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }}
            variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
            className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {API_CAPABILITIES.map((cap) => {
              const Icon = cap.icon;
              return (
                <motion.div
                  key={cap.title}
                  variants={fadeUp}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  className="rounded-lg border bg-card p-5"
                >
                  <Icon className="h-5 w-5 text-primary mb-3" />
                  <h3 className="font-semibold text-sm">{cap.title}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{cap.desc}</p>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-10 sm:py-12 lg:py-16 border-t">
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

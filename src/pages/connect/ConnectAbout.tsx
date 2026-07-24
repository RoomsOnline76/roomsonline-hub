import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { connectPath } from "@/lib/config";
import { Globe, Zap, Users, Target, MapPin, ArrowRight, Heart, Shield, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";

const fadeUp = {
  hidden: { opacity: 0, y: 16, filter: "blur(4px)" },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { delay: i * 0.08, duration: 0.6, ease: [0.16, 1, 0.3, 1] },
  }),
};

const values = [
  {
    icon: Heart,
    title: "Built for Africa",
    description:
      "We understand the unique rhythms, challenges, and opportunities of African hospitality — because we live it every day.",
  },
  {
    icon: Zap,
    title: "Technology That Disappears",
    description:
      "The best tech gets out of the way. Our tools feel intuitive because they're designed around how hospitality actually works, not how engineers think it should.",
  },
  {
    icon: Shield,
    title: "Trust Through Transparency",
    description:
      "Every booking, every sync, every commission — fully auditable. We believe property partners deserve complete visibility into their business.",
  },
  {
    icon: Users,
    title: "Partnership, Not Dependency",
    description:
      "We integrate with your existing tools rather than replacing them. Your data stays yours. Your brand stays yours. We amplify, never absorb.",
  },
];

const milestones = [
  { year: "2019", event: "Founded in Cape Town with a vision for connected hospitality" },
  { year: "2020", event: "First PMS integration live — proving the adapter model works" },
  { year: "2021", event: "Multi-property portfolio management launched" },
  { year: "2022", event: "ROL'OS API v1 released — opening the platform to developers" },
  { year: "2023", event: "WordPress plugin and embeddable booking widgets shipped" },
  { year: "2024", event: "TOBI AI assistant introduced across the platform" },
  { year: "2025", event: "ROL'OS Connect portal launched — the front door to our ecosystem" },
  { year: "2026", event: "API v2, expanded PMS integrations, and growing across Southern Africa" },
];

const stats = [
  { value: "40+", label: "API actions" },
  { value: "3", label: "PMS integrations" },
  { value: "24/7", label: "Automated operations" },
  { value: "99.9%", label: "Uptime target" },
];

export default function ConnectAbout() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-muted/60 to-background border-b">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-20 lg:py-28">
          <div className="max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-4 py-1.5 text-xs font-medium text-muted-foreground mb-6">
                <Globe className="h-3.5 w-3.5" />
                Our Story
              </div>
              <h1 className="font-display text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-semibold tracking-tight text-foreground mb-6 leading-[1.1]">
                Hospitality infrastructure for a connected continent
              </h1>
              <p className="text-muted-foreground text-base sm:text-lg lg:text-xl leading-relaxed max-w-2xl">
                ROL'OS is the technology layer that connects property managers,
                booking engines, and guest experiences across Africa — one API
                call at a time.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Mission */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-20 lg:py-28">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-start">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            custom={0}
            variants={fadeUp}
          >
            <h2 className="text-sm font-semibold text-primary uppercase tracking-wider mb-4">
              The Problem
            </h2>
            <p className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground leading-snug mb-6">
              African hospitality runs on disconnected systems
            </p>
            <p className="text-muted-foreground leading-relaxed text-[0.95rem]">
              Property managers juggle multiple PMS platforms, manual booking
              processes, and fragmented guest communication. Web agencies build
              beautiful property websites but can't connect them to live
              availability. The result? Lost bookings, operational friction, and
              revenue that slips through the cracks.
            </p>
          </motion.div>
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            custom={1}
            variants={fadeUp}
          >
            <h2 className="text-sm font-semibold text-primary uppercase tracking-wider mb-4">
              Our Answer
            </h2>
            <p className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground leading-snug mb-6">
              One platform. Every operation. Real-time.
            </p>
            <p className="text-muted-foreground leading-relaxed text-[0.95rem]">
              ROL'OS provides a unified API that bridges any PMS with any
              front-end — whether that's our own booking engine, a custom
              WordPress site, or a bespoke application. Availability, rates,
              reservations, housekeeping, guest profiles, and financial
              reporting — all through a single, well-documented interface.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
            {stats.map((stat, i) => (
              <motion.div
                key={stat.label}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.3 }}
                custom={i}
                variants={fadeUp}
                className="text-center"
              >
                <p className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
                  {stat.value}
                </p>
                <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-20 lg:py-28">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          custom={0}
          variants={fadeUp}
          className="max-w-2xl mb-14"
        >
          <h2 className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">
            What We Believe
          </h2>
          <p className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground leading-snug">
            Principles that shape every line of code
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 gap-6 sm:gap-8">
          {values.map((v, i) => {
            const Icon = v.icon;
            return (
              <motion.div
                key={v.title}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.2 }}
                custom={i}
                variants={fadeUp}
                className="rounded-xl border bg-card p-6 sm:p-8 hover:shadow-md transition-shadow duration-300"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary mb-4">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2 tracking-tight">
                  {v.title}
                </h3>
                <p className="text-muted-foreground text-[0.935rem] leading-relaxed">
                  {v.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* Timeline */}
      <section className="border-t bg-muted/20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-20 lg:py-28">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            custom={0}
            variants={fadeUp}
            className="max-w-2xl mb-14"
          >
            <h2 className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">
              Our Journey
            </h2>
            <p className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground leading-snug">
              From Cape Town to connected hospitality
            </p>
          </motion.div>

          <div className="relative">
            <div className="absolute left-4 sm:left-8 top-0 bottom-0 w-px bg-border" />
            <div className="space-y-8">
              {milestones.map((m, i) => (
                <motion.div
                  key={m.year}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, amount: 0.3 }}
                  custom={i}
                  variants={fadeUp}
                  className="relative flex items-start gap-6 pl-4 sm:pl-8"
                >
                  <div className="absolute left-4 sm:left-8 -translate-x-1/2 mt-1.5 h-3 w-3 rounded-full border-2 border-primary bg-background" />
                  <div className="pl-6">
                    <span className="text-xs font-bold text-primary uppercase tracking-wider">
                      {m.year}
                    </span>
                    <p className="text-foreground text-[0.95rem] mt-0.5">{m.event}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Where We Are */}
      <section className="border-t">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-20 lg:py-28">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.2 }}
              custom={0}
              variants={fadeUp}
            >
              <h2 className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">
                Based in Cape Town
              </h2>
              <p className="text-2xl sm:text-3xl font-semibold tracking-tight text-foreground leading-snug mb-6">
                Built at the tip of Africa, for all of Africa
              </p>
              <p className="text-muted-foreground leading-relaxed text-[0.95rem] mb-4">
                Our team operates from Cape Town, South Africa — one of the
                continent's most vibrant hospitality markets. We work closely
                with properties across the Western Cape, Garden Route, and
                beyond, with a growing footprint in Southern and East Africa.
              </p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 text-primary" />
                Cape Town, Western Cape, South Africa
              </div>
            </motion.div>
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.2 }}
              custom={1}
              variants={fadeUp}
              className="rounded-xl border bg-card p-8"
            >
              <BarChart3 className="h-8 w-8 text-primary mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-2 tracking-tight">
                Join the ecosystem
              </h3>
              <p className="text-muted-foreground text-[0.935rem] leading-relaxed mb-6">
                Whether you're a property manager looking to modernise
                operations or a developer building the next great hospitality
                experience — there's a place for you in the ROL'OS ecosystem.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link to={connectPath("/connect/get-started")}>
                  <Button className="gap-2">
                    Get Started <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link to={connectPath("/connect/docs")}>
                  <Button variant="outline">Explore the API</Button>
                </Link>
              </div>
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  );
}

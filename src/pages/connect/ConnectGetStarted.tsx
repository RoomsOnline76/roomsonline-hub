import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Link } from "react-router-dom";
import { connectPath } from "@/lib/config";

const fadeUp = {
  hidden: { opacity: 0, y: 16, filter: "blur(4px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)" },
};

const PROCESS_STEPS = [
  { step: "1", title: "Discovery Call", desc: "15 minutes to understand your property and needs." },
  { step: "2", title: "API Credentials", desc: "Get your property ID and API key within 24 hours." },
  { step: "3", title: "Integration Support", desc: "Our team helps you get set up and running." },
  { step: "4", title: "Go Live", desc: "Launch your integration with full support." },
];

export default function ConnectGetStarted() {
  const [form, setForm] = useState({
    name: "", email: "", company: "", property_count: "", current_pms: "", message: "",
  });
  const [honeypot, setHoneypot] = useState("");
  const [loadedAt] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Spam checks: honeypot filled or form submitted in under 3 seconds
    if (honeypot || Date.now() - loadedAt < 3000) return;
    if (!form.name.trim() || !form.email.trim()) return;

    setSubmitting(true);
    const { error } = await supabase.from("connect_inquiries" as any).insert({
      name: form.name.trim(),
      email: form.email.trim(),
      company: form.company.trim() || null,
      property_count: form.property_count.trim() || null,
      current_pms: form.current_pms.trim() || null,
      message: form.message.trim() || null,
    });

    setSubmitting(false);
    if (error) {
      toast({ title: "Error", description: "Failed to submit. Please try again.", variant: "destructive" });
    } else {
      setSubmitted(true);
      toast({ title: "Submitted!", description: "We'll be in touch within 24 hours." });
    }
  };

  if (submitted) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <motion.div
          initial="hidden" animate="visible" variants={fadeUp}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="text-center max-w-md"
        >
          <CheckCircle2 className="h-12 w-12 text-primary mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Thank You!</h1>
          <p className="text-muted-foreground mb-6">
            We've received your inquiry and will be in touch within 24 hours with your API credentials and onboarding details.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link to={connectPath("/connect/docs/quickstart")}><Button variant="outline">Read the Quickstart</Button></Link>
            <Link to={connectPath("/connect")}><Button>Back to Home</Button></Link>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div>
      <section className="bg-gradient-to-b from-primary/5 to-background pt-10 pb-8 sm:pt-16 sm:pb-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <motion.h1
            initial="hidden" animate="visible" variants={fadeUp}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight"
          >
            Get Started with ROL'OS
          </motion.h1>
          <motion.p
            initial="hidden" animate="visible" variants={fadeUp}
            transition={{ duration: 0.7, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto"
          >
            Free for your first 60 days — the full ROL'OS stack, no subscription, and the setup fee waived when you start in that period.
            In that period you pay only the booking fee on bookings taken through ROL'OS, plus card
            processing on our payment-processing schedule if you use our gateway. From day 61 the PMS
            subscription and any add-ons you keep — channel manager, white label, branding, revenue
            management — are billed as set out in your agreement.
          </motion.p>
          <motion.p
            initial="hidden" animate="visible" variants={fadeUp}
            transition={{ duration: 0.7, delay: 0.14, ease: [0.16, 1, 0.3, 1] }}
            className="mt-3 text-sm text-muted-foreground max-w-2xl mx-auto"
          >
            Every commercial term — the booking fee, the add-ons you keep and the payment-processing
            schedule — is confirmed in the contract you sign, and the rate quoted there is the rate
            that gets billed.{" "}
            <Link to={connectPath("/connect/pricing")} className="text-primary underline underline-offset-2">
              See the current schedule
            </Link>
            .
          </motion.p>

        </div>
      </section>

      <section className="py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12">
            {/* Form */}
            <motion.div
              initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}
              variants={fadeUp} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Honeypot - hidden from real users */}
                <div className="absolute opacity-0 -z-10" aria-hidden="true" tabIndex={-1}>
                  <input
                    type="text"
                    name="website_url"
                    autoComplete="off"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                    tabIndex={-1}
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Full Name *</Label>
                    <Input id="name" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} required className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="email">Email *</Label>
                    <Input id="email" type="email" value={form.email} onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))} required className="mt-1" />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="company">Company / Property Name</Label>
                    <Input id="company" value={form.company} onChange={(e) => setForm(f => ({ ...f, company: e.target.value }))} className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="count">Number of Properties</Label>
                    <Input id="count" value={form.property_count} onChange={(e) => setForm(f => ({ ...f, property_count: e.target.value }))} placeholder="e.g. 1, 3, 10+" className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label htmlFor="pms">Current PMS (if any)</Label>
                  <Input id="pms" value={form.current_pms} onChange={(e) => setForm(f => ({ ...f, current_pms: e.target.value }))} placeholder="e.g. Hostfully, Benson, Rentals United, None — I'm just getting started" className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="message">Tell us about your integration needs</Label>
                  <Textarea id="message" value={form.message} onChange={(e) => setForm(f => ({ ...f, message: e.target.value }))} rows={4} className="mt-1" />
                </div>
                <Button type="submit" size="lg" disabled={submitting} className="w-full gap-2">
                  {submitting ? "Submitting..." : "Get Started Free"} <Send className="h-4 w-4" />
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  No credit card required. Every property is different — we'll build a plan that fits your budget.
                </p>
              </form>
            </motion.div>

            {/* Process */}
            <motion.div
              initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.2 }}
              variants={{ visible: { transition: { staggerChildren: 0.08 } } }}
              className="space-y-6"
            >
              <h2 className="text-xl font-semibold">How It Works</h2>
              {PROCESS_STEPS.map((s) => (
                <motion.div
                  key={s.step}
                  variants={fadeUp}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="flex gap-4"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                    {s.step}
                  </div>
                  <div>
                    <h3 className="font-medium">{s.title}</h3>
                    <p className="text-sm text-muted-foreground">{s.desc}</p>
                  </div>
                </motion.div>
              ))}

              <div className="rounded-xl bg-muted/50 p-6 mt-6">
                <h3 className="font-medium mb-2">Prefer to talk?</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  Email us directly at <a href="mailto:connect@roomsonline.co.za" className="text-primary hover:underline">connect@roomsonline.co.za</a> or use the TOBI chat widget.
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>
    </div>
  );
}

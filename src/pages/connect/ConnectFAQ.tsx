import { motion } from "framer-motion";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { Link } from "react-router-dom";
import { connectPath } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { usePageSEO } from "@/hooks/usePageSEO";

const fadeUp = {
  hidden: { opacity: 0, y: 16, filter: "blur(4px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)" },
};

const FAQ_CATEGORIES = [
  {
    title: "Discover",
    items: [
      {
        q: "What is ROL'OS?",
        a: "ROL'OS (Rooms Online Operating System) is a native property management system and booking engine built specifically for the African hospitality market. It provides a complete REST API with 50+ actions, WordPress integration, embeddable widgets, and white-label capabilities.",
      },
      {
        q: "Who is ROL'OS for?",
        a: "Property managers who want a modern PMS, web agencies building booking websites for clients, and developers looking for a robust hospitality API. We serve lodges, boutique hotels, guesthouses, and vacation rental managers across Africa.",
      },
      {
        q: "What PMS systems do you support?",
        a: "ROL'OS ships its own native PMS. We also have first-class adapters for Hostfully (vacation rentals), Benson (South African PMS), and Rentals United (60+ rental channels). Custom adapters can be built using our standardised interface.",
      },
      {
        q: "How is ROL'OS different from other PMS platforms?",
        a: "We're built for Africa first — with local payment methods, multi-currency support, and an understanding of the region's hospitality landscape. Our API-first approach means everything is programmable, and our WordPress plugin provides zero-code integration.",
      },
    ],
  },
  {
    title: "Connect",
    items: [
      {
        q: "How do I get API access?",
        a: "Submit a request through our Get Started page. You will receive your property ID and API key within 24 hours. API access carries no per-call fee and no separate API add-on.",
      },
      {
        q: "What authentication does the API use?",
        a: "The API uses API key authentication via the x-api-key header. Keys are generated per property and can be rotated at any time through your admin panel.",
      },
      {
        q: "Is there a rate limit?",
        a: "The API has generous rate limits suitable for production use. Standard plans support up to 1,000 requests per minute. Enterprise plans have custom limits.",
      },
      {
        q: "Do you have webhooks?",
        a: "Webhook support for booking events (created, modified, cancelled, checked-in, checked-out) is on our roadmap. Currently, you can poll the get_reservations endpoint for updates.",
      },
    ],
  },
  {
    title: "Build",
    items: [
      {
        q: "How do I install the WordPress plugin?",
        a: "Download the plugin from your ROL'OS admin panel, upload it via Plugins → Add New → Upload Plugin in WordPress, activate it, and enter your API credentials in Settings → ROL'OS. See our WordPress Guide for detailed instructions.",
      },
      {
        q: "Can I embed booking widgets on a non-WordPress site?",
        a: "Yes! We provide embeddable booking widgets, availability calendars, and Smart Book buttons that work on any website. Use a simple script tag or iframe embed. Check the Embed Widgets section in your admin panel.",
      },
      {
        q: "What programming languages are supported?",
        a: "The API is a standard REST endpoint accepting JSON POST requests. We provide code examples in cURL, JavaScript, and PHP. Any language that can make HTTP requests will work.",
      },
      {
        q: "Can I connect HubSpot as my CRM?",
        a: "Yes — and it is free. The HubSpot add-on is opt-in per owner and covers your whole portfolio. Guests become contacts with real stay history and lifetime spend, trade partners become companies, bookings become deals, and website enquiries land in a pipeline. Your token is encrypted server-side, verified before it is saved, and a delta sweep keeps HubSpot current every 15 minutes.",
      },
      {
        q: "Do I need HubSpot to get CRM features in ROL'OS?",
        a: "No. Guest profiles, enquiry pipelines, digital check-in, post-departure feedback and Trade/Direct segmentation are all native ROL'OS features. HubSpot is an optional projection for teams who already work in HubSpot.",
      },
      {
        q: "Can I white-label the booking experience?",
        a: "Yes. ROL'OS supports full white-labelling: custom logos, colour palettes, email templates and your own booking domain. It is free during your first 60 days and an add-on after that, priced on your agreement.",
      },
    ],
  },
  {
    title: "Grow",
    items: [
      {
        q: "What analytics are included?",
        a: "ADR (Average Daily Rate), RevPAR (Revenue per Available Room), occupancy forecasting, channel performance, revenue breakdowns, and guest demographics. The get_daily_metrics API action returns these in real-time.",
      },
      {
        q: "Can I manage multiple properties?",
        a: "Yes — unlimited properties, with portfolio-level analytics and aggregated KPIs. Portfolio terms are negotiable; subscription and add-on pricing is agreed per property in your agreement.",
      },
      {
        q: "Do you support OTA channel management?",
        a: "OTA channel management is on our near-term roadmap and actively in development. When launched, it will include connections to Booking.com, Airbnb, Expedia, Google Hotels, and more — with rate parity rules, real-time availability sync, and commission tracking built in.",
      },
      {
        q: "What about revenue management?",
        a: "ROL'OS includes rate seasons with day-of-week multipliers, rate plans with min/max stay rules, and 14-day demand forecasting based on historical data.",
      },
    ],
  },
  {
    title: "Support",
    items: [
      {
        q: "What support is included?",
        a: "Onboarding, setup assistance, training and email support are free for every property — there is no support tier to buy.",
      },
      {
        q: "What does ROL'OS cost?",
        a: "Your first 60 days are free: the full ROL'OS PMS and every add-on, with no subscription, and the setup fee waived when you start in that period. In that period the only ROL'OS charge is the booking fee on bookings taken through ROL OTA and channel listings or the widget/embed booking engine. From day 61 the PMS subscription starts, along with any add-ons you keep — channel manager (per unit), white label, branding, revenue management, bring-your-own gateway. Each is priced per property in your agreement.",
      },
      {
        q: "What is the booking fee?",
        a: "It is competitive and surprisingly low, agreed per property and negotiable for volume and portfolios. We put it in writing before you go live — talk to us via the Get Started page.",
      },
      {
        q: "Do I pay extra for White Label, Revenue Management or the Channel Manager?",
        a: "They are free for your first 60 days, and chargeable after that if you keep them. White label, branding, revenue management and the channel manager (charged per unit) are add-ons priced per property in your agreement. The PMS core, developer API, CRM, folio and invoicing sit inside the PMS subscription.",
      },
      {
        q: "What happens after the first 60 days?",
        a: "The PMS subscription begins, and the add-ons you have chosen to keep are billed as set out in your agreement — channel manager per unit, white label, branding, revenue management, bring-your-own gateway. The booking fee on bookings taken through ROL'OS continues as before. We agree every amount with you in writing beforehand, and you can drop any add-on you do not want.",
      },
      GATEWAY_FAQ_MARKER,




      {
        q: "What static content can I pull for a property?",
        a: "Everything you need to render a rich booking flow: property name, type, location & geo, images (with automatic room-image fallback), room types with bed configs and capacities, amenities, rates and live availability, cancellation policies (with linked rate plans), reservation (deposit/guarantee) policies, accepted payment methods, and reception/landlord contact details. Add ?include_static_content=true to the Portfolio API to get it all in one call.",
      },
      {
        q: "Where can I report issues?",
        a: "Email connect@roomsonline.co.za or use the TOBI assistant on this site. For API-specific issues, include your property ID and the action that failed.",
      },
      {
        q: "Do you offer migration support?",
        a: "Yes. We can help migrate your existing property data, guest profiles, and reservation history from other PMS platforms. Contact our team for a migration assessment.",
      },
    ],
  },
];

export default function ConnectFAQ() {
  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_CATEGORIES.flatMap((cat) =>
      cat.items.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      }))
    ),
  };

  usePageSEO({
    title: "ROL'OS Developer FAQ — Connect",
    description: "Answers about ROL'OS API access, WordPress plugin, embeddable widgets, PMS integrations, analytics and support.",
    jsonLd: faqSchema,
  });

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-b from-primary/5 to-background pt-10 pb-8 sm:pt-16 sm:pb-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <motion.h1
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight"
          >
            Frequently Asked Questions
          </motion.h1>
          <motion.p
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            transition={{ duration: 0.7, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto"
          >
            Everything you need to know about ROL'OS. Can't find an answer? Ask TOBI or contact our team.
          </motion.p>
        </div>
      </section>

      {/* FAQ sections */}
      <section className="py-12">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 space-y-10">
          {FAQ_CATEGORIES.map((category) => (
            <motion.div
              key={category.title}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, amount: 0.2 }}
              variants={fadeUp}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <h2 className="text-lg font-semibold mb-3">{category.title}</h2>
              <Accordion type="single" collapsible className="rounded-lg border divide-y">
                {category.items.map((item, i) => (
                  <AccordionItem key={i} value={`${category.title}-${i}`} className="border-0">
                    <AccordionTrigger className="px-4 text-sm text-left hover:no-underline">{item.q}</AccordionTrigger>
                    <AccordionContent className="px-4 text-sm text-muted-foreground">{item.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-10 sm:py-12 lg:py-16 border-t">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-bold mb-3">Still Have Questions?</h2>
          <p className="text-muted-foreground mb-6">Ask TOBI using the chat widget, or get in touch with our team.</p>
          <Link to={connectPath("/connect/get-started")}>
            <Button size="lg" className="gap-2">
              Contact Us <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}

import { motion } from "framer-motion";
import { Scale, FileText, AlertTriangle, CreditCard, Shield, Globe, Gavel, Mail } from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 16, filter: "blur(4px)" },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { delay: i * 0.08, duration: 0.6, ease: [0.16, 1, 0.3, 1] },
  }),
};

const sections = [
  {
    icon: Scale,
    title: "1. Acceptance of Terms",
    content: `By accessing or using the ROL'OS Connect platform, API services, booking widgets, WordPress plugin, or any associated technology operated by Rooms Online (Pty) Ltd ("ROL'OS", "we", "our", or "us"), you agree to be bound by these Terms of Service.

If you are entering into these terms on behalf of a company or other legal entity, you represent that you have the authority to bind that entity. If you do not agree to these terms, you must not use our services.`,
  },
  {
    icon: FileText,
    title: "2. Description of Services",
    content: `ROL'OS provides a hospitality technology platform that includes:`,
    subsections: [
      {
        subtitle: "Platform Components",
        items: [
          "ROL'OS Connect API — a RESTful interface for property management, availability, bookings, and guest operations",
          "Booking engine — embeddable widgets, Smart Book buttons, and hosted booking pages",
          "WordPress plugin — Gutenberg blocks and admin dashboard for property websites",
          "PMS integration layer — synchronisation with third-party property management systems (Hostfully, Benson, Rentals United)",
          "TOBI assistant — support and sales assistant",
          "Analytics and reporting — occupancy, revenue, and operational dashboards",
        ],
      },
    ],
  },
  {
    icon: Shield,
    title: "3. Account Registration & API Access",
    content: null,
    subsections: [
      {
        subtitle: "3.1 Eligibility",
        items: [
          "You must be at least 18 years old and legally capable of entering into binding agreements",
          "Business accounts must be registered by an authorised representative",
          "You must provide accurate, current, and complete registration information",
        ],
      },
      {
        subtitle: "3.2 API Credentials",
        items: [
          "API keys are issued per property and are strictly confidential",
          "You are responsible for all activity that occurs under your API credentials",
          "You must not share, publish, or embed API keys in client-side code",
          "Compromised credentials must be reported to us immediately for rotation",
          "We reserve the right to revoke API access for misuse or policy violation",
        ],
      },
    ],
  },
  {
    icon: AlertTriangle,
    title: "4. Acceptable Use",
    content: `You agree to use the ROL'OS platform responsibly and in accordance with all applicable laws. The following activities are strictly prohibited:`,
    subsections: [
      {
        subtitle: "Prohibited Conduct",
        items: [
          "Exceeding published rate limits or engaging in abusive API consumption patterns",
          "Attempting to access data belonging to other properties or users",
          "Reverse-engineering, decompiling, or creating derivative works of our technology",
          "Using the platform to transmit malware, spam, or fraudulent content",
          "Scraping, data mining, or automated harvesting of platform content",
          "Misrepresenting your identity or affiliation when using our services",
          "Using the platform for any unlawful, harmful, or discriminatory purpose",
        ],
      },
    ],
  },
  {
    icon: CreditCard,
    title: "5. Fees & Payment",
    content: null,
    subsections: [
      {
        subtitle: "5.1 Pricing",
        items: [
          "The first 60 days from your engagement date are free of subscription and add-on charges",
          "During that period, commission/booking fees remain payable on bookings taken through ROL'OS infrastructure, and card processing fees on our payment gateway are payable by you",
          "From day 61, the PMS subscription and any add-ons you retain (channel manager charged per unit, white label, branding, revenue management, bring-your-own gateway) are billed as set out in your agreement",
          "Service fees are set out in your subscription agreement or as displayed on the Connect portal",
          "Prices are quoted in South African Rand (ZAR) unless otherwise specified",
          "We reserve the right to modify pricing with 30 days' written notice",
          "Commission-based fees are calculated on confirmed booking revenue as defined in your agreement",
        ],
      },

      {
        subtitle: "5.2 Payment Terms",
        items: [
          "Subscription fees are billed in advance on a monthly or annual basis",
          "Commission payments are invoiced monthly in arrears",
          "Overdue payments may incur interest at the maximum rate permitted by law",
          "We may suspend services for accounts with payments overdue by more than 14 days",
        ],
      },
    ],
  },
  {
    icon: FileText,
    title: "6. Intellectual Property",
    content: `All rights, title, and interest in the ROL'OS platform — including source code, documentation, trademarks, designs, and the TOBI assistant — remain the exclusive property of Rooms Online (Pty) Ltd.

Your use of our services does not grant you any ownership rights in our technology. You are granted a limited, non-exclusive, non-transferable, revocable licence to use the platform in accordance with these terms and your subscription agreement.

Content you submit to the platform (property descriptions, images, booking data) remains your property. By submitting content, you grant us a licence to use, display, and process it as necessary to deliver our services.`,
  },
  {
    icon: Globe,
    title: "7. Third-Party Integrations",
    content: `The ROL'OS platform integrates with third-party services including PMS platforms, payment processors, and mapping providers. Your use of these integrations is subject to:`,
    subsections: [
      {
        subtitle: "Integration Terms",
        items: [
          "The respective third party's own terms of service and privacy policies",
          "Availability and functionality that may change without our control",
          "Data sharing necessary to fulfil integration purposes as described in our Privacy Policy",
          "Your responsibility to maintain valid credentials and authorisations with third-party providers",
        ],
      },
    ],
  },
  {
    icon: Shield,
    title: "8. Service Availability & Support",
    content: null,
    subsections: [
      {
        subtitle: "8.1 Uptime",
        items: [
          "We target 99.9% API uptime on a monthly basis",
          "Scheduled maintenance windows are communicated at least 48 hours in advance",
          "We are not liable for downtime caused by third-party service failures, force majeure, or circumstances beyond our reasonable control",
        ],
      },
      {
        subtitle: "8.2 Support",
        items: [
          "Technical support is available via email at connect@roomsonline.co.za",
          "TOBI assistant provides 24/7 automated guidance on API integration and platform features",
          "Priority support tiers are available under Professional and Enterprise plans",
        ],
      },
    ],
  },
  {
    icon: AlertTriangle,
    title: "9. Limitation of Liability",
    content: `To the maximum extent permitted by applicable law:

ROL'OS shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, revenue, data, or business opportunities, arising from your use of the platform.

Our total aggregate liability for any claim arising under these terms shall not exceed the fees paid by you to ROL'OS in the twelve (12) months preceding the claim.

This limitation applies regardless of the theory of liability (contract, tort, negligence, strict liability, or otherwise) and even if we have been advised of the possibility of such damages.`,
  },
  {
    icon: Scale,
    title: "10. Indemnification",
    content: `You agree to indemnify, defend, and hold harmless Rooms Online (Pty) Ltd, its officers, directors, employees, and agents from any claims, damages, losses, liabilities, costs, and expenses (including reasonable legal fees) arising from:

• Your use or misuse of the platform
• Your violation of these Terms of Service
• Your violation of any applicable law or third-party rights
• Content you submit to or transmit through the platform
• Your negligence or wilful misconduct`,
  },
  {
    icon: Gavel,
    title: "11. Termination",
    content: null,
    subsections: [
      {
        subtitle: "11.1 By You",
        items: [
          "You may terminate your account at any time by providing 30 days' written notice",
          "Pre-paid subscription fees are non-refundable unless otherwise specified in your agreement",
          "You must settle all outstanding commission and usage fees before account closure",
        ],
      },
      {
        subtitle: "11.2 By Us",
        items: [
          "We may suspend or terminate your access immediately for material breach of these terms",
          "We may terminate with 30 days' notice for any reason, including discontinuation of services",
          "Upon termination, your API credentials are revoked and access to platform data ceases",
          "We will provide reasonable assistance in exporting your data for 30 days following termination",
        ],
      },
    ],
  },
  {
    icon: Globe,
    title: "12. Governing Law & Jurisdiction",
    content: `These Terms of Service are governed by and construed in accordance with the laws of the Republic of South Africa.

Any disputes arising from or in connection with these terms shall be subject to the exclusive jurisdiction of the courts of the Western Cape, South Africa.

Before initiating formal proceedings, both parties agree to attempt resolution through good-faith negotiation for a period of not less than 30 days.`,
  },
  {
    icon: FileText,
    title: "13. Changes to These Terms",
    content: `We may revise these Terms of Service at any time. Material changes will be communicated via:

• A prominent notice on the Connect portal
• Email notification to registered account holders
• An updated "Last revised" date at the top of this page

Continued use of our services after changes take effect constitutes acceptance of the revised terms. If you do not agree to revised terms, you must discontinue use of the platform and terminate your account.`,
  },
];

export default function ConnectTermsOfService() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-muted/60 to-background border-b">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 sm:py-20 lg:py-28 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-4 py-1.5 text-xs font-medium text-muted-foreground mb-6">
              <Scale className="h-3.5 w-3.5" />
              Legal
            </div>
            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-foreground mb-4">
              Terms of Service
            </h1>
            <p className="text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
              The agreement governing your use of the ROL'OS Connect platform,
              API services, and associated technology.
            </p>
            <p className="text-xs text-muted-foreground/70 mt-6 uppercase tracking-wider">
              Last revised — March 2026
            </p>
          </motion.div>
        </div>
      </section>

      {/* Content */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-10 sm:py-16 lg:py-24">
        <div className="space-y-16">
          {sections.map((section, i) => {
            const Icon = section.icon;
            return (
              <motion.article
                key={section.title}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.2 }}
                variants={fadeUp}
                className="group"
              >
                <div className="flex items-start gap-4 mb-4">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
                    {section.title}
                  </h2>
                </div>

                <div className="pl-13 space-y-4">
                  {section.content && (
                    <p className="text-muted-foreground leading-relaxed whitespace-pre-line text-[0.935rem]">
                      {section.content}
                    </p>
                  )}

                  {section.subsections?.map((sub) => (
                    <div key={sub.subtitle} className="space-y-2">
                      <h3 className="text-sm font-semibold text-foreground tracking-tight">
                        {sub.subtitle}
                      </h3>
                      <ul className="space-y-1.5">
                        {sub.items.map((item) => (
                          <li
                            key={item}
                            className="flex items-start gap-2.5 text-[0.935rem] text-muted-foreground leading-relaxed"
                          >
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/40" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </motion.article>
            );
          })}

          {/* Contact */}
          <motion.article
            custom={sections.length}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, amount: 0.2 }}
            variants={fadeUp}
          >
            <div className="flex items-start gap-4 mb-4">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Mail className="h-4.5 w-4.5" />
              </div>
              <h2 className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground">
                14. Contact
              </h2>
            </div>
            <div className="pl-13">
              <p className="text-muted-foreground leading-relaxed text-[0.935rem] mb-6">
                For questions about these Terms of Service, please contact us:
              </p>
              <div className="rounded-xl border bg-card p-6 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-foreground w-20">Email</span>
                  <a href="mailto:connect@roomsonline.co.za" className="text-sm text-primary hover:underline transition-colors">
                    connect@roomsonline.co.za
                  </a>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-foreground w-20">Phone</span>
                  <a href="tel:+27823238115" className="text-sm text-primary hover:underline transition-colors">
                    +27 82 323 8115
                  </a>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-foreground w-20">Address</span>
                  <span className="text-sm text-muted-foreground">Cape Town, South Africa</span>
                </div>
              </div>
            </div>
          </motion.article>
        </div>
      </section>
    </div>
  );
}

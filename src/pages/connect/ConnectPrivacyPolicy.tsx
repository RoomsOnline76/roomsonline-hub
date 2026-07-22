import { motion } from "framer-motion";
import { Shield, Lock, Eye, UserCheck, Globe, Mail } from "lucide-react";

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
    icon: Shield,
    title: "1. Who We Are",
    content: `Rooms Online (Pty) Ltd ("ROL'OS", "we", "our", or "us") operates the ROL'OS Connect platform, API services, and associated booking infrastructure. We are committed to protecting the privacy and security of every user, property partner, and guest who interacts with our platform.

This Privacy Policy explains how we collect, process, store, and protect your information when you use:
• The ROL'OS Connect portal and API
• ROL'OS booking widgets, embeds, and WordPress plugin
• Any property website powered by ROL'OS technology
• The ROL'OS PMS dashboard and admin tools`,
  },
  {
    icon: Eye,
    title: "2. Information We Collect",
    content: null,
    subsections: [
      {
        subtitle: "2.1 Information You Provide",
        items: [
          "Account registration details (name, email, organisation)",
          "API credential requests and integration configuration",
          "Booking and reservation data (guest names, dates, preferences)",
          "Payment information (processed securely via PCI-compliant providers)",
          "Communications with our team or TOBI assistant",
          "Property details submitted through onboarding or the Connect portal",
        ],
      },
      {
        subtitle: "2.2 Automatically Collected Data",
        items: [
          "IP address, browser type, and device information",
          "Pages visited, session duration, and interaction patterns",
          "API usage logs (endpoints called, request volume, error rates)",
          "Cookies and similar tracking technologies (see Section 7)",
          "Geolocation data (with your explicit consent)",
        ],
      },
      {
        subtitle: "2.3 Data from Third Parties",
        items: [
          "PMS platform data synced via authorised integrations (Hostfully, Benson, Rentals United)",
          "Payment processor confirmations and settlement data",
          "Publicly available business information for property verification",
        ],
      },
    ],
  },
  {
    icon: Lock,
    title: "3. How We Use Your Information",
    content: null,
    subsections: [
      {
        subtitle: "3.1 Core Service Delivery",
        items: [
          "Process and manage bookings across connected properties",
          "Synchronise availability and rates with PMS platforms",
          "Deliver API responses and maintain service uptime",
          "Send booking confirmations, modifications, and cancellation notices",
          "Process payments and generate financial reports",
        ],
      },
      {
        subtitle: "3.2 Platform Improvement",
        items: [
          "Analyse usage patterns to improve API performance and reliability",
          "Train and refine TOBI assistant responses (anonymised data only)",
          "Develop new features based on aggregate usage insights",
          "Monitor and prevent fraudulent or abusive activity",
        ],
      },
      {
        subtitle: "3.3 Communication",
        items: [
          "Respond to support requests and technical enquiries",
          "Send platform updates, maintenance notices, and security alerts",
          "Share product updates and feature announcements (with opt-out)",
        ],
      },
    ],
  },
  {
    icon: Globe,
    title: "4. Data Sharing & Third Parties",
    content: `We share information only when necessary to deliver our services or when required by law. We never sell personal data to third parties for marketing purposes.`,
    subsections: [
      {
        subtitle: "Recipients",
        items: [
          "Property owners and managers — to fulfil booking requests and manage operations",
          "PMS platforms — to synchronise reservations via authorised API connections",
          "Payment processors — to complete secure transactions (Stripe, PayFast)",
          "Infrastructure providers — hosting, CDN, and monitoring services (encrypted in transit and at rest)",
          "Legal authorities — when compelled by valid legal process",
        ],
      },
    ],
  },
  {
    icon: Shield,
    title: "5. Data Security",
    content: `We implement enterprise-grade security measures to protect your information:

• All data encrypted in transit (TLS 1.3) and at rest (AES-256)
• API authentication via secure key pairs with automatic rotation capabilities
• Row-level security (RLS) policies ensuring data isolation between properties
• Regular security audits and vulnerability assessments
• PCI DSS compliance for all payment data handling
• Immutable audit logs for all sensitive data operations
• Role-based access control with principle of least privilege

While no system is 100% immune to threats, we continuously invest in security infrastructure and follow industry best practices to minimise risk.`,
  },
  {
    icon: UserCheck,
    title: "6. Your Rights",
    content: `Under applicable data protection laws (including POPIA in South Africa and GDPR where applicable), you have the right to:`,
    subsections: [
      {
        subtitle: "Your Data Rights",
        items: [
          "Access — request a copy of all personal data we hold about you",
          "Rectification — correct any inaccurate or incomplete data",
          "Erasure — request deletion of your data (subject to legal retention requirements)",
          "Restriction — limit how we process your data in certain circumstances",
          "Portability — receive your data in a structured, machine-readable format",
          "Objection — object to processing based on legitimate interests",
          "Withdraw consent — revoke any previously given consent at any time",
        ],
      },
    ],
  },
  {
    icon: Eye,
    title: "7. Cookies & Tracking",
    content: `We use cookies and similar technologies to operate our platform effectively:

Essential cookies — required for authentication, session management, and security. These cannot be disabled.

Analytics cookies — help us understand how the platform is used. We use privacy-focused analytics that do not track individuals across websites.

Preference cookies — remember your settings (language, currency, display preferences).

You can manage cookie preferences through your browser settings. Disabling essential cookies may prevent certain platform features from functioning correctly.`,
  },
  {
    icon: Lock,
    title: "8. Data Retention",
    content: `We retain personal data only as long as necessary for the purposes described in this policy:

• Active account data — retained while your account is active, plus 12 months after closure
• Booking records — retained for 7 years for financial and legal compliance
• API logs — retained for 90 days for debugging and performance monitoring
• Support conversations — retained for 24 months for quality assurance
• Audit logs — retained indefinitely as immutable compliance records

When data is no longer required, it is securely deleted or anonymised.`,
  },
  {
    icon: Globe,
    title: "9. International Transfers",
    content: `ROL'OS operates primarily in South Africa with infrastructure hosted on globally distributed cloud services. Where personal data is transferred outside South Africa, we ensure appropriate safeguards are in place, including contractual protections consistent with POPIA Section 72 requirements.`,
  },
  {
    icon: Shield,
    title: "10. Children's Privacy",
    content: `Our platform is not directed at individuals under the age of 18. We do not knowingly collect personal information from children. If we become aware that we have collected data from a child without parental consent, we will take steps to delete that information promptly.`,
  },
  {
    icon: Eye,
    title: "11. Changes to This Policy",
    content: `We may update this Privacy Policy periodically to reflect changes in our practices, technology, or legal requirements. Material changes will be communicated via:

• A prominent notice on the Connect portal
• Email notification to registered account holders
• An updated "Last revised" date at the top of this page

Continued use of our services after changes take effect constitutes acceptance of the revised policy.`,
  },
];

export default function ConnectPrivacyPolicy() {
  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-muted/60 to-background border-b">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 sm:py-28 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-4 py-1.5 text-xs font-medium text-muted-foreground mb-6">
              <Shield className="h-3.5 w-3.5" />
              Legal
            </div>
            <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight text-foreground mb-4">
              Privacy Policy
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto leading-relaxed">
              How ROL'OS collects, processes, and protects your data across
              every touchpoint of our platform.
            </p>
            <p className="text-xs text-muted-foreground/70 mt-6 uppercase tracking-wider">
              Last revised — March 2026
            </p>
          </motion.div>
        </div>
      </section>

      {/* Content */}
      <section className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
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
                12. Contact Us
              </h2>
            </div>
            <div className="pl-13">
              <p className="text-muted-foreground leading-relaxed text-[0.935rem] mb-6">
                If you have questions about this Privacy Policy, wish to
                exercise your data rights, or need to report a privacy concern,
                please contact us:
              </p>
              <div className="rounded-xl border bg-card p-6 space-y-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-foreground w-20">Email</span>
                  <a
                    href="mailto:connect@roomsonline.co.za"
                    className="text-sm text-primary hover:underline transition-colors"
                  >
                    connect@roomsonline.co.za
                  </a>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-foreground w-20">Phone</span>
                  <a
                    href="tel:+27823238115"
                    className="text-sm text-primary hover:underline transition-colors"
                  >
                    +27 82 323 8115
                  </a>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-foreground w-20">Address</span>
                  <span className="text-sm text-muted-foreground">
                    Cape Town, South Africa
                  </span>
                </div>
              </div>
            </div>
          </motion.article>
        </div>
      </section>
    </div>
  );
}

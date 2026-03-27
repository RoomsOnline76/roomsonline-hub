import { PublicLayout } from "@/components/layout/PublicLayout";
import { usePageSEO } from "@/hooks/usePageSEO";

const PrivacyPolicy = () => {
  usePageSEO({
    title: "Privacy Policy — RoomsOnline",
    description: "Learn how RoomsOnline collects, uses, and protects your personal information when using our booking platform and services.",
  });

  return (
    <PublicLayout backLabel="Back to Home" backTo="/">
      <div className="container mx-auto px-4 sm:px-6 py-16 sm:py-20">
        {/* Page title */}
        <div className="max-w-3xl mx-auto text-center mb-12">
          <h1 className="font-display text-3xl sm:text-4xl font-light tracking-tight leading-tight text-foreground mb-4">
            Privacy Policy
          </h1>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Last updated: January 2025</p>
        </div>

        {/* Content */}
        <div className="max-w-3xl mx-auto space-y-12">
          <section className="space-y-4">
            <h2 className="font-sans text-xl font-medium tracking-tight leading-tight text-foreground mb-4">
              1. Introduction
            </h2>
            <p className="text-foreground/80 leading-relaxed">
              RoomsOnline ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains
              how we collect, use, disclose, and safeguard your information when you use our booking platform and
              services.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="font-sans text-xl font-medium tracking-tight leading-tight text-foreground mb-4">
              2. Information We Collect
            </h2>
            <h3 className="font-medium text-foreground">2.1 Personal Information</h3>
            <p className="text-foreground/80 leading-relaxed">
              When you make a booking or create an account, we collect:
            </p>
            <ul className="list-disc list-inside text-foreground/80 space-y-1 ml-4 marker:text-primary/50">
              <li>Full name</li>
              <li>Email address</li>
              <li>Phone number</li>
              <li>Billing and payment information</li>
              <li>Booking preferences and special requests</li>
            </ul>

            <h3 className="font-medium text-foreground mt-6">2.2 Automatically Collected Information</h3>
            <p className="text-foreground/80 leading-relaxed">
              When you access our platform, we may automatically collect:
            </p>
            <ul className="list-disc list-inside text-foreground/80 space-y-1 ml-4 marker:text-primary/50">
              <li>IP address and browser type</li>
              <li>Device information</li>
              <li>Pages visited and time spent</li>
              <li>Location data (with your consent)</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="font-sans text-xl font-medium tracking-tight leading-tight text-foreground mb-4">
              3. How We Use Your Information
            </h2>
            <p className="text-foreground/80 leading-relaxed">We use the information we collect to:</p>
            <ul className="list-disc list-inside text-foreground/80 space-y-1 ml-4 marker:text-primary/50">
              <li>Process and manage your bookings</li>
              <li>Send booking confirmations and updates</li>
              <li>Communicate with you about your reservations</li>
              <li>Process payments securely</li>
              <li>Improve our services and user experience</li>
              <li>Comply with legal obligations</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="font-sans text-xl font-medium tracking-tight leading-tight text-foreground mb-4">
              4. Information Sharing
            </h2>
            <p className="text-foreground/80 leading-relaxed">We may share your information with:</p>
            <ul className="list-disc list-inside text-foreground/80 space-y-1 ml-4 marker:text-primary/50">
              <li>
                <strong>Property Owners/Managers:</strong> To fulfill your booking requests
              </li>
              <li>
                <strong>Payment Processors:</strong> To process secure transactions
              </li>
              <li>
                <strong>Service Providers:</strong> Who assist in operating our platform
              </li>
              <li>
                <strong>Legal Authorities:</strong> When required by law
              </li>
            </ul>
            <p className="text-foreground/80 leading-relaxed mt-4">
              We do not sell your personal information to third parties for marketing purposes.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="font-sans text-xl font-medium tracking-tight leading-tight text-foreground mb-4">
              5. Data Security
            </h2>
            <p className="text-foreground/80 leading-relaxed">
              We implement industry-standard security measures to protect your personal information, including
              encryption, secure servers, and access controls. However, no method of transmission over the Internet is
              100% secure.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="font-sans text-xl font-medium tracking-tight leading-tight text-foreground mb-4">
              6. Your Rights
            </h2>
            <p className="text-foreground/80 leading-relaxed">
              Under applicable data protection laws, you have the right to:
            </p>
            <ul className="list-disc list-inside text-foreground/80 space-y-1 ml-4 marker:text-primary/50">
              <li>Access your personal information</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Object to processing of your data</li>
              <li>Withdraw consent at any time</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="font-sans text-xl font-medium tracking-tight leading-tight text-foreground mb-4">
              7. Cookies
            </h2>
            <p className="text-foreground/80 leading-relaxed">
              We use cookies and similar tracking technologies to enhance your experience, analyze site traffic, and for
              marketing purposes. You can control cookie settings through your browser preferences.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="font-sans text-xl font-medium tracking-tight leading-tight text-foreground mb-4">
              8. Changes to This Policy
            </h2>
            <p className="text-foreground/80 leading-relaxed">
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new
              policy on this page and updating the "Last updated" date.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="font-sans text-xl font-medium tracking-tight leading-tight text-foreground mb-4">
              9. Contact Us
            </h2>
            <p className="text-foreground/80 leading-relaxed">
              If you have any questions about this Privacy Policy, please contact us:
            </p>
            <div className="p-6 rounded-lg bg-card border border-border mt-4">
              <p className="text-foreground">
                Email:{" "}
                <a
                  href="mailto:privacy@roomsonline.co.za"
                  className="text-primary hover:underline transition-colors duration-200"
                >
                  privacy@roomsonline.co.za
                </a>
              </p>
              <p className="text-foreground mt-2">
                Phone:{" "}
                <a href="tel:+27214180022" className="text-primary hover:underline transition-colors duration-200">
                  +27823238115
                </a>
              </p>
            </div>
          </section>
        </div>
      </div>
    </PublicLayout>
  );
};

export default PrivacyPolicy;

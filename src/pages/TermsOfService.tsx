import { PublicLayout } from "@/components/layout/PublicLayout";

const TermsOfService = () => {
  return (
    <PublicLayout backLabel="Back to Home" backTo="/">
      <div className="container mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* Page title */}
        <div className="max-w-3xl mx-auto text-center mb-12">
          <h1 className="font-display text-3xl sm:text-4xl font-light text-foreground mb-4">
            Terms of Service
          </h1>
          <p className="text-sm text-muted-foreground">
            Last updated: January 2025
          </p>
        </div>

        {/* Content */}
        <div className="max-w-3xl mx-auto space-y-8">
          <section className="space-y-4">
            <h2 className="font-display text-xl font-light text-foreground border-b border-border pb-2">
              1. Acceptance of Terms
            </h2>
            <p className="text-foreground/80 leading-relaxed">
              By accessing or using RoomsOnline ("the Platform"), you agree to be bound by 
              these Terms of Service. If you do not agree to these terms, please do not 
              use our services.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="font-display text-xl font-light text-foreground border-b border-border pb-2">
              2. Description of Service
            </h2>
            <p className="text-foreground/80 leading-relaxed">
              RoomsOnline is a unified booking engine that connects guests with accommodation 
              providers, including hotels, vacation rentals, and bed & breakfasts. We facilitate 
              bookings between guests and property owners/managers but are not the accommodation 
              provider.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="font-display text-xl font-light text-foreground border-b border-border pb-2">
              3. User Accounts
            </h2>
            <p className="text-foreground/80 leading-relaxed">When creating an account, you agree to:</p>
            <ul className="list-disc list-inside text-foreground/80 space-y-1 ml-4">
              <li>Provide accurate and complete information</li>
              <li>Maintain the security of your account credentials</li>
              <li>Notify us immediately of any unauthorized access</li>
              <li>Accept responsibility for all activities under your account</li>
              <li>Be at least 18 years of age</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="font-display text-xl font-light text-foreground border-b border-border pb-2">
              4. Booking Terms
            </h2>
            <h3 className="font-medium text-foreground">4.1 Reservations</h3>
            <p className="text-foreground/80 leading-relaxed">
              When you make a booking through RoomsOnline, you enter into a direct contract 
              with the accommodation provider. We act as an intermediary to facilitate the 
              booking process.
            </p>

            <h3 className="font-medium text-foreground mt-4">4.2 Pricing</h3>
            <p className="text-foreground/80 leading-relaxed">
              All prices displayed are provided by the accommodation providers and may be 
              subject to change. Additional taxes, fees, or charges may apply as indicated 
              during the booking process.
            </p>

            <h3 className="font-medium text-foreground mt-4">4.3 Cancellations</h3>
            <p className="text-foreground/80 leading-relaxed">
              Cancellation and modification policies are set by individual accommodation 
              providers and will be displayed during the booking process. Please review 
              these policies carefully before confirming your booking.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="font-display text-xl font-light text-foreground border-b border-border pb-2">
              5. User Responsibilities
            </h2>
            <p className="text-foreground/80 leading-relaxed">You agree not to:</p>
            <ul className="list-disc list-inside text-foreground/80 space-y-1 ml-4">
              <li>Use the Platform for any unlawful purpose</li>
              <li>Provide false or misleading information</li>
              <li>Interfere with the proper functioning of the Platform</li>
              <li>Attempt to gain unauthorized access to our systems</li>
              <li>Violate any applicable laws or regulations</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="font-display text-xl font-light text-foreground border-b border-border pb-2">
              6. Intellectual Property
            </h2>
            <p className="text-foreground/80 leading-relaxed">
              All content on the Platform, including text, graphics, logos, and software, 
              is the property of RoomsOnline or its licensors and is protected by 
              intellectual property laws. You may not reproduce, distribute, or create 
              derivative works without our express written consent.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="font-display text-xl font-light text-foreground border-b border-border pb-2">
              7. Limitation of Liability
            </h2>
            <p className="text-foreground/80 leading-relaxed">
              RoomsOnline acts as an intermediary between guests and accommodation providers. 
              We are not liable for any issues arising from the accommodation itself, including 
              but not limited to property conditions, service quality, or disputes with property 
              owners/managers. Our liability is limited to the maximum extent permitted by law.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="font-display text-xl font-light text-foreground border-b border-border pb-2">
              8. Governing Law
            </h2>
            <p className="text-foreground/80 leading-relaxed">
              These Terms are governed by the laws of the Republic of South Africa. Any 
              disputes arising from these Terms or your use of the Platform shall be 
              subject to the exclusive jurisdiction of the South African courts.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="font-display text-xl font-light text-foreground border-b border-border pb-2">
              9. Changes to Terms
            </h2>
            <p className="text-foreground/80 leading-relaxed">
              We reserve the right to modify these Terms at any time. Changes will be 
              effective upon posting to the Platform. Your continued use of the Platform 
              after changes constitutes acceptance of the modified Terms.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="font-display text-xl font-light text-foreground border-b border-border pb-2">
              10. Contact Information
            </h2>
            <p className="text-foreground/80 leading-relaxed">
              For questions about these Terms of Service, please contact us:
            </p>
            <div className="p-4 rounded-lg bg-muted/30 border border-border/50 mt-4">
              <p className="text-foreground">
                Email: <a href="mailto:legal@roomsonline.co.za" className="text-primary hover:underline">legal@roomsonline.co.za</a>
              </p>
              <p className="text-foreground mt-1">
                Phone: <a href="tel:+27214180022" className="text-primary hover:underline">+27 21 418 0022</a>
              </p>
            </div>
          </section>
        </div>
      </div>
    </PublicLayout>
  );
};

export default TermsOfService;

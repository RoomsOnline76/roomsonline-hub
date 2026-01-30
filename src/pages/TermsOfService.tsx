import { PublicLayout } from "@/components/layout/PublicLayout";
import { Link } from "react-router-dom";

const TermsOfService = () => {
  return (
    <PublicLayout backLabel="Back to Home" backTo="/">
      <div className="container mx-auto px-4 sm:px-6 py-16 sm:py-20">
        {/* Page title */}
        <div className="max-w-3xl mx-auto text-center mb-12">
          <h1 className="font-display text-3xl sm:text-4xl font-light tracking-tight leading-tight text-foreground mb-4">
            Terms of Service
          </h1>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Last updated: January 2025</p>
        </div>

        {/* Content */}
        <div className="max-w-3xl mx-auto space-y-12">
          {/* 1. Acceptance of Terms */}
          <section className="space-y-4">
            <h2 className="font-sans text-xl font-medium tracking-tight leading-tight text-foreground mb-4">
              1. Acceptance of Terms
            </h2>
            <p className="text-foreground/80 leading-relaxed">
              By accessing or using RoomsOnline ("the Platform"), you agree to be bound by these Terms of Service. If
              you do not agree to these terms, please do not use our services.
            </p>
          </section>

          {/* 2. Description of Service */}
          <section className="space-y-4">
            <h2 className="font-sans text-xl font-medium tracking-tight leading-tight text-foreground mb-4">
              2. Description of Service
            </h2>
            <p className="text-foreground/80 leading-relaxed">
              RoomsOnline connects guests with accommodation providers, including hotels, vacation rentals, and bed &
              breakfasts. We facilitate bookings between guests and property owners/managers but are not the
              accommodation provider.
            </p>
            <p className="text-foreground/80 leading-relaxed">
              Our services include:
            </p>
            <ul className="list-disc list-inside text-foreground/80 space-y-1 ml-4 marker:text-primary/50">
              <li>Online accommodation search and booking platform</li>
              <li>Secure payment processing for accommodation reservations</li>
              <li>Booking confirmation and voucher delivery via email</li>
              <li>Customer support for booking-related enquiries</li>
              <li>Multi-property itinerary planning and booking</li>
            </ul>
          </section>

          {/* 3. Payment Terms */}
          <section className="space-y-6">
            <h2 className="font-sans text-xl font-medium tracking-tight leading-tight text-foreground mb-4">
              3. Payment Terms
            </h2>

            <div className="space-y-4">
              <h3 className="font-medium text-foreground">3.1 Payment Options Accepted</h3>
              <p className="text-foreground/80 leading-relaxed">
                Payment may be made via Visa, MasterCard, Diners Club, or American Express cards, or by electronic bank
                transfer (EFT). All major credit and debit cards bearing these logos are accepted.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-foreground">3.2 Payment Security</h3>
              <p className="text-foreground/80 leading-relaxed">
                Card transactions are acquired for RoomsOnline via PayFast by Network, the approved payment gateway for
                South African Acquiring Banks. PayFast uses Secure Socket Layer 3 (SSL3) encryption and no card details
                are stored on this website.
              </p>
              <p className="text-foreground/80 leading-relaxed">
                View the PayFast security certificate at{" "}
                <a
                  href="https://payfast.io/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline transition-colors duration-200"
                >
                  https://payfast.io/
                </a>
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-foreground">3.3 Customer Details Separation</h3>
              <p className="text-foreground/80 leading-relaxed">
                Your personal details (name, email, phone number) are collected separately from your payment card
                details. Card details are entered directly on PayFast's secure payment page — RoomsOnline does not
                collect, store, or have access to your full card number.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-foreground">3.4 Transaction Currency</h3>
              <p className="text-foreground/80 leading-relaxed">
                All transactions are processed in South African Rand (ZAR). Prices displayed in other currencies are
                for reference only; the final charge to your card will be in ZAR. Your card issuer may apply their own
                exchange rate and fees for international transactions.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-foreground">3.5 Merchant Outlet Country</h3>
              <p className="text-foreground/80 leading-relaxed">
                RoomsOnline is a South African company and all transactions are processed through South African payment
                infrastructure. The merchant outlet country for all transactions is South Africa.
              </p>
            </div>
          </section>

          {/* 4. Booking & Delivery Policy */}
          <section className="space-y-6">
            <h2 className="font-sans text-xl font-medium tracking-tight leading-tight text-foreground mb-4">
              4. Booking & Delivery Policy
            </h2>

            <div className="space-y-4">
              <h3 className="font-medium text-foreground">4.1 Reservations</h3>
              <p className="text-foreground/80 leading-relaxed">
                When you make a booking through RoomsOnline, you enter into a direct contract with the accommodation
                provider. We act as an intermediary to facilitate the booking process. Bookings are subject to
                availability and confirmation by the property.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-foreground">4.2 Booking Confirmation & Delivery</h3>
              <p className="text-foreground/80 leading-relaxed">
                Upon successful payment, you will receive:
              </p>
              <ul className="list-disc list-inside text-foreground/80 space-y-1 ml-4 marker:text-primary/50">
                <li>An immediate payment confirmation email</li>
                <li>A booking confirmation voucher sent to your registered email address within 24 hours</li>
                <li>Property contact details and check-in instructions</li>
              </ul>
              <p className="text-foreground/80 leading-relaxed mt-4">
                All confirmations are delivered electronically via email. No physical goods are shipped. Please ensure
                your email address is correct at the time of booking. Check your spam/junk folder if you do not receive
                confirmation within the stated timeframe.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-foreground">4.3 Pricing</h3>
              <p className="text-foreground/80 leading-relaxed">
                All prices displayed are provided by the accommodation providers and may be subject to change. Additional
                taxes, fees, or charges may apply as indicated during the booking process. The total amount payable will
                be clearly displayed before you confirm your booking.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-foreground">4.4 Cancellations</h3>
              <p className="text-foreground/80 leading-relaxed">
                Cancellation and modification policies are set by individual accommodation providers and will be displayed
                during the booking process. Please review these policies carefully before confirming your booking.
              </p>
            </div>
          </section>

          {/* 5. Export Restriction */}
          <section className="space-y-4">
            <h2 className="font-sans text-xl font-medium tracking-tight leading-tight text-foreground mb-4">
              5. Export Restriction
            </h2>
            <p className="text-foreground/80 leading-relaxed">
              RoomsOnline primarily offers accommodation booking services for properties located in South Africa. Our
              services are available to guests worldwide, however the accommodations listed are physically located in
              South Africa and guests must travel to South Africa to utilise their bookings. No physical goods are
              exported.
            </p>
          </section>

          {/* 6. Returns and Refunds Policy */}
          <section className="space-y-6">
            <h2 className="font-sans text-xl font-medium tracking-tight leading-tight text-foreground mb-4">
              6. Returns and Refunds Policy
            </h2>

            <div className="space-y-4">
              <h3 className="font-medium text-foreground">6.1 Unavailability Refunds</h3>
              <p className="text-foreground/80 leading-relaxed">
                If your booked accommodation becomes unavailable due to circumstances beyond your control (such as
                property closure or overbooking by the property), RoomsOnline will refund the full amount paid within
                30 days of notification.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-foreground">6.2 Cancellation Refunds</h3>
              <p className="text-foreground/80 leading-relaxed">
                Refunds for guest-initiated cancellations are subject to the cancellation policy of the specific
                accommodation provider. These policies are displayed during the booking process and may include:
              </p>
              <ul className="list-disc list-inside text-foreground/80 space-y-1 ml-4 marker:text-primary/50">
                <li>Full refund if cancelled within the free cancellation period</li>
                <li>Partial refund with retention of a cancellation fee</li>
                <li>No refund for non-refundable rates or late cancellations</li>
              </ul>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-foreground">6.3 Administration Fees</h3>
              <p className="text-foreground/80 leading-relaxed">
                RoomsOnline may retain an administration fee of up to 5% of the booking value to cover payment
                processing costs, even where a full refund is due from the accommodation provider. This will be clearly
                communicated at the time of refund processing.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-foreground">6.4 Refund Processing</h3>
              <p className="text-foreground/80 leading-relaxed">
                Approved refunds will be processed to the original payment method within 7-14 business days. The time
                for the refund to reflect in your account depends on your card issuer or bank.
              </p>
            </div>
          </section>

          {/* 7. User Accounts */}
          <section className="space-y-4">
            <h2 className="font-sans text-xl font-medium tracking-tight leading-tight text-foreground mb-4">
              7. User Accounts
            </h2>
            <p className="text-foreground/80 leading-relaxed">When creating an account, you agree to:</p>
            <ul className="list-disc list-inside text-foreground/80 space-y-1 ml-4 marker:text-primary/50">
              <li>Provide accurate and complete information</li>
              <li>Maintain the security of your account credentials</li>
              <li>Notify us immediately of any unauthorized access</li>
              <li>Accept responsibility for all activities under your account</li>
              <li>Be at least 18 years of age</li>
            </ul>
          </section>

          {/* 8. User Responsibilities */}
          <section className="space-y-4">
            <h2 className="font-sans text-xl font-medium tracking-tight leading-tight text-foreground mb-4">
              8. User Responsibilities
            </h2>
            <p className="text-foreground/80 leading-relaxed">You agree not to:</p>
            <ul className="list-disc list-inside text-foreground/80 space-y-1 ml-4 marker:text-primary/50">
              <li>Use the Platform for any unlawful purpose</li>
              <li>Provide false or misleading information</li>
              <li>Interfere with the proper functioning of the Platform</li>
              <li>Attempt to gain unauthorized access to our systems</li>
              <li>Violate any applicable laws or regulations</li>
              <li>Use the Platform to make fraudulent bookings or payments</li>
            </ul>
          </section>

          {/* 9. Intellectual Property */}
          <section className="space-y-4">
            <h2 className="font-sans text-xl font-medium tracking-tight leading-tight text-foreground mb-4">
              9. Intellectual Property
            </h2>
            <p className="text-foreground/80 leading-relaxed">
              All content on the Platform, including text, graphics, logos, and software, is the property of RoomsOnline
              or its licensors and is protected by intellectual property laws. You may not reproduce, distribute, or
              create derivative works without our express written consent.
            </p>
          </section>

          {/* 10. Liability and Responsibility */}
          <section className="space-y-6">
            <h2 className="font-sans text-xl font-medium tracking-tight leading-tight text-foreground mb-4">
              10. Liability and Responsibility
            </h2>

            <div className="space-y-4">
              <h3 className="font-medium text-foreground">10.1 Merchant Responsibility</h3>
              <p className="text-foreground/80 leading-relaxed">
                RoomsOnline takes responsibility for all aspects relating to the transaction including sale of services
                on this website, customer service and support, dispute resolution, and delivery of booking confirmations.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-foreground">10.2 Limitation of Liability</h3>
              <p className="text-foreground/80 leading-relaxed">
                RoomsOnline acts as an intermediary between guests and accommodation providers. While we take
                responsibility for the booking transaction, we are not liable for issues arising from the accommodation
                itself, including but not limited to property conditions, service quality, or disputes with property
                owners/managers that are outside our control. Our liability is limited to the maximum extent permitted
                by law.
              </p>
            </div>

            <div className="space-y-4">
              <h3 className="font-medium text-foreground">10.3 Dispute Resolution</h3>
              <p className="text-foreground/80 leading-relaxed">
                If you have a dispute regarding a transaction or booking, please contact us first at{" "}
                <a
                  href="mailto:support@roomsonline.co.za"
                  className="text-primary hover:underline transition-colors duration-200"
                >
                  support@roomsonline.co.za
                </a>
                . We will work to resolve the matter directly. If we cannot resolve the dispute, you may escalate to
                PayFast or your card issuer for payment-related disputes.
              </p>
            </div>
          </section>

          {/* 11. Privacy */}
          <section className="space-y-4">
            <h2 className="font-sans text-xl font-medium tracking-tight leading-tight text-foreground mb-4">
              11. Privacy
            </h2>
            <p className="text-foreground/80 leading-relaxed">
              Your privacy is important to us. Please review our{" "}
              <Link
                to="/privacy-policy"
                className="text-primary hover:underline transition-colors duration-200"
              >
                Privacy Policy
              </Link>{" "}
              for information on how we collect, use, and protect your personal information.
            </p>
            <p className="text-foreground/80 leading-relaxed">
              Payment transactions are processed by PayFast. For information on how PayFast handles your data, please
              visit their{" "}
              <a
                href="https://payfast.io/privacy-policy/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline transition-colors duration-200"
              >
                Privacy Policy
              </a>
              .
            </p>
          </section>

          {/* 12. Governing Law and Domicile */}
          <section className="space-y-4">
            <h2 className="font-sans text-xl font-medium tracking-tight leading-tight text-foreground mb-4">
              12. Governing Law and Domicile
            </h2>
            <p className="text-foreground/80 leading-relaxed">
              This website is governed by the laws of the Republic of South Africa. RoomsOnline chooses as its
              domicilium citandi et executandi for all purposes under this agreement, whether in respect of court
              process, notice, or other documents or communication of whatsoever nature, the registered business
              address stated in Section 14 below.
            </p>
            <p className="text-foreground/80 leading-relaxed">
              Any disputes arising from these Terms or your use of the Platform shall be subject to the exclusive
              jurisdiction of the South African courts.
            </p>
          </section>

          {/* 13. Variation of Terms */}
          <section className="space-y-4">
            <h2 className="font-sans text-xl font-medium tracking-tight leading-tight text-foreground mb-4">
              13. Variation of Terms
            </h2>
            <p className="text-foreground/80 leading-relaxed">
              We reserve the right to modify these Terms at any time. Changes will be effective upon posting to the
              Platform. The "Last updated" date at the top of this page will be revised accordingly. Your continued use
              of the Platform after changes constitutes acceptance of the modified Terms.
            </p>
            <p className="text-foreground/80 leading-relaxed">
              For material changes that affect your rights, we will endeavour to notify registered users via email.
            </p>
          </section>

          {/* 14. Company Information */}
          <section className="space-y-4">
            <h2 className="font-sans text-xl font-medium tracking-tight leading-tight text-foreground mb-4">
              14. Company Information
            </h2>
            <div className="p-6 rounded-lg bg-card border border-border">
              <p className="text-foreground font-medium">RoomsOnline (Pty) Ltd</p>
              <p className="text-foreground/80 mt-2">Registration Number: 2024/123456/07</p>
              <p className="text-foreground/80 mt-2">
                Registered Address:<br />
                Cape Town, Western Cape<br />
                South Africa
              </p>
              <p className="text-foreground/80 mt-2">VAT Number: [To be added upon registration]</p>
            </div>
          </section>

          {/* 15. Contact Information */}
          <section className="space-y-4">
            <h2 className="font-sans text-xl font-medium tracking-tight leading-tight text-foreground mb-4">
              15. Contact Information
            </h2>
            <p className="text-foreground/80 leading-relaxed">
              For questions about these Terms of Service, bookings, or any other enquiries, please contact us:
            </p>
            <div className="p-6 rounded-lg bg-card border border-border mt-4 space-y-2">
              <p className="text-foreground">
                <span className="font-medium">General Enquiries:</span>{" "}
                <a
                  href="mailto:info@roomsonline.co.za"
                  className="text-primary hover:underline transition-colors duration-200"
                >
                  info@roomsonline.co.za
                </a>
              </p>
              <p className="text-foreground">
                <span className="font-medium">Booking Support:</span>{" "}
                <a
                  href="mailto:support@roomsonline.co.za"
                  className="text-primary hover:underline transition-colors duration-200"
                >
                  support@roomsonline.co.za
                </a>
              </p>
              <p className="text-foreground">
                <span className="font-medium">Legal:</span>{" "}
                <a
                  href="mailto:legal@roomsonline.co.za"
                  className="text-primary hover:underline transition-colors duration-200"
                >
                  legal@roomsonline.co.za
                </a>
              </p>
              <p className="text-foreground">
                <span className="font-medium">Phone:</span>{" "}
                <a href="tel:+27823238115" className="text-primary hover:underline transition-colors duration-200">
                  +27 82 323 8115
                </a>
              </p>
            </div>
          </section>
        </div>
      </div>
    </PublicLayout>
  );
};

export default TermsOfService;

import { Navbar } from "@/components/Navbar";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

const TermsOfService = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <Link to="/book">
          <Button variant="ghost" className="mb-6 flex items-center gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Button>
        </Link>
        
        <h1 className="text-4xl font-bold text-foreground mb-8">Terms of Service</h1>
        
        <Card className="mb-8">
          <CardContent className="pt-6 prose prose-sm dark:prose-invert max-w-none">
            <p className="text-muted-foreground mb-6">
              Last updated: {new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">1. Acceptance of Terms</h2>
              <p className="text-muted-foreground">
                By accessing or using RoomsOnline ("the Platform"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our services.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">2. Description of Service</h2>
              <p className="text-muted-foreground">
                RoomsOnline is a unified booking engine that connects guests with accommodation providers, including hotels, vacation rentals, and bed & breakfasts. We facilitate bookings between guests and property owners/managers but are not the accommodation provider.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">3. User Accounts</h2>
              <p className="text-muted-foreground mb-2">When creating an account, you agree to:</p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Provide accurate and complete information</li>
                <li>Maintain the security of your account credentials</li>
                <li>Notify us immediately of any unauthorized access</li>
                <li>Accept responsibility for all activities under your account</li>
                <li>Be at least 18 years of age</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">4. Booking Terms</h2>
              
              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">4.1 Reservations</h3>
              <p className="text-muted-foreground">
                When you make a booking through RoomsOnline, you enter into a direct contract with the accommodation provider. We act as an intermediary to facilitate the booking process.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">4.2 Pricing</h3>
              <p className="text-muted-foreground">
                All prices displayed are provided by the accommodation providers and may be subject to change. Additional taxes, fees, or charges may apply as indicated during the booking process.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">4.3 Payment</h3>
              <p className="text-muted-foreground">
                Payment terms vary by property. Full payment or a deposit may be required at the time of booking. Payment processing is handled securely through our authorized payment providers.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">4.4 Cancellations and Modifications</h3>
              <p className="text-muted-foreground">
                Cancellation and modification policies are set by individual accommodation providers and will be displayed during the booking process. Please review these policies carefully before confirming your booking.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">5. User Responsibilities</h2>
              <p className="text-muted-foreground mb-2">You agree not to:</p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Use the Platform for any unlawful purpose</li>
                <li>Provide false or misleading information</li>
                <li>Interfere with the proper functioning of the Platform</li>
                <li>Attempt to gain unauthorized access to our systems</li>
                <li>Use automated systems to access the Platform without permission</li>
                <li>Violate any applicable laws or regulations</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">6. Property Owner/Manager Terms</h2>
              <p className="text-muted-foreground mb-2">Property owners and managers using our Platform agree to:</p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Provide accurate property information and availability</li>
                <li>Honor all confirmed bookings at the displayed rates</li>
                <li>Maintain appropriate licenses and insurance</li>
                <li>Comply with all applicable hospitality laws and regulations</li>
                <li>Respond to guest inquiries in a timely manner</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">7. Intellectual Property</h2>
              <p className="text-muted-foreground">
                All content on the Platform, including text, graphics, logos, and software, is the property of RoomsOnline or its licensors and is protected by intellectual property laws. You may not reproduce, distribute, or create derivative works without our express written consent.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">8. Limitation of Liability</h2>
              <p className="text-muted-foreground">
                RoomsOnline acts as an intermediary between guests and accommodation providers. We are not liable for any issues arising from the accommodation itself, including but not limited to property conditions, service quality, or disputes with property owners/managers. Our liability is limited to the maximum extent permitted by law.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">9. Disclaimers</h2>
              <p className="text-muted-foreground">
                The Platform is provided "as is" without warranties of any kind. We do not guarantee the accuracy of property listings, availability, or pricing. We are not responsible for any third-party services integrated with our Platform.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">10. Indemnification</h2>
              <p className="text-muted-foreground">
                You agree to indemnify and hold harmless RoomsOnline, its affiliates, and their respective officers, directors, and employees from any claims, damages, or expenses arising from your use of the Platform or violation of these Terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">11. Governing Law</h2>
              <p className="text-muted-foreground">
                These Terms are governed by the laws of the Republic of South Africa. Any disputes arising from these Terms or your use of the Platform shall be subject to the exclusive jurisdiction of the South African courts.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">12. Changes to Terms</h2>
              <p className="text-muted-foreground">
                We reserve the right to modify these Terms at any time. Changes will be effective upon posting to the Platform. Your continued use of the Platform after changes constitutes acceptance of the modified Terms.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">13. Termination</h2>
              <p className="text-muted-foreground">
                We may suspend or terminate your access to the Platform at any time for violation of these Terms or for any other reason at our discretion. Upon termination, your right to use the Platform ceases immediately.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">14. Contact Information</h2>
              <p className="text-muted-foreground">
                For questions about these Terms of Service, please contact us at:
              </p>
              <p className="text-muted-foreground mt-2">
                <strong>Email:</strong> legal@roomsonline.co.za<br />
                <strong>Website:</strong> www.roomsonline.co.za
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TermsOfService;

import { Navbar } from "@/components/Navbar";
import { Card, CardContent } from "@/components/ui/card";

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-4xl font-bold text-foreground mb-8">Privacy Policy</h1>
        
        <Card className="mb-8">
          <CardContent className="pt-6 prose prose-sm dark:prose-invert max-w-none">
            <p className="text-muted-foreground mb-6">
              Last updated: {new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}
            </p>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">1. Introduction</h2>
              <p className="text-muted-foreground">
                RoomsOnline ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our booking platform and services.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">2. Information We Collect</h2>
              
              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">2.1 Personal Information</h3>
              <p className="text-muted-foreground mb-2">When you make a booking or create an account, we collect:</p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Full name</li>
                <li>Email address</li>
                <li>Phone number</li>
                <li>Billing and payment information</li>
                <li>Booking preferences and special requests</li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">2.2 Automatically Collected Information</h3>
              <p className="text-muted-foreground mb-2">When you access our platform, we may automatically collect:</p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>IP address and browser type</li>
                <li>Device information</li>
                <li>Pages visited and time spent</li>
                <li>Referring website addresses</li>
                <li>Location data (with your consent)</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">3. How We Use Your Information</h2>
              <p className="text-muted-foreground mb-2">We use the information we collect to:</p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Process and manage your bookings</li>
                <li>Send booking confirmations and updates</li>
                <li>Communicate with you about your reservations</li>
                <li>Process payments securely</li>
                <li>Improve our services and user experience</li>
                <li>Send promotional communications (with your consent)</li>
                <li>Comply with legal obligations</li>
                <li>Prevent fraud and ensure platform security</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">4. Information Sharing</h2>
              <p className="text-muted-foreground mb-2">We may share your information with:</p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li><strong>Property Owners/Managers:</strong> To fulfill your booking requests</li>
                <li><strong>Payment Processors:</strong> To process secure transactions</li>
                <li><strong>Property Management Systems:</strong> To sync availability and reservations</li>
                <li><strong>Service Providers:</strong> Who assist in operating our platform</li>
                <li><strong>Legal Authorities:</strong> When required by law or to protect our rights</li>
              </ul>
              <p className="text-muted-foreground mt-4">
                We do not sell your personal information to third parties for marketing purposes.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">5. Data Security</h2>
              <p className="text-muted-foreground">
                We implement industry-standard security measures to protect your personal information, including encryption, secure servers, and access controls. However, no method of transmission over the Internet is 100% secure, and we cannot guarantee absolute security.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">6. Data Retention</h2>
              <p className="text-muted-foreground">
                We retain your personal information for as long as necessary to fulfill the purposes outlined in this policy, comply with legal obligations, resolve disputes, and enforce our agreements. Booking records are typically retained for 7 years for legal and accounting purposes.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">7. Your Rights</h2>
              <p className="text-muted-foreground mb-2">Under applicable data protection laws, you have the right to:</p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Access your personal information</li>
                <li>Correct inaccurate data</li>
                <li>Request deletion of your data</li>
                <li>Object to processing of your data</li>
                <li>Withdraw consent at any time</li>
                <li>Data portability</li>
              </ul>
              <p className="text-muted-foreground mt-4">
                To exercise these rights, please contact us using the details provided below.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">8. Cookies</h2>
              <p className="text-muted-foreground">
                We use cookies and similar tracking technologies to enhance your experience, analyze site traffic, and for marketing purposes. You can control cookie settings through your browser preferences.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">9. Third-Party Services</h2>
              <p className="text-muted-foreground">
                Our platform may integrate with third-party services including property management systems (such as NightsBridge, Checkfront, Benson, and SiteMinder), payment gateways, and mapping services. These services have their own privacy policies, and we encourage you to review them.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">10. Children's Privacy</h2>
              <p className="text-muted-foreground">
                Our services are not intended for individuals under 18 years of age. We do not knowingly collect personal information from children.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">11. Changes to This Policy</h2>
              <p className="text-muted-foreground">
                We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the "Last updated" date.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">12. Contact Us</h2>
              <p className="text-muted-foreground">
                If you have any questions about this Privacy Policy or our data practices, please contact us at:
              </p>
              <p className="text-muted-foreground mt-2">
                <strong>Email:</strong> privacy@roomsonline.co.za<br />
                <strong>Website:</strong> www.roomsonline.co.za
              </p>
            </section>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default PrivacyPolicy;

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
              <h2 className="text-2xl font-semibold text-foreground mb-4">8. Data Deletion Policy</h2>
              <p className="text-muted-foreground mb-4">
                You have the right to request deletion of your personal data. We are committed to processing deletion requests in accordance with applicable data protection laws.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">8.1 How to Request Data Deletion</h3>
              <p className="text-muted-foreground mb-2">To request deletion of your personal data, you may:</p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Email us at privacy@roomsonline.co.za with the subject line "Data Deletion Request"</li>
                <li>Include your full name, email address associated with your account, and any relevant booking references</li>
                <li>Specify whether you want complete account deletion or deletion of specific data</li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">8.2 Processing Timeline</h3>
              <p className="text-muted-foreground">
                We will acknowledge your deletion request within 5 business days and complete the deletion within 30 days of verification. If we require additional time due to complexity, we will notify you of the delay and reason.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">8.3 Data We Will Delete</h3>
              <p className="text-muted-foreground mb-2">Upon a verified deletion request, we will delete:</p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Your account profile information (name, email, phone, avatar)</li>
                <li>Saved preferences and settings</li>
                <li>Marketing and communication preferences</li>
                <li>Session and authentication data</li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">8.4 Data We May Retain</h3>
              <p className="text-muted-foreground mb-2">Certain data may be retained for legal, regulatory, or legitimate business purposes:</p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li><strong>Booking records:</strong> Retained for 7 years for tax, accounting, and legal compliance</li>
                <li><strong>Payment transaction records:</strong> Retained as required by financial regulations</li>
                <li><strong>Communications related to disputes:</strong> Retained until resolution and applicable limitation periods expire</li>
                <li><strong>Data required for fraud prevention:</strong> May be retained to protect against fraudulent activity</li>
                <li><strong>Anonymized/aggregated data:</strong> May be retained for analytics as it cannot identify you</li>
              </ul>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">8.5 Third-Party Data Deletion</h3>
              <p className="text-muted-foreground">
                When you request deletion, we will also instruct relevant third-party service providers to delete your data where technically feasible. However, property management systems and accommodation providers may retain booking records independently as required by their own legal obligations.
              </p>

              <h3 className="text-lg font-medium text-foreground mt-4 mb-2">8.6 Consequences of Deletion</h3>
              <p className="text-muted-foreground mb-2">Please note that data deletion will result in:</p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-1">
                <li>Permanent closure of your account</li>
                <li>Loss of access to booking history and saved information</li>
                <li>Inability to recover deleted data</li>
                <li>Need to create a new account for future bookings</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">9. Cookies</h2>
              <p className="text-muted-foreground">
                We use cookies and similar tracking technologies to enhance your experience, analyze site traffic, and for marketing purposes. You can control cookie settings through your browser preferences.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">10. Third-Party Services</h2>
              <p className="text-muted-foreground">
                Our platform may integrate with third-party services including property management systems (such as NightsBridge, Checkfront, Benson, and SiteMinder), payment gateways, and mapping services. These services have their own privacy policies, and we encourage you to review them.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">11. Children's Privacy</h2>
              <p className="text-muted-foreground">
                Our services are not intended for individuals under 18 years of age. We do not knowingly collect personal information from children.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">12. Changes to This Policy</h2>
              <p className="text-muted-foreground">
                We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the "Last updated" date.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-4">13. Contact Us</h2>
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

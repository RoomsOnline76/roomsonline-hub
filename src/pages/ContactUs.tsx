import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { Mail, Phone, MapPin, Send, CheckCircle, Loader2, Clock, ShieldCheck } from "lucide-react";
import { useRecaptcha } from "@/hooks/useRecaptcha";
import { RecaptchaOverlay } from "@/components/RecaptchaOverlay";

const contactSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
  email: z.string().trim().email("Invalid email address").max(255, "Email must be less than 255 characters"),
  message: z.string().trim().min(1, "Message is required").max(2000, "Message must be less than 2000 characters"),
});

const ContactUs = () => {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string; message?: string; recaptcha?: string }>({});
  
  // reCAPTCHA v3 integration
  const recaptcha = useRecaptcha("contact_form");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const result = contactSchema.safeParse({ name, email, message });
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    // Verify reCAPTCHA before submission
    if (!recaptcha.isVerified) {
      const verified = await recaptcha.verify();
      if (!verified) {
        setErrors({ recaptcha: "Human verification failed. Please try again." });
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke("send-contact-email", {
        body: {
          name: result.data.name,
          email: result.data.email,
          message: result.data.message,
          honeypot,
          recaptchaToken: recaptcha.token,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setShowSuccessModal(true);
      setName("");
      setEmail("");
      setMessage("");
      recaptcha.reset();
    } catch (error: any) {
      console.error("Error sending message:", error);
      setErrors({ message: error.message || "Failed to send message. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PublicLayout backLabel="Back to Home" backTo="/">
      <div className="container mx-auto px-4 sm:px-6 py-16 sm:py-20">
        {/* Page title */}
        <div className="max-w-3xl mx-auto text-center mb-12">
          <h1 className="font-display text-3xl sm:text-4xl font-light tracking-tight leading-tight text-foreground mb-4">
            Get in Touch
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed">We would love to hear from you</p>
        </div>

        <div className="max-w-4xl mx-auto grid gap-12 lg:grid-cols-5">
          {/* Contact info */}
          <div className="lg:col-span-2 space-y-8">
            <div>
              <h2 className="font-sans text-xl font-medium tracking-tight leading-tight text-foreground mb-6">
                Contact Information
              </h2>
              <div className="space-y-5">
                <div className="flex items-start gap-4">
                  <div className="bg-primary/5 rounded-full p-2.5">
                    <Mail className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Email</p>
                    <a
                      href="mailto:info@roomsonline.co.za"
                      className="text-foreground hover:text-primary transition-colors duration-200"
                    >
                      info@roomsonline.co.za
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="bg-primary/5 rounded-full p-2.5">
                    <Phone className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Phone</p>
                    <a
                      href="tel:+27214180022"
                      className="text-foreground hover:text-primary transition-colors duration-200"
                    >
                      +27 82 323 8115
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="bg-primary/5 rounded-full p-2.5">
                    <MapPin className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Address</p>
                    <p className="text-foreground">Cape Town, South Africa</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 rounded-lg bg-card border border-border">
              <div className="flex items-center gap-3 mb-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <h3 className="font-medium text-foreground">Office Hours</h3>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">Monday – Friday: 9:00 AM – 5:00 PM (SAST)</p>
              <p className="text-sm text-muted-foreground leading-relaxed mt-1">Saturday – Sunday: Closed</p>
            </div>
          </div>

          {/* Contact form */}
          <div className="lg:col-span-3">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="p-6 sm:p-8 rounded-lg bg-card border border-border">
                <h2 className="font-sans text-xl font-medium tracking-tight leading-tight text-foreground mb-6">
                  Send a Message
                </h2>

                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm text-foreground">
                      Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={`h-12 ${errors.name ? "border-destructive" : ""}`}
                      placeholder="Your name"
                    />
                    {errors.name && <p className="text-sm text-destructive">{errors.name}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm text-foreground">
                      Email <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={`h-12 ${errors.email ? "border-destructive" : ""}`}
                      placeholder="you@example.com"
                    />
                    {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message" className="text-sm text-foreground">
                      Message <span className="text-destructive">*</span>
                    </Label>
                    <Textarea
                      id="message"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      rows={5}
                      className={`resize-none ${errors.message ? "border-destructive" : ""}`}
                      placeholder="Tell us more..."
                    />
                    {errors.message && <p className="text-sm text-destructive">{errors.message}</p>}
                  </div>

                  {/* Honeypot */}
                  <input
                    type="text"
                    name="website"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                    className="absolute opacity-0 pointer-events-none"
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                  />

                  {/* reCAPTCHA status indicator */}
                  <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg border border-border">
                    <ShieldCheck className={`h-5 w-5 ${recaptcha.isReady ? 'text-status-healthy' : 'text-muted-foreground'}`} />
                    <span className="text-sm text-muted-foreground">
                      {recaptcha.isVerifying ? "Verifying..." : 
                       recaptcha.isVerified ? "Verified" : 
                       "Protected by reCAPTCHA"}
                    </span>
                  </div>
                  {errors.recaptcha && <p className="text-sm text-destructive">{errors.recaptcha}</p>}
                </div>

                <Button type="submit" disabled={isSubmitting} size="lg" className="w-full mt-6 gap-2 h-12">
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Send Message
                    </>
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* Success Modal */}
      <Dialog
        open={showSuccessModal}
        onOpenChange={(open) => {
          setShowSuccessModal(open);
          if (!open) navigate("/");
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-status-healthy/10 flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-status-healthy" />
            </div>
            <DialogTitle className="font-display text-xl font-light tracking-tight">Message Sent</DialogTitle>
            <DialogDescription className="text-muted-foreground pt-4 space-y-3 leading-relaxed">
              <p>Thank you for reaching out.</p>
              <p>
                Your message has been received and is with the RoomsOnline team. We read every enquiry properly and will
                get back to you as soon as we can—usually within one business day.
              </p>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center pt-4">
            <Button
              onClick={() => {
                setShowSuccessModal(false);
                navigate("/");
              }}
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PublicLayout>
  );
};

export default ContactUs;

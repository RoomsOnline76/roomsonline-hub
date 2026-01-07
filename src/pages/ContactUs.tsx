import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { Mail, Phone, MapPin, Send, CheckCircle, Loader2 } from "lucide-react";

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
  const [captchaChecked, setCaptchaChecked] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; email?: string; message?: string; captcha?: string }>({});

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    if (!captchaChecked) {
      setErrors({ captcha: "Please confirm you are not a robot" });
      return;
    }

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

    setIsSubmitting(true);

    try {
      const { error } = await supabase.functions.invoke("send-contact-email", {
        body: {
          name: result.data.name,
          email: result.data.email,
          message: result.data.message,
          honeypot,
        },
      });

      if (error) throw error;

      setShowSuccessModal(true);
      setName("");
      setEmail("");
      setMessage("");
      setCaptchaChecked(false);
    } catch (error) {
      console.error("Error sending message:", error);
      setErrors({ message: "Failed to send message. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PublicLayout backLabel="Back to Home" backTo="/">
      <div className="container mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* Page title */}
        <div className="max-w-3xl mx-auto text-center mb-12 sm:mb-16">
          <h1 className="font-display text-3xl sm:text-4xl font-light text-foreground mb-4">
            Get in Touch
          </h1>
          <p className="text-muted-foreground text-lg">
            We would love to hear from you
          </p>
        </div>

        <div className="max-w-4xl mx-auto grid gap-12 lg:grid-cols-5">
          {/* Contact info */}
          <div className="lg:col-span-2 space-y-8">
            <div>
              <h2 className="font-display text-xl font-light text-foreground mb-6">
                Contact Information
              </h2>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    <a
                      href="mailto:info@roomsonline.co.za"
                      className="text-foreground hover:text-primary transition-colors"
                    >
                      info@roomsonline.co.za
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Phone</p>
                    <a
                      href="tel:+27214180022"
                      className="text-foreground hover:text-primary transition-colors"
                    >
                      +27 21 418 0022
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Address</p>
                    <p className="text-foreground">
                      Cape Town, South Africa
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 rounded-lg bg-muted/30 border border-border/50">
              <h3 className="font-medium text-foreground mb-2">Office Hours</h3>
              <p className="text-sm text-muted-foreground">
                Monday – Friday: 9:00 AM – 5:00 PM (SAST)
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Saturday – Sunday: Closed
              </p>
            </div>
          </div>

          {/* Contact form */}
          <div className="lg:col-span-3">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="p-6 sm:p-8 rounded-lg bg-card border border-border shadow-sm">
                <h2 className="font-display text-xl font-light text-foreground mb-6">
                  Send a Message
                </h2>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name" className="text-sm text-foreground">
                      Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={errors.name ? "border-destructive" : ""}
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
                      className={errors.email ? "border-destructive" : ""}
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

                  <div className="flex items-center gap-3 p-4 bg-muted/30 rounded-lg border border-border/50">
                    <Checkbox
                      id="captcha"
                      checked={captchaChecked}
                      onCheckedChange={(checked) => setCaptchaChecked(checked === true)}
                    />
                    <Label
                      htmlFor="captcha"
                      className="text-sm text-muted-foreground cursor-pointer"
                    >
                      I am not a robot
                    </Label>
                  </div>
                  {errors.captcha && <p className="text-sm text-destructive">{errors.captcha}</p>}
                </div>

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full mt-6 gap-2"
                >
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
      <Dialog open={showSuccessModal} onOpenChange={(open) => {
        setShowSuccessModal(open);
        if (!open) navigate("/");
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-status-healthy/10 flex items-center justify-center">
              <CheckCircle className="h-6 w-6 text-status-healthy" />
            </div>
            <DialogTitle className="font-display text-xl font-light">
              Message Sent
            </DialogTitle>
            <DialogDescription className="text-muted-foreground pt-4 space-y-3">
              <p>Thank you for reaching out.</p>
              <p>Your message has been received and is with the RoomsOnline team. We read every enquiry properly and will get back to you as soon as we can—usually within one business day.</p>
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center pt-4">
            <Button onClick={() => {
              setShowSuccessModal(false);
              navigate("/");
            }}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PublicLayout>
  );
};

export default ContactUs;

import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle, Loader2, ChevronRight, ChevronLeft } from "lucide-react";
import rolLogo from "@/assets/rol-logo.png";

// Survey schema
const surveySchema = z.object({
  // Section 1: Business & Core Goals
  businessName: z.string().min(1, "Business name is required").max(200),
  contactDetails: z.string().min(1, "Contact details are required").max(500),
  clientEmail: z.string().email("Valid email is required"),
  businessDescription: z.string().min(1, "Please describe your business").max(2000),
  eventDetails: z.string().max(2000).optional(),
  primaryGoal: z.string().min(1, "Primary goal is required").max(500),

  // Section 2: Audience & Rivals
  targetAudience: z.string().min(1, "Target audience is required").max(1000),
  inspirationLinks: z.string().max(2000).optional(),
  competitors: z.string().max(500).optional(),

  // Section 3: Features & Functionality
  paymentTypes: z.array(z.string()),
  paymentFlowDescription: z.string().max(1000).optional(),
  userAccountFeatures: z.array(z.string()),
  liveChatPurpose: z.string().optional(),
  blogManagement: z.string().optional(),
  criticalFeatures: z.array(z.string()),

  // Section 4: Design & Technical
  brandAssets: z.array(z.string()),
  designWords: z.string().max(200).optional(),
  contentProvider: z.string().max(1000).optional(),
  domainOwned: z.string(),
  domainName: z.string().max(100).optional(),
  hostingOwned: z.string(),
  hostingProvider: z.string().max(100).optional(),

  // Section 5: Timeline & Budget
  launchDate: z.string().min(1, "Launch date is required").max(100),
  priorityDesign: z.number().min(1).max(5),
  priorityPayment: z.number().min(1).max(5),
  priorityFeatures: z.number().min(1).max(5),
  prioritySpeed: z.number().min(1).max(5),
  priorityEaseOfUse: z.number().min(1).max(5),
  phasedApproach: z.string(),
  maintenancePreference: z.string().optional(),
  finalNotes: z.string().max(2000).optional(),
});

type SurveyFormData = z.infer<typeof surveySchema>;

const PAYMENT_TYPE_OPTIONS = [
  { value: "event_tickets", label: "Event Tickets" },
  { value: "products", label: "Digital/Physical Products" },
  { value: "donations", label: "Donations" },
  { value: "membership", label: "Membership/Subscription" },
];

const USER_ACCOUNT_OPTIONS = [
  { value: "view_tickets", label: "View/Download past tickets/invoices" },
  { value: "manage_profile", label: "Manage their profile (name, email)" },
  { value: "exclusive_content", label: "Access exclusive content after registering" },
  { value: "submit_forms", label: "Submit/save forms" },
];

const BRAND_ASSET_OPTIONS = [
  { value: "logo", label: "Logo" },
  { value: "colors", label: "Brand Colour Palette" },
  { value: "fonts", label: "Specific Fonts" },
  { value: "style_guide", label: "Style Guide" },
  { value: "none", label: "None, we need guidance" },
];

const CRITICAL_FEATURE_OPTIONS = [
  { value: "contact_forms", label: "Contact/Registration Forms" },
  { value: "newsletter", label: "Email Newsletter Signup Integration" },
  { value: "event_schedule", label: "Detailed Event Schedule / Agenda" },
  { value: "speaker_profiles", label: "Speaker or Presenter Profiles" },
  { value: "gallery", label: "Photo/Video Gallery" },
  { value: "faq", label: "FAQ Section" },
  { value: "social_feeds", label: "Social Media Feeds (Facebook/Instagram)" },
  { value: "seo", label: "SEO Optimization" },
  { value: "popia_gdpr", label: "POPIA/GDPR Compliance Tools (Privacy Policy, Cookie Consent)" },
];

const SECTIONS = [
  { id: 1, title: "Your Business & Core Goals", description: "Tell us about your business" },
  { id: 2, title: "Audience & Rivals", description: "Understanding your market" },
  { id: 3, title: "Features & Functionality", description: "What should your website do?" },
  { id: 4, title: "Design & Technical", description: "Branding and technical setup" },
  { id: 5, title: "Timeline & Budget", description: "Practicalities and priorities" },
];

export default function ProjectDiscoverySurvey() {
  const [currentSection, setCurrentSection] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const form = useForm<SurveyFormData>({
    resolver: zodResolver(surveySchema),
    defaultValues: {
      businessName: "",
      contactDetails: "",
      clientEmail: "",
      businessDescription: "",
      eventDetails: "",
      primaryGoal: "",
      targetAudience: "",
      inspirationLinks: "",
      competitors: "",
      paymentTypes: [],
      paymentFlowDescription: "",
      userAccountFeatures: [],
      liveChatPurpose: "",
      blogManagement: "",
      criticalFeatures: [],
      brandAssets: [],
      designWords: "",
      contentProvider: "",
      domainOwned: "",
      domainName: "",
      hostingOwned: "",
      hostingProvider: "",
      launchDate: "",
      priorityDesign: 3,
      priorityPayment: 3,
      priorityFeatures: 3,
      prioritySpeed: 3,
      priorityEaseOfUse: 3,
      phasedApproach: "",
      maintenancePreference: "",
      finalNotes: "",
    },
  });

  const onSubmit = async (data: SurveyFormData) => {
    setIsSubmitting(true);
    try {
      // Store in database
      const { error: dbError } = await supabase.from("survey_responses").insert({
        client_email: data.clientEmail,
        business_name: data.businessName,
        contact_details: data.contactDetails,
        response_data: data,
      });

      if (dbError) {
        console.error("Database error:", dbError);
      }

      // Send email report
      const { error: emailError } = await supabase.functions.invoke("send-survey-report", {
        body: data,
      });

      if (emailError) {
        throw emailError;
      }

      setIsSubmitted(true);
      toast.success("Survey submitted successfully!");
    } catch (error) {
      console.error("Submission error:", error);
      toast.error("Failed to submit survey. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const nextSection = () => {
    if (currentSection < 5) setCurrentSection(currentSection + 1);
  };

  const prevSection = () => {
    if (currentSection > 1) setCurrentSection(currentSection - 1);
  };

  const progressPercentage = (currentSection / 5) * 100;

  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 flex items-center justify-center p-4">
        <Card className="max-w-lg w-full text-center">
          <CardHeader>
            <div className="mx-auto mb-4 w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-green-600" />
            </div>
            <CardTitle className="text-2xl">Thank You!</CardTitle>
            <CardDescription className="text-base">
              Your project discovery questionnaire has been submitted successfully.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-muted-foreground">
              A copy of your responses has been sent to your email address.
            </p>
            <p className="text-muted-foreground">
              We will carefully review your answers and get back to you with a tailored proposal and quote within <strong>2 business days</strong>.
            </p>
            <p className="text-sm text-muted-foreground mt-6">
              We're excited about the possibility of helping your business grow!
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-center">
          <img src={rolLogo} alt="RoomsOnline" className="h-10" />
        </div>
      </header>

      {/* Progress bar */}
      <div className="sticky top-[65px] z-40 bg-background border-b">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            {SECTIONS.map((section) => (
              <button
                key={section.id}
                onClick={() => setCurrentSection(section.id)}
                className={`flex-1 text-xs font-medium transition-colors ${
                  section.id === currentSection
                    ? "text-primary"
                    : section.id < currentSection
                    ? "text-muted-foreground"
                    : "text-muted-foreground/50"
                }`}
              >
                <span className="hidden sm:inline">{section.title}</span>
                <span className="sm:hidden">Step {section.id}</span>
              </button>
            ))}
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Form */}
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Introduction - only on first section */}
        {currentSection === 1 && (
          <Card className="mb-8 bg-primary/5 border-primary/20">
            <CardContent className="pt-6">
              <h1 className="text-2xl font-semibold mb-4">Website Project Discovery Questionnaire</h1>
              <p className="text-muted-foreground mb-4">
                Thank you for reaching out! To ensure we propose the perfect website solution for your goals and budget, we need to understand your vision a little better.
              </p>
              <p className="text-muted-foreground mb-4">
                This questionnaire is the first step. Your detailed answers will allow us to provide a clear, accurate, and fair quote with no surprises.
              </p>
              <p className="text-muted-foreground">
                <strong>Estimated time:</strong> 10-15 minutes
              </p>
            </CardContent>
          </Card>
        )}

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            {/* Section 1: Business & Core Goals */}
            {currentSection === 1 && (
              <Card>
                <CardHeader>
                  <CardTitle>Your Business & Core Goals</CardTitle>
                  <CardDescription>Tell us about your business and what you want to achieve</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="businessName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Business/Organization Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="Your business name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="contactDetails"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Your Name, Role & Best Contact Number *</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. John Smith, Marketing Manager, 082 123 4567" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="clientEmail"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Your Email Address *</FormLabel>
                        <FormDescription>We'll send a copy of your responses to this email</FormDescription>
                        <FormControl>
                          <Input type="email" placeholder="your@email.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="businessDescription"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Describe your business and the specific services you offer *</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Tell us about your business in your own words..."
                            className="min-h-[120px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="eventDetails"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>If this is for an event, tell us more</FormLabel>
                        <FormDescription>What is the name and nature of the event? Key dates?</FormDescription>
                        <FormControl>
                          <Textarea
                            placeholder="e.g. Annual Tech Conference, registration opens August 1st, event date October 15th..."
                            className="min-h-[100px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="primaryGoal"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>What is the single most important thing this website must achieve? *</FormLabel>
                        <FormDescription>In one sentence, what's your primary goal?</FormDescription>
                        <FormControl>
                          <Input placeholder="e.g. Sell 100 event tickets by October" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            )}

            {/* Section 2: Audience & Rivals */}
            {currentSection === 2 && (
              <Card>
                <CardHeader>
                  <CardTitle>Understanding Your Audience & Rivals</CardTitle>
                  <CardDescription>Help us understand who you're targeting</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="targetAudience"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Who is your primary target audience? *</FormLabel>
                        <FormDescription>Be as specific as possible</FormDescription>
                        <FormControl>
                          <Textarea
                            placeholder="e.g. Small business owners in Johannesburg aged 30-50, or Marketing managers in the tech industry"
                            className="min-h-[100px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="inspirationLinks"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Inspiration & Benchmarks</FormLabel>
                        <FormDescription>
                          Share links to 2-3 websites you like and note what you like about them
                        </FormDescription>
                        <FormControl>
                          <Textarea
                            placeholder="e.g. www.example.com - love the clean design, the booking process is so easy..."
                            className="min-h-[100px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="competitors"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Direct Competitors</FormLabel>
                        <FormDescription>Any competitors whose online presence we should be aware of?</FormDescription>
                        <FormControl>
                          <Input placeholder="e.g. competitor1.com, competitor2.co.za" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            )}

            {/* Section 3: Features & Functionality */}
            {currentSection === 3 && (
              <Card>
                <CardHeader>
                  <CardTitle>Website Features & Functionality</CardTitle>
                  <CardDescription>What should your website be able to do?</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="paymentTypes"
                    render={() => (
                      <FormItem>
                        <FormLabel>Payment Gateway - What will people be paying for?</FormLabel>
                        <div className="grid grid-cols-2 gap-3 mt-2">
                          {PAYMENT_TYPE_OPTIONS.map((option) => (
                            <FormField
                              key={option.value}
                              control={form.control}
                              name="paymentTypes"
                              render={({ field }) => (
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(option.value)}
                                      onCheckedChange={(checked) => {
                                        const newValue = checked
                                          ? [...field.value, option.value]
                                          : field.value.filter((v) => v !== option.value);
                                        field.onChange(newValue);
                                      }}
                                    />
                                  </FormControl>
                                  <Label className="text-sm font-normal cursor-pointer">{option.label}</Label>
                                </FormItem>
                              )}
                            />
                          ))}
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="paymentFlowDescription"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Describe the payment flow</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Early bird vs. standard tickets with discount codes" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="userAccountFeatures"
                    render={() => (
                      <FormItem>
                        <FormLabel>User Accounts - What should users be able to do?</FormLabel>
                        <div className="grid grid-cols-1 gap-3 mt-2">
                          {USER_ACCOUNT_OPTIONS.map((option) => (
                            <FormField
                              key={option.value}
                              control={form.control}
                              name="userAccountFeatures"
                              render={({ field }) => (
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(option.value)}
                                      onCheckedChange={(checked) => {
                                        const newValue = checked
                                          ? [...field.value, option.value]
                                          : field.value.filter((v) => v !== option.value);
                                        field.onChange(newValue);
                                      }}
                                    />
                                  </FormControl>
                                  <Label className="text-sm font-normal cursor-pointer">{option.label}</Label>
                                </FormItem>
                              )}
                            />
                          ))}
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="liveChatPurpose"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Live Chat - What is the main purpose?</FormLabel>
                        <FormControl>
                          <RadioGroup onValueChange={field.onChange} value={field.value}>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="presales" id="chat-presales" />
                              <Label htmlFor="chat-presales" className="font-normal">Pre-sales questions for attendees</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="support" id="chat-support" />
                              <Label htmlFor="chat-support" className="font-normal">Customer support for your services</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="faq_bot" id="chat-faq" />
                              <Label htmlFor="chat-faq" className="font-normal">Automated FAQ bot to reduce emails</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="not_sure" id="chat-unsure" />
                              <Label htmlFor="chat-unsure" className="font-normal">Not sure yet</Label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="blogManagement"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Blog / News Section - Who will manage it?</FormLabel>
                        <FormControl>
                          <RadioGroup onValueChange={field.onChange} value={field.value}>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="in_house" id="blog-inhouse" />
                              <Label htmlFor="blog-inhouse" className="font-normal">We will, in-house</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="you_write" id="blog-you" />
                              <Label htmlFor="blog-you" className="font-normal">We'd need you to write them</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="not_needed" id="blog-none" />
                              <Label htmlFor="blog-none" className="font-normal">Not needed initially</Label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="criticalFeatures"
                    render={() => (
                      <FormItem>
                        <FormLabel>Other Critical Features (select all that apply)</FormLabel>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                          {CRITICAL_FEATURE_OPTIONS.map((option) => (
                            <FormField
                              key={option.value}
                              control={form.control}
                              name="criticalFeatures"
                              render={({ field }) => (
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(option.value)}
                                      onCheckedChange={(checked) => {
                                        const newValue = checked
                                          ? [...field.value, option.value]
                                          : field.value.filter((v) => v !== option.value);
                                        field.onChange(newValue);
                                      }}
                                    />
                                  </FormControl>
                                  <Label className="text-sm font-normal cursor-pointer">{option.label}</Label>
                                </FormItem>
                              )}
                            />
                          ))}
                        </div>
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            )}

            {/* Section 4: Design & Technical */}
            {currentSection === 4 && (
              <Card>
                <CardHeader>
                  <CardTitle>Design, Content & Technical Setup</CardTitle>
                  <CardDescription>Branding and technical requirements</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="brandAssets"
                    render={() => (
                      <FormItem>
                        <FormLabel>Branding - Do you have existing brand assets?</FormLabel>
                        <div className="grid grid-cols-2 gap-3 mt-2">
                          {BRAND_ASSET_OPTIONS.map((option) => (
                            <FormField
                              key={option.value}
                              control={form.control}
                              name="brandAssets"
                              render={({ field }) => (
                                <FormItem className="flex items-center space-x-2 space-y-0">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(option.value)}
                                      onCheckedChange={(checked) => {
                                        const newValue = checked
                                          ? [...field.value, option.value]
                                          : field.value.filter((v) => v !== option.value);
                                        field.onChange(newValue);
                                      }}
                                    />
                                  </FormControl>
                                  <Label className="text-sm font-normal cursor-pointer">{option.label}</Label>
                                </FormItem>
                              )}
                            />
                          ))}
                        </div>
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="designWords"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>What words describe the feeling you want the website to convey?</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g. Professional & Trustworthy, Vibrant & Energetic, Simple & Minimal" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="contentProvider"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Content - Who will provide the website's text and images?</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="e.g. We have some photos and will draft text, or We need you to handle all content creation"
                            className="min-h-[80px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="domainOwned"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Do you already own a domain name?</FormLabel>
                        <FormControl>
                          <RadioGroup onValueChange={field.onChange} value={field.value}>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="yes" id="domain-yes" />
                              <Label htmlFor="domain-yes" className="font-normal">Yes</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="no" id="domain-no" />
                              <Label htmlFor="domain-no" className="font-normal">No, we need to register one</Label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {form.watch("domainOwned") === "yes" && (
                    <FormField
                      control={form.control}
                      name="domainName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Domain Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. www.yourbusiness.co.za" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={form.control}
                    name="hostingOwned"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Do you have web hosting?</FormLabel>
                        <FormControl>
                          <RadioGroup onValueChange={field.onChange} value={field.value}>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="yes" id="hosting-yes" />
                              <Label htmlFor="hosting-yes" className="font-normal">Yes</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="no" id="hosting-no" />
                              <Label htmlFor="hosting-no" className="font-normal">No, we need a recommendation/setup</Label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {form.watch("hostingOwned") === "yes" && (
                    <FormField
                      control={form.control}
                      name="hostingProvider"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Hosting Provider</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Xneelo, Afrihost, etc." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </CardContent>
              </Card>
            )}

            {/* Section 5: Timeline & Budget */}
            {currentSection === 5 && (
              <Card>
                <CardHeader>
                  <CardTitle>Practicalities, Timeline & Budget</CardTitle>
                  <CardDescription>Help us understand your priorities and constraints</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FormField
                    control={form.control}
                    name="launchDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>What is your must-launch-by date? *</FormLabel>
                        <FormDescription>If ASAP, please give a specific target week/month</FormDescription>
                        <FormControl>
                          <Input placeholder="e.g. October 1st, 2025" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="space-y-4">
                    <Label>Priority Ranking (1 = Least important, 5 = Most important)</Label>
                    <p className="text-sm text-muted-foreground">
                      Rate each of these priorities from 1-5:
                    </p>

                    {[
                      { name: "priorityDesign" as const, label: "A stunning, custom design that wows visitors" },
                      { name: "priorityPayment" as const, label: "Rock-solid, reliable payment & registration functionality" },
                      { name: "priorityFeatures" as const, label: "Complex features (user accounts, live chat)" },
                      { name: "prioritySpeed" as const, label: "Fast turnaround time" },
                      { name: "priorityEaseOfUse" as const, label: "Ease of use for you to update later" },
                    ].map((priority) => (
                      <FormField
                        key={priority.name}
                        control={form.control}
                        name={priority.name}
                        render={({ field }) => (
                          <FormItem className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                            <FormLabel className="flex-1 font-normal">{priority.label}</FormLabel>
                            <FormControl>
                              <div className="flex gap-2">
                                {[1, 2, 3, 4, 5].map((num) => (
                                  <button
                                    key={num}
                                    type="button"
                                    onClick={() => field.onChange(num)}
                                    className={`w-10 h-10 rounded-full border-2 font-medium transition-colors ${
                                      field.value === num
                                        ? "bg-primary text-primary-foreground border-primary"
                                        : "border-muted-foreground/30 hover:border-primary/50"
                                    }`}
                                  >
                                    {num}
                                  </button>
                                ))}
                              </div>
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>

                  <FormField
                    control={form.control}
                    name="phasedApproach"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Are you open to a phased approach?</FormLabel>
                        <FormDescription>
                          e.g., Launch Phase 1 with core event registration now, add blogs/user accounts in Phase 2
                        </FormDescription>
                        <FormControl>
                          <RadioGroup onValueChange={field.onChange} value={field.value}>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="yes" id="phased-yes" />
                              <Label htmlFor="phased-yes" className="font-normal">Yes, that makes sense</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="no" id="phased-no" />
                              <Label htmlFor="phased-no" className="font-normal">No, we need everything at once</Label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="maintenancePreference"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>After the Launch - Who will manage the site?</FormLabel>
                        <FormControl>
                          <RadioGroup onValueChange={field.onChange} value={field.value}>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="self_managed" id="maint-self" />
                              <Label htmlFor="maint-self" className="font-normal">We will, with training</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="maintenance_plan" id="maint-plan" />
                              <Label htmlFor="maint-plan" className="font-normal">We'd prefer a monthly maintenance plan from you</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="undecided" id="maint-undecided" />
                              <Label htmlFor="maint-undecided" className="font-normal">Undecided</Label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="finalNotes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Final Check</FormLabel>
                        <FormDescription>
                          Is there anything you're anxious about, unsure of, or haven't had a chance to mention yet?
                        </FormDescription>
                        <FormControl>
                          <Textarea
                            placeholder="Any additional thoughts or concerns..."
                            className="min-h-[100px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>
            )}

            {/* Navigation */}
            <div className="flex justify-between mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={prevSection}
                disabled={currentSection === 1}
              >
                <ChevronLeft className="w-4 h-4 mr-2" />
                Previous
              </Button>

              {currentSection < 5 ? (
                <Button type="button" onClick={nextSection}>
                  Next
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    "Submit Questionnaire"
                  )}
                </Button>
              )}
            </div>
          </form>
        </Form>

        {/* Footer */}
        <footer className="mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} RoomsOnline. All rights reserved.</p>
        </footer>
      </main>
    </div>
  );
}

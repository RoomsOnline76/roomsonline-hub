import { Suspense, ReactElement } from "react";
import { lazyRoute } from "@/lib/lazyWithRetry";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { CurrencyProvider } from "@/contexts/CurrencyContext";
import { MobileBookingProvider } from "@/contexts/MobileBookingContext";
import { ItineraryProvider } from "@/contexts/ItineraryContext";
import { BehavioralMemoryProvider } from "@/contexts/BehavioralMemoryContext";
import { RecaptchaProvider } from "@/components/RecaptchaProvider";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { GuestHostLanding } from "./components/GuestHostLanding";
import { isGuestBookingHost } from "./lib/guestDomain";

import { AdminRouteLayout } from "./components/layout/AdminRouteLayout";
import { DevRouteLayout } from "./components/layout/DevRouteLayout";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeProvider } from "@/components/ThemeProvider";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/react";
import { AuthProvider } from "@/hooks/useAuth";

// ─── Eager — critical path only (FCP) ────────────────────────────
import NotFound from "./pages/NotFound";
import UnderConstruction from "./pages/UnderConstruction";

// ─── Lazy — public pages ─────────────────────────────────────────
const Auth = lazyRoute(() => import("./pages/Auth"));
const PropertyShowcase = lazyRoute(() => import("./pages/PropertyShowcase"));
const RoomShowcase = lazyRoute(() => import("./pages/RoomShowcase"));
const RoomAvailability = lazyRoute(() => import("./pages/RoomAvailability"));
const Booking = lazyRoute(() => import("./pages/Booking"));
const BookingConfirmation = lazyRoute(() => import("./pages/BookingConfirmation"));
const PrivacyPolicy = lazyRoute(() => import("./pages/PrivacyPolicy"));
const TermsOfService = lazyRoute(() => import("./pages/TermsOfService"));
const AboutUs = lazyRoute(() => import("./pages/AboutUs"));
const ContactUs = lazyRoute(() => import("./pages/ContactUs"));
const PublicJournals = lazyRoute(() => import("./pages/PublicJournals"));
const PMSComparison = lazyRoute(() => import("./pages/PMSComparison"));
const AffiliateDisclosure = lazyRoute(() => import("./pages/AffiliateDisclosure"));
const PropertyListing = lazyRoute(() => import("./pages/PropertyListing"));
const EmbedProperty = lazyRoute(() => import("./pages/EmbedProperty"));
const EmbedPortfolio = lazyRoute(() => import("./pages/EmbedPortfolio"));
const StaffLogin = lazyRoute(() => import("./pages/StaffLogin"));
const ContractSign = lazyRoute(() => import("./pages/ContractSign"));
const PropertyOnboarding = lazyRoute(() => import("./pages/PropertyOnboarding"));
const GuestPortal = lazyRoute(() => import("./pages/GuestPortal"));
const GroupRoomingPortal = lazyRoute(() => import("./pages/GroupRoomingPortal"));
const SubscriptionPay = lazyRoute(() => import("./pages/SubscriptionPay"));
const PropertyInvoicePay = lazyRoute(() => import("./pages/PropertyInvoicePay"));
const BookingBalancePay = lazyRoute(() => import("./pages/BookingBalancePay"));
const BookingCreditChoice = lazyRoute(() => import("./pages/BookingCreditChoice"));

const RecaptchaBridge = lazyRoute(() => import("./pages/RecaptchaBridge"));

// ─── Lazy — admin pages ──────────────────────────────────────────
const PropertyOverview = lazyRoute(() => import("./pages/PropertyOverview"));
const Calendar = lazyRoute(() => import("./pages/Calendar"));
const CalendarAccommodation = lazyRoute(() => import("./pages/CalendarAccommodation"));
const CalendarEventWedding = lazyRoute(() => import("./pages/CalendarEventWedding"));
const CalendarConference = lazyRoute(() => import("./pages/CalendarConference"));
const Promotion = lazyRoute(() => import("./pages/Promotion"));
const Bookings = lazyRoute(() => import("./pages/Bookings"));
const PropertyForm = lazyRoute(() => import("./pages/PropertyForm"));
const BensonConfig = lazyRoute(() => import("./pages/BensonConfig"));
const PMSConfig = lazyRoute(() => import("./pages/PMSConfig"));
const TestBookingBenson = lazyRoute(() => import("./pages/TestBookingBenson"));
const NB = lazyRoute(() => import("./pages/NB"));
const AdminDashboard = lazyRoute(() => import("./pages/AdminDashboard"));
const AdminPayments = lazyRoute(() => import("./pages/AdminPayments"));
const OwnerAccount = lazyRoute(() => import("./pages/OwnerAccount"));

const AdminKeys = lazyRoute(() => import("./pages/AdminKeys"));
const AdminUsers = lazyRoute(() => import("./pages/AdminUsers"));
const AdminAccessRequests = lazyRoute(() => import("./pages/AdminAccessRequests"));
const AdminJournals = lazyRoute(() => import("./pages/AdminJournals"));
const JournalEditor = lazyRoute(() => import("./pages/JournalEditor"));
const AdminAudit = lazyRoute(() => import("./pages/AdminAudit"));
const AdminHelpArticles = lazyRoute(() => import("./pages/AdminHelpArticles"));
const HelpArticleEditor = lazyRoute(() => import("./pages/HelpArticleEditor"));
const AdminContracts = lazyRoute(() => import("./pages/AdminContracts"));
const AdminOnboarding = lazyRoute(() => import("./pages/AdminOnboarding"));
const ChannelOnboarding = lazyRoute(() => import("./pages/ChannelOnboarding"));
const AdminContractEditor = lazyRoute(() => import("./pages/AdminContractEditor"));
const AdminWizardEditor = lazyRoute(() => import("./pages/AdminWizardEditor"));
const AdminPreFlight = lazyRoute(() => import("./pages/AdminPreFlight"));
const AdminReviewQueue = lazyRoute(() => import("./pages/AdminReviewQueue"));
const AdminPortfolios = lazyRoute(() => import("./pages/admin/AdminPortfolios"));
const AdminBillingDefaults = lazyRoute(() => import("./pages/AdminBillingDefaults"));

const AdminSalesReps = lazyRoute(() => import("./pages/AdminSalesReps"));
const AdminCommissionReports = lazyRoute(() => import("./pages/AdminCommissionReports"));
const AdminIntegrations = lazyRoute(() => import("./pages/AdminIntegrations"));
const AdminChannelMonitor = lazyRoute(() => import("./pages/AdminChannelMonitor"));
const AdminChannelTrafficLive = lazyRoute(() => import("./pages/AdminChannelTrafficLive"));
const AdminApiConfigurator = lazyRoute(() => import("./pages/AdminApiConfigurator"));
const ApiDocsViewer = lazyRoute(() => import("./pages/ApiDocsViewer"));
const HyperGuestCertificationPortal = lazyRoute(() => import("./pages/HyperGuestCertificationPortal"));
const HyperGuestReflectionInspector = lazyRoute(() => import("./pages/HyperGuestReflectionInspector"));

// ─── Lazy — dashboard pages ─────────────────────────────────────
const Dashboard = lazyRoute(() => import("./pages/Dashboard"));
const ROLPulse = lazyRoute(() => import("./pages/ROLPulse"));
const Insights = lazyRoute(() => import("./pages/Insights"));
const PropertyProgress = lazyRoute(() => import("./pages/PropertyProgress"));

// ─── Lazy — journey pages ───────────────────────────────────────
const JourneyReview = lazyRoute(() => import("./pages/JourneyReview"));
const JourneyConfirmation = lazyRoute(() => import("./pages/JourneyConfirmation"));
const JourneyCheckout = lazyRoute(() => import("./pages/JourneyCheckout"));
const ItineraryBuilder = lazyRoute(() => import("./pages/ItineraryBuilder"));

// ─── Lazy — dev pages ───────────────────────────────────────────
const DevSystemHealth = lazyRoute(() => import("./pages/DevSystemHealth"));
const DevRuSyncPipelines = lazyRoute(() => import("./pages/DevRuSyncPipelines"));
const DevPMS = lazyRoute(() => import("./pages/DevPMS"));
const DevFeatures = lazyRoute(() => import("./pages/DevFeatures"));
const DevTesting = lazyRoute(() => import("./pages/DevTesting"));
const DevTaskTracker = lazyRoute(() => import("./pages/DevTaskTracker"));

// ─── Lazy — Connect portal pages ────────────────────────────────
const ConnectHome = lazyRoute(() => import("./pages/connect/ConnectHome"));
const ConnectFeatures = lazyRoute(() => import("./pages/connect/ConnectFeatures"));
const ConnectIntegrations = lazyRoute(() => import("./pages/connect/ConnectIntegrations"));
const ConnectHubSpot = lazyRoute(() => import("./pages/connect/ConnectHubSpot"));
const ConnectPricing = lazyRoute(() => import("./pages/connect/ConnectPricing"));
const ConnectDocs = lazyRoute(() => import("./pages/connect/ConnectDocs"));
const ConnectQuickstart = lazyRoute(() => import("./pages/connect/ConnectQuickstart"));
const ConnectWordPress = lazyRoute(() => import("./pages/connect/ConnectWordPress"));
const ConnectFAQ = lazyRoute(() => import("./pages/connect/ConnectFAQ"));
const ConnectGetStarted = lazyRoute(() => import("./pages/connect/ConnectGetStarted"));
const ConnectPrivacyPolicy = lazyRoute(() => import("./pages/connect/ConnectPrivacyPolicy"));
const ConnectTermsOfService = lazyRoute(() => import("./pages/connect/ConnectTermsOfService"));
const ConnectAbout = lazyRoute(() => import("./pages/connect/ConnectAbout"));
const ConnectJournal = lazyRoute(() => import("./pages/connect/ConnectJournal"));

// ─── Lazy — PMS pages ───────────────────────────────────────────
const PMSDashboard = lazyRoute(() => import("./pages/pms/PMSDashboard"));
const PMSRooms = lazyRoute(() => import("./pages/pms/PMSRooms"));
const PMSRoomTypes = lazyRoute(() => import("./pages/pms/PMSRoomTypes"));
const PMSRatePlans = lazyRoute(() => import("./pages/pms/PMSRatePlans"));
const PMSGuests = lazyRoute(() => import("./pages/pms/PMSGuests"));
const PMSInquiries = lazyRoute(() => import("./pages/pms/PMSInquiries"));
const PMSCrm = lazyRoute(() => import("./pages/pms/PMSCrm"));
const GuestCheckIn = lazyRoute(() => import("./pages/GuestCheckIn"));
const GuestFeedback = lazyRoute(() => import("./pages/GuestFeedback"));
const PMSHousekeeping = lazyRoute(() => import("./pages/pms/PMSHousekeeping"));
const PMSReports = lazyRoute(() => import("./pages/pms/PMSReports"));
const PMSBranding = lazyRoute(() => import("./pages/pms/PMSBranding"));
const PMSIntegrations = lazyRoute(() => import("./pages/pms/PMSIntegrations"));
const PMSStaff = lazyRoute(() => import("./pages/pms/PMSStaff"));
const PMSChannels = lazyRoute(() => import("./pages/pms/PMSChannels"));
const PMSGroups = lazyRoute(() => import("./pages/pms/PMSGroups"));
const PMSEvents = lazyRoute(() => import("./pages/pms/PMSEvents"));
const PMSNightAudit = lazyRoute(() => import("./pages/pms/PMSNightAudit"));
const PMSMessaging = lazyRoute(() => import("./pages/pms/PMSMessaging"));
const PMSPortfolio = lazyRoute(() => import("./pages/pms/PMSPortfolio"));
const PMSRevenue = lazyRoute(() => import("./pages/pms/PMSRevenue"));
const PMSCommandCentre = lazyRoute(() => import("./pages/pms/PMSCommandCentre"));
const PMSPropertySetup = lazyRoute(() => import("./pages/pms/PMSPropertySetup"));
const PMSPriceLabs = lazyRoute(() => import("./pages/pms/PMSPriceLabs"));
const ProjectDiscoverySurvey = lazyRoute(() => import("./pages/ProjectDiscoverySurvey"));

import { PMSShell } from "./components/layout/PMSShell";
import { ConnectLayout } from "./components/layout/ConnectLayout";
import { ReportsLayout } from "./components/layout/ReportsLayout";
import { isConnectDomain, isReportsDomain } from "./lib/config";

const ReportsDashboard = lazyRoute(() => import("./pages/reports/ReportsDashboard"));
const ReportsNewRun = lazyRoute(() => import("./pages/reports/ReportsNewRun"));
const ReportsRunReview = lazyRoute(() => import("./pages/reports/ReportsRunReview"));
const ReportsDraftView = lazyRoute(() => import("./pages/reports/ReportsDraftView"));
const ReportsPropertySettings = lazyRoute(() => import("./pages/reports/ReportsPropertySettings"));
const ReportsSettings = lazyRoute(() => import("./pages/reports/ReportsSettings"));

const ReportsHelp = lazyRoute(() => import("./pages/reports/ReportsHelp"));


// ─── Shared Connect portal child routes (used in two mounts) ────
function connectChildRoutes(): ReactElement[] {
  return [
    <Route key="idx" index element={<ConnectHome />} />,
    <Route key="feat" path="features" element={<ConnectFeatures />} />,
    <Route key="integ" path="integrations" element={<ConnectIntegrations />} />,
    <Route key="hubspot" path="integrations/hubspot" element={<ConnectHubSpot />} />,
    <Route key="hubspot-alias" path="hubspot" element={<ConnectHubSpot />} />,
    <Route key="price" path="pricing" element={<ConnectPricing />} />,
    <Route key="docs" path="docs" element={<ConnectDocs />} />,
    <Route key="qs" path="docs/quickstart" element={<ConnectQuickstart />} />,
    <Route key="wp" path="docs/wordpress" element={<ConnectWordPress />} />,
    <Route key="wh" path="docs/webhooks" element={<ConnectDocs />} />,
    <Route key="faq" path="faq" element={<ConnectFAQ />} />,
    <Route key="gs" path="get-started" element={<ConnectGetStarted />} />,
    <Route key="pp" path="privacy-policy" element={<ConnectPrivacyPolicy />} />,
    <Route key="tos" path="terms-of-service" element={<ConnectTermsOfService />} />,
    <Route key="about" path="about" element={<ConnectAbout />} />,
    <Route key="journal" path="journal" element={<ConnectJournal />} />,
  ];
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
const isSurveyDomain = window.location.hostname === "survey.roomsonline.co.za";
const isBookDomain = window.location.hostname === "book.sleepinafrica.roomsonline.co.za";

// Exception allowlist: Jongensfontein portfolio + its properties render normally
// on book.sleepinafrica.roomsonline.co.za, bypassing the UnderConstruction page.
const JONGENSFONTEIN_PORTFOLIO_SLUG = "jongensfontein";
const JONGENSFONTEIN_PROPERTY_SLUGS = new Set([
  "dassiesingel-self-catering-units",
  "fonteinhutte-self-catering-chalets",
  "seesig-self-catering-chalets",
  "tidal-pools-self-catering-apartments",
]);

const isBookDomainAllowedPath = (): boolean => {
  if (!isBookDomain) return false;
  const path = window.location.pathname.toLowerCase();
  // Portfolio pages (any route referencing the portfolio slug)
  if (path.includes(`/portfolio/${JONGENSFONTEIN_PORTFOLIO_SLUG}`)) return true;
  if (path.includes(`/${JONGENSFONTEIN_PORTFOLIO_SLUG}`)) return true;
  // Post-payment / share / bookmark landing pages (bookingId is a UUID, not a slug)
  if (path.startsWith("/booking-confirmation/")) return true;
  if (path.startsWith("/journey-confirmation/")) return true;
  if (path.startsWith("/guest-portal/")) return true;
  if (path.startsWith("/booking-balance/")) return true;
  if (path.startsWith("/booking-credit/")) return true;

  // Embed routes used by the booking widget
  if (path.startsWith("/embed/")) return true;
  // Property / room / booking / confirmation paths for allowlisted properties
  for (const slug of JONGENSFONTEIN_PROPERTY_SLUGS) {
    if (path.includes(`/${slug}`)) return true;
  }
  return false;
};

const bookDomainBlocked = isBookDomain && !isBookDomainAllowedPath();

const BookRedirect = () => {
  if (isBookDomain) return <UnderConstruction />;
  window.location.href = "https://book.sleepinafrica.roomsonline.co.za";
  return null;
};


const PageFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="space-y-4 w-full max-w-md px-6">
      <Skeleton className="h-8 w-3/4 mx-auto" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-32 w-full rounded-lg" />
    </div>
  </div>
);

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem storageKey="rol-theme">
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CurrencyProvider>
          <MobileBookingProvider>
            <ItineraryProvider>
              <BehavioralMemoryProvider>
                <RecaptchaProvider>
                  <TooltipProvider>
                  <Toaster />
                  <Sonner />
                  <BrowserRouter>
                    <Suspense fallback={<PageFallback />}>
                      {bookDomainBlocked ? (
                        <Routes>
                          <Route path="*" element={<UnderConstruction />} />
                        </Routes>
                      ) : isReportsDomain ? (
                        /* ═══ Revenue Reports domain mount ═══════════════ */
                        <Routes>
                          <Route path="/auth" element={<Auth />} />
                          <Route path="/" element={<ReportsLayout />}>
                            <Route index element={<ReportsDashboard />} />
                            <Route path="new" element={<ReportsNewRun />} />
                            <Route path="runs/:runId" element={<ReportsRunReview />} />
                            <Route path="runs/:runId/draft" element={<ReportsDraftView />} />
                            <Route path="settings" element={<ReportsSettings />} />

                            <Route path="settings/:propertyId" element={<ReportsPropertySettings />} />
                            <Route path="help" element={<ReportsHelp />} />
                          </Route>
                          <Route path="*" element={<Navigate to="/" replace />} />
                        </Routes>
                      ) : (

                      <Routes>

                        {/* ═══ Connect domain mount ═══════════════════════ */}
                        {isConnectDomain && (
                          <Route path="/" element={<ConnectLayout />}>
                            {connectChildRoutes()}
                          </Route>
                        )}

                        {/* ═══ Revenue Reports mounted under /reports so the
                            surface is reachable from preview and the admin
                            domain, not only reports.roomsonline.co.za ═════ */}
                        <Route path="/reports" element={<ReportsLayout />}>
                          <Route index element={<ReportsDashboard />} />
                          <Route path="new" element={<ReportsNewRun />} />
                          <Route path="runs/:runId" element={<ReportsRunReview />} />
                          <Route path="runs/:runId/draft" element={<ReportsDraftView />} />
                          <Route path="settings" element={<ReportsSettings />} />
                          <Route path="settings/:propertyId" element={<ReportsPropertySettings />} />
                          <Route path="help" element={<ReportsHelp />} />
                        </Route>


                        {/* ═══ Book domain — allowlisted paths render normally ═ */}
                        {!isBookDomain && (
                          <Route
                            path="/"
                            element={
                              isConnectDomain
                                ? <Navigate to="/" replace />
                                : isSurveyDomain
                                  ? <ProjectDiscoverySurvey />
                                  : isGuestBookingHost()
                                    ? <GuestHostLanding />
                                    : <Navigate to="/dashboard/reports" replace />
                            }
                          />
                        )}



                        {/* ═══ Public routes ══════════════════════════════ */}
                        <Route path="/book" element={<BookRedirect />} />
                        <Route path="/property_listing" element={<PropertyListing />} />
                        <Route path="/auth" element={<Auth />} />
                        <Route path="/property/:id" element={<PropertyShowcase />} />
                        <Route path="/property/:propertySlug/room/:roomSlug" element={<RoomShowcase />} />
                        <Route path="/property/:propertySlug/room/:roomSlug/availability" element={<RoomAvailability />} />
                        <Route path="/book/:id" element={<Booking />} />
                        <Route path="/booking/:id" element={<Booking />} />
                        <Route path="/booking-confirmation/:bookingId" element={<BookingConfirmation />} />
                        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                        <Route path="/terms-of-service" element={<TermsOfService />} />
                        <Route path="/affiliate-disclosure" element={<AffiliateDisclosure />} />
                        <Route path="/about" element={<AboutUs />} />
                        <Route path="/contact" element={<ContactUs />} />
                        <Route path="/journals" element={<PublicJournals />} />
                        <Route path="/how-our-booking-engine-works" element={<PMSComparison />} />
                        <Route path="/contract/sign/:token" element={<ContractSign />} />
                        <Route path="/onboarding/:token" element={<PropertyOnboarding />} />
                        <Route path="/staff-login" element={<StaffLogin />} />
                        <Route path="/staff-login/:propertySlug" element={<StaffLogin />} />
                        <Route path="/my-booking" element={<GuestPortal />} />
                        <Route path="/checkin" element={<GuestCheckIn />} />
                        <Route path="/feedback" element={<GuestFeedback />} />
                        <Route path="/group-rooming/:token" element={<GroupRoomingPortal />} />

                        {/* ═══ HyperGuest certification portal (token-gated, public) ═══ */}
                        <Route path="/hyperguest/certification" element={<HyperGuestCertificationPortal />} />
                        <Route path="/hyperguest/certification/reflection" element={<HyperGuestReflectionInspector />} />

                        {/* ═══ Embed routes (public) ═════════════════════ */}
                        <Route path="/embed/property/:slug" element={<EmbedProperty />} />
                        <Route path="/embed/portfolio/:portfolioSlug" element={<EmbedPortfolio />} />
                        <Route path="/recaptcha-bridge" element={<RecaptchaBridge />} />
                        <Route path="/subscribe/pay/:token" element={<SubscriptionPay />} />
                        <Route path="/billing/pay/:token" element={<PropertyInvoicePay />} />
                        <Route path="/booking-balance/:token" element={<BookingBalancePay />} />
                        <Route path="/booking-credit/:token" element={<BookingCreditChoice />} />


                        {/* ═══ Journey routes (public) ═══════════════════ */}
                        <Route path="/journey/builder" element={<ItineraryBuilder />} />
                        <Route path="/journey/review" element={<JourneyReview />} />
                        <Route path="/journey/checkout" element={<JourneyCheckout />} />
                        <Route path="/journey/confirmation/:itineraryId" element={<JourneyConfirmation />} />

                        {/* ═══ Dashboard routes (auth required) ══════════ */}
                        <Route path="/dashboard/reports" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                        <Route path="/dashboard/insights" element={<ProtectedRoute requireDevOrFearless><Insights /></ProtectedRoute>} />
                        <Route path="/dashboard/property/:id/progress" element={<ProtectedRoute><PropertyProgress /></ProtectedRoute>} />
                        <Route path="/pulse" element={<ProtectedRoute><ROLPulse /></ProtectedRoute>} />

                        {/* ═══ Admin routes (requireAdmin layout) ════════ */}
                        <Route path="/admin" element={<Navigate to="/admin/property-overview" replace />} />
                        <Route element={<AdminRouteLayout />}>
                          <Route path="/admin/dashboard" element={<AdminDashboard />} />
                          <Route path="/admin/payments" element={<AdminPayments />} />
                          <Route path="/admin/access-requests" element={<AdminAccessRequests />} />
                          <Route path="/admin/benson-config" element={<BensonConfig />} />
                          <Route path="/admin/pms-config/:systemType" element={<PMSConfig />} />
                          <Route path="/admin/journals" element={<AdminJournals />} />
                          <Route path="/admin/journals/:id" element={<JournalEditor />} />
                          <Route path="/admin/audit" element={<AdminAudit />} />
                          <Route path="/admin/help-articles" element={<AdminHelpArticles />} />
                          <Route path="/admin/help-articles/:id" element={<HelpArticleEditor />} />
                          <Route path="/admin/portfolios" element={<AdminPortfolios />} />
                          <Route path="/admin/contracts" element={<AdminContracts />} />
                          <Route path="/admin/onboarding" element={<AdminOnboarding />} />
                          <Route path="/admin/onboarding/:propertyId" element={<ChannelOnboarding />} />
                          <Route path="/admin/contract-editor" element={<AdminContractEditor />} />
                          <Route path="/admin/contract-editor/:templateId" element={<AdminContractEditor />} />
                          <Route path="/admin/wizard-editor" element={<AdminWizardEditor />} />
                          <Route path="/admin/wizard-editor/:wizardId" element={<AdminWizardEditor />} />
                          <Route path="/admin/review-queue" element={<AdminReviewQueue />} />
                          <Route path="/admin/sales-reps" element={<AdminSalesReps />} />
                          <Route path="/admin/commission-reports" element={<AdminCommissionReports />} />
                          <Route path="/admin-users" element={<AdminUsers />} />
                        </Route>

                        {/* Admin routes with special permissions */}
                        <Route path="/admin/properties/new" element={<ProtectedRoute><PropertyForm /></ProtectedRoute>} />
                        <Route path="/admin/properties/new/preflight" element={<ProtectedRoute requireAdmin><AdminPreFlight /></ProtectedRoute>} />
                        <Route path="/admin/properties/:id" element={<ProtectedRoute><PropertyForm /></ProtectedRoute>} />
                        <Route path="/admin/property-overview" element={<ProtectedRoute><PropertyOverview /></ProtectedRoute>} />
                        <Route path="/admin/calendar" element={<ProtectedRoute><Calendar /></ProtectedRoute>} />
                        <Route path="/admin/calendar/accommodation" element={<ProtectedRoute><CalendarAccommodation /></ProtectedRoute>} />
                        <Route path="/admin/calendar/event-wedding" element={<ProtectedRoute><CalendarEventWedding /></ProtectedRoute>} />
                        <Route path="/admin/calendar/conference" element={<ProtectedRoute><CalendarConference /></ProtectedRoute>} />
                        <Route path="/admin/promotion" element={<ProtectedRoute><Promotion /></ProtectedRoute>} />
                        <Route path="/admin/bookings" element={<ProtectedRoute><Bookings /></ProtectedRoute>} />
                        <Route path="/admin/integrations" element={<ProtectedRoute><AdminIntegrations /></ProtectedRoute>} />
                        <Route path="/admin/channel-monitor" element={<ProtectedRoute requireAdmin><AdminChannelMonitor /></ProtectedRoute>} />
                        <Route path="/admin/channel-monitor/live" element={<ProtectedRoute requireAdmin><AdminChannelTrafficLive /></ProtectedRoute>} />
                        <Route path="/admin/account" element={<ProtectedRoute><OwnerAccount /></ProtectedRoute>} />



                        {/* Admin routes requiring dev/fearless */}
                        <Route path="/admin-keys" element={<ProtectedRoute requireDevOrFearless><AdminKeys /></ProtectedRoute>} />
                        <Route path="/admin/api-keys" element={<ProtectedRoute requireDev><AdminKeys /></ProtectedRoute>} />
                        <Route path="/admin/test-booking-benson" element={<ProtectedRoute requireDev><TestBookingBenson /></ProtectedRoute>} />
                        <Route path="/admin/billing-defaults" element={<ProtectedRoute requireDevOrFearless><AdminBillingDefaults /></ProtectedRoute>} />
                        <Route path="/admin/system/api-configurator" element={<ProtectedRoute requireDevOrFearless><AdminApiConfigurator /></ProtectedRoute>} />
                        
                        <Route path="/docs/api" element={<ProtectedRoute requireDevOrFearless><ApiDocsViewer /></ProtectedRoute>} />
                        <Route path="/nb" element={<ProtectedRoute requireDev><NB /></ProtectedRoute>} />

                        {/* ═══ Dev routes (requireDev layout) ════════════ */}
                        <Route element={<DevRouteLayout />}>
                          <Route path="/dev/system-health" element={<DevSystemHealth />} />
                          <Route path="/dev/system-health/ru-sync-pipelines" element={<DevRuSyncPipelines />} />
                          <Route path="/dev/pms" element={<DevPMS />} />
                          <Route path="/dev/features" element={<DevFeatures />} />
                          <Route path="/dev/testing" element={<DevTesting />} />
                        </Route>
                        <Route path="/dev/tasks" element={<ProtectedRoute requireDevOrFearless><DevTaskTracker /></ProtectedRoute>} />

                        {/* ═══ PMS routes (persistent shell) ═════════════ */}
                        <Route path="/pms" element={<ProtectedRoute><PMSShell /></ProtectedRoute>}>
                          <Route index element={<PMSDashboard />} />
                          <Route path="bookings" element={<Bookings />} />
                          <Route path="rooms" element={<PMSRooms />} />
                          <Route path="room-types" element={<PMSRoomTypes />} />
                          <Route path="rate-plans" element={<PMSRatePlans />} />
                          <Route path="guests" element={<PMSGuests />} />
                          <Route path="inquiries" element={<PMSInquiries />} />
                          <Route path="crm" element={<PMSCrm />} />
                          <Route path="housekeeping" element={<PMSHousekeeping />} />
                          <Route path="reports" element={<PMSReports />} />
                          <Route path="branding" element={<PMSBranding />} />
                          <Route path="integrations" element={<PMSIntegrations />} />
                          <Route path="calendar" element={<PMSDashboard />} />
                          <Route path="staff" element={<PMSStaff />} />
                          <Route path="channels" element={<PMSChannels />} />
                          <Route path="groups" element={<PMSGroups />} />
                          <Route path="events" element={<PMSEvents />} />
                          <Route path="night-audit" element={<PMSNightAudit />} />
                          <Route path="messaging" element={<PMSMessaging />} />
                          <Route path="portfolio" element={<PMSPortfolio />} />
                          <Route path="revenue" element={<PMSRevenue />} />
                          <Route path="command-centre" element={<PMSCommandCentre />} />
                          <Route path="property-setup" element={<PMSPropertySetup />} />
                          <Route path="pricelabs" element={<PMSPriceLabs />} />
                        </Route>

                        {/* ═══ Connect portal (/connect path) ════════════ */}
                        <Route path="/connect" element={<ConnectLayout />}>
                          {connectChildRoutes()}
                        </Route>

                        {/* ═══ Legacy redirects ══════════════════════════ */}
                        <Route path="/admin/system-health" element={<Navigate to="/dev/system-health" replace />} />
                        <Route path="/admin/supporting-systems" element={<Navigate to="/admin-keys" replace />} />
                        <Route path="/admin/all-bookings" element={<Navigate to="/admin/bookings" replace />} />
                        <Route path="/admin/all-properties" element={<Navigate to="/admin/property-overview" replace />} />
                        <Route path="/admin/system" element={<Navigate to="/admin/dashboard" replace />} />
                        <Route path="/dev/overview" element={<Navigate to="/dev/system-health" replace />} />
                        <Route path="/dev/danger" element={<Navigate to="/dev/system-health?tab=actions" replace />} />
                        <Route path="/pms-comparison" element={<Navigate to="/how-our-booking-engine-works" replace />} />
                        <Route path="/compare-property-management-systems" element={<Navigate to="/how-our-booking-engine-works" replace />} />

                        {/* ═══ Catch-all ═════════════════════════════════ */}
                        <Route path="*" element={isConnectDomain ? <Navigate to="/" replace /> : isGuestBookingHost() ? <GuestHostLanding /> : <NotFound />} />
                      </Routes>
                      )}
                    </Suspense>
                  </BrowserRouter>
                  </TooltipProvider>
                </RecaptchaProvider>
              </BehavioralMemoryProvider>
            </ItineraryProvider>
          </MobileBookingProvider>
        </CurrencyProvider>
      </AuthProvider>
    </QueryClientProvider>
    <Analytics />
    <SpeedInsights />
  </ThemeProvider>
);

export default App;

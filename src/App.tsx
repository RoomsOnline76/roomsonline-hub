import { lazy, Suspense } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeProvider } from "@/components/ThemeProvider";

// Eager — public-facing pages (critical path)
import Home from "./pages/Home";
import PropertyShowcase from "./pages/PropertyShowcase";
import RoomShowcase from "./pages/RoomShowcase";
import RoomAvailability from "./pages/RoomAvailability";
import Booking from "./pages/Booking";
import BookingConfirmation from "./pages/BookingConfirmation";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import AboutUs from "./pages/AboutUs";
import ContactUs from "./pages/ContactUs";
import PublicJournals from "./pages/PublicJournals";
import PMSComparison from "./pages/PMSComparison";
import AffiliateDisclosure from "./pages/AffiliateDisclosure";
import PropertyListing from "./pages/PropertyListing";
import EmbedProperty from "./pages/EmbedProperty";
import EmbedPortfolio from "./pages/EmbedPortfolio";
import StaffLogin from "./pages/StaffLogin";
import ContractSign from "./pages/ContractSign";
import PropertyOnboarding from "./pages/PropertyOnboarding";
import GuestPortal from "./pages/GuestPortal";

// Lazy — admin, PMS, dev, dashboard (only loaded when needed)
const JourneyReview = lazy(() => import("./pages/JourneyReview"));
const JourneyConfirmation = lazy(() => import("./pages/JourneyConfirmation"));
const JourneyCheckout = lazy(() => import("./pages/JourneyCheckout"));
const ItineraryBuilder = lazy(() => import("./pages/ItineraryBuilder"));
const PropertyOverview = lazy(() => import("./pages/PropertyOverview"));
const Calendar = lazy(() => import("./pages/Calendar"));
const CalendarAccommodation = lazy(() => import("./pages/CalendarAccommodation"));
const CalendarEventWedding = lazy(() => import("./pages/CalendarEventWedding"));
const CalendarConference = lazy(() => import("./pages/CalendarConference"));
const Promotion = lazy(() => import("./pages/Promotion"));
const Bookings = lazy(() => import("./pages/Bookings"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const ROLPulse = lazy(() => import("./pages/ROLPulse"));
const Insights = lazy(() => import("./pages/Insights"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminPayments = lazy(() => import("./pages/AdminPayments"));
const AdminKeys = lazy(() => import("./pages/AdminKeys"));
const AdminUsers = lazy(() => import("./pages/AdminUsers"));
const AdminAccessRequests = lazy(() => import("./pages/AdminAccessRequests"));
const PropertyForm = lazy(() => import("./pages/PropertyForm"));
const BensonConfig = lazy(() => import("./pages/BensonConfig"));
const PMSConfig = lazy(() => import("./pages/PMSConfig"));
const TestBookingBenson = lazy(() => import("./pages/TestBookingBenson"));
const NB = lazy(() => import("./pages/NB"));
const AdminJournals = lazy(() => import("./pages/AdminJournals"));
const JournalEditor = lazy(() => import("./pages/JournalEditor"));
const AdminAudit = lazy(() => import("./pages/AdminAudit"));
const AdminHelpArticles = lazy(() => import("./pages/AdminHelpArticles"));
const HelpArticleEditor = lazy(() => import("./pages/HelpArticleEditor"));
const DevSystemHealth = lazy(() => import("./pages/DevSystemHealth"));
const AdminContracts = lazy(() => import("./pages/AdminContracts"));
const AdminOnboarding = lazy(() => import("./pages/AdminOnboarding"));
const AdminContractEditor = lazy(() => import("./pages/AdminContractEditor"));
const AdminWizardEditor = lazy(() => import("./pages/AdminWizardEditor"));
const AdminPreFlight = lazy(() => import("./pages/AdminPreFlight"));
const AdminReviewQueue = lazy(() => import("./pages/AdminReviewQueue"));
const PropertyProgress = lazy(() => import("./pages/PropertyProgress"));
const ProjectDiscoverySurvey = lazy(() => import("./pages/ProjectDiscoverySurvey"));
const DevPMS = lazy(() => import("./pages/DevPMS"));
const DevLogs = lazy(() => import("./pages/DevLogs"));
const DevFeatures = lazy(() => import("./pages/DevFeatures"));
const DevTesting = lazy(() => import("./pages/DevTesting"));
const DevTaskTracker = lazy(() => import("./pages/DevTaskTracker"));
const AdminIntegrations = lazy(() => import("./pages/AdminIntegrations"));
const AdminApiConfigurator = lazy(() => import("./pages/AdminApiConfigurator"));
const AdminPortfolios = lazy(() => import("./pages/admin/AdminPortfolios"));
const AdminBillingDefaults = lazy(() => import("./pages/AdminBillingDefaults"));
const AdminSalesReps = lazy(() => import("./pages/AdminSalesReps"));
const AdminCommissionReports = lazy(() => import("./pages/AdminCommissionReports"));
const ApiDocsViewer = lazy(() => import("./pages/ApiDocsViewer"));

// Lazy — Connect portal pages
const ConnectHome = lazy(() => import("./pages/connect/ConnectHome"));
const ConnectFeatures = lazy(() => import("./pages/connect/ConnectFeatures"));
const ConnectIntegrations = lazy(() => import("./pages/connect/ConnectIntegrations"));
const ConnectPricing = lazy(() => import("./pages/connect/ConnectPricing"));
const ConnectDocs = lazy(() => import("./pages/connect/ConnectDocs"));
const ConnectQuickstart = lazy(() => import("./pages/connect/ConnectQuickstart"));
const ConnectWordPress = lazy(() => import("./pages/connect/ConnectWordPress"));
const ConnectFAQ = lazy(() => import("./pages/connect/ConnectFAQ"));
const ConnectGetStarted = lazy(() => import("./pages/connect/ConnectGetStarted"));
const ConnectPrivacyPolicy = lazy(() => import("./pages/connect/ConnectPrivacyPolicy"));
const ConnectTermsOfService = lazy(() => import("./pages/connect/ConnectTermsOfService"));
const ConnectAbout = lazy(() => import("./pages/connect/ConnectAbout"));
const ConnectJournal = lazy(() => import("./pages/connect/ConnectJournal"));

// Lazy PMS pages
const PMSDashboard = lazy(() => import("./pages/pms/PMSDashboard"));
const PMSRooms = lazy(() => import("./pages/pms/PMSRooms"));
const PMSRoomTypes = lazy(() => import("./pages/pms/PMSRoomTypes"));
const PMSRatePlans = lazy(() => import("./pages/pms/PMSRatePlans"));
const PMSGuests = lazy(() => import("./pages/pms/PMSGuests"));
const PMSHousekeeping = lazy(() => import("./pages/pms/PMSHousekeeping"));
const PMSReports = lazy(() => import("./pages/pms/PMSReports"));
const PMSBranding = lazy(() => import("./pages/pms/PMSBranding"));
const PMSIntegrations = lazy(() => import("./pages/pms/PMSIntegrations"));
const PMSStaff = lazy(() => import("./pages/pms/PMSStaff"));
const PMSChannels = lazy(() => import("./pages/pms/PMSChannels"));
const PMSGroups = lazy(() => import("./pages/pms/PMSGroups"));
const PMSEvents = lazy(() => import("./pages/pms/PMSEvents"));
const PMSNightAudit = lazy(() => import("./pages/pms/PMSNightAudit"));
const PMSMessaging = lazy(() => import("./pages/pms/PMSMessaging"));
const PMSPortfolio = lazy(() => import("./pages/pms/PMSPortfolio"));
const PMSRevenue = lazy(() => import("./pages/pms/PMSRevenue"));
const PMSCommandCentre = lazy(() => import("./pages/pms/PMSCommandCentre"));
import { PMSShell } from "./components/layout/PMSShell";
import { ConnectLayout } from "./components/layout/ConnectLayout";
import { isConnectDomain } from "./lib/config";

const queryClient = new QueryClient();

// Check if we're on the survey domain
const isSurveyDomain = window.location.hostname === 'survey.roomsonline.co.za';

// Redirect component for /book path
const BookRedirect = () => {
  const hostname = window.location.hostname;
  const isPreviewHost = hostname.includes("lovableproject.com") || hostname.includes("lovable.app");

  if (hostname === "book.sleepinafrica.roomsonline.co.za" || isPreviewHost) {
    return <Home />;
  }

  window.location.href = "https://book.sleepinafrica.roomsonline.co.za";
  return null;
};

// Suspense fallback for lazy-loaded pages
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
        <Routes>
          {/* On connect domain, mount portal at root */}
          {isConnectDomain && (
            <Route path="/" element={<ConnectLayout />}>
              <Route index element={<ConnectHome />} />
              <Route path="features" element={<ConnectFeatures />} />
              <Route path="integrations" element={<ConnectIntegrations />} />
              <Route path="pricing" element={<ConnectPricing />} />
              <Route path="docs" element={<ConnectDocs />} />
              <Route path="docs/quickstart" element={<ConnectQuickstart />} />
              <Route path="docs/wordpress" element={<ConnectWordPress />} />
              <Route path="docs/webhooks" element={<ConnectDocs />} />
              <Route path="faq" element={<ConnectFAQ />} />
              <Route path="get-started" element={<ConnectGetStarted />} />
              <Route path="privacy-policy" element={<ConnectPrivacyPolicy />} />
              <Route path="terms-of-service" element={<ConnectTermsOfService />} />
              <Route path="about" element={<ConnectAbout />} />
              <Route path="journal" element={<ConnectJournal />} />
            </Route>
          )}
          <Route path="/" element={
            isConnectDomain
              ? <Navigate to="/" replace />
              : isSurveyDomain
                ? <ProjectDiscoverySurvey />
                : window.location.hostname === 'book.sleepinafrica.roomsonline.co.za' 
                  ? <Home /> 
                  : <Navigate to="/dashboard/reports" replace />
          } />
          <Route path="/book" element={<BookRedirect />} />
          <Route path="/property_listing" element={<PropertyListing />} />
          <Route path="/auth" element={<Auth />} />
          <Route
            path="/admin"
            element={<Navigate to="/admin/property-overview" replace />}
          />
          <Route
            path="/admin-keys"
            element={
               <ProtectedRoute requireDevOrFearless={true}>
                <AdminKeys />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin-users"
            element={
              <ProtectedRoute requireAdmin={true}>
            <AdminUsers />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/access-requests"
            element={
              <ProtectedRoute requireAdmin={true}>
                <AdminAccessRequests />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/api-keys"
            element={
              <ProtectedRoute requireDev={true}>
                <AdminKeys />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/benson-config"
            element={
              <ProtectedRoute requireAdmin={true}>
                <BensonConfig />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/pms-config/:systemType"
            element={
              <ProtectedRoute requireAdmin={true}>
                <PMSConfig />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/test-booking-benson"
            element={
              <ProtectedRoute requireDev={true}>
                <TestBookingBenson />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/properties/new"
            element={
              <ProtectedRoute>
                <PropertyForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/properties/new/preflight"
            element={
              <ProtectedRoute requireAdmin={true}>
                <AdminPreFlight />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/properties/:id"
            element={
              <ProtectedRoute>
                <PropertyForm />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/property-overview"
            element={
              <ProtectedRoute>
                <PropertyOverview />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/calendar"
            element={
              <ProtectedRoute>
                <Calendar />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/calendar/accommodation"
            element={
              <ProtectedRoute>
                <CalendarAccommodation />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/calendar/event-wedding"
            element={
              <ProtectedRoute>
                <CalendarEventWedding />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/calendar/conference"
            element={
              <ProtectedRoute>
                <CalendarConference />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/promotion"
            element={
              <ProtectedRoute>
                <Promotion />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/bookings"
            element={
              <ProtectedRoute>
                <Bookings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/reports"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/pulse"
            element={
              <ProtectedRoute>
                <ROLPulse />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard/insights"
            element={
              <ProtectedRoute requireDevOrFearless={true}>
                <Insights />
              </ProtectedRoute>
            }
          />
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
          <Route path="/how-our-booking-engine-works" element={<PMSComparison />} />
          <Route path="/pms-comparison" element={<Navigate to="/how-our-booking-engine-works" replace />} />
          <Route path="/compare-property-management-systems" element={<Navigate to="/how-our-booking-engine-works" replace />} />
          <Route
            path="/nb"
            element={
              <ProtectedRoute requireDev={true}>
                <NB />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/journals"
            element={
              <ProtectedRoute requireAdmin={true}>
                <AdminJournals />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/journals/:id"
            element={
              <ProtectedRoute requireAdmin={true}>
              <JournalEditor />
              </ProtectedRoute>
            }
          />
          <Route path="/journals" element={<PublicJournals />} />
          <Route
            path="/admin/audit"
            element={
              <ProtectedRoute requireAdmin={true}>
                <AdminAudit />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/help-articles"
            element={
              <ProtectedRoute requireAdmin={true}>
                <AdminHelpArticles />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/help-articles/:id"
            element={
              <ProtectedRoute requireAdmin={true}>
                <HelpArticleEditor />
            </ProtectedRoute>
            }
          />
          <Route
            path="/admin/system-health"
            element={<Navigate to="/dev/system-health" replace />}
          />
          <Route
            path="/admin/supporting-systems"
            element={<Navigate to="/admin-keys" replace />}
          />
          <Route
            path="/admin/all-bookings"
            element={<Navigate to="/admin/bookings" replace />}
          />
          <Route
            path="/admin/all-properties"
            element={<Navigate to="/admin/property-overview" replace />}
          />
          <Route
            path="/admin/system"
            element={<Navigate to="/admin/dashboard" replace />}
          />
            {/* Contract signing - public route */}
            <Route path="/contract/sign/:token" element={<ContractSign />} />
            {/* Property onboarding - requires auth */}
            <Route path="/onboarding/:token" element={<PropertyOnboarding />} />
            {/* Admin contract and onboarding management */}
            <Route
              path="/admin/portfolios"
              element={
                <ProtectedRoute requireAdmin={true}>
                  <AdminPortfolios />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/contracts"
              element={
                <ProtectedRoute requireAdmin={true}>
                  <AdminContracts />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/onboarding"
              element={
                <ProtectedRoute requireAdmin={true}>
                  <AdminOnboarding />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/contract-editor"
              element={
                <ProtectedRoute requireAdmin={true}>
                  <AdminContractEditor />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/contract-editor/:templateId"
              element={
                <ProtectedRoute requireAdmin={true}>
                  <AdminContractEditor />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/wizard-editor"
              element={
                <ProtectedRoute requireAdmin={true}>
                  <AdminWizardEditor />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/wizard-editor/:wizardId"
              element={
                <ProtectedRoute requireAdmin={true}>
                  <AdminWizardEditor />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/review-queue"
              element={
                <ProtectedRoute requireAdmin={true}>
                  <AdminReviewQueue />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/billing-defaults"
              element={
                <ProtectedRoute requireDevOrFearless={true}>
                  <AdminBillingDefaults />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/sales-reps"
              element={
                <ProtectedRoute requireAdmin={true}>
                  <AdminSalesReps />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/commission-reports"
              element={
                <ProtectedRoute requireAdmin={true}>
                  <AdminCommissionReports />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/system/api-configurator"
              element={
                <ProtectedRoute requireDevOrFearless={true}>
                  <AdminApiConfigurator />
                </ProtectedRoute>
              }
            />
            <Route
              path="/docs/api"
              element={
                <ProtectedRoute requireDevOrFearless={true}>
                  <ApiDocsViewer />
                </ProtectedRoute>
              }
            />
            {/* Journey routes */}
            <Route path="/journey/builder" element={<ItineraryBuilder />} />
            <Route path="/journey/review" element={<JourneyReview />} />
            <Route path="/journey/checkout" element={<JourneyCheckout />} />
            <Route path="/journey/confirmation/:itineraryId" element={<JourneyConfirmation />} />
            {/* Admin Dashboard & Payments routes */}
            <Route
              path="/admin/dashboard"
              element={
                <ProtectedRoute requireAdmin={true}>
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/payments"
              element={
                <ProtectedRoute requireAdmin={true}>
                  <AdminPayments />
                </ProtectedRoute>
              }
            />
            {/* Dev routes */}
            <Route
              path="/dev/overview"
              element={<Navigate to="/dev/system-health" replace />}
            />
            <Route
              path="/dev/danger"
              element={<Navigate to="/dev/system-health?tab=actions" replace />}
            />
            <Route
              path="/dev/system-health"
              element={
                <ProtectedRoute requireDev={true}>
                  <DevSystemHealth />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dev/pms"
              element={
                <ProtectedRoute requireDev={true}>
                  <DevPMS />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dev/logs"
              element={
                <ProtectedRoute requireDev={true}>
                  <DevLogs />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dev/features"
              element={
                <ProtectedRoute requireDev={true}>
                  <DevFeatures />
                </ProtectedRoute>
              }
            />
            
            <Route
              path="/dev/testing"
              element={
                <ProtectedRoute requireDev={true}>
                  <DevTesting />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dev/tasks"
              element={
                <ProtectedRoute requireDevOrFearless={true}>
                  <DevTaskTracker />
                </ProtectedRoute>
              }
            />
            {/* Property Progress Dashboard */}
            <Route
              path="/dashboard/property/:id/progress"
              element={
                <ProtectedRoute>
                  <PropertyProgress />
                </ProtectedRoute>
              }
            />
            {/* ROL'OS Native PMS Module — persistent shell keeps sidebar & brand mounted */}
            <Route path="/pms" element={<ProtectedRoute><PMSShell /></ProtectedRoute>}>
              <Route index element={<PMSDashboard />} />
              <Route path="rooms" element={<PMSRooms />} />
              <Route path="room-types" element={<PMSRoomTypes />} />
              <Route path="rate-plans" element={<PMSRatePlans />} />
              <Route path="guests" element={<PMSGuests />} />
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
            </Route>
            {/* Integration toolkit */}
            <Route
              path="/admin/integrations"
              element={
                <ProtectedRoute>
                  <AdminIntegrations />
                </ProtectedRoute>
              }
            />
            {/* Embeddable booking widget — public route */}
            <Route path="/embed/property/:slug" element={<EmbedProperty />} />
            <Route path="/embed/portfolio/:portfolioSlug" element={<EmbedPortfolio />} />
            {/* Branded staff login — public route (smart branding via ?property= or localStorage) */}
            <Route path="/staff-login" element={<StaffLogin />} />
            <Route path="/staff-login/:propertySlug" element={<StaffLogin />} />
            {/* ─── Connect Portal (public) ──────────────────────── */}
            <Route path="/connect" element={<ConnectLayout />}>
              <Route index element={<ConnectHome />} />
              <Route path="features" element={<ConnectFeatures />} />
              <Route path="integrations" element={<ConnectIntegrations />} />
              <Route path="pricing" element={<ConnectPricing />} />
              <Route path="docs" element={<ConnectDocs />} />
              <Route path="docs/quickstart" element={<ConnectQuickstart />} />
              <Route path="docs/wordpress" element={<ConnectWordPress />} />
              <Route path="faq" element={<ConnectFAQ />} />
              <Route path="get-started" element={<ConnectGetStarted />} />
              <Route path="privacy-policy" element={<ConnectPrivacyPolicy />} />
              <Route path="terms-of-service" element={<ConnectTermsOfService />} />
              <Route path="about" element={<ConnectAbout />} />
              <Route path="journal" element={<ConnectJournal />} />
            </Route>
            {/* Guest Portal — public self-service booking management */}
            <Route path="/my-booking" element={<GuestPortal />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={isConnectDomain ? <Navigate to="/" replace /> : <NotFound />} />
          </Routes>
          </Suspense>
          </BrowserRouter>
        </TooltipProvider>
      </RecaptchaProvider>
      </BehavioralMemoryProvider>
      </ItineraryProvider>
    </MobileBookingProvider>
    </CurrencyProvider>
  </QueryClientProvider>
  </ThemeProvider>
);

export default App;

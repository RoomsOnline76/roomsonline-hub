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
import PropertyListing from "./pages/PropertyListing";
import EmbedProperty from "./pages/EmbedProperty";
import StaffLogin from "./pages/StaffLogin";
import ContractSign from "./pages/ContractSign";
import PropertyOnboarding from "./pages/PropertyOnboarding";

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
          </Route>

          {/* When on the connect domain, redirect ALL other routes to /connect */}
          {isConnectDomain ? (
            <Route path="*" element={<Navigate to="/connect" replace />} />
          ) : (
            <>
          <Route path="/" element={
            isSurveyDomain
              ? <ProjectDiscoverySurvey />
              : window.location.hostname === 'book.sleepinafrica.roomsonline.co.za' 
                ? <Home /> 
                : <Navigate to="/dashboard/reports" replace />
          } />
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

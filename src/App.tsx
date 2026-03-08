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
import JourneyReview from "./pages/JourneyReview";
import JourneyConfirmation from "./pages/JourneyConfirmation";
import JourneyCheckout from "./pages/JourneyCheckout";
import ItineraryBuilder from "./pages/ItineraryBuilder";
import Home from "./pages/Home";
import HomeOld from "./pages/HomeOld";
import StagingBook from "./pages/StagingBook";
import PropertyOverview from "./pages/PropertyOverview";
import Calendar from "./pages/Calendar";
import CalendarAccommodation from "./pages/CalendarAccommodation";
import CalendarEventWedding from "./pages/CalendarEventWedding";
import CalendarConference from "./pages/CalendarConference";
import Promotion from "./pages/Promotion";
import Bookings from "./pages/Bookings";
import Dashboard from "./pages/Dashboard";
import ROLPulse from "./pages/ROLPulse";
import Insights from "./pages/Insights";
import AdminDashboard from "./pages/AdminDashboard";
import AdminPayments from "./pages/AdminPayments";
import AdminKeys from "./pages/AdminKeys";
import AdminUsers from "./pages/AdminUsers";
import AdminAccessRequests from "./pages/AdminAccessRequests";
import PropertyForm from "./pages/PropertyForm";
import BensonConfig from "./pages/BensonConfig";
import PMSConfig from "./pages/PMSConfig";
import TestBookingBenson from "./pages/TestBookingBenson";
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
import PropertyListing from "./pages/PropertyListing";
import NB from "./pages/NB";
import AdminJournals from "./pages/AdminJournals";
import JournalEditor from "./pages/JournalEditor";
import PublicJournals from "./pages/PublicJournals";
import AdminAudit from "./pages/AdminAudit";
import AdminHelpArticles from "./pages/AdminHelpArticles";
import HelpArticleEditor from "./pages/HelpArticleEditor";
import AdminSystemHealth from "./pages/AdminSystemHealth";
import ProjectDiscoverySurvey from "./pages/ProjectDiscoverySurvey";
import SupportingSystems from "./pages/SupportingSystems";
import ContractSign from "./pages/ContractSign";
import PropertyOnboarding from "./pages/PropertyOnboarding";
import AdminContracts from "./pages/AdminContracts";
import AdminOnboarding from "./pages/AdminOnboarding";
import AdminContractEditor from "./pages/AdminContractEditor";
import AdminWizardEditor from "./pages/AdminWizardEditor";
import AdminPreFlight from "./pages/AdminPreFlight";
import AdminReviewQueue from "./pages/AdminReviewQueue";
import PropertyProgress from "./pages/PropertyProgress";
import DevOverview from "./pages/DevOverview";
import DevPMS from "./pages/DevPMS";
import DevLogs from "./pages/DevLogs";
import DevFeatures from "./pages/DevFeatures";
import DevDanger from "./pages/DevDanger";
import DevTesting from "./pages/DevTesting";
import DevTaskTracker from "./pages/DevTaskTracker";
import PMSComparison from "./pages/PMSComparison";
import AdminIntegrations from "./pages/AdminIntegrations";
import EmbedProperty from "./pages/EmbedProperty";
import { PMSDashboard, PMSRooms, PMSRoomTypes, PMSRatePlans, PMSGuests, PMSHousekeeping, PMSReports, PMSBranding, PMSIntegrations } from "./pages/pms";
import { PMSBrandProvider } from "./contexts/PMSBrandContext";
import { ProtectedRoute } from "./components/ProtectedRoute";

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

  // Redirect to book subdomain for non-preview hosts
  window.location.href = "https://book.sleepinafrica.roomsonline.co.za";
  return null;
};

const App = () => (
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
        <Routes>
          <Route path="/" element={
            isSurveyDomain
              ? <ProjectDiscoverySurvey />
              : window.location.hostname === 'book.sleepinafrica.roomsonline.co.za' 
                ? <Home /> 
                : <Navigate to="/dashboard/reports" replace />
          } />
          <Route path="/book" element={<BookRedirect />} />
          <Route path="/home-old" element={<HomeOld />} />
          <Route path="/property_listing" element={<PropertyListing />} />
          <Route path="/staging" element={<StagingBook />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/auth" element={<Auth />} />
          <Route
            path="/admin"
            element={<Navigate to="/admin/property-overview" replace />}
          />
          <Route
            path="/admin-keys"
            element={
              <ProtectedRoute requireDev={true}>
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
          <Route path="/booking/:id" element={<Booking />} />
          <Route path="/booking-confirmation/:bookingId" element={<BookingConfirmation />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />
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
            element={
              <ProtectedRoute requireDevOrFearless={true}>
                <AdminSystemHealth />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/supporting-systems"
            element={
              <ProtectedRoute requireDevOrFearless={true}>
                <SupportingSystems />
              </ProtectedRoute>
            }
            />
            {/* Contract signing - public route */}
            <Route path="/contract/sign/:token" element={<ContractSign />} />
            {/* Property onboarding - requires auth */}
            <Route path="/onboarding/:token" element={<PropertyOnboarding />} />
            {/* Admin contract and onboarding management */}
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
              element={
                <ProtectedRoute requireDev={true}>
                  <DevOverview />
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
              path="/dev/danger"
              element={
                <ProtectedRoute requireDev={true}>
                  <DevDanger />
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
            {/* ROL'OS Native PMS Module — white-labeled with PMSBrandProvider */}
            <Route path="/pms" element={<ProtectedRoute><PMSBrandProvider><PMSDashboard /></PMSBrandProvider></ProtectedRoute>} />
            <Route path="/pms/rooms" element={<ProtectedRoute><PMSBrandProvider><PMSRooms /></PMSBrandProvider></ProtectedRoute>} />
            <Route path="/pms/room-types" element={<ProtectedRoute><PMSBrandProvider><PMSRoomTypes /></PMSBrandProvider></ProtectedRoute>} />
            <Route path="/pms/rate-plans" element={<ProtectedRoute><PMSBrandProvider><PMSRatePlans /></PMSBrandProvider></ProtectedRoute>} />
            <Route path="/pms/guests" element={<ProtectedRoute><PMSBrandProvider><PMSGuests /></PMSBrandProvider></ProtectedRoute>} />
            <Route path="/pms/housekeeping" element={<ProtectedRoute><PMSBrandProvider><PMSHousekeeping /></PMSBrandProvider></ProtectedRoute>} />
            <Route path="/pms/reports" element={<ProtectedRoute><PMSBrandProvider><PMSReports /></PMSBrandProvider></ProtectedRoute>} />
            <Route path="/pms/branding" element={<ProtectedRoute><PMSBrandProvider><PMSBranding /></PMSBrandProvider></ProtectedRoute>} />
            <Route path="/pms/integrations" element={<ProtectedRoute><PMSBrandProvider><PMSIntegrations /></PMSBrandProvider></ProtectedRoute>} />
            <Route path="/pms/calendar" element={<ProtectedRoute><PMSBrandProvider><PMSDashboard /></PMSBrandProvider></ProtectedRoute>} />
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
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </RecaptchaProvider>
      </BehavioralMemoryProvider>
      </ItineraryProvider>
    </MobileBookingProvider>
    </CurrencyProvider>
  </QueryClientProvider>
);

export default App;

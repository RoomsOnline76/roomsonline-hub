import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Home from "./pages/Home";
import StagingBook from "./pages/StagingBook";
import Results from "./pages/Results";
import PropertyOverview from "./pages/PropertyOverview";
import Calendar from "./pages/Calendar";
import CalendarAccommodation from "./pages/CalendarAccommodation";
import CalendarEventWedding from "./pages/CalendarEventWedding";
import CalendarConference from "./pages/CalendarConference";
import Promotion from "./pages/Promotion";
import Bookings from "./pages/Bookings";
import Dashboard from "./pages/Dashboard";
import AdminKeys from "./pages/AdminKeys";
import AdminUsers from "./pages/AdminUsers";
import AdminAccessRequests from "./pages/AdminAccessRequests";
import PropertyForm from "./pages/PropertyForm";
import BensonConfig from "./pages/BensonConfig";
import TestBookingBenson from "./pages/TestBookingBenson";
import PropertyShowcase from "./pages/PropertyShowcase";
import RoomShowcase from "./pages/RoomShowcase";
import RoomAvailability from "./pages/RoomAvailability";
import Booking from "./pages/Booking";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import { ProtectedRoute } from "./components/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={
            window.location.hostname === 'book.sleepinafrica.roomsonline.co.za' 
              ? <StagingBook /> 
              : <Navigate to="/dashboard/reports" replace />
          } />
          <Route path="/book" element={<Home />} />
          <Route path="/staging" element={<StagingBook />} />
          <Route path="/search" element={<Results />} />
          <Route path="/results" element={<Navigate to="/search" replace />} />
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
          <Route path="/property/:id" element={<PropertyShowcase />} />
          <Route path="/property/:propertySlug/room/:roomSlug" element={<RoomShowcase />} />
          <Route path="/property/:propertySlug/room/:roomSlug/availability" element={<RoomAvailability />} />
          <Route path="/booking/:id" element={<Booking />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Results from "./pages/Results";
import Admin from "./pages/Admin";
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
import PropertyForm from "./pages/PropertyForm";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import { ProtectedRoute } from "./components/ProtectedRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/results" element={<Results />} />
          <Route path="/auth" element={<Auth />} />
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <Admin />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin-keys"
            element={
              <ProtectedRoute requireAdmin={true}>
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
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { RealtimeNotificationsProvider } from "@/contexts/RealtimeNotificationsContext";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import TranscriptionHistory from "./pages/TranscriptionHistory";
import ChangePassword from "./pages/ChangePassword";
import Profile from "./pages/Profile";
import NotificationSettings from "./pages/NotificationSettings";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <RealtimeNotificationsProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/history" element={<TranscriptionHistory />} />
            <Route path="/change-password" element={<ChangePassword />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/notifications" element={<NotificationSettings />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </RealtimeNotificationsProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

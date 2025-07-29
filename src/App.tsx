import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import AuthCallback from "./pages/AuthCallback";
import VoiceAssistant from "./components/VoiceAssistant";
import { useTokenRefresh } from "./hooks/useTokenRefresh";
import { useAnalytics } from "./hooks/useAnalytics";
import React from "react";

const queryClient = new QueryClient();

const App = () => {
  // Enable automatic background token refresh
  useTokenRefresh();
  
  const analytics = useAnalytics();
  
  // Track app initialization
  React.useEffect(() => {
    analytics.trackPageView('/', 'ODrive Home');
    analytics.trackFeatureUsage({
      feature_name: 'app_initialization',
      user_type: 'new' // Could be detected based on localStorage
    });
  }, [analytics]);
  
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth/callback" element={<AuthCallback />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          <VoiceAssistant />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
};

export default App;

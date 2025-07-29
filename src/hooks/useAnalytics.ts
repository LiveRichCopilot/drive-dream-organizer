import { useCallback } from 'react';

// Declare gtag function for TypeScript
declare global {
  interface Window {
    gtag: (command: string, targetId: string, config?: any) => void;
    dataLayer: any[];
  }
}

export const useAnalytics = () => {
  const trackEvent = useCallback((eventName: string, eventData: any = {}) => {
    // Google Analytics 4 tracking
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('event', eventName, {
        event_category: eventData.category || 'user_interaction',
        event_label: eventData.label,
        value: eventData.value,
        custom_parameter_1: eventData.custom1,
        custom_parameter_2: eventData.custom2,
        timestamp: new Date().toISOString(),
        ...eventData
      });
    }

    // Console logging for development
    if (process.env.NODE_ENV === 'development') {
      console.log(`Analytics Event: ${eventName}`, eventData);
    }

    // Could also integrate with other analytics services here
    // Example: Mixpanel, PostHog, etc.
  }, []);

  const trackPageView = useCallback((pagePath: string, pageTitle?: string) => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('config', 'G-XXXXXXXXXX', {
        page_path: pagePath,
        page_title: pageTitle,
      });
    }
  }, []);

  const trackUserProperty = useCallback((propertyName: string, value: any) => {
    if (typeof window !== 'undefined' && window.gtag) {
      window.gtag('config', 'G-XXXXXXXXXX', {
        custom_map: { [propertyName]: value }
      });
    }
  }, []);

  // Predefined event tracking functions for common ODrive actions
  const trackPhotoAnalyzed = useCallback((data: {
    category?: string;
    photo_count?: number;
    processing_time?: number;
    ai_model?: string;
  }) => {
    trackEvent('photo_analyzed', {
      category: 'ai_processing',
      ...data
    });
  }, [trackEvent]);

  const trackPromptExtracted = useCallback((data: {
    prompt_type?: string;
    copy_action?: boolean;
    prompt_length?: number;
  }) => {
    trackEvent('prompt_extracted', {
      category: 'ai_generation',
      ...data
    });
  }, [trackEvent]);

  const trackBatchProcessed = useCallback((data: {
    batch_size?: number;
    processing_duration?: number;
    success_rate?: number;
    organization_method?: string;
  }) => {
    trackEvent('batch_processed', {
      category: 'batch_operation',
      ...data
    });
  }, [trackEvent]);

  const trackSearch = useCallback((data: {
    search_query?: string;
    results_count?: number;
    search_type?: string;
  }) => {
    trackEvent('search_performed', {
      category: 'search',
      ...data
    });
  }, [trackEvent]);

  const trackOrganization = useCallback((data: {
    organization_type?: 'date' | 'category' | 'style' | 'location';
    folder_count?: number;
    file_count?: number;
  }) => {
    trackEvent('files_organized', {
      category: 'organization',
      ...data
    });
  }, [trackEvent]);

  const trackError = useCallback((data: {
    error_type?: string;
    error_message?: string;
    component?: string;
    stack_trace?: string;
  }) => {
    trackEvent('error_occurred', {
      category: 'error',
      error_type: data.error_type,
      error_message: data.error_message,
      component: data.component,
      // Don't send full stack trace to GA for privacy
      has_stack_trace: !!data.stack_trace
    });
  }, [trackEvent]);

  const trackUserSession = useCallback((data: {
    session_duration?: number;
    pages_viewed?: number;
    actions_performed?: number;
    feature_usage?: string[];
  }) => {
    trackEvent('session_summary', {
      category: 'engagement',
      ...data
    });
  }, [trackEvent]);

  const trackFeatureUsage = useCallback((data: {
    feature_name?: string;
    usage_duration?: number;
    success?: boolean;
    user_type?: 'new' | 'returning';
  }) => {
    trackEvent('feature_used', {
      category: 'feature_engagement',
      ...data
    });
  }, [trackEvent]);

  return {
    trackEvent,
    trackPageView,
    trackUserProperty,
    trackPhotoAnalyzed,
    trackPromptExtracted,
    trackBatchProcessed,
    trackSearch,
    trackOrganization,
    trackError,
    trackUserSession,
    trackFeatureUsage
  };
};
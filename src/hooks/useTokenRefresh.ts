import { useEffect, useRef } from 'react';
import { tokenManager } from '@/lib/auth/TokenManager';
import { tokenStorage } from '@/lib/auth/TokenStorage';

/**
 * Hook for automatic background token refresh
 * Checks every 2 minutes if token needs refresh
 */
export function useTokenRefresh() {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isRefreshingRef = useRef(false);

  useEffect(() => {
    const checkAndRefreshToken = async () => {
      // Prevent concurrent refresh attempts
      if (isRefreshingRef.current) {
        return;
      }

      // Only check if we have tokens
      if (!tokenStorage.getAccessToken()) {
        return;
      }

      // Check if token will expire within 5 minutes
      if (tokenStorage.willExpireSoon(5)) {
        isRefreshingRef.current = true;
        
        try {
          console.log('Background token refresh triggered');
          await tokenManager.refreshToken();
          console.log('Background token refresh successful');
        } catch (error) {
          console.error('Background token refresh failed:', error);
          // Token might be invalid - user will need to re-authenticate
        } finally {
          isRefreshingRef.current = false;
        }
      }
    };

    // Check immediately when hook mounts
    checkAndRefreshToken();

    // Set up interval to check every 2 minutes
    intervalRef.current = setInterval(checkAndRefreshToken, 2 * 60 * 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Also check when page becomes visible again (user switches back to tab)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && tokenStorage.getAccessToken()) {
        // Check token when user returns to tab
        if (tokenStorage.willExpireSoon(5)) {
          tokenManager.refreshToken().catch(error => {
            console.error('Token refresh on visibility change failed:', error);
          });
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
}
// Hook for automatic token refresh and validation
import { useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { TokenManagerService } from '@/services/tokenManager.svc';
import { toast } from 'sonner';

export const useTokenRefresh = () => {
  const { logout } = useAuth();
  const tokenManager = TokenManagerService.getInstance();

  /**
   * Check token validity and refresh if needed before API calls
   */
  const ensureValidToken = useCallback(async (): Promise<boolean> => {
    try {
      // Check if token exists and is valid
      if (tokenManager.isTokenExpired()) {
        // Try to refresh the token
        const refreshSuccess = await tokenManager.refreshToken();
        
        if (!refreshSuccess) {
          // Refresh failed, log out user
          toast.error('Session expired. Please log in again.');
          logout();
          return false;
        }
        
        toast.success('Session refreshed successfully');
        return true;
      }

      return true; // Token is valid
    } catch (error) {
      console.error('Error ensuring valid token:', error);
      logout();
      return false;
    }
  }, [logout, tokenManager]);

  /**
   * Get current token information
   */
  const getTokenInfo = useCallback(() => {
    return tokenManager.getTokenInfo();
  }, [tokenManager]);

  /**
   * Manually refresh token
   */
  const refreshToken = useCallback(async (): Promise<boolean> => {
    try {
      const success = await tokenManager.refreshToken();
      if (success) {
        toast.success('Session refreshed successfully');
      } else {
        toast.error('Failed to refresh session');
      }
      return success;
    } catch (error) {
      console.error('Error refreshing token:', error);
      toast.error('Failed to refresh session');
      return false;
    }
  }, [tokenManager]);

  return {
    ensureValidToken,
    getTokenInfo,
    refreshToken,
    isTokenExpired: tokenManager.isTokenExpired.bind(tokenManager),
    getTimeUntilExpiry: tokenManager.getTimeUntilExpiry.bind(tokenManager)
  };
};
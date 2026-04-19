
// Authentication context for React application

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { User, AuthResponse } from '@/types';
import { AuthService } from '@/services/auth.svc';
import { TokenManagerService } from '@/services/tokenManager.svc';
import { toast } from 'sonner';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<AuthResponse>;
  register: (name: string, email: string, password: string, confirmPassword: string) => Promise<AuthResponse>;
  logout: () => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const authService = AuthService.getInstance();
  const tokenManager = TokenManagerService.getInstance();
  
  // Track current warning toast to dismiss when user becomes active
  const [currentWarningToast, setCurrentWarningToast] = useState<string | number | null>(null);

  // Initialize authentication state
  useEffect(() => {
    initializeAuth();
  }, []);

  // Activity-aware token expiry monitoring
  useEffect(() => {
    if (user) {
      // Start activity-aware expiry monitoring when user is authenticated
      tokenManager.startMonitoring(
        () => {
          // Handle token expiration - redirect to login
          toast.error('Your session has expired. Please log in again.');
          handleAutoLogout();
        },
        (minutesLeft) => {
          // Handle token warning - show notification but track it for dismissal
          const toastId = toast.warning(`Your session will expire in ${minutesLeft} minutes.`, {
            duration: 10000 // Show for 10 seconds
          });
          setCurrentWarningToast(toastId);
        },
        () => {
          // Handle warning dismissal when user becomes active
          if (currentWarningToast) {
            toast.dismiss(currentWarningToast);
            setCurrentWarningToast(null);
            // Show success message that session was extended
            toast.success('Session extended due to activity', {
              duration: 3000
            });
          }
        }
      );
    } else {
      // Stop monitoring when user is not authenticated
      tokenManager.stopMonitoring();
      // Clear any pending warning toast
      if (currentWarningToast) {
        toast.dismiss(currentWarningToast);
        setCurrentWarningToast(null);
      }
    }

    // Cleanup on unmount
    return () => {
      tokenManager.stopMonitoring();
      if (currentWarningToast) {
        toast.dismiss(currentWarningToast);
        setCurrentWarningToast(null);
      }
    };
  }, [user, currentWarningToast]);

  const initializeAuth = async () => {
    try {
      setLoading(true);

      // Check for existing session with simple expiry check
      const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
      if (token) {
        // Simple expiry check before attempting backend verification
        const isExpired = tokenManager.isTokenExpired();
        
        if (isExpired) {
          // Clear expired tokens
          localStorage.removeItem('auth_token');
          localStorage.removeItem('refresh_token');
          localStorage.removeItem('remember_me');
          sessionStorage.removeItem('auth_token');
          sessionStorage.removeItem('refresh_token');
        } else {
          // Token not expired, try to verify with backend
          try {
            const user = await authService.verifyToken(token);
            if (user) {
              setUser(user);
              authService.setCurrentUser(user);
            } else {
              // Backend verification failed, clear tokens
              localStorage.removeItem('auth_token');
              localStorage.removeItem('refresh_token');
              localStorage.removeItem('remember_me');
              sessionStorage.removeItem('auth_token');
              sessionStorage.removeItem('refresh_token');
            }
          } catch (error) {
            console.warn('Token verification failed:', error);
            // Clear tokens on verification error
            localStorage.removeItem('auth_token');
            localStorage.removeItem('refresh_token');
            localStorage.removeItem('remember_me');
            sessionStorage.removeItem('auth_token');
            sessionStorage.removeItem('refresh_token');
          }
        }
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string, rememberMe: boolean = false): Promise<AuthResponse> => {
    try {
      const response = await authService.login({ email, password, rememberMe });

      if (response.success && response.user && response.session_token) {
        // Store tokens BEFORE setting user state to ensure they're available for API calls
        if (rememberMe) {
          // Use localStorage for persistent storage
          localStorage.setItem('auth_token', response.session_token);
          localStorage.setItem('remember_me', 'true');
          if (response.refresh_token) {
            localStorage.setItem('refresh_token', response.refresh_token);
          }
        } else {
          // Use sessionStorage for session-only storage
          sessionStorage.setItem('auth_token', response.session_token);
          localStorage.removeItem('remember_me');
          if (response.refresh_token) {
            sessionStorage.setItem('refresh_token', response.refresh_token);
          }
        }

        // Set user state AFTER tokens are stored
        setUser(response.user);
        authService.setCurrentUser(response.user);
      }

      return response;
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, message: 'Login failed. Please try again.' };
    }
  };

  const register = async (
    name: string,
    email: string,
    password: string,
    confirmPassword: string
  ): Promise<AuthResponse> => {
    try {
      const response = await authService.register({
        name,
        email,
        password,
        confirm_password: confirmPassword
      });

      return response;
    } catch (error) {
      console.error('Registration error:', error);
      return { success: false, message: 'Registration failed. Please try again.' };
    }
  };



  const logout = () => {
    setUser(null);
    authService.logout();
    tokenManager.stopMonitoring();
    
    // Clear any pending warning toast
    if (currentWarningToast) {
      toast.dismiss(currentWarningToast);
      setCurrentWarningToast(null);
    }
    
    // Clear tokens from both storages
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('remember_me');
    sessionStorage.removeItem('auth_token');
    sessionStorage.removeItem('refresh_token');
  };

  const handleAutoLogout = () => {
    setUser(null);
    authService.logout();
    tokenManager.stopMonitoring();
    
    // Clear any pending warning toast
    if (currentWarningToast) {
      toast.dismiss(currentWarningToast);
      setCurrentWarningToast(null);
    }
    
    // Clear tokens from both storages
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('remember_me');
    sessionStorage.removeItem('auth_token');
    sessionStorage.removeItem('refresh_token');
    
    // Force redirect to login page
    window.location.href = '/login';
  };

  const refreshUser = async () => {
    try {
      const token = localStorage.getItem('auth_token') || sessionStorage.getItem('auth_token');
      if (token && user) {
        const updatedUser = await authService.verifyToken(token);
        if (updatedUser) {
          setUser(updatedUser);
        }
      }
    } catch (error) {
      console.error('Error refreshing user:', error);
    }
  };

  const value: AuthContextType = {
    user,
    loading,
    login,
    register,
    logout,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    refreshUser
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Protected Route component
interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
  fallback?: ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  requireAdmin = false,
  fallback
}) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    // Redirect to login page with current location as state
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requireAdmin && user.role !== 'admin') {
    return fallback || (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
          <p className="text-muted-foreground">You don't have permission to access this page.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

// Hook for checking permissions
export const usePermissions = () => {
  const { user } = useAuth();

  return {
    canViewAdminPanel: user?.role === 'admin',
    canManageUsers: user?.role === 'admin',
    canManageSettings: user?.role === 'admin',
    canViewReports: !!user,
    canCreateInvoices: !!user,
    canManageClients: !!user,
    canManageExpenses: !!user
  };
};

import React from 'react';
import { AlertTriangle, WifiOff, Loader2 } from 'lucide-react';
import { cn } from '@/utils/themeUtils.util';

interface ConnectionLostDialogProps {
  isVisible: boolean;
  retryCount: number;
  maxRetries: number;
  isChecking: boolean;
  hasExceededMaxRetries: boolean;
  lastError?: string | null;
}

export const ConnectionLostDialog: React.FC<ConnectionLostDialogProps> = ({
  isVisible,
  retryCount,
  maxRetries,
  isChecking,
  hasExceededMaxRetries,
  lastError
}) => {
  if (!isVisible) return null;

  const getStatusIcon = () => {
    if (isChecking) {
      return <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />;
    }
    if (hasExceededMaxRetries) {
      return <AlertTriangle className="h-8 w-8 text-red-500" />;
    }
    return <WifiOff className="h-8 w-8 text-orange-500" />;
  };

  const getStatusMessage = () => {
    if (hasExceededMaxRetries) {
      return {
        title: "Connection Failed",
        message: "Unable to reconnect to the API after multiple attempts. Please contact your system administrator or try refreshing the page."
      };
    }
    
    if (isChecking) {
      return {
        title: "Reconnecting...",
        message: `Attempting to reconnect to the API (${retryCount}/${maxRetries})`
      };
    }

    return {
      title: "Connection Lost",
      message: "Connection to the API has been lost. Please wait while we attempt to reconnect."
    };
  };

  const { title, message } = getStatusMessage();

  return (
    <>
      {/* Backdrop - non-closable overlay */}
      <div 
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
        style={{ pointerEvents: 'all' }}
      />
      
      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div 
          className={cn(
            "relative w-full max-w-md rounded-lg border bg-background p-6 shadow-lg",
            "animate-in fade-in-0 zoom-in-95 duration-200"
          )}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="connection-dialog-title"
          aria-describedby="connection-dialog-description"
        >
          {/* Header */}
          <div className="flex flex-col items-center space-y-4 text-center">
            {getStatusIcon()}
            
            <div className="space-y-2">
              <h2 
                id="connection-dialog-title"
                className="text-lg font-semibold text-foreground"
              >
                {title}
              </h2>
              
              <p 
                id="connection-dialog-description"
                className="text-sm text-muted-foreground"
              >
                {message}
              </p>
            </div>
          </div>

          {/* Progress indicator */}
          {!hasExceededMaxRetries && (
            <div className="mt-6 space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Retry attempts</span>
                <span>{retryCount}/{maxRetries}</span>
              </div>
              
              <div className="w-full bg-muted rounded-full h-2">
                <div 
                  className={cn(
                    "h-2 rounded-full transition-all duration-300",
                    hasExceededMaxRetries 
                      ? "bg-red-500" 
                      : retryCount > maxRetries * 0.7 
                        ? "bg-orange-500" 
                        : "bg-blue-500"
                  )}
                  style={{ 
                    width: `${Math.min((retryCount / maxRetries) * 100, 100)}%` 
                  }}
                />
              </div>
            </div>
          )}

          {/* Error details (if available and max retries exceeded) */}
          {hasExceededMaxRetries && lastError && (
            <div className="mt-4 p-3 bg-muted rounded-md">
              <p className="text-xs text-muted-foreground">
                <strong>Error details:</strong> {lastError}
              </p>
            </div>
          )}

          {/* Status indicator */}
          <div className="mt-6 flex items-center justify-center space-x-2 text-xs text-muted-foreground">
            {isChecking ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Checking connection...</span>
              </>
            ) : hasExceededMaxRetries ? (
              <>
                <AlertTriangle className="h-3 w-3" />
                <span>Connection failed</span>
              </>
            ) : (
              <>
                <WifiOff className="h-3 w-3" />
                <span>Waiting to retry...</span>
              </>
            )}
          </div>

          {/* Refresh button for max retries case */}
          {hasExceededMaxRetries && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Refresh Page
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

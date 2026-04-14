// Token status component for debugging (can be removed in production)
import React from 'react';
import { useTokenRefresh } from '@/hooks/useTokenRefresh';

interface TokenStatusProps {
  className?: string;
}

export const TokenStatus: React.FC<TokenStatusProps> = ({ className }) => {
  const { getTokenInfo, getTimeUntilExpiry } = useTokenRefresh();
  
  const tokenInfo = getTokenInfo();
  const timeUntilExpiry = getTimeUntilExpiry();
  
  if (!tokenInfo.hasToken) {
    return null;
  }

  const formatTime = (milliseconds: number): string => {
    const minutes = Math.floor(milliseconds / (60 * 1000));
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (hours > 0) {
      return `${hours}h ${remainingMinutes}m`;
    }
    return `${minutes}m`;
  };

  return (
    <div className={`text-xs text-muted-foreground ${className}`}>
      <span>Session: </span>
      {!tokenInfo.isExpired ? (
        <span className="text-green-600">
          Valid ({timeUntilExpiry ? formatTime(timeUntilExpiry) : 'Unknown'} remaining)
        </span>
      ) : (
        <span className="text-red-600">Invalid</span>
      )}
    </div>
  );
};
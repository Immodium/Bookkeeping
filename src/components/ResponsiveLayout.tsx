import React from 'react';
import { ResponsiveSidebar } from './ResponsiveSidebar';
import { cn } from '@/utils/themeUtils.util';

interface ResponsiveLayoutProps {
  children: React.ReactNode;
  onNavigationAttempt?: (path: string) => void;
}

export const ResponsiveLayout: React.FC<ResponsiveLayoutProps> = ({ 
  children, 
  onNavigationAttempt 
}) => {
  return (
    <div className="h-screen w-full flex bg-background overflow-hidden">
      {/* Sidebar */}
      <ResponsiveSidebar onNavigationAttempt={onNavigationAttempt} />
      
      {/* Main Content */}
      <main className={cn(
        "flex-1 h-full overflow-y-auto bg-background",
        // Add padding for mobile menu button and desktop collapsed sidebar
        "pt-16 lg:pt-0", // Top padding for mobile menu button
        "lg:pl-0" // No left padding on desktop, sidebar handles spacing
      )}>
        {children}
      </main>
    </div>
  );
};
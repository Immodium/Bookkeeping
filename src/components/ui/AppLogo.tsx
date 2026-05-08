import React from 'react';
import { cn } from '@/utils/themeUtils.util';
import lightLogo from '@/assets/slimbooks_logo_light.png';
import darkLogo from '@/assets/slimbooks_logo_dark.png';

interface AppLogoProps {
  alt: string;
  className?: string;
}

export const AppLogo: React.FC<AppLogoProps> = ({ alt, className }) => {
  return (
    <span className="inline-flex items-center">
      <img src={lightLogo} alt={alt} className={cn(className, 'dark:hidden')} />
      <img src={darkLogo} alt={alt} className={cn('hidden dark:block', className)} />
    </span>
  );
};

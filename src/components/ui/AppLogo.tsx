import React from 'react';
import { useTheme } from '@/hooks/useTheme.hook';
import lightLogo from '@/assets/slimbooks_logo_light.png';
import darkLogo from '@/assets/slimbooks_logo_dark.png';

interface AppLogoProps {
  alt: string;
  className?: string;
}

export const AppLogo: React.FC<AppLogoProps> = ({ alt, className }) => {
  const { effectiveTheme } = useTheme();
  const logoSrc = effectiveTheme === 'dark' ? darkLogo : lightLogo;

  return <img src={logoSrc} alt={alt} className={className} />;
};

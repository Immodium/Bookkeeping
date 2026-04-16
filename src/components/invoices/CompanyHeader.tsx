
import React from 'react';
import { Upload } from 'lucide-react';
import { useCompanySettings } from '@/hooks/useSettings.hook';

interface CompanyHeaderProps {
  companyLogo: string | null;
  onLogoUpload?: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export const CompanyHeader: React.FC<CompanyHeaderProps> = ({ companyLogo, onLogoUpload }) => {

  const { settings: companySettings, isLoading } = useCompanySettings();

  if (isLoading) {
    return <div className="flex items-center space-x-4">Loading...</div>;
  }

  const displayLogo = companyLogo ?? companySettings.brandingImage;

  return (
    <div className="flex items-center space-x-4">
      <div className="w-16 h-16 bg-muted rounded-lg flex items-center justify-center border-2 border-dashed border-border hover:border-primary cursor-pointer relative overflow-hidden">
        {displayLogo ? (
          <img src={displayLogo} alt="Company Logo" className="w-full h-full object-cover" />
        ) : (
          <Upload className="h-6 w-6 text-muted-foreground" />
        )}
        {onLogoUpload && (
          <input
            type="file"
            accept="image/*"
            onChange={onLogoUpload}
            className="absolute inset-0 opacity-0 cursor-pointer"
          />
        )}
      </div>
      <div>
        <h1 className="text-2xl font-bold text-card-foreground">{companySettings.companyName}</h1>
        <p className="text-muted-foreground">{companySettings.address}</p>
        <p className="text-muted-foreground">{companySettings.city}, {companySettings.state} {companySettings.zipCode}</p>
      </div>
    </div>
  );
};

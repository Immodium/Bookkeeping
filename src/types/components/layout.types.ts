// Layout component prop types

export interface SidebarProps {
  isOpen?: boolean;
  onToggle?: () => void;
}

export interface ResponsiveSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface ResponsiveLayoutProps {
  children: React.ReactNode;
  showSidebar?: boolean;
}

export interface NavigationGuardedSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  hasUnsavedChanges?: boolean;
  onDiscardChanges?: () => void;
}

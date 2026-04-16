// Settings component types and interfaces

/**
 * Standard interface that all settings tabs should implement for coordinated saving
 * and change tracking across the settings page.
 */
export interface SettingsTabRef {
  saveSettings: () => Promise<void>;
  hasUnsavedChanges?: () => boolean;
}

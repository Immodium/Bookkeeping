// Client component prop types

import type { Client, ClientFormData } from '@/types';

export interface ClientFormProps {
  client?: Client | null;
  onSave: (clientData: ClientFormData) => void;
  onCancel: () => void;
}

export interface ClientImportExportProps {
  onImportComplete?: () => void;
}

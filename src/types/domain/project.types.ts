import type { BaseEntity } from '../shared/common.types';

export type AppRole = 'admin' | 'client_manager' | 'project_manager' | 'user_manager';

export interface RoleAwareUser extends BaseEntity {
  name: string;
  email: string;
  username: string;
  role: 'admin' | 'user' | 'viewer';
  roles?: AppRole[];
  email_verified: number;
  last_login?: string;
  failed_login_attempts: number;
  account_locked_until?: string;
}

export interface ProjectTaskAssignee {
  id: number;
  name: string;
  email: string;
}

export interface ProjectTask extends BaseEntity {
  project_id: number;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'completed' | 'blocked';
  start_date?: string;
  due_date?: string;
  created_by?: number;
  assignees?: ProjectTaskAssignee[];
}

export interface ProjectDocument {
  id: number;
  project_id: number;
  uploaded_by?: number;
  uploaded_by_name?: string;
  original_name: string;
  file_name: string;
  file_path: string;
  mime_type?: string;
  file_size: number;
  created_at: string;
}

export interface Project extends BaseEntity {
  name: string;
  description?: string;
  client_id?: number;
  client_name?: string;
  status: 'planning' | 'active' | 'on_hold' | 'completed' | 'cancelled';
  start_date?: string;
  end_date?: string;
  created_by?: number;
  created_by_name?: string;
  task_count?: number;
  document_count?: number;
  tasks?: ProjectTask[];
  documents?: ProjectDocument[];
}

export interface ProjectFormData {
  name: string;
  description?: string;
  client_id?: number;
  status: Project['status'];
  start_date?: string;
  end_date?: string;
}

export interface ProjectTaskFormData {
  title: string;
  description?: string;
  status: ProjectTask['status'];
  start_date?: string;
  due_date?: string;
  assignee_ids: number[];
}

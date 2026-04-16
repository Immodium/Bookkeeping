import { mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { databaseService } from '../core/DatabaseService.js';
import { Project, ProjectDocument, ProjectTask } from '../types/index.js';

export class ProjectService {
  private readonly projectFilesPath = join(process.cwd(), 'public', 'uploads', 'projects');

  async ensureProjectUploadDirectory(): Promise<void> {
    await mkdir(this.projectFilesPath, { recursive: true });
  }

  async getProjects(filters: { client_id?: number; status?: string } = {}): Promise<Project[]> {
    const conditions: string[] = [];
    const params: Array<string | number> = [];

    if (filters.client_id) {
      conditions.push('p.client_id = ?');
      params.push(filters.client_id);
    }

    if (filters.status) {
      conditions.push('p.status = ?');
      params.push(filters.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = databaseService.getMany<Project & { assignee_count: number }>(
      `
      SELECT
        p.*,
        c.name as client_name,
        u.name as created_by_name,
        COALESCE(task_counts.task_count, 0) as task_count,
        COALESCE(document_counts.document_count, 0) as document_count
      FROM projects p
      LEFT JOIN clients c ON c.id = p.client_id
      LEFT JOIN users u ON u.id = p.created_by
      LEFT JOIN (
        SELECT project_id, COUNT(*) as task_count
        FROM project_tasks
        GROUP BY project_id
      ) task_counts ON task_counts.project_id = p.id
      LEFT JOIN (
        SELECT project_id, COUNT(*) as document_count
        FROM project_documents
        GROUP BY project_id
      ) document_counts ON document_counts.project_id = p.id
      ${whereClause}
      ORDER BY p.created_at DESC
      `,
      params
    );

    return rows;
  }

  async getProjectById(projectId: number): Promise<Project | null> {
    return databaseService.getOne<Project>(
      `
      SELECT
        p.*,
        c.name as client_name,
        u.name as created_by_name
      FROM projects p
      LEFT JOIN clients c ON c.id = p.client_id
      LEFT JOIN users u ON u.id = p.created_by
      WHERE p.id = ?
      `,
      [projectId]
    );
  }

  async createProject(projectData: {
    name: string;
    description?: string;
    client_id?: number;
    status?: string;
    start_date?: string;
    end_date?: string;
    created_by?: number;
  }): Promise<number> {
    if (!projectData.name?.trim()) {
      throw new Error('Project name is required');
    }

    const nextId = databaseService.getNextId('projects');
    const now = new Date().toISOString();

    databaseService.executeQuery(
      `
      INSERT INTO projects (
        id, name, description, client_id, status, start_date, end_date, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        nextId,
        projectData.name.trim(),
        projectData.description || null,
        projectData.client_id || null,
        projectData.status || 'planning',
        projectData.start_date || null,
        projectData.end_date || null,
        projectData.created_by || null,
        now,
        now
      ]
    );

    return nextId;
  }

  async updateProject(
    projectId: number,
    projectData: Partial<{
      name: string;
      description: string;
      client_id: number;
      status: string;
      start_date: string;
      end_date: string;
    }>
  ): Promise<void> {
    const existing = await this.getProjectById(projectId);
    if (!existing) {
      throw new Error('Project not found');
    }

    const allowed: Record<string, unknown> = {};
    const updatableFields = ['name', 'description', 'client_id', 'status', 'start_date', 'end_date'] as const;
    updatableFields.forEach((field) => {
      const value = projectData[field];
      if (value !== undefined) {
        allowed[field] = typeof value === 'string' ? value.trim() : value;
      }
    });

    if (Object.keys(allowed).length === 0) {
      throw new Error('No valid fields to update');
    }

    databaseService.updateById('projects', projectId, allowed);
  }

  async deleteProject(projectId: number): Promise<void> {
    const exists = await this.getProjectById(projectId);
    if (!exists) {
      throw new Error('Project not found');
    }

    databaseService.deleteById('projects', projectId);
  }

  async getProjectTasks(projectId: number): Promise<ProjectTask[]> {
    const tasks = databaseService.getMany<ProjectTask>(
      `
      SELECT pt.*
      FROM project_tasks pt
      WHERE pt.project_id = ?
      ORDER BY
        CASE pt.status
          WHEN 'in_progress' THEN 1
          WHEN 'todo' THEN 2
          WHEN 'blocked' THEN 3
          WHEN 'completed' THEN 4
          ELSE 5
        END,
        pt.created_at DESC
      `,
      [projectId]
    );

    const taskIds = tasks.map((task) => task.id);
    if (taskIds.length === 0) {
      return tasks;
    }

    const placeholders = taskIds.map(() => '?').join(',');
    const assignees = databaseService.getMany<{
      task_id: number;
      id: number;
      name: string;
      email: string;
    }>(
      `
      SELECT
        pta.task_id,
        u.id,
        u.name,
        u.email
      FROM project_task_assignees pta
      INNER JOIN users u ON u.id = pta.user_id
      WHERE pta.task_id IN (${placeholders})
      `,
      taskIds
    );

    const assigneeMap = new Map<number, Array<{ id: number; name: string; email: string }>>();
    assignees.forEach((assignee) => {
      if (!assigneeMap.has(assignee.task_id)) {
        assigneeMap.set(assignee.task_id, []);
      }
      assigneeMap.get(assignee.task_id)?.push({
        id: assignee.id,
        name: assignee.name,
        email: assignee.email
      });
    });

    return tasks.map((task) => ({
      ...task,
      assignees: assigneeMap.get(task.id) || []
    }));
  }

  async createProjectTask(taskData: {
    project_id: number;
    title: string;
    description?: string;
    status?: string;
    start_date?: string;
    due_date?: string;
    created_by?: number;
    assignee_ids?: number[];
  }): Promise<number> {
    if (!taskData.title?.trim()) {
      throw new Error('Task title is required');
    }

    const project = await this.getProjectById(taskData.project_id);
    if (!project) {
      throw new Error('Project not found');
    }

    const nextId = databaseService.getNextId('project_tasks');
    const now = new Date().toISOString();

    databaseService.executeQuery(
      `
      INSERT INTO project_tasks (
        id, project_id, title, description, status, start_date, due_date, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        nextId,
        taskData.project_id,
        taskData.title.trim(),
        taskData.description || null,
        taskData.status || 'todo',
        taskData.start_date || null,
        taskData.due_date || null,
        taskData.created_by || null,
        now,
        now
      ]
    );

    await this.setTaskAssignees(nextId, taskData.assignee_ids || []);

    return nextId;
  }

  async updateProjectTask(
    taskId: number,
    taskData: Partial<{
      title: string;
      description: string;
      status: string;
      start_date: string;
      due_date: string;
      assignee_ids: number[];
    }>
  ): Promise<void> {
    const existingTask = databaseService.getOne<ProjectTask>('SELECT * FROM project_tasks WHERE id = ?', [taskId]);
    if (!existingTask) {
      throw new Error('Task not found');
    }

    const allowed: Record<string, unknown> = {};
    const updatableFields = ['title', 'description', 'status', 'start_date', 'due_date'] as const;

    updatableFields.forEach((field) => {
      const value = taskData[field];
      if (value !== undefined) {
        allowed[field] = typeof value === 'string' ? value.trim() : value;
      }
    });

    if (Object.keys(allowed).length > 0) {
      databaseService.updateById('project_tasks', taskId, allowed);
    }

    if (taskData.assignee_ids) {
      await this.setTaskAssignees(taskId, taskData.assignee_ids);
    }
  }

  async deleteProjectTask(taskId: number): Promise<void> {
    const existingTask = databaseService.getOne<ProjectTask>('SELECT * FROM project_tasks WHERE id = ?', [taskId]);
    if (!existingTask) {
      throw new Error('Task not found');
    }

    databaseService.deleteById('project_tasks', taskId);
  }

  async getProjectDocuments(projectId: number): Promise<ProjectDocument[]> {
    return databaseService.getMany<ProjectDocument>(
      `
      SELECT
        pd.*,
        u.name as uploaded_by_name
      FROM project_documents pd
      LEFT JOIN users u ON u.id = pd.uploaded_by
      WHERE pd.project_id = ?
      ORDER BY pd.created_at DESC
      `,
      [projectId]
    );
  }

  async createProjectDocument(documentData: {
    project_id: number;
    uploaded_by?: number;
    original_name: string;
    file_name: string;
    file_path: string;
    mime_type?: string;
    file_size?: number;
  }): Promise<number> {
    const project = await this.getProjectById(documentData.project_id);
    if (!project) {
      throw new Error('Project not found');
    }

    const nextId = databaseService.getNextId('project_documents');

    databaseService.executeQuery(
      `
      INSERT INTO project_documents (
        id, project_id, uploaded_by, original_name, file_name, file_path, mime_type, file_size, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        nextId,
        documentData.project_id,
        documentData.uploaded_by || null,
        documentData.original_name,
        documentData.file_name,
        documentData.file_path,
        documentData.mime_type || null,
        documentData.file_size || 0,
        new Date().toISOString()
      ]
    );

    return nextId;
  }

  async deleteProjectDocument(documentId: number): Promise<void> {
    const existing = databaseService.getOne<ProjectDocument>('SELECT * FROM project_documents WHERE id = ?', [documentId]);
    if (!existing) {
      throw new Error('Document not found');
    }

    databaseService.deleteById('project_documents', documentId);
  }

  buildProjectDocumentStorageName(originalName: string): string {
    const extension = originalName.includes('.') ? originalName.slice(originalName.lastIndexOf('.')) : '';
    return `${Date.now()}-${randomUUID()}${extension}`;
  }

  private async setTaskAssignees(taskId: number, userIds: number[]): Promise<void> {
    databaseService.executeQuery('DELETE FROM project_task_assignees WHERE task_id = ?', [taskId]);

    if (userIds.length === 0) {
      return;
    }

    const uniqueUserIds = Array.from(new Set(userIds));
    uniqueUserIds.forEach((userId) => {
      databaseService.executeQuery(
        `
        INSERT INTO project_task_assignees (task_id, user_id, created_at)
        VALUES (?, ?, ?)
        `,
        [taskId, userId, new Date().toISOString()]
      );
    });
  }
}

export const projectService = new ProjectService();

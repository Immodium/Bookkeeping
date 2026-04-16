import React, { useEffect, useMemo, useState } from 'react';
import { Briefcase, Calendar, Check, ChevronDown, FileText, Plus, Save, Search, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { sqliteService } from '@/services/sqlite.svc';
import { useAuth } from '@/contexts/AuthContext';
import { usePagination } from '@/hooks/usePagination';
import { PaginationControls } from './ui/PaginationControls';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger
} from './ui/dropdown-menu';
import { themeClasses, getButtonClasses, getIconColorClasses, getStatusColor } from '@/utils/themeUtils.util';
import type { AppRole, Client, Project, ProjectFormData, ProjectTask, ProjectTaskFormData, User, UserRole } from '@/types';

type ProjectViewState = {
  selectedProjectId: number | null;
  searchTerm: string;
};

const projectStatuses: Array<Project['status']> = ['planning', 'active', 'on_hold', 'completed', 'cancelled'];
const taskStatuses: Array<ProjectTask['status']> = ['todo', 'in_progress', 'blocked', 'completed'];

const emptyProjectForm: ProjectFormData = {
  name: '',
  description: '',
  client_id: undefined,
  status: 'planning',
  start_date: '',
  end_date: ''
};

const emptyTaskForm: ProjectTaskFormData = {
  title: '',
  description: '',
  status: 'todo',
  start_date: '',
  due_date: '',
  assignee_ids: []
};

export const ProjectManagement: React.FC = () => {
  const { hasAnyRole } = useAuth();
  const canManageProjects = hasAnyRole(['admin', 'project_manager']);
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [viewState, setViewState] = useState<ProjectViewState>({ selectedProjectId: null, searchTerm: '' });
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectForm, setProjectForm] = useState<ProjectFormData>(emptyProjectForm);
  const [taskForm, setTaskForm] = useState<ProjectTaskFormData>(emptyTaskForm);
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [isSavingProject, setIsSavingProject] = useState(false);
  const [isSavingTask, setIsSavingTask] = useState(false);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);

  const selectedProject = useMemo(
    () => projects.find(project => project.id === viewState.selectedProjectId) || null,
    [projects, viewState.selectedProjectId]
  );

  const filteredProjects = useMemo(() => {
    if (!viewState.searchTerm.trim()) return projects;
    const needle = viewState.searchTerm.toLowerCase();
    return projects.filter(project =>
      project.name.toLowerCase().includes(needle) ||
      (project.client_name || '').toLowerCase().includes(needle) ||
      (project.status || '').toLowerCase().includes(needle)
    );
  }, [projects, viewState.searchTerm]);

  const pagination = usePagination({
    data: filteredProjects,
    searchTerm: viewState.searchTerm,
    filters: {}
  });

  const userMatchesProjectWork = (user: User): boolean => {
    const primaryRole = user.role as UserRole;
    const roles = new Set<AppRole>([
      ...(user.roles || []),
      ...(primaryRole === 'admin' || primaryRole === 'project_manager'
        ? [primaryRole]
        : [])
    ]);
    return roles.has('admin') || roles.has('project_manager');
  };

  const loadBaseData = async () => {
    const [projectRows, clientRows, userRows] = await Promise.all([
      sqliteService.getProjects(),
      sqliteService.getClients(),
      sqliteService.getUsers()
    ]);
    setProjects(projectRows);
    setClients(clientRows);
    setUsers(userRows.filter(userMatchesProjectWork));
    if (projectRows.length > 0 && !viewState.selectedProjectId) {
      setViewState(prev => ({ ...prev, selectedProjectId: projectRows[0]?.id || null }));
    }
  };

  const refreshSelectedProject = async (projectId: number | null) => {
    if (!projectId) return;
    const detailed = await sqliteService.getProjectById(projectId);
    if (!detailed) return;
    setProjects(prev => prev.map(project => (project.id === projectId ? detailed : project)));
  };

  useEffect(() => {
    if (!canManageProjects) return;
    loadBaseData().catch(error => {
      toast.error((error as Error).message || 'Failed to load projects');
    });
  }, [canManageProjects]);

  const handleProjectSubmit = async () => {
    if (!projectForm.name.trim()) {
      toast.error('Project name is required');
      return;
    }

    setIsSavingProject(true);
    try {
      if (selectedProject?.id) {
        await sqliteService.updateProject(selectedProject.id, projectForm);
        toast.success('Project updated');
      } else {
        const created = await sqliteService.createProject(projectForm);
        setViewState(prev => ({ ...prev, selectedProjectId: created.id }));
        toast.success('Project created');
      }
      setShowProjectForm(false);
      setProjectForm(emptyProjectForm);
      await loadBaseData();
      if (selectedProject?.id) {
        await refreshSelectedProject(selectedProject.id);
      }
    } catch (error) {
      toast.error((error as Error).message || 'Failed to save project');
    } finally {
      setIsSavingProject(false);
    }
  };

  const handleDeleteProject = async (projectId: number) => {
    if (!window.confirm('Delete this project and all related tasks/documents?')) return;
    try {
      await sqliteService.deleteProject(projectId);
      toast.success('Project deleted');
      const updated = projects.filter(project => project.id !== projectId);
      setProjects(updated);
      setViewState(prev => ({
        ...prev,
        selectedProjectId: updated[0]?.id || null
      }));
    } catch (error) {
      toast.error((error as Error).message || 'Failed to delete project');
    }
  };

  const handleTaskSubmit = async () => {
    if (!selectedProject?.id) {
      toast.error('Select a project first');
      return;
    }
    if (!taskForm.title.trim()) {
      toast.error('Task title is required');
      return;
    }

    setIsSavingTask(true);
    try {
      if (editingTaskId) {
        await sqliteService.updateProjectTask(selectedProject.id, editingTaskId, taskForm);
        toast.success('Task updated');
      } else {
        await sqliteService.createProjectTask(selectedProject.id, taskForm);
        toast.success('Task added');
      }
      setTaskForm(emptyTaskForm);
      setEditingTaskId(null);
      await refreshSelectedProject(selectedProject.id);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to save task');
    } finally {
      setIsSavingTask(false);
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    if (!selectedProject?.id) return;
    try {
      await sqliteService.deleteProjectTask(selectedProject.id, taskId);
      toast.success('Task deleted');
      await refreshSelectedProject(selectedProject.id);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to delete task');
    }
  };

  const handleEditTask = (task: ProjectTask) => {
    setEditingTaskId(task.id);
    setTaskForm({
      title: task.title,
      description: task.description || '',
      status: task.status,
      start_date: task.start_date || '',
      due_date: task.due_date || '',
      assignee_ids: (task.assignees || []).map(assignee => assignee.id)
    });
  };

  const toggleTaskAssignee = (userId: number) => {
    setTaskForm(prev => ({
      ...prev,
      assignee_ids: prev.assignee_ids.includes(userId)
        ? prev.assignee_ids.filter(id => id !== userId)
        : [...prev.assignee_ids, userId]
    }));
  };

  const selectedAssigneeLabel = useMemo(() => {
    if (taskForm.assignee_ids.length === 0) return 'Unassigned';
    const names = users
      .filter(user => taskForm.assignee_ids.includes(user.id))
      .map(user => user.name);
    if (names.length <= 2) return names.join(', ');
    return `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
  }, [taskForm.assignee_ids, users]);

  const handleUploadDocument = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedProject?.id) return;

    setIsUploadingDocument(true);
    try {
      await sqliteService.uploadProjectDocument(selectedProject.id, file);
      toast.success('Document uploaded');
      await refreshSelectedProject(selectedProject.id);
    } catch (error) {
      toast.error((error as Error).message || 'Document upload failed');
    } finally {
      setIsUploadingDocument(false);
      event.target.value = '';
    }
  };

  const handleDeleteDocument = async (documentId: number) => {
    if (!selectedProject?.id) return;
    try {
      await sqliteService.deleteProjectDocument(selectedProject.id, documentId);
      toast.success('Document removed');
      await refreshSelectedProject(selectedProject.id);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to remove document');
    }
  };

  const handleEditProject = () => {
    if (!selectedProject) return;
    setProjectForm({
      name: selectedProject.name,
      description: selectedProject.description || '',
      client_id: selectedProject.client_id,
      status: selectedProject.status,
      start_date: selectedProject.start_date || '',
      end_date: selectedProject.end_date || ''
    });
    setShowProjectForm(true);
  };

  if (!canManageProjects) {
    return (
      <div className={themeClasses.page}>
        <div className={themeClasses.pageContainer}>
          <div className={themeClasses.card}>
            <h2 className={themeClasses.sectionTitle}>Projects</h2>
            <p className={themeClasses.sectionSubtitle}>Project Manager or Admin role is required.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={themeClasses.page}>
      <div className={themeClasses.pageContainer}>
        <div className={themeClasses.sectionHeader}>
          <div>
            <h1 className={themeClasses.sectionTitle}>Projects</h1>
            <p className={themeClasses.sectionSubtitle}>Track projects, tasks, clients, assignees, and documents.</p>
          </div>
          <button
            className={getButtonClasses('primary')}
            onClick={() => {
              setProjectForm(emptyProjectForm);
              setShowProjectForm(true);
            }}
          >
            <Plus className={themeClasses.iconButton} />
            New Project
          </button>
        </div>

        <div className={themeClasses.statsGridThree}>
          <div className={themeClasses.statCard}>
            <div className={themeClasses.statCardContent}>
              <div>
                <p className={themeClasses.statLabel}>Total Projects</p>
                <p className={themeClasses.statValueMedium}>{projects.length}</p>
              </div>
              <Briefcase className={`${themeClasses.iconLarge} ${getIconColorClasses('blue')}`} />
            </div>
          </div>
          <div className={themeClasses.statCard}>
            <div className={themeClasses.statCardContent}>
              <div>
                <p className={themeClasses.statLabel}>Active Projects</p>
                <p className={themeClasses.statValueMedium}>
                  {projects.filter(project => project.status === 'active').length}
                </p>
              </div>
              <Calendar className={`${themeClasses.iconLarge} ${getIconColorClasses('green')}`} />
            </div>
          </div>
          <div className={themeClasses.statCard}>
            <div className={themeClasses.statCardContent}>
              <div>
                <p className={themeClasses.statLabel}>Completed</p>
                <p className={themeClasses.statValueMedium}>
                  {projects.filter(project => project.status === 'completed').length}
                </p>
              </div>
              <FileText className={`${themeClasses.iconLarge} ${getIconColorClasses('purple')}`} />
            </div>
          </div>
        </div>

        <div className={themeClasses.contentGrid}>
          <div className={themeClasses.card}>
            <div className="relative mb-4">
              <Search className={themeClasses.searchIcon} />
              <input
                className={themeClasses.searchInput}
                placeholder="Search projects..."
                value={viewState.searchTerm}
                onChange={(event) => setViewState(prev => ({ ...prev, searchTerm: event.target.value }))}
              />
            </div>

            <div className="space-y-2">
              {pagination.paginatedData.map(project => (
                <button
                  key={project.id}
                  className={`w-full text-left p-3 rounded-lg border ${
                    project.id === selectedProject?.id ? 'border-primary bg-accent/60' : 'border-border'
                  }`}
                  onClick={() => setViewState(prev => ({ ...prev, selectedProjectId: project.id }))}
                >
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-card-foreground">{project.name}</p>
                    <span className={getStatusColor(project.status)}>{project.status.replace('_', ' ')}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Client: {project.client_name || 'Unassigned'} • Tasks: {project.task_count || 0}
                  </p>
                </button>
              ))}
            </div>

            <PaginationControls
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              itemsPerPage={pagination.itemsPerPage}
              totalItems={pagination.totalItems}
              displayStart={pagination.displayStart}
              displayEnd={pagination.displayEnd}
              pageNumbers={pagination.pageNumbers}
              paginationSettings={pagination.paginationSettings}
              onPageChange={pagination.setCurrentPage}
              onItemsPerPageChange={pagination.setItemsPerPage}
              onNextPage={pagination.goToNextPage}
              onPrevPage={pagination.goToPrevPage}
              canGoNext={pagination.canGoNext}
              canGoPrev={pagination.canGoPrev}
              className="mt-4"
              itemType="projects"
            />
          </div>

          <div className={themeClasses.card}>
            {!selectedProject ? (
              <p className={themeClasses.mutedText}>Select a project to view details.</p>
            ) : (
              <div className="space-y-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className={themeClasses.cardTitle}>{selectedProject.name}</h3>
                    <p className={themeClasses.smallText}>{selectedProject.description || 'No description'}</p>
                    <p className={themeClasses.smallText}>Client: {selectedProject.client_name || 'Unassigned'}</p>
                  </div>
                  <div className="flex gap-2">
                    <button className={getButtonClasses('outline')} onClick={handleEditProject}>
                      Edit
                    </button>
                    <button className={getButtonClasses('destructive')} onClick={() => handleDeleteProject(selectedProject.id)}>
                      <Trash2 className={themeClasses.iconButton} />
                      Delete
                    </button>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-medium text-card-foreground">Tasks</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <input
                      className={themeClasses.input}
                      placeholder="Task title"
                      value={taskForm.title}
                      onChange={(event) => setTaskForm(prev => ({ ...prev, title: event.target.value }))}
                    />
                    <select
                      className={themeClasses.select}
                      value={taskForm.status}
                      onChange={(event) =>
                        setTaskForm(prev => ({ ...prev, status: event.target.value as ProjectTask['status'] }))
                      }
                    >
                      {taskStatuses.map(status => (
                        <option key={status} value={status}>
                          {status.replace('_', ' ')}
                        </option>
                      ))}
                    </select>
                    <input
                      className={themeClasses.input}
                      placeholder="Start date"
                      type="date"
                      value={taskForm.start_date || ''}
                      onChange={(event) => setTaskForm(prev => ({ ...prev, start_date: event.target.value }))}
                    />
                    <input
                      className={themeClasses.input}
                      placeholder="Due date"
                      type="date"
                      value={taskForm.due_date || ''}
                      onChange={(event) => setTaskForm(prev => ({ ...prev, due_date: event.target.value }))}
                    />
                  </div>
                  <textarea
                    className={themeClasses.textarea}
                    placeholder="Task description"
                    value={taskForm.description || ''}
                    onChange={(event) => setTaskForm(prev => ({ ...prev, description: event.target.value }))}
                  />
                  <label className={themeClasses.label}>Assign Users</label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className={`${themeClasses.select} flex items-center justify-between`}
                      >
                        <span className="truncate">{selectedAssigneeLabel}</span>
                        <ChevronDown className="h-4 w-4 opacity-70" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-[320px] max-h-72 overflow-y-auto">
                      {users.length === 0 ? (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">No assignable users</div>
                      ) : (
                        users.map(user => (
                          <DropdownMenuCheckboxItem
                            key={user.id}
                            checked={taskForm.assignee_ids.includes(user.id)}
                            onCheckedChange={() => toggleTaskAssignee(user.id)}
                            onSelect={(event) => event.preventDefault()}
                          >
                            <span className="truncate">{user.name} ({user.email})</span>
                          </DropdownMenuCheckboxItem>
                        ))
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <button className={getButtonClasses('primary')} onClick={handleTaskSubmit} disabled={isSavingTask}>
                    <Save className={themeClasses.iconButton} />
                    {isSavingTask ? 'Saving task...' : editingTaskId ? 'Update Task' : 'Add Task'}
                  </button>
                  {editingTaskId ? (
                    <button
                      className={getButtonClasses('outline')}
                      onClick={() => {
                        setEditingTaskId(null);
                        setTaskForm(emptyTaskForm);
                      }}
                    >
                      Cancel Task Edit
                    </button>
                  ) : null}
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Check className="h-3 w-3" />
                    Use the dropdown to select multiple assignees per task.
                  </div>

                  <div className="space-y-2">
                    {(selectedProject.tasks || []).map(task => (
                      <div key={task.id} className="border border-border rounded-lg p-3">
                        <div className="flex justify-between items-center">
                          <p className="font-medium text-card-foreground">{task.title}</p>
                          <div className="flex gap-2 items-center">
                            <span className={getStatusColor(task.status)}>{task.status.replace('_', ' ')}</span>
                            <button
                              className="text-primary hover:opacity-80 text-xs border border-border rounded px-2 py-1"
                              onClick={() => handleEditTask(task)}
                              aria-label="Edit task"
                            >
                              Edit
                            </button>
                            <button
                              className="text-destructive hover:opacity-80"
                              onClick={() => handleDeleteTask(task.id)}
                              aria-label="Delete task"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <p className={themeClasses.smallText}>{task.description || 'No description'}</p>
                        <p className={themeClasses.smallText}>
                          Assignees:{' '}
                          {(task.assignees || []).map(assignee => assignee.name).join(', ') || 'Unassigned'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-medium text-card-foreground">Documents</h4>
                  <label className={getButtonClasses('outline')}>
                    <Upload className={themeClasses.iconButton} />
                    {isUploadingDocument ? 'Uploading...' : 'Upload Document'}
                    <input type="file" className="hidden" onChange={handleUploadDocument} disabled={isUploadingDocument} />
                  </label>

                  <div className="space-y-2">
                    {(selectedProject.documents || []).map(document => (
                      <div key={document.id} className="flex items-center justify-between border border-border rounded-lg p-2">
                        <a href={document.file_path} target="_blank" rel="noreferrer" className="text-sm text-primary hover:underline">
                          {document.original_name}
                        </a>
                        <button
                          className="text-destructive hover:opacity-80"
                          onClick={() => handleDeleteDocument(document.id)}
                          aria-label="Delete document"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {showProjectForm && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
            <div className={`${themeClasses.card} w-full max-w-2xl`}>
              <h3 className={themeClasses.cardTitle}>{selectedProject ? 'Edit Project' : 'Create Project'}</h3>
              <div className="space-y-3 mt-4">
                <input
                  className={themeClasses.input}
                  placeholder="Project name"
                  value={projectForm.name}
                  onChange={(event) => setProjectForm(prev => ({ ...prev, name: event.target.value }))}
                />
                <textarea
                  className={themeClasses.textarea}
                  placeholder="Description"
                  value={projectForm.description || ''}
                  onChange={(event) => setProjectForm(prev => ({ ...prev, description: event.target.value }))}
                />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <select
                    className={themeClasses.select}
                    value={projectForm.client_id || ''}
                    onChange={(event) =>
                      setProjectForm(prev => ({ ...prev, client_id: event.target.value ? Number(event.target.value) : undefined }))
                    }
                  >
                    <option value="">Unassigned client</option>
                    {clients.map(client => (
                      <option key={client.id} value={client.id}>
                        {client.name}
                      </option>
                    ))}
                  </select>
                  <select
                    className={themeClasses.select}
                    value={projectForm.status}
                    onChange={(event) =>
                      setProjectForm(prev => ({ ...prev, status: event.target.value as Project['status'] }))
                    }
                  >
                    {projectStatuses.map(status => (
                      <option key={status} value={status}>
                        {status.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                  <input
                    className={themeClasses.input}
                    type="date"
                    value={projectForm.start_date || ''}
                    onChange={(event) => setProjectForm(prev => ({ ...prev, start_date: event.target.value }))}
                  />
                  <input
                    className={themeClasses.input}
                    type="date"
                    value={projectForm.end_date || ''}
                    onChange={(event) => setProjectForm(prev => ({ ...prev, end_date: event.target.value }))}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button className={getButtonClasses('outline')} onClick={() => setShowProjectForm(false)}>
                  Cancel
                </button>
                <button className={getButtonClasses('primary')} onClick={handleProjectSubmit} disabled={isSavingProject}>
                  <Save className={themeClasses.iconButton} />
                  {isSavingProject ? 'Saving...' : 'Save Project'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

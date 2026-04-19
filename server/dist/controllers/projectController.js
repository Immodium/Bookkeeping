import { promises as fs } from 'fs';
import { appendFileSync } from 'fs';
import { join } from 'path';
import { asyncHandler, NotFoundError, ValidationError } from '../middleware/index.js';
import { projectService } from '../services/ProjectService.js';
import { rbacService } from '../services/RbacService.js';
const uploadRoot = join(process.cwd(), 'public', 'uploads', 'projects');
const debugLog = (hypothesisId, location, message, data = {}) => {
    try {
        appendFileSync('/opt/cursor/logs/debug.log', JSON.stringify({ hypothesisId, location, message, data, timestamp: Date.now() }) + '\n');
    }
    catch { }
};
const ensureUser = (req) => {
    if (!req.user) {
        throw new ValidationError('Authentication required');
    }
    return req.user;
};
const parseId = (value, label) => {
    if (!value) {
        throw new ValidationError(`${label} is required`);
    }
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed <= 0) {
        throw new ValidationError(`Invalid ${label.toLowerCase()}`);
    }
    return parsed;
};
const assertProjectManagerAccess = async (req) => {
    const user = ensureUser(req);
    const allowed = await rbacService.userHasAnyRole(user.id, ['admin', 'project_manager']);
    if (!allowed) {
        throw new ValidationError('Project Manager or Admin role is required');
    }
};
export const getProjects = asyncHandler(async (req, res) => {
    await assertProjectManagerAccess(req);
    const clientId = req.query.client_id ? Number.parseInt(String(req.query.client_id), 10) : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;
    const filters = {};
    if (typeof clientId === 'number' && !Number.isNaN(clientId)) {
        filters.client_id = clientId;
    }
    if (status) {
        filters.status = status;
    }
    const projects = await projectService.getProjects(filters);
    res.json({ success: true, data: projects });
});
export const getProjectById = asyncHandler(async (req, res) => {
    await assertProjectManagerAccess(req);
    const projectId = parseId(req.params.id, 'Project ID');
    const project = await projectService.getProjectById(projectId);
    if (!project) {
        throw new NotFoundError('Project');
    }
    const [tasks, documents] = await Promise.all([
        projectService.getProjectTasks(projectId),
        projectService.getProjectDocuments(projectId)
    ]);
    res.json({
        success: true,
        data: {
            ...project,
            tasks,
            documents
        }
    });
});
export const createProject = asyncHandler(async (req, res) => {
    await assertProjectManagerAccess(req);
    const user = ensureUser(req);
    const projectData = req.body?.projectData;
    // #region agent log
    debugLog('A', 'projectController.js:createProject:entry', 'createProject entry', {
        method: req.method,
        path: req.originalUrl,
        hasProjectData: !!projectData,
        projectName: typeof projectData?.name === 'string' ? projectData.name : null,
        projectDataId: projectData?.id ?? null
    });
    // #endregion
    if (!projectData || typeof projectData !== 'object') {
        throw new ValidationError('Project data is required');
    }
    const createPayload = {
        name: String(projectData.name || ''),
        created_by: user.id
    };
    if (projectData.description)
        createPayload.description = String(projectData.description);
    if (projectData.client_id)
        createPayload.client_id = Number(projectData.client_id);
    if (projectData.status)
        createPayload.status = String(projectData.status);
    if (projectData.start_date)
        createPayload.start_date = String(projectData.start_date);
    if (projectData.end_date)
        createPayload.end_date = String(projectData.end_date);
    const projectId = await projectService.createProject(createPayload);
    // #region agent log
    debugLog('B', 'projectController.js:createProject:exit', 'createProject exit', {
        createdProjectId: projectId,
        createdBy: user.id
    });
    // #endregion
    res.status(201).json({
        success: true,
        data: { id: projectId },
        message: 'Project created successfully'
    });
});
export const updateProject = asyncHandler(async (req, res) => {
    await assertProjectManagerAccess(req);
    const projectId = parseId(req.params.id, 'Project ID');
    const projectData = req.body?.projectData;
    // #region agent log
    debugLog('A', 'projectController.js:updateProject:entry', 'updateProject entry', {
        method: req.method,
        path: req.originalUrl,
        projectId,
        hasProjectData: !!projectData,
        projectDataId: projectData?.id ?? null
    });
    // #endregion
    if (!projectData || typeof projectData !== 'object') {
        throw new ValidationError('Project data is required');
    }
    const updatePayload = {};
    if (projectData.name)
        updatePayload.name = String(projectData.name);
    if (projectData.description)
        updatePayload.description = String(projectData.description);
    if (projectData.client_id)
        updatePayload.client_id = Number(projectData.client_id);
    if (projectData.status)
        updatePayload.status = String(projectData.status);
    if (projectData.start_date)
        updatePayload.start_date = String(projectData.start_date);
    if (projectData.end_date)
        updatePayload.end_date = String(projectData.end_date);
    await projectService.updateProject(projectId, updatePayload);
    // #region agent log
    debugLog('C', 'projectController.js:updateProject:exit', 'updateProject exit', {
        projectId,
        updatedFields: Object.keys(updatePayload)
    });
    // #endregion
    res.json({ success: true, message: 'Project updated successfully' });
});
export const deleteProject = asyncHandler(async (req, res) => {
    await assertProjectManagerAccess(req);
    const projectId = parseId(req.params.id, 'Project ID');
    await projectService.deleteProject(projectId);
    res.json({ success: true, message: 'Project deleted successfully' });
});
export const getProjectTasks = asyncHandler(async (req, res) => {
    await assertProjectManagerAccess(req);
    const projectId = parseId(req.params.id, 'Project ID');
    const tasks = await projectService.getProjectTasks(projectId);
    res.json({ success: true, data: tasks });
});
export const createProjectTask = asyncHandler(async (req, res) => {
    await assertProjectManagerAccess(req);
    const user = ensureUser(req);
    const projectId = parseId(req.params.id, 'Project ID');
    const taskData = req.body?.taskData;
    if (!taskData || typeof taskData !== 'object') {
        throw new ValidationError('Task data is required');
    }
    const assigneeIds = Array.isArray(taskData.assignee_ids)
        ? taskData.assignee_ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
        : [];
    const createTaskPayload = {
        project_id: projectId,
        title: String(taskData.title || ''),
        created_by: user.id,
        assignee_ids: assigneeIds
    };
    if (taskData.description)
        createTaskPayload.description = String(taskData.description);
    if (taskData.status)
        createTaskPayload.status = String(taskData.status);
    if (taskData.start_date)
        createTaskPayload.start_date = String(taskData.start_date);
    if (taskData.due_date)
        createTaskPayload.due_date = String(taskData.due_date);
    const taskId = await projectService.createProjectTask(createTaskPayload);
    res.status(201).json({
        success: true,
        data: { id: taskId },
        message: 'Task created successfully'
    });
});
export const updateProjectTask = asyncHandler(async (req, res) => {
    await assertProjectManagerAccess(req);
    const taskId = parseId(req.params.taskId, 'Task ID');
    const taskData = req.body?.taskData;
    if (!taskData || typeof taskData !== 'object') {
        throw new ValidationError('Task data is required');
    }
    const assigneeIds = Array.isArray(taskData.assignee_ids)
        ? taskData.assignee_ids.map((id) => Number(id)).filter((id) => Number.isInteger(id) && id > 0)
        : undefined;
    const updateTaskPayload = {};
    if (taskData.title)
        updateTaskPayload.title = String(taskData.title);
    if (taskData.description)
        updateTaskPayload.description = String(taskData.description);
    if (taskData.status)
        updateTaskPayload.status = String(taskData.status);
    if (taskData.start_date)
        updateTaskPayload.start_date = String(taskData.start_date);
    if (taskData.due_date)
        updateTaskPayload.due_date = String(taskData.due_date);
    if (assigneeIds)
        updateTaskPayload.assignee_ids = assigneeIds;
    await projectService.updateProjectTask(taskId, updateTaskPayload);
    res.json({ success: true, message: 'Task updated successfully' });
});
export const deleteProjectTask = asyncHandler(async (req, res) => {
    await assertProjectManagerAccess(req);
    const taskId = parseId(req.params.taskId, 'Task ID');
    await projectService.deleteProjectTask(taskId);
    res.json({ success: true, message: 'Task deleted successfully' });
});
export const getProjectDocuments = asyncHandler(async (req, res) => {
    await assertProjectManagerAccess(req);
    const projectId = parseId(req.params.id, 'Project ID');
    const documents = await projectService.getProjectDocuments(projectId);
    res.json({ success: true, data: documents });
});
export const uploadProjectDocument = asyncHandler(async (req, res) => {
    await assertProjectManagerAccess(req);
    const user = ensureUser(req);
    const projectId = parseId(req.params.id, 'Project ID');
    if (!req.file) {
        throw new ValidationError('Document file is required');
    }
    await projectService.ensureProjectUploadDirectory();
    const documentId = await projectService.createProjectDocument({
        project_id: projectId,
        uploaded_by: user.id,
        original_name: req.file.originalname,
        file_name: req.file.filename,
        file_path: `/uploads/projects/${req.file.filename}`,
        mime_type: req.file.mimetype,
        file_size: req.file.size
    });
    res.status(201).json({
        success: true,
        data: {
            id: documentId,
            file_path: `/uploads/projects/${req.file.filename}`
        },
        message: 'Document uploaded successfully'
    });
});
export const deleteProjectDocument = asyncHandler(async (req, res) => {
    await assertProjectManagerAccess(req);
    const documentId = parseId(req.params.documentId, 'Document ID');
    const documents = await projectService.getProjectDocuments(parseId(req.params.id, 'Project ID'));
    const document = documents.find(item => item.id === documentId);
    await projectService.deleteProjectDocument(documentId);
    if (document?.file_name) {
        const localFile = join(uploadRoot, document.file_name);
        await fs.rm(localFile, { force: true });
    }
    res.json({ success: true, message: 'Document deleted successfully' });
});
//# sourceMappingURL=projectController.js.map
// User controller for Slimbooks
// Handles all user-related business logic

import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { userService } from '../services/UserService.js';
import { authConfig } from '../config/index.js';
import { emailProviderService } from '../services/EmailProviderService.js';
import { emailTemplateService } from '../services/EmailTemplateService.js';
import { 
  NotFoundError, 
  ValidationError,
  asyncHandler
} from '../middleware/index.js';
import { CreateUserRequest, UpdateUserRequest, UpdateUserResponse } from '../types/api.types.js';
import { UserRole } from '../types/index.js';

const parseRolesInput = (roles: unknown): UserRole[] | undefined => {
  if (roles === undefined || roles === null) {
    return undefined;
  }

  if (!Array.isArray(roles)) {
    throw new ValidationError('roles must be an array');
  }

  const allowedRoles: UserRole[] = ['admin', 'client_manager', 'project_manager', 'user_manager', 'user', 'viewer'];
  const normalized = Array.from(
    new Set(
      roles
        .map((role) => String(role).trim())
        .filter((role) => role.length > 0) as UserRole[]
    )
  );

  if (normalized.length === 0) {
    throw new ValidationError('At least one role is required');
  }

  for (const role of normalized) {
    if (!allowedRoles.includes(role)) {
      throw new ValidationError(`Invalid role: ${role}`);
    }
  }

  return normalized;
};

const extractUserDataPayload = (payload: unknown): Record<string, unknown> => {
  if (!payload || typeof payload !== 'object') {
    return {};
  }

  const record = payload as Record<string, unknown>;
  const nested = record.userData;
  if (nested && typeof nested === 'object') {
    return nested as Record<string, unknown>;
  }

  const inviteNested = record.inviteData;
  if (inviteNested && typeof inviteNested === 'object') {
    return inviteNested as Record<string, unknown>;
  }

  return record;
};

/**
 * Get all users
 */
export const getAllUsers = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.tenantId || req.user?.tenant_id || 1;
  const users = await userService.getAllUsers({}, tenantId);
  
  res.json({ success: true, data: users });
});

/**
 * Get user by ID
 */
export const getUserById = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  
  if (!id) {
    throw new ValidationError('User ID is required');
  }
  
  const userId = parseInt(id, 10);
  
  if (isNaN(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  const tenantId = req.tenantId || req.user?.tenant_id || 1;
  const user = await userService.getUserById(userId, tenantId);

  if (!user) {
    throw new NotFoundError('User');
  }

  res.json({ success: true, data: user });
});

/**
 * Get user by email
 */
export const getUserByEmail = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { email } = req.params;
  
  if (!email) {
    throw new ValidationError('Valid email is required');
  }

  const tenantId = req.tenantId || req.user?.tenant_id || 1;
  const user = await userService.getUserByEmail(email, tenantId);

  if (!user) {
    throw new NotFoundError('User');
  }

  res.json({ success: true, data: user });
});

/**
 * Get user by Google ID
 */
export const getUserByGoogleId = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { googleId } = req.params;
  
  if (!googleId) {
    throw new ValidationError('Valid Google ID is required');
  }

  const tenantId = req.tenantId || req.user?.tenant_id || 1;
  const user = await userService.getUserByGoogleId(googleId, tenantId);

  if (!user) {
    throw new NotFoundError('User');
  }

  res.json({ success: true, data: user });
});

/**
 * Create new user
 */
export const createUser = asyncHandler(async (req: Request<object, object, CreateUserRequest>, res: Response): Promise<void> => {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
  const bodyUserData = extractUserDataPayload(req.body);

  try {
    const roles = parseRolesInput(bodyUserData.roles);
    const rawPassword = bodyUserData.password;
    let passwordHash = typeof bodyUserData.password_hash === 'string' ? bodyUserData.password_hash : undefined;
    const name = typeof bodyUserData.name === 'string' ? bodyUserData.name : '';
    const email = typeof bodyUserData.email === 'string' ? bodyUserData.email : '';
    const username = typeof bodyUserData.username === 'string' ? bodyUserData.username : undefined;
    const role = typeof bodyUserData.role === 'string' ? (bodyUserData.role as UserRole) : undefined;
    const email_verified = Boolean(bodyUserData.email_verified);
    const google_id = typeof bodyUserData.google_id === 'string' ? bodyUserData.google_id : undefined;
    const last_login = typeof bodyUserData.last_login === 'string' ? bodyUserData.last_login : undefined;
    const failed_login_attempts = typeof bodyUserData.failed_login_attempts === 'number' ? bodyUserData.failed_login_attempts : undefined;
    const account_locked_until = typeof bodyUserData.account_locked_until === 'string' ? bodyUserData.account_locked_until : undefined;

    if (!passwordHash && typeof rawPassword === 'string' && rawPassword.trim()) {
      passwordHash = await bcrypt.hash(rawPassword.trim(), authConfig.bcryptRounds);
    }

    const createPayload: {
      name: string;
      email: string;
      username?: string;
      password_hash?: string;
      role?: UserRole;
      roles?: UserRole[];
      email_verified?: boolean;
      google_id?: string;
      last_login?: string;
      failed_login_attempts?: number;
      account_locked_until?: string;
    } = {
      name,
      email
    };
    if (username) createPayload.username = username;
    if (passwordHash) createPayload.password_hash = passwordHash;
    if (role) createPayload.role = role;
    if (roles) createPayload.roles = roles;
    if (email_verified !== undefined) createPayload.email_verified = email_verified;
    if (google_id) createPayload.google_id = google_id;
    if (last_login) createPayload.last_login = last_login;
    if (failed_login_attempts !== undefined) createPayload.failed_login_attempts = failed_login_attempts;
    if (account_locked_until) createPayload.account_locked_until = account_locked_until;

    const sanitizedCreatePayload: {
      name: string;
      email: string;
      username?: string;
      password_hash?: string;
      role?: UserRole;
      roles?: UserRole[];
      email_verified?: boolean;
      google_id?: string;
      last_login?: string;
      failed_login_attempts?: number;
      account_locked_until?: string;
    } = {
      name: createPayload.name,
      email: createPayload.email
    };
    if (createPayload.username) sanitizedCreatePayload.username = createPayload.username;
    if (createPayload.password_hash) sanitizedCreatePayload.password_hash = createPayload.password_hash;
    if (createPayload.role) sanitizedCreatePayload.role = createPayload.role;
    if (createPayload.roles) sanitizedCreatePayload.roles = createPayload.roles;
    if (createPayload.email_verified !== undefined) sanitizedCreatePayload.email_verified = createPayload.email_verified;
    if (createPayload.google_id) sanitizedCreatePayload.google_id = createPayload.google_id;
    if (createPayload.last_login) sanitizedCreatePayload.last_login = createPayload.last_login;
    if (createPayload.failed_login_attempts !== undefined) {
      sanitizedCreatePayload.failed_login_attempts = createPayload.failed_login_attempts;
    }
    if (createPayload.account_locked_until) {
      sanitizedCreatePayload.account_locked_until = createPayload.account_locked_until;
    }

    const userId = await userService.createUser({ ...sanitizedCreatePayload, tenant_id: tenantId });
    const createdUser = await userService.getUserById(userId, tenantId);

    const effectivePassword = typeof rawPassword === 'string' ? rawPassword.trim() : null;
    if (createdUser && effectivePassword) {
      const appUrl = process.env.APP_URL || 'http://localhost:5173';
      const inviteContent = await emailTemplateService.render('invitation', {
        name: createdUser.name,
        tenant_name: 'Slimbooks',
        temp_password: effectivePassword,
        app_url: appUrl
      }, tenantId);
      await emailProviderService.sendEmail({
        to: createdUser.email,
        subject: inviteContent.subject,
        html: inviteContent.html,
        text: inviteContent.text
      }, { tenantId });
    }

    res.status(201).json({ 
      success: true, 
      data: { id: userId },
      message: 'User created successfully'
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('name and email are required')) {
      throw new ValidationError('Invalid user data - name and email are required');
    } else if (errorMessage.includes('already exists')) {
      throw new ValidationError('User with this email already exists');
    }
    throw error;
  }
});

/**
 * Update user
 */
export const updateUser = asyncHandler(async (req: Request<{id: string}, UpdateUserResponse, UpdateUserRequest>, res: Response): Promise<void> => {
  const { id } = req.params;
  const userData = extractUserDataPayload(req.body);
  const userId = parseInt(id, 10);

  if (isNaN(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  try {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;

    // Mass-assignment protection: non-admin callers must not be able to set privileged fields
    const callerIsAdmin = req.user?.roles?.includes('admin') || req.user?.role === 'admin';
    const isUpdatingOtherUser = String(userId) !== String(req.user?.id);

    if (isUpdatingOtherUser && !callerIsAdmin) {
      throw new ValidationError('Admin role required to update another user');
    }

    // Strip privileged fields for non-admin callers
    if (!callerIsAdmin) {
      const privilegedFields = ['role', 'roles', 'email_verified', 'google_id', 'password_hash', 'tenant_id'];
      for (const field of privilegedFields) {
        delete (userData as Record<string, unknown>)[field];
      }
    }

    // Convert and validate user data for service layer
    const convertedUserData: Partial<{
      name: string;
      email: string;
      username: string;
      role: UserRole;
      roles: UserRole[];
      email_verified: boolean;
      google_id: string;
      password_hash: string;
    }> = {};

    // Copy all defined properties except email_verified (and tenant_id which should never be in updates)
    Object.keys(userData).forEach(key => {
      if (key !== 'email_verified' && key !== 'tenant_id' && userData[key as keyof typeof userData] !== undefined) {
        (convertedUserData as Record<string, unknown>)[key] = userData[key as keyof typeof userData];
      }
    });

    // Handle email_verified conversion separately
    if (userData.email_verified !== undefined) {
      convertedUserData.email_verified = userData.email_verified === 1;
    }

    const requestedRoles = parseRolesInput((userData as Record<string, unknown>).roles);
    const newPassword = (userData as Record<string, unknown>).password;

    if (!convertedUserData.password_hash && typeof newPassword === 'string' && newPassword.trim()) {
      convertedUserData.password_hash = await bcrypt.hash(newPassword.trim(), authConfig.bcryptRounds);
    }

    if (requestedRoles) {
      convertedUserData.roles = requestedRoles;
      if (requestedRoles[0]) {
        convertedUserData.role = requestedRoles[0];
      }
    }

    const changes = await userService.updateUser(userId, convertedUserData, tenantId);

    res.json({ 
      success: true, 
      data: { changes },
      message: 'User updated successfully'
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage === 'User data is required') {
      throw new ValidationError('User data is required');
    } else if (errorMessage === 'User not found') {
      throw new NotFoundError('User');
    } else if (errorMessage === 'No valid fields to update') {
      throw new ValidationError('No valid fields to update');
    } else if (errorMessage === 'Email is already in use') {
      throw new ValidationError('Email is already in use');
    }
    throw error;
  }
});

/**
 * Delete user
 */
export const deleteUser = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  
  if (!id) {
    throw new ValidationError('User ID is required');
  }
  
  const userId = parseInt(id, 10);

  if (isNaN(userId)) {
    throw new ValidationError('Invalid user ID');
  }
  
  try {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const changes = await userService.deleteUser(userId, tenantId);

    res.json({ 
      success: true, 
      data: { changes },
      message: 'User deleted successfully'
    });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage === 'User not found') {
      throw new NotFoundError('User');
    } else if (errorMessage === 'Cannot delete the last administrator') {
      throw new ValidationError('Cannot delete the last administrator');
    }
    throw error;
  }
});

/**
 * Update user login attempts
 */
export const updateUserLoginAttempts = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { userId, attempts, lockedUntil } = req.body;

  if (!userId || typeof userId !== 'number' || typeof attempts !== 'number') {
    throw new ValidationError('Valid userId and attempts are required');
  }

  try {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const success = await userService.updateUserLoginAttempts(userId, attempts, lockedUntil, tenantId);
    res.json({ success: true, data: { success } });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage.includes('Invalid parameters') || errorMessage.includes('required')) {
      throw new ValidationError('Invalid parameters - userId and attempts are required');
    }
    throw error;
  }
});

/**
 * Update user last login
 */
export const updateUserLastLogin = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { userId } = req.body;

  if (!userId || typeof userId !== 'number') {
    throw new ValidationError('Valid user ID is required');
  }

  try {
    const tenantId = req.tenantId || req.user?.tenant_id || 1;
    const success = await userService.updateUserLastLogin(userId, tenantId);
    res.json({ success: true, data: { success } });
  } catch (error) {
    const errorMessage = (error as Error).message;
    if (errorMessage === 'Valid user ID is required') {
      throw new ValidationError('User ID is required');
    }
    throw error;
  }
});

/**
 * Update user login attempts by ID (alternative endpoint)
 */
export const updateLoginAttemptsByUserId = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { attempts, lockedUntil } = req.body;
  
  if (!id) {
    throw new ValidationError('User ID is required');
  }
  
  const userId = parseInt(id, 10);

  if (isNaN(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  if (typeof attempts !== 'number') {
    throw new ValidationError('Valid attempts count is required');
  }

  const tenantId = req.tenantId || req.user?.tenant_id || 1;
  const success = await userService.updateUserLoginAttempts(userId, attempts, lockedUntil, tenantId);
  res.json({ success: true, data: { success } });
});

/**
 * Update user last login by ID (alternative endpoint)
 */
export const updateLastLoginByUserId = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  
  if (!id) {
    throw new ValidationError('User ID is required');
  }
  
  const userId = parseInt(id, 10);

  if (isNaN(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  const tenantId = req.tenantId || req.user?.tenant_id || 1;
  const success = await userService.updateUserLastLogin(userId, tenantId);
  res.json({ success: true, data: { success } });
});

/**
 * Verify user email
 */
export const verifyUserEmail = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  
  if (!id) {
    throw new ValidationError('User ID is required');
  }
  
  const userId = parseInt(id, 10);

  if (isNaN(userId)) {
    throw new ValidationError('Invalid user ID');
  }

  const tenantId = req.tenantId || req.user?.tenant_id || 1;
  const success = await userService.verifyUserEmail(userId, tenantId);
  res.json({ success: true, message: 'Email verified successfully' });
});

/**
 * Admin: Invite user and send temporary password
 */
export const inviteUser = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.tenantId || req.user?.tenant_id || 1;
  const bodyRecord = (req.body && typeof req.body === 'object')
    ? (req.body as Record<string, unknown>)
    : {};
  const invitePayload =
    bodyRecord.inviteData && typeof bodyRecord.inviteData === 'object'
      ? (bodyRecord.inviteData as Record<string, unknown>)
      : bodyRecord;
  const inviteData = extractUserDataPayload(invitePayload);
  const name = typeof inviteData.name === 'string' ? inviteData.name.trim() : '';
  const email = typeof inviteData.email === 'string' ? inviteData.email.trim() : '';
  const username = typeof inviteData.username === 'string' ? inviteData.username.trim() : undefined;
  const roles = inviteData.roles;
  const sendInviteEmail =
    typeof inviteData.sendInviteEmail === 'boolean' ? inviteData.sendInviteEmail : true;

  if (!name || !email) {
    throw new ValidationError('Name and email are required');
  }

  const nameValue = typeof name === 'string' ? name : '';
  const emailValue = typeof email === 'string' ? email : '';
  const usernameValue = typeof username === 'string' && username.trim().length > 0 ? username : undefined;
  const parsedRoles = parseRolesInput(roles) || ['viewer'];
  const tempPassword = `${crypto.randomBytes(6).toString('base64url')}A1!`;
  const password_hash = await bcrypt.hash(tempPassword, authConfig.bcryptRounds);

  const createPayload: {
    name: string;
    email: string;
    username?: string;
    password_hash: string;
    role: UserRole;
    roles: UserRole[];
    email_verified: boolean;
  } = {
    name: nameValue,
    email: emailValue,
    password_hash,
    role: parsedRoles[0] || 'viewer',
    roles: parsedRoles,
    email_verified: false
  };
  if (usernameValue) {
    createPayload.username = usernameValue;
  }

  const userId = await userService.createUser({ ...createPayload, tenant_id: tenantId });
  const createdUser = await userService.getUserById(userId, tenantId);

  if (createdUser && sendInviteEmail) {
    const appUrl = process.env.APP_URL || 'http://localhost:5173';
    const inviteContent = await emailTemplateService.render('invitation', {
      name: createdUser.name,
      tenant_name: 'Slimbooks',
      temp_password: tempPassword,
      app_url: appUrl
    }, tenantId);
    await emailProviderService.sendEmail({
      to: createdUser.email,
      subject: inviteContent.subject,
      html: inviteContent.html,
      text: inviteContent.text
    }, { tenantId });
  }

  res.status(201).json({
    success: true,
    data: {
      id: userId,
      tempPassword
    },
    message: 'User invited successfully'
  });
});

/**
 * Admin: Reset user password directly
 */
export const resetUserPasswordByAdmin = asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const tenantId = req.tenantId || req.user?.tenant_id || 1;
  const { id } = req.params;
  if (!id) {
    throw new ValidationError('User ID is required');
  }
  const userId = parseInt(id, 10);
  const { newPassword, sendEmail = false } = req.body || {};

  if (isNaN(userId)) {
    throw new ValidationError('Invalid user ID');
  }
  if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 8) {
    throw new ValidationError('newPassword must be at least 8 characters');
  }

  const user = await userService.getUserById(userId, tenantId);
  if (!user) {
    throw new NotFoundError('User');
  }

  const passwordHash = await bcrypt.hash(newPassword.trim(), authConfig.bcryptRounds);
  await userService.updateUser(userId, { password_hash: passwordHash }, tenantId);
  await userService.updateUserLoginAttempts(userId, 0, null, tenantId);

  if (sendEmail) {
    await emailProviderService.sendEmail({
      to: user.email,
      subject: 'Your Slimbooks password was reset',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto;">
          <h2>Password reset</h2>
          <p>Hello ${user.name},</p>
          <p>An administrator reset your password.</p>
          <p><strong>New password:</strong> ${newPassword}</p>
          <p>Please log in and update it immediately.</p>
        </div>
      `,
      text: `Hello ${user.name},\n\nAn administrator reset your Slimbooks password.\nNew password: ${newPassword}\n\nPlease log in and update it immediately.`
    }, { tenantId });
  }

  res.json({
    success: true,
    message: 'Password reset successfully'
  });
});

export const adminResetUserPassword = resetUserPasswordByAdmin;
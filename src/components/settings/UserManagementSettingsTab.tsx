import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { KeyRound, MailPlus, Shield, UserCog, Users2 } from 'lucide-react';
import { toast } from 'sonner';
import { sqliteService } from '@/services/sqlite.svc';
import { getButtonClasses, themeClasses } from '@/utils/themeUtils.util';
import type { AppRole, RoleAwareUser, SettingsTabRef } from '@/types';

type UserEditorState = {
  id: number;
  name: string;
  email: string;
  username: string;
  roles: AppRole[];
};

const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Admin',
  client_manager: 'Client Manager',
  project_manager: 'Project Manager',
  user_manager: 'User Manager'
};

const getUserRoles = (user: RoleAwareUser): AppRole[] => {
  const fromArray = Array.isArray(user.roles) ? user.roles : [];
  const fallback = user.role === 'admin' ? ['admin'] : [];
  return Array.from(new Set([...fromArray, ...fallback])) as AppRole[];
};

export const UserManagementSettingsTab = forwardRef<SettingsTabRef>((_props, ref) => {
  const [users, setUsers] = useState<RoleAwareUser[]>([]);
  const [roleCatalog, setRoleCatalog] = useState<AppRole[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInviting, setIsInviting] = useState(false);
  const [isUpdatingUserId, setIsUpdatingUserId] = useState<number | null>(null);
  const [isResettingUserId, setIsResettingUserId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [inviteForm, setInviteForm] = useState({
    name: '',
    email: '',
    username: '',
    roles: ['project_manager'] as AppRole[]
  });

  const [editing, setEditing] = useState<UserEditorState | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [inviteResult, setInviteResult] = useState<{ email: string; temporaryPassword: string } | null>(null);

  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const [usersData, roles] = await Promise.all([
        sqliteService.getUsers(),
        sqliteService.getRoleCatalog()
      ]);
      setUsers(usersData);
      setRoleCatalog(roles);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to load user management data');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useImperativeHandle(ref, () => ({
    saveSettings: async () => {
      await loadData();
    }
  }));

  const filteredUsers = useMemo(() => {
    if (!searchTerm.trim()) return users;
    const needle = searchTerm.toLowerCase();
    return users.filter(user => {
      const roles = getUserRoles(user).map(role => ROLE_LABELS[role].toLowerCase()).join(' ');
      return (
        user.name.toLowerCase().includes(needle) ||
        user.email.toLowerCase().includes(needle) ||
        user.username.toLowerCase().includes(needle) ||
        roles.includes(needle)
      );
    });
  }, [searchTerm, users]);

  const toggleRole = (roles: AppRole[], role: AppRole) => {
    if (roles.includes(role)) {
      return roles.filter(item => item !== role);
    }
    return [...roles, role];
  };

  const handleInviteUser = async () => {
    if (!inviteForm.name.trim() || !inviteForm.email.trim()) {
      toast.error('Name and email are required');
      return;
    }
    if (inviteForm.roles.length === 0) {
      toast.error('Select at least one role');
      return;
    }

    setIsInviting(true);
    try {
      const inviteResult = await sqliteService.inviteUser({
        name: inviteForm.name.trim(),
        email: inviteForm.email.trim(),
        username: inviteForm.username.trim() || undefined,
        roles: inviteForm.roles
      });
      setInviteResult({
        email: inviteForm.email.trim(),
        temporaryPassword: inviteResult.temporary_password
      });
      setInviteForm({
        name: '',
        email: '',
        username: '',
        roles: ['project_manager']
      });
      toast.success('User invited successfully');
      await loadData();
    } catch (error) {
      toast.error((error as Error).message || 'Failed to invite user');
    } finally {
      setIsInviting(false);
    }
  };

  const handleStartEditUser = (user: RoleAwareUser) => {
    setEditing({
      id: user.id,
      name: user.name,
      email: user.email,
      username: user.username,
      roles: getUserRoles(user)
    });
    setResetPasswordValue('');
  };

  const handleSaveUser = async () => {
    if (!editing) return;
    if (!editing.name.trim() || !editing.email.trim()) {
      toast.error('Name and email are required');
      return;
    }
    if (editing.roles.length === 0) {
      toast.error('At least one role is required');
      return;
    }

    setIsUpdatingUserId(editing.id);
    try {
      await sqliteService.updateUser(editing.id, {
        name: editing.name.trim(),
        email: editing.email.trim(),
        username: editing.username.trim() || editing.email.trim(),
        roles: editing.roles,
        role: editing.roles.includes('admin') ? 'admin' : 'user'
      });
      await sqliteService.assignUserRoles(editing.id, editing.roles);
      toast.success('User updated');
      setEditing(null);
      await loadData();
    } catch (error) {
      toast.error((error as Error).message || 'Failed to update user');
    } finally {
      setIsUpdatingUserId(null);
    }
  };

  const handleResetPassword = async () => {
    if (!editing) return;
    if (resetPasswordValue.trim().length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setIsResettingUserId(editing.id);
    try {
      await sqliteService.adminResetUserPassword(editing.id, resetPasswordValue.trim());
      setResetPasswordValue('');
      toast.success('Password reset');
    } catch (error) {
      toast.error((error as Error).message || 'Failed to reset password');
    } finally {
      setIsResettingUserId(null);
    }
  };

  return (
    <div className="space-y-6">
      <section className={themeClasses.card}>
        <div className="mb-4 flex items-center gap-2">
          <MailPlus className={themeClasses.icon} />
          <h3 className={themeClasses.cardTitle}>Invite User</h3>
        </div>
        <p className={themeClasses.mutedText}>Create user accounts and assign one or more roles at invite time.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input
            type="text"
            value={inviteForm.name}
            onChange={event => setInviteForm(prev => ({ ...prev, name: event.target.value }))}
            className={themeClasses.formInput}
            placeholder="Full name"
          />
          <input
            type="email"
            value={inviteForm.email}
            onChange={event => setInviteForm(prev => ({ ...prev, email: event.target.value }))}
            className={themeClasses.formInput}
            placeholder="Email address"
          />
          <input
            type="text"
            value={inviteForm.username}
            onChange={event => setInviteForm(prev => ({ ...prev, username: event.target.value }))}
            className={themeClasses.formInput}
            placeholder="Username (optional)"
          />
        </div>
        <div className="mt-4">
          <p className={themeClasses.label}>Roles</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {roleCatalog.map(role => (
              <button
                key={`invite-${role}`}
                type="button"
                onClick={() =>
                  setInviteForm(prev => ({
                    ...prev,
                    roles: toggleRole(prev.roles, role)
                  }))
                }
                className={[
                  'rounded-md border px-3 py-1.5 text-sm transition-colors',
                  inviteForm.roles.includes(role)
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-card text-card-foreground hover:bg-accent'
                ].join(' ')}
              >
                {ROLE_LABELS[role]}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={getButtonClasses('primary')}
            onClick={handleInviteUser}
            disabled={isInviting}
          >
            <MailPlus className={themeClasses.iconButton} />
            {isInviting ? 'Inviting...' : 'Invite User'}
          </button>
          {inviteResult ? (
            <span className={themeClasses.smallText}>
              Temporary password for {inviteResult.email}: <strong>{inviteResult.temporaryPassword}</strong>
            </span>
          ) : null}
        </div>
      </section>

      <section className={themeClasses.card}>
        <div className="mb-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Users2 className={themeClasses.icon} />
            <h3 className={themeClasses.cardTitle}>Existing Users</h3>
          </div>
          <button
            type="button"
            onClick={loadData}
            className={getButtonClasses('secondary')}
            disabled={isRefreshing}
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        <input
          type="text"
          value={searchTerm}
          onChange={event => setSearchTerm(event.target.value)}
          className={themeClasses.formInput}
          placeholder="Search users by name, email, username, or role..."
        />

        <div className="mt-4 space-y-3">
          {isLoading ? (
            <p className={themeClasses.mutedText}>Loading users...</p>
          ) : filteredUsers.length === 0 ? (
            <p className={themeClasses.mutedText}>No users found.</p>
          ) : (
            filteredUsers.map(user => (
              <button
                type="button"
                key={user.id}
                className="w-full rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent/40"
                onClick={() => handleStartEditUser(user)}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-card-foreground">{user.name}</p>
                    <p className={themeClasses.smallText}>{user.email}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {getUserRoles(user).map(role => (
                      <span key={`${user.id}-${role}`} className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {ROLE_LABELS[role]}
                      </span>
                    ))}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </section>

      {editing ? (
        <section className={themeClasses.card}>
          <div className="mb-4 flex items-center gap-2">
            <UserCog className={themeClasses.icon} />
            <h3 className={themeClasses.cardTitle}>Edit User</h3>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <input
              type="text"
              value={editing.name}
              onChange={event => setEditing(prev => (prev ? { ...prev, name: event.target.value } : prev))}
              className={themeClasses.formInput}
              placeholder="Full name"
            />
            <input
              type="email"
              value={editing.email}
              onChange={event => setEditing(prev => (prev ? { ...prev, email: event.target.value } : prev))}
              className={themeClasses.formInput}
              placeholder="Email address"
            />
            <input
              type="text"
              value={editing.username}
              onChange={event => setEditing(prev => (prev ? { ...prev, username: event.target.value } : prev))}
              className={themeClasses.formInput}
              placeholder="Username"
            />
          </div>
          <div className="mt-4">
            <p className={themeClasses.label}>Assigned Roles</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {roleCatalog.map(role => (
                <button
                  key={`edit-${role}`}
                  type="button"
                  onClick={() =>
                    setEditing(prev => (prev ? { ...prev, roles: toggleRole(prev.roles, role) } : prev))
                  }
                  className={[
                    'rounded-md border px-3 py-1.5 text-sm transition-colors',
                    editing.roles.includes(role)
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-card-foreground hover:bg-accent'
                  ].join(' ')}
                >
                  <Shield className="mr-1 inline h-3.5 w-3.5" />
                  {ROLE_LABELS[role]}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              className={getButtonClasses('primary')}
              onClick={handleSaveUser}
              disabled={isUpdatingUserId === editing.id}
            >
              <UserCog className={themeClasses.iconButton} />
              {isUpdatingUserId === editing.id ? 'Saving...' : 'Save User'}
            </button>
            <button
              type="button"
              className={getButtonClasses('secondary')}
              onClick={() => setEditing(null)}
            >
              Cancel
            </button>
          </div>

          <div className="mt-6 rounded-lg border border-border p-4">
            <div className="mb-3 flex items-center gap-2">
              <KeyRound className={themeClasses.icon} />
              <h4 className="font-medium text-card-foreground">Admin Password Reset</h4>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="password"
                value={resetPasswordValue}
                onChange={event => setResetPasswordValue(event.target.value)}
                className={themeClasses.formInput}
                placeholder="New temporary password"
              />
              <button
                type="button"
                className={getButtonClasses('secondary')}
                onClick={handleResetPassword}
                disabled={isResettingUserId === editing.id}
              >
                {isResettingUserId === editing.id ? 'Resetting...' : 'Reset Password'}
              </button>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
});

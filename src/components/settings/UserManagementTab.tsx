import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react';
import { RefreshCw, KeyRound, Plus, Shield, Users } from 'lucide-react';
import { toast } from 'sonner';
import { authenticatedFetch } from '@/utils/api';
import { getButtonClasses, themeClasses } from '@/utils/themeUtils.util';
import type { SettingsTabRef } from '@/types/components/settings.types';
import type { User } from '@/types';
import { APP_ROLES, AppRole, getRoleDisplayName, hasRole, normalizeUserRoles } from '@/auth/roles';

interface InviteFormState {
  name: string;
  email: string;
  username: string;
  sendInviteEmail: boolean;
  roles: AppRole[];
}

interface ResetPasswordState {
  userId: number | null;
  password: string;
  sendEmail: boolean;
}

interface UsersResponse {
  success: boolean;
  data?: User[];
}

const defaultInviteState: InviteFormState = {
  name: '',
  email: '',
  username: '',
  sendInviteEmail: true,
  roles: ['viewer']
};

export const UserManagementTab = forwardRef<SettingsTabRef>((_props, ref) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inviteForm, setInviteForm] = useState<InviteFormState>(defaultInviteState);
  const [resetPassword, setResetPassword] = useState<ResetPasswordState>({
    userId: null,
    password: '',
    sendEmail: true
  });

  const loadUsers = async () => {
    setLoading(true);
    try {
      const response = await authenticatedFetch('/api/users');
      const result = (await response.json()) as UsersResponse;
      setUsers(Array.isArray(result.data) ? result.data : []);
    } catch (error) {
      console.error('Failed to load users:', error);
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const groupedUsers = useMemo(() => {
    const sorted = [...users].sort((a, b) => {
      const aName = a.name || a.email || '';
      const bName = b.name || b.email || '';
      return aName.localeCompare(bName);
    });
    return sorted;
  }, [users]);

  const toggleInviteRole = (role: AppRole) => {
    setInviteForm((prev) => {
      const exists = prev.roles.includes(role);
      const roles = exists ? prev.roles.filter((r) => r !== role) : [...prev.roles, role];
      return {
        ...prev,
        roles: roles.length > 0 ? roles : ['viewer']
      };
    });
  };

  const toggleUserRole = async (user: User, role: AppRole) => {
    const currentRoles = normalizeUserRoles(user);
    const has = currentRoles.includes(role);
    const nextRoles = has ? currentRoles.filter((r) => r !== role) : [...currentRoles, role];

    if (nextRoles.length === 0) {
      toast.error('A user must have at least one role');
      return;
    }

    setSaving(true);
    try {
      await authenticatedFetch(`/api/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          userData: {
            roles: nextRoles
          }
        })
      });
      toast.success('User roles updated');
      await loadUsers();
    } catch (error) {
      console.error('Failed to update user roles:', error);
      toast.error('Failed to update user roles');
    } finally {
      setSaving(false);
    }
  };

  const handleInvite = async () => {
    if (!inviteForm.name.trim() || !inviteForm.email.trim()) {
      toast.error('Name and email are required');
      return;
    }

    setSaving(true);
    try {
      const response = await authenticatedFetch('/api/users/invite', {
        method: 'POST',
        body: JSON.stringify({
          inviteData: {
            name: inviteForm.name.trim(),
            email: inviteForm.email.trim(),
            username: inviteForm.username.trim() || undefined,
            sendInviteEmail: inviteForm.sendInviteEmail,
            roles: inviteForm.roles
          }
        })
      });
      const result = await response.json();
      const tempPassword = result?.data?.tempPassword;
      if (tempPassword) {
        toast.success(`User invited. Temporary password: ${tempPassword}`);
      } else {
        toast.success('User invited');
      }
      setInviteForm(defaultInviteState);
      await loadUsers();
    } catch (error) {
      console.error('Failed to invite user:', error);
      toast.error('Failed to invite user');
    } finally {
      setSaving(false);
    }
  };

  const handleAdminResetPassword = async () => {
    if (!resetPassword.userId) {
      toast.error('Select a user first');
      return;
    }
    if (resetPassword.password.trim().length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }

    setSaving(true);
    try {
      await authenticatedFetch(`/api/users/${resetPassword.userId}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({
          newPassword: resetPassword.password.trim(),
          sendEmail: resetPassword.sendEmail
        })
      });
      toast.success('Password reset successfully');
      setResetPassword({ userId: null, password: '', sendEmail: true });
    } catch (error) {
      console.error('Failed to reset password:', error);
      toast.error('Failed to reset password');
    } finally {
      setSaving(false);
    }
  };

  useImperativeHandle(ref, () => ({
    saveSettings: async () => {
      // Actions in this tab are auto-saved; keep compatibility with Settings shell button.
      await loadUsers();
      toast.success('User data refreshed');
    }
  }), [users]);

  return (
    <div className="space-y-6">
      <div className={themeClasses.card}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <h3 className={themeClasses.cardTitle}>Invite User</h3>
          </div>
          <button
            type="button"
            onClick={loadUsers}
            className={getButtonClasses('outline')}
            disabled={loading || saving}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={themeClasses.label}>Name</label>
            <input
              className={themeClasses.input}
              value={inviteForm.name}
              onChange={(e) => setInviteForm((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Jane Doe"
            />
          </div>
          <div>
            <label className={themeClasses.label}>Email</label>
            <input
              className={themeClasses.input}
              value={inviteForm.email}
              onChange={(e) => setInviteForm((prev) => ({ ...prev, email: e.target.value }))}
              placeholder="jane@example.com"
              type="email"
            />
          </div>
          <div>
            <label className={themeClasses.label}>Username (optional)</label>
            <input
              className={themeClasses.input}
              value={inviteForm.username}
              onChange={(e) => setInviteForm((prev) => ({ ...prev, username: e.target.value }))}
              placeholder="jane"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className={themeClasses.label}>Roles (multiple allowed)</label>
          <div className="flex flex-wrap gap-2">
            {APP_ROLES.map((role) => {
              const active = inviteForm.roles.includes(role);
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => toggleInviteRole(role)}
                  className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                    active
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-foreground border-border hover:bg-accent'
                  }`}
                >
                  {getRoleDisplayName(role)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <input
            id="sendInviteEmail"
            type="checkbox"
            checked={inviteForm.sendInviteEmail}
            onChange={(e) => setInviteForm((prev) => ({ ...prev, sendInviteEmail: e.target.checked }))}
          />
          <label htmlFor="sendInviteEmail" className={themeClasses.smallText}>
            Send invitation email with temporary password
          </label>
        </div>

        <div className="mt-5">
          <button
            type="button"
            className={getButtonClasses('primary')}
            onClick={handleInvite}
            disabled={saving}
          >
            <Plus className="h-4 w-4 mr-2" />
            Invite User
          </button>
        </div>
      </div>

      <div className={themeClasses.card}>
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="h-5 w-5 text-primary" />
          <h3 className={themeClasses.cardTitle}>Admin Password Reset</h3>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={themeClasses.label}>User</label>
            <select
              className={themeClasses.select}
              value={resetPassword.userId ?? ''}
              onChange={(e) =>
                setResetPassword((prev) => ({
                  ...prev,
                  userId: e.target.value ? Number(e.target.value) : null
                }))
              }
            >
              <option value="">Select user</option>
              {groupedUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.email})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={themeClasses.label}>New Password</label>
            <input
              type="text"
              className={themeClasses.input}
              value={resetPassword.password}
              onChange={(e) =>
                setResetPassword((prev) => ({
                  ...prev,
                  password: e.target.value
                }))
              }
              placeholder="At least 8 characters"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              className={getButtonClasses('primary')}
              onClick={handleAdminResetPassword}
              disabled={saving}
            >
              Reset Password
            </button>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input
            id="sendResetEmail"
            type="checkbox"
            checked={resetPassword.sendEmail}
            onChange={(e) => setResetPassword((prev) => ({ ...prev, sendEmail: e.target.checked }))}
          />
          <label htmlFor="sendResetEmail" className={themeClasses.smallText}>
            Send email notification with new password
          </label>
        </div>
      </div>

      <div className={themeClasses.card}>
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-5 w-5 text-primary" />
          <h3 className={themeClasses.cardTitle}>Users & Roles</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Roles</th>
                <th className="py-2 pr-3">Last Login</th>
              </tr>
            </thead>
            <tbody>
              {groupedUsers.map((user) => {
                const roles = normalizeUserRoles(user);
                const isOnlyAdminAccount = hasRole(user, 'admin') && users.filter((candidate) => hasRole(candidate, 'admin')).length <= 1;
                return (
                  <tr key={user.id} className="border-b border-border/60 align-top">
                    <td className="py-3 pr-3">{user.name}</td>
                    <td className="py-3 pr-3">{user.email}</td>
                    <td className="py-3 pr-3">
                      <div className="flex flex-wrap gap-2">
                        {APP_ROLES.map((role) => {
                          const active = roles.includes(role);
                          return (
                            <button
                              key={`${user.id}-${role}`}
                              type="button"
                              onClick={() => toggleUserRole(user, role)}
                              disabled={saving || (role === 'admin' && isOnlyAdminAccount && roles.includes('admin'))}
                              className={`px-2 py-1 rounded text-xs border transition-colors ${
                                active
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-background text-foreground border-border hover:bg-accent'
                              }`}
                            >
                              {getRoleDisplayName(role)}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="py-3 pr-3">{user.last_login || '-'}</td>
                  </tr>
                );
              })}
              {groupedUsers.length === 0 && !loading && (
                <tr>
                  <td className="py-4 text-muted-foreground" colSpan={4}>
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});

UserManagementTab.displayName = 'UserManagementTab';

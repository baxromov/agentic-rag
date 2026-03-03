import React, { useEffect, useState } from "react";
import {
  UsersIcon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { API_BASE_URL } from "../../config/api";
import { apiFetch } from "../../config/apiClient";
import type { User, UserRole } from "../../types/auth";

interface Department {
  id: string;
  name: string;
}

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDeptModal, setShowDeptModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Form state
  const [formUsername, setFormUsername] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formFullName, setFormFullName] = useState("");
  const [formDepartment, setFormDepartment] = useState("");
  const [formRole, setFormRole] = useState<UserRole>("user");
  const [formActive, setFormActive] = useState(true);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  // Department form state
  const [newDeptName, setNewDeptName] = useState("");
  const [deptError, setDeptError] = useState("");

  const fetchUsers = async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/admin/users`);
      if (res.ok) {
        setUsers(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch users:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDepartments = async () => {
    try {
      const res = await apiFetch(`${API_BASE_URL}/admin/departments`);
      if (res.ok) {
        setDepartments(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch departments:", err);
    }
  };

  const handleAddDepartment = async () => {
    const name = newDeptName.trim();
    if (!name) return;
    setDeptError("");
    try {
      const res = await apiFetch(`${API_BASE_URL}/admin/departments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Failed" }));
        throw new Error(err.detail);
      }
      setNewDeptName("");
      await fetchDepartments();
    } catch (err) {
      setDeptError(err instanceof Error ? err.message : "Failed");
    }
  };

  const handleDeleteDepartment = async (dept: Department) => {
    if (!confirm(`Delete department "${dept.name}"?`)) return;
    try {
      await apiFetch(`${API_BASE_URL}/admin/departments/${dept.id}`, {
        method: "DELETE",
      });
      await fetchDepartments();
    } catch (err) {
      console.error("Failed to delete department:", err);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchDepartments();
  }, []);

  const openCreateModal = () => {
    setEditingUser(null);
    setFormUsername("");
    setFormPassword("");
    setFormFullName("");
    setFormDepartment("");
    setFormRole("user");
    setFormActive(true);
    setFormError("");
    setShowModal(true);
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setFormUsername(user.username);
    setFormPassword("");
    setFormFullName(user.full_name);
    setFormDepartment(user.department || "");
    setFormRole(user.role);
    setFormActive(user.is_active);
    setFormError("");
    setShowModal(true);
  };

  const handleSave = async () => {
    setFormError("");
    setSaving(true);

    try {
      if (editingUser) {
        // Update
        const body: Record<string, unknown> = {};
        if (formPassword) body.password = formPassword;
        if (formRole !== editingUser.role) body.role = formRole;
        if (formFullName !== editingUser.full_name)
          body.full_name = formFullName;
        if (formDepartment !== (editingUser.department || ""))
          body.department = formDepartment;
        if (formActive !== editingUser.is_active) body.is_active = formActive;

        const res = await apiFetch(
          `${API_BASE_URL}/admin/users/${editingUser.id}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
        );

        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: "Update failed" }));
          throw new Error(err.detail);
        }
      } else {
        // Create
        const res = await apiFetch(`${API_BASE_URL}/admin/users`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: formUsername,
            password: formPassword,
            role: formRole,
            full_name: formFullName,
            department: formDepartment,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ detail: "Create failed" }));
          throw new Error(err.detail);
        }
      }

      setShowModal(false);
      await fetchUsers();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Operation failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user: User) => {
    if (!confirm(`Delete user "${user.username}"? This cannot be undone.`))
      return;

    try {
      const res = await apiFetch(`${API_BASE_URL}/admin/users/${user.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Delete failed" }));
        console.error("Failed to delete user:", err.detail);
        return;
      }

      await fetchUsers();
    } catch (err) {
      console.error("Failed to delete user:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-page">
        <div className="w-12 h-12 border-4 border-border-default border-t-blue-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-page">
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-text-primary flex items-center gap-3">
              <UsersIcon className="w-8 h-8 text-blue-400" />
              User Management
            </h1>
            <p className="text-text-secondary mt-1">
              Manage user accounts and permissions
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setDeptError(""); setNewDeptName(""); setShowDeptModal(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-input hover:bg-hover text-text-secondary rounded-lg font-medium transition-colors border border-border-default"
            >
              Departments
            </button>
            <button
              onClick={openCreateModal}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              <PlusIcon className="w-5 h-5" />
              Create User
            </button>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-card rounded-2xl border border-border-default overflow-hidden">
          <table className="w-full">
            <thead className="bg-input/50 border-b border-border-default">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-text-muted uppercase">
                  User
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-text-muted uppercase">
                  Department
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-text-muted uppercase">
                  Role
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-text-muted uppercase">
                  Status
                </th>
                <th className="px-6 py-4 text-left text-xs font-medium text-text-muted uppercase">
                  Last Login
                </th>
                <th className="px-6 py-4 text-right text-xs font-medium text-text-muted uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-input/50">
                  <td className="px-6 py-4">
                    <div>
                      <p className="text-sm font-medium text-text-primary">
                        {user.full_name || user.username}
                      </p>
                      <p className="text-xs text-text-muted">@{user.username}</p>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-text-secondary">
                    {user.department || "—"}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-3 py-1 text-xs font-medium rounded-full ${
                        user.role === "admin"
                          ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                          : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`flex items-center gap-2 text-sm ${
                        user.is_active ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      <div
                        className={`w-2 h-2 rounded-full ${
                          user.is_active ? "bg-green-400" : "bg-red-400"
                        }`}
                      />
                      {user.is_active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-text-secondary">
                    {user.last_login
                      ? new Date(user.last_login).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "Never"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEditModal(user)}
                        className="p-2 hover:bg-hover rounded-lg transition-colors"
                        title="Edit user"
                      >
                        <PencilSquareIcon className="w-4 h-4 text-blue-400" />
                      </button>
                      <button
                        onClick={() => handleDelete(user)}
                        className="p-2 hover:bg-hover rounded-lg transition-colors"
                        title="Delete user"
                      >
                        <TrashIcon className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {users.length === 0 && (
            <div className="text-center py-12 text-text-muted">
              <UsersIcon className="w-16 h-16 mx-auto mb-4" />
              <p>No users found</p>
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6">
          <div className="bg-card border border-border-default rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-text-primary">
                {editingUser ? "Edit User" : "Create User"}
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 hover:bg-input rounded-lg transition-colors"
              >
                <XMarkIcon className="w-5 h-5 text-text-secondary" />
              </button>
            </div>

            {formError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {formError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Username
                </label>
                <input
                  type="text"
                  value={formUsername}
                  onChange={(e) => setFormUsername(e.target.value)}
                  disabled={!!editingUser}
                  className="w-full px-4 py-2.5 bg-input border border-border-default focus:border-blue-500 rounded-lg outline-none text-text-primary disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  {editingUser
                    ? "New Password (leave empty to keep)"
                    : "Password"}
                </label>
                <input
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  className="w-full px-4 py-2.5 bg-input border border-border-default focus:border-blue-500 rounded-lg outline-none text-text-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={formFullName}
                  onChange={(e) => setFormFullName(e.target.value)}
                  className="w-full px-4 py-2.5 bg-input border border-border-default focus:border-blue-500 rounded-lg outline-none text-text-primary"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Department
                </label>
                <select
                  value={formDepartment}
                  onChange={(e) => setFormDepartment(e.target.value)}
                  className="w-full px-4 py-2.5 bg-input border border-border-default focus:border-blue-500 rounded-lg outline-none text-text-primary"
                >
                  <option value="">Select department</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.name}>
                      {dept.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-text-secondary mb-1">
                  Role
                </label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as UserRole)}
                  className="w-full px-4 py-2.5 bg-input border border-border-default focus:border-blue-500 rounded-lg outline-none text-text-primary"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {editingUser && (
                <div className="flex items-center gap-3">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formActive}
                      onChange={(e) => setFormActive(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-hover peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                  <span className="text-sm text-text-secondary">Account active</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 mt-6">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2.5 bg-input hover:bg-hover text-text-secondary rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={
                  saving ||
                  (!editingUser && (!formUsername || !formPassword))
                }
                className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {saving ? "Saving..." : editingUser ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Departments Modal */}
      {showDeptModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-6">
          <div className="bg-card border border-border-default rounded-2xl shadow-2xl max-w-sm w-full p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold text-text-primary">
                Manage Departments
              </h2>
              <button
                onClick={() => setShowDeptModal(false)}
                className="p-2 hover:bg-input rounded-lg transition-colors"
              >
                <XMarkIcon className="w-5 h-5 text-text-secondary" />
              </button>
            </div>

            {deptError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {deptError}
              </div>
            )}

            {/* Add new department */}
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                value={newDeptName}
                onChange={(e) => setNewDeptName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddDepartment()}
                placeholder="New department name"
                className="flex-1 px-4 py-2.5 bg-input border border-border-default focus:border-blue-500 rounded-lg outline-none text-text-primary text-sm"
              />
              <button
                onClick={handleAddDepartment}
                disabled={!newDeptName.trim()}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 text-sm"
              >
                Add
              </button>
            </div>

            {/* Department list */}
            <div className="space-y-2 max-h-64 overflow-auto">
              {departments.length === 0 && (
                <p className="text-text-muted text-sm text-center py-4">
                  No departments yet
                </p>
              )}
              {departments.map((dept) => (
                <div
                  key={dept.id}
                  className="flex items-center justify-between px-4 py-3 bg-input/50 rounded-lg"
                >
                  <span className="text-sm text-text-primary">{dept.name}</span>
                  <button
                    onClick={() => handleDeleteDepartment(dept)}
                    className="p-1.5 hover:bg-hover rounded-lg transition-colors"
                    title="Delete department"
                  >
                    <TrashIcon className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

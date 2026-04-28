import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { AlertTriangle, ArrowLeft, Check, Save, Trash2 } from "lucide-react";
import { createManagedUser, deleteCurrentUser, listManagedUsers, updateCurrentUserProfile, updateManagedUserRole, type ManagedUser } from "../data/apiClient";
import { useAuth } from "../context/AuthContext";
import { formatRoleLabel, managedRoleOptions } from "../data/roleLabels";

export function Profile() {
  const { user, logout, setSessionUser } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [email, setEmail] = useState(user?.email || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [adminMessage, setAdminMessage] = useState("");
  const [adminError, setAdminError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [newUserDisplayName, setNewUserDisplayName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<"admin" | "user">("user");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [roleDrafts, setRoleDrafts] = useState<Record<number, "admin" | "user">>({});
  const [savingRoleUserId, setSavingRoleUserId] = useState<number | null>(null);

  useEffect(() => {
    setDisplayName(user?.displayName || "");
    setEmail(user?.email || "");
  }, [user]);

  useEffect(() => {
    if (!user || user.role !== "admin") {
      setManagedUsers([]);
      return;
    }

    void (async () => {
      try {
        const rows = await listManagedUsers();
        setManagedUsers(rows);
      } catch (err) {
        console.error("Failed to load users", err);
      }
    })();
  }, [user]);

  if (!user) {
    return null;
  }

  const handleSaveProfile = async () => {
    setProfileMessage("");
    setProfileError("");
    setIsSaving(true);

    try {
      if (newPassword || confirmPassword || currentPassword) {
        if (!currentPassword) {
          throw new Error("Current password is required to change password");
        }
        if (newPassword !== confirmPassword) {
          throw new Error("New password and confirmation do not match");
        }
      }

      const result = await updateCurrentUserProfile({
        displayName,
        email,
        currentPassword: currentPassword || undefined,
        newPassword: newPassword || undefined,
      });

      setSessionUser(result.user);
      setDisplayName(result.user.displayName);
      setEmail(result.user.email);
      setProfileMessage("Profile updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    const confirmed = window.confirm(
      "Delete your account? This will remove your profile, sessions, and bookmarks."
    );

    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    setProfileError("");

    try {
      await deleteCurrentUser();
      await logout();
      navigate("/login", { replace: true });
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to delete account");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCreateUser = async () => {
    setAdminError("");
    setAdminMessage("");
    setIsCreatingUser(true);

    try {
      if (!newUserDisplayName.trim() || !newUserEmail.trim() || !newUserPassword.trim()) {
        throw new Error("Display name, email, and password are required");
      }

      const result = await createManagedUser({
        displayName: newUserDisplayName.trim(),
        email: newUserEmail.trim().toLowerCase(),
        role: newUserRole,
        password: newUserPassword,
      });

      setManagedUsers((prev) => [result.user, ...prev]);
      setNewUserDisplayName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserRole("user");
      setAdminMessage(`User ${result.user.email} created successfully.`);
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : "Failed to create user account");
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleUpdateUserRole = async (managedUser: ManagedUser) => {
    setAdminError("");
    setAdminMessage("");
    setSavingRoleUserId(managedUser.id);

    try {
      const selectedRole = roleDrafts[managedUser.id] ?? (managedUser.role as "admin" | "user");
      if (selectedRole === managedUser.role) {
        setAdminMessage(`Role for ${managedUser.email} is already ${formatRoleLabel(managedUser.role)}.`);
        return;
      }

      const result = await updateManagedUserRole(managedUser.id, { role: selectedRole });
      setManagedUsers((prev) => prev.map((userItem) => (userItem.id === managedUser.id ? result.user : userItem)));
      setRoleDrafts((prev) => ({ ...prev, [managedUser.id]: result.user.role as "admin" | "user" }));

      if (user.id === managedUser.id) {
        setSessionUser(result.user);
      }

      setAdminMessage(`Updated ${result.user.displayName} to ${formatRoleLabel(result.user.role)}.`);
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : "Failed to update user role");
    } finally {
      setSavingRoleUserId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
          <p className="text-gray-600 mt-1">Manage your account details and security settings</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Account Details</h2>
            <p className="text-sm text-gray-600 mt-1">Edit the profile fields shown in the header.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Required for password changes"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
              />
            </div>
          </div>

          {profileMessage && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <Check className="w-4 h-4" />
              {profileMessage}
            </div>
          )}
          {profileError && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4" />
              {profileError}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveProfile}
              disabled={isSaving}
              className="px-4 py-2 bg-[#E31937] text-white rounded-lg hover:bg-[#c41230] disabled:opacity-60 transition-colors"
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
            <button
              onClick={() => navigate(-1)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Account Summary</h2>
            <p className="text-sm text-gray-600 mt-1">Your current login and permissions.</p>
          </div>

          <div className="space-y-3 text-sm">
            <div>
              <div className="text-gray-500">Display Name</div>
              <div className="font-medium text-gray-900">{user.displayName}</div>
            </div>
            <div>
              <div className="text-gray-500">Email</div>
              <div className="font-medium text-gray-900">{user.email}</div>
            </div>
            <div>
              <div className="text-gray-500">Role</div>
              <div className="font-medium text-gray-900">{formatRoleLabel(user.role)}</div>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">Danger Zone</h3>
            <p className="text-sm text-gray-600 mb-4">Delete your own account permanently.</p>
            <button
              onClick={handleDeleteAccount}
              disabled={isDeleting}
              className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-60 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              {isDeleting ? "Deleting..." : "Delete Account"}
            </button>
          </div>
        </div>
      </div>

      {user.role === "admin" && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Admin User Management</h2>
            <p className="text-sm text-gray-600 mt-1">Create accounts for other users.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
              <input
                value={newUserDisplayName}
                onChange={(e) => setNewUserDisplayName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
              <select
                value={newUserRole}
                onChange={(e) => setNewUserRole(e.target.value as "admin" | "user")}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937] bg-white"
              >
                {managedRoleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Temporary Password</label>
              <input
                type="password"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCreateUser}
              disabled={isCreatingUser}
              className="px-4 py-2 bg-[#E31937] text-white rounded-lg hover:bg-[#c41230] disabled:opacity-60 transition-colors"
            >
              {isCreatingUser ? "Creating..." : "Create User"}
            </button>
          </div>

          {adminMessage && (
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <Check className="w-4 h-4" />
              {adminMessage}
            </div>
          )}
          {adminError && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertTriangle className="w-4 h-4" />
              {adminError}
            </div>
          )}

          <div className="border border-gray-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold text-gray-700">Name</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-700">Email</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-700">Role</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-700">Last Login</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {managedUsers.map((managedUser) => (
                  <tr key={managedUser.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-2 text-gray-900 whitespace-nowrap">{managedUser.displayName}</td>
                    <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{managedUser.email}</td>
                    <td className="px-4 py-2 text-gray-700 whitespace-nowrap">
                      <select
                        value={roleDrafts[managedUser.id] ?? (managedUser.role as "admin" | "user")}
                        onChange={(e) =>
                          setRoleDrafts((prev) => ({
                            ...prev,
                            [managedUser.id]: e.target.value as "admin" | "user",
                          }))
                        }
                        className="w-full min-w-40 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937] bg-white"
                      >
                        {managedRoleOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{managedUser.lastLoginAt || "Never"}</td>
                    <td className="px-4 py-2 text-gray-700 whitespace-nowrap">
                      <button
                        onClick={() => handleUpdateUserRole(managedUser)}
                        disabled={savingRoleUserId === managedUser.id || (roleDrafts[managedUser.id] ?? managedUser.role) === managedUser.role}
                        className="inline-flex items-center gap-2 px-3 py-2 bg-gray-900 text-white rounded-lg hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        <Save className="w-4 h-4" />
                        {savingRoleUserId === managedUser.id ? "Saving..." : "Save Role"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

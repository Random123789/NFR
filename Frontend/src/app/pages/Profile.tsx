import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { AlertTriangle, ArrowLeft, Check, KeyRound, Save, Trash2 } from "lucide-react";
import { createManagedUser, deleteCurrentUser, listManagedUsers, updateCurrentUserProfile, updateManagedUser, updateManagedUserPassword, type ManagedUser } from "../data/apiClient";
import { useAuth } from "../context/AuthContext";
import { PageGuide } from "../components/PageGuide";
import { accountVerticals, type AccountVertical } from "../data/accountOptions";
import { adminProfileGuideStep, profileGuideSteps } from "../data/pageGuides";
import { formatRoleLabel, managedRoleOptions, type ManagedRole } from "../data/roleLabels";
import { formatTimestampMinute } from "../utils/dateTime";

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
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [newUserDisplayName, setNewUserDisplayName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserRole, setNewUserRole] = useState<ManagedRole>("user");
  const [newUserVertical, setNewUserVertical] = useState<AccountVertical | "">("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [nameDrafts, setNameDrafts] = useState<Record<number, string>>({});
  const [emailDrafts, setEmailDrafts] = useState<Record<number, string>>({});
  const [roleDrafts, setRoleDrafts] = useState<Record<number, ManagedRole>>({});
  const [verticalDrafts, setVerticalDrafts] = useState<Record<number, AccountVertical | "">>({});
  const [passwordDrafts, setPasswordDrafts] = useState<Record<number, string>>({});
  const [savingManagedUserId, setSavingManagedUserId] = useState<number | null>(null);
  const [resettingPasswordUserId, setResettingPasswordUserId] = useState<number | null>(null);

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
        setNameDrafts({});
        setEmailDrafts({});
        setRoleDrafts({});
        setVerticalDrafts({});
        setPasswordDrafts({});
      } catch (err) {
        console.error("Failed to load users", err);
      }
    })();
  }, [user]);

  if (!user) {
    return null;
  }

  const guideSteps = user.role === "admin" ? [...profileGuideSteps, adminProfileGuideStep] : profileGuideSteps;

  const handleSaveProfile = async () => {
    setProfileMessage("");
    setProfileError("");
    setIsSaving(true);

    try {
      const result = await updateCurrentUserProfile({
        displayName,
        email,
      });

      setSessionUser(result.user);
      setDisplayName(result.user.displayName);
      setEmail(result.user.email);
      setProfileMessage("Profile updated successfully.");
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetOwnPassword = async () => {
    setProfileMessage("");
    setProfileError("");
    setIsResettingPassword(true);

    try {
      if (!currentPassword) {
        throw new Error("Current password is required");
      }
      if (!newPassword) {
        throw new Error("New password is required");
      }
      if (newPassword !== confirmPassword) {
        throw new Error("New password and confirmation do not match");
      }

      await updateCurrentUserProfile({
        currentPassword,
        newPassword,
      });

      setProfileMessage("Password reset successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setIsResettingPassword(false);
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
      if (newUserRole === "user" && !newUserVertical) {
        throw new Error("Vertical is required for SE users");
      }

      const result = await createManagedUser({
        displayName: newUserDisplayName.trim(),
        email: newUserEmail.trim().toLowerCase(),
        role: newUserRole,
        vertical: newUserRole === "user" ? newUserVertical : null,
        password: newUserPassword,
      });

      const createdUser = {
        ...result.user,
        vertical: result.user.vertical ?? (newUserRole === "user" ? newUserVertical : null),
      };
      setManagedUsers((prev) => [createdUser, ...prev]);
      setNewUserDisplayName("");
      setNewUserEmail("");
      setNewUserPassword("");
      setNewUserRole("user");
      setNewUserVertical("");
      setAdminMessage(`User ${createdUser.email} created successfully.`);
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : "Failed to create user account");
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleSaveManagedUser = async (managedUser: ManagedUser) => {
    setAdminError("");
    setAdminMessage("");
    setSavingManagedUserId(managedUser.id);

    try {
      const nextDisplayName = (nameDrafts[managedUser.id] ?? managedUser.displayName).trim();
      const nextEmail = (emailDrafts[managedUser.id] ?? managedUser.email).trim().toLowerCase();
      const selectedRole = roleDrafts[managedUser.id] ?? (managedUser.role as ManagedRole);
      const selectedVertical = selectedRole === "user"
        ? verticalDrafts[managedUser.id] ?? managedUser.vertical ?? ""
        : "";
      const nextVertical = selectedRole === "user" ? selectedVertical || null : null;
      const currentVertical = managedUser.role === "user" ? managedUser.vertical ?? null : null;

      if (!nextDisplayName) {
        throw new Error("Display name is required");
      }
      if (!nextEmail) {
        throw new Error("Email is required");
      }
      if (selectedRole === "user" && !nextVertical) {
        throw new Error("Vertical is required for SE users");
      }
      if (
        nextDisplayName === managedUser.displayName &&
        nextEmail === managedUser.email.toLowerCase() &&
        selectedRole === managedUser.role &&
        nextVertical === currentVertical
      ) {
        setAdminMessage(`User settings for ${managedUser.email} are already up to date.`);
        return;
      }

      const result = await updateManagedUser(managedUser.id, {
        displayName: nextDisplayName,
        email: nextEmail,
        role: selectedRole,
        vertical: nextVertical,
      });
      const updatedUser = {
        ...result.user,
        role: result.user.role || selectedRole,
        vertical: "vertical" in result.user ? result.user.vertical : nextVertical,
      };
      setManagedUsers((prev) => prev.map((userItem) => (userItem.id === managedUser.id ? updatedUser : userItem)));
      setNameDrafts((prev) => ({ ...prev, [managedUser.id]: updatedUser.displayName }));
      setEmailDrafts((prev) => ({ ...prev, [managedUser.id]: updatedUser.email }));
      setRoleDrafts((prev) => ({ ...prev, [managedUser.id]: updatedUser.role as ManagedRole }));
      setVerticalDrafts((prev) => ({ ...prev, [managedUser.id]: updatedUser.vertical ?? "" }));

      if (user.id === managedUser.id) {
        setSessionUser(updatedUser);
      }

      setAdminMessage(`Updated ${updatedUser.displayName}.`);
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setSavingManagedUserId(null);
    }
  };

  const handleResetManagedUserPassword = async (managedUser: ManagedUser) => {
    setAdminError("");
    setAdminMessage("");
    setResettingPasswordUserId(managedUser.id);

    try {
      const password = (passwordDrafts[managedUser.id] || "").trim();
      if (password.length < 8) {
        throw new Error("New password must be at least 8 characters");
      }

      await updateManagedUserPassword(managedUser.id, { password });
      setPasswordDrafts((prev) => {
        const next = { ...prev };
        delete next[managedUser.id];
        return next;
      });
      setAdminMessage(`Password reset for ${managedUser.email}.`);
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setResettingPasswordUserId(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div data-guide-id="profile-intro">
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
        <PageGuide label="Profile" steps={guideSteps} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
        <div data-guide-id="profile-details" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-6">
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

          <div data-guide-id="profile-password" className="border-t border-gray-200 pt-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Reset Password</h2>
              <p className="text-sm text-gray-600 mt-1">Change the password for this profile.</p>
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

            <button
              onClick={handleResetOwnPassword}
              disabled={isResettingPassword}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-black disabled:opacity-60 transition-colors"
            >
              <KeyRound className="w-4 h-4" />
              {isResettingPassword ? "Resetting..." : "Reset Password"}
            </button>
          </div>
        </div>

        <div data-guide-id="profile-summary" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
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
            {user.role === "user" && (
              <div>
                <div className="text-gray-500">Vertical</div>
                <div className="font-medium text-gray-900">{user.vertical || "-"}</div>
              </div>
            )}
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
        <div data-guide-id="profile-admin" className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Admin User Management</h2>
            <p className="text-sm text-gray-600 mt-1">Create accounts, update users, and reset passwords for other users.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
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
                onChange={(e) => {
                  const nextRole = e.target.value as ManagedRole;
                  setNewUserRole(nextRole);
                  if (nextRole !== "user") {
                    setNewUserVertical("");
                  }
                }}
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Vertical</label>
              <select
                value={newUserVertical}
                onChange={(e) => setNewUserVertical(e.target.value as AccountVertical | "")}
                disabled={newUserRole !== "user"}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937] bg-white disabled:bg-gray-100 disabled:text-gray-500"
              >
                <option value="">{newUserRole === "user" ? "Select vertical" : "Not applicable"}</option>
                {accountVerticals.map((vertical) => (
                  <option key={vertical} value={vertical}>
                    {vertical}
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
                  <th className="text-left px-4 py-2 font-semibold text-gray-700">Vertical</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-700">New Password</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-700">Last Login</th>
                  <th className="text-left px-4 py-2 font-semibold text-gray-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {managedUsers.map((managedUser) => {
                  const draftedName = nameDrafts[managedUser.id] ?? managedUser.displayName;
                  const draftedEmail = emailDrafts[managedUser.id] ?? managedUser.email;
                  const selectedRole = roleDrafts[managedUser.id] ?? (managedUser.role as ManagedRole);
                  const selectedVertical = selectedRole === "user"
                    ? verticalDrafts[managedUser.id] ?? managedUser.vertical ?? ""
                    : "";
                  const nextVertical = selectedRole === "user" ? selectedVertical || null : null;
                  const currentVertical = managedUser.role === "user" ? managedUser.vertical ?? null : null;
                  const hasUserDraftChanges =
                    draftedName.trim() !== managedUser.displayName ||
                    draftedEmail.trim().toLowerCase() !== managedUser.email.toLowerCase() ||
                    selectedRole !== managedUser.role ||
                    nextVertical !== currentVertical;

                  return (
                    <tr key={managedUser.id} className="border-b border-gray-100 last:border-0">
                      <td className="px-4 py-2 text-gray-900 whitespace-nowrap">
                        <input
                          value={draftedName}
                          onChange={(e) =>
                            setNameDrafts((prev) => ({
                              ...prev,
                              [managedUser.id]: e.target.value,
                            }))
                          }
                          className="w-full min-w-36 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                        />
                      </td>
                      <td className="px-4 py-2 text-gray-700 whitespace-nowrap">
                        <input
                          type="email"
                          value={draftedEmail}
                          onChange={(e) =>
                            setEmailDrafts((prev) => ({
                              ...prev,
                              [managedUser.id]: e.target.value,
                            }))
                          }
                          className="w-full min-w-56 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                        />
                      </td>
                      <td className="px-4 py-2 text-gray-700 whitespace-nowrap">
                        <select
                          value={selectedRole}
                          onChange={(e) =>
                            setRoleDrafts((prev) => ({
                              ...prev,
                              [managedUser.id]: e.target.value as ManagedRole,
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
                      <td className="px-4 py-2 text-gray-700 whitespace-nowrap">
                        <select
                          value={selectedVertical}
                          onChange={(e) =>
                            setVerticalDrafts((prev) => ({
                              ...prev,
                              [managedUser.id]: e.target.value as AccountVertical | "",
                            }))
                          }
                          disabled={selectedRole !== "user"}
                          className="w-full min-w-40 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937] bg-white disabled:bg-gray-100 disabled:text-gray-500"
                        >
                          <option value="">{selectedRole === "user" ? "Select vertical" : "Not applicable"}</option>
                          {accountVerticals.map((vertical) => (
                            <option key={vertical} value={vertical}>
                              {vertical}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2 text-gray-700 whitespace-nowrap">
                        <input
                          type="password"
                          value={passwordDrafts[managedUser.id] || ""}
                          onChange={(e) =>
                            setPasswordDrafts((prev) => ({
                              ...prev,
                              [managedUser.id]: e.target.value,
                            }))
                          }
                          placeholder="Temporary password"
                          className="w-full min-w-44 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                        />
                      </td>
                      <td className="px-4 py-2 text-gray-700 whitespace-nowrap">{managedUser.lastLoginAt ? formatTimestampMinute(managedUser.lastLoginAt) : "Never"}</td>
                      <td className="px-4 py-2 text-gray-700 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleSaveManagedUser(managedUser)}
                            disabled={savingManagedUserId === managedUser.id || !hasUserDraftChanges}
                            className="inline-flex items-center gap-2 px-3 py-2 bg-gray-900 text-white rounded-lg hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            <Save className="w-4 h-4" />
                            {savingManagedUserId === managedUser.id ? "Saving..." : "Save"}
                          </button>
                          <button
                            onClick={() => handleResetManagedUserPassword(managedUser)}
                            disabled={resettingPasswordUserId === managedUser.id || !(passwordDrafts[managedUser.id] || "").trim()}
                            className="inline-flex items-center gap-2 px-3 py-2 bg-[#E31937] text-white rounded-lg hover:bg-[#c41230] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            <KeyRound className="w-4 h-4" />
                            {resettingPasswordUserId === managedUser.id ? "Resetting..." : "Reset"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

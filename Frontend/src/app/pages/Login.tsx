import { useEffect, useState, type FormEvent } from "react";
import { Navigate, useSearchParams } from "react-router";
import { requestPasswordReset, resetPassword } from "../data/apiClient";
import { useAuth } from "../context/AuthContext";
import fortinetLogoUrl from "../../../FortinetLogo.png";

type LoginMode = "login" | "forgot" | "reset";

export function Login() {
  const { user, login } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const resetToken = searchParams.get("resetToken") ?? "";
  const [mode, setMode] = useState<LoginMode>(resetToken ? "reset" : "login");
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (resetToken) {
      setMode("reset");
      setError("");
      setMessage("");
    }
  }, [resetToken]);

  if (user) {
    return <Navigate to="/" replace />;
  }

  const resetFeedback = () => {
    setError("");
    setMessage("");
  };

  const switchMode = (nextMode: LoginMode) => {
    resetFeedback();
    setMode(nextMode);
    if (nextMode !== "reset") {
      setSearchParams({});
    }
  };

  const handleLoginSubmit = async (event: FormEvent) => {
    event.preventDefault();
    resetFeedback();
    setIsSubmitting(true);

    try {
      await login(loginIdentifier, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotSubmit = async (event: FormEvent) => {
    event.preventDefault();
    resetFeedback();
    setIsSubmitting(true);

    try {
      await requestPasswordReset(resetEmail);
      setMessage("If an active account exists for that email, a reset link has been sent.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send reset email");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetSubmit = async (event: FormEvent) => {
    event.preventDefault();
    resetFeedback();

    if (!resetToken) {
      setError("Reset link is missing a token.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    try {
      await resetPassword(resetToken, newPassword);
      setSearchParams({});
      setMode("login");
      setPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setMessage("Password updated. Sign in with your new password.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reset password");
    } finally {
      setIsSubmitting(false);
    }
  };

  const title = mode === "forgot" ? "Reset password" : mode === "reset" ? "Choose new password" : "Login";
  const subtitle =
    mode === "forgot"
      ? "Enter your account email and we will send a password reset link."
      : mode === "reset"
        ? "Set a new password for your account."
        : "Sign in to load your bookmarks and track your actions.";

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-100 via-white to-red-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
        <div className="mb-8">
          <img src={fortinetLogoUrl} alt="Fortinet" className="h-16 w-auto mx-auto mb-7" />
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          <p className="text-sm text-gray-600 mt-1">{subtitle}</p>
        </div>

        {mode === "login" && (
          <form className="space-y-4" onSubmit={handleLoginSubmit}>
            <div>
              <label htmlFor="login-identifier" className="block text-sm font-medium text-gray-700 mb-1">Name or email</label>
              <input
                id="login-identifier"
                type="text"
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                autoComplete="username"
                required
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between gap-3">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">Password</label>
                <button
                  type="button"
                  onClick={() => switchMode("forgot")}
                  className="text-sm font-medium text-[#E31937] hover:text-[#c41230]"
                >
                  Forgot password?
                </button>
              </div>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                autoComplete="current-password"
                required
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {message && <p className="text-sm text-emerald-700">{message}</p>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 bg-[#E31937] text-white rounded-lg hover:bg-[#c41230] disabled:opacity-60 transition-colors"
            >
              {isSubmitting ? "Signing in..." : "Sign in"}
            </button>
          </form>
        )}

        {mode === "forgot" && (
          <form className="space-y-4" onSubmit={handleForgotSubmit}>
            <div>
              <label htmlFor="reset-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                id="reset-email"
                type="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                autoComplete="email"
                required
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {message && <p className="text-sm text-emerald-700">{message}</p>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 bg-[#E31937] text-white rounded-lg hover:bg-[#c41230] disabled:opacity-60 transition-colors"
            >
              {isSubmitting ? "Sending..." : "Send reset link"}
            </button>

            <button
              type="button"
              onClick={() => switchMode("login")}
              className="w-full py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Back to sign in
            </button>
          </form>
        )}

        {mode === "reset" && (
          <form className="space-y-4" onSubmit={handleResetSubmit}>
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1">New password</label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>

            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#E31937]"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            {message && <p className="text-sm text-emerald-700">{message}</p>}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 bg-[#E31937] text-white rounded-lg hover:bg-[#c41230] disabled:opacity-60 transition-colors"
            >
              {isSubmitting ? "Updating..." : "Update password"}
            </button>

            <button
              type="button"
              onClick={() => switchMode("login")}
              className="w-full py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Back to sign in
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

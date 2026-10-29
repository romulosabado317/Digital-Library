import { useState } from "react";
import { ArrowRight, LibraryBig } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../services/api.js";

export default function ChangePasswordPage({ user, onPasswordChanged, onLogout }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const isTemporaryPassword = user.mustChangePassword;

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const { data } = await api.post("/auth/password", { currentPassword, newPassword });
      onPasswordChanged(data.data.user);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setSuccess(true);
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message ?? "The password could not be changed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="change-password-title">
        <div className="brand-mark"><LibraryBig aria-hidden="true" size={27} /></div>
        <p className="eyebrow">ICCT COLLEGE LIBRARY</p>
        <h1 id="change-password-title">
          {success ? "Password changed" : isTemporaryPassword ? "Choose your password" : "Change password"}
        </h1>
        {success ? (
          <div className="account-created" role="status">
            <p className="form-success">Your password has been updated.</p>
            <Link className="primary-button" to="/my-loans">Continue to my account</Link>
          </div>
        ) : (
          <>
            <p className="muted">
              {isTemporaryPassword
                ? "For your account security, change the temporary password before continuing."
                : "Enter your current password and choose a new one."}
            </p>
            <form className="form-stack" onSubmit={submit}>
              <label htmlFor="current-password">
                {isTemporaryPassword ? "Temporary password" : "Current password"}
              </label>
              <input
                autoComplete="current-password"
                id="current-password"
                maxLength="128"
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
                type="password"
                value={currentPassword}
              />
              <label htmlFor="new-password">New password</label>
              <input
                autoComplete="new-password"
                id="new-password"
                maxLength="128"
                minLength="8"
                onChange={(event) => setNewPassword(event.target.value)}
                required
                type="password"
                value={newPassword}
              />
              <label htmlFor="confirm-password">Confirm new password</label>
              <input
                autoComplete="new-password"
                id="confirm-password"
                maxLength="128"
                minLength="8"
                onChange={(event) => setConfirmPassword(event.target.value)}
                required
                type="password"
                value={confirmPassword}
              />
              <p className="hint">Use at least 8 characters and choose a password different from your current password.</p>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="primary-button" disabled={saving} type="submit">
                {saving ? "Saving password..." : "Save new password"}
                {!saving && <ArrowRight aria-hidden="true" size={17} />}
              </button>
            </form>
            <p className="catalog-prompt">
              {!isTemporaryPassword && <><Link to="/catalog">Browse catalog</Link>{" · "}</>}
              <button className="text-button" onClick={onLogout} type="button">Sign out</button>
            </p>
          </>
        )}
      </section>
    </main>
  );
}

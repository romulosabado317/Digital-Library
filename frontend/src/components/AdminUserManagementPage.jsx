import { useState } from "react";
import { LibraryBig, LogOut, UserPlus } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../services/api.js";

const initialForm = {
  fullName: "",
  email: "",
  password: "",
  role: "MEMBER",
};

export default function AdminUserManagementPage({ user, onLogout }) {
  const isAdmin = user.role === "ADMIN";
  const [form, setForm] = useState(initialForm);
  const [createdUser, setCreatedUser] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
    setError("");
    setCreatedUser(null);
  }

  async function createUser(event) {
    event.preventDefault();
    setError("");
    setCreatedUser(null);
    setSaving(true);
    try {
      const { data } = await api.post("/users", {
        ...form,
        role: isAdmin ? form.role : "MEMBER",
      });
      setCreatedUser(data.data.user);
      setForm(initialForm);
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message ?? "The account could not be created.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <aside className="sidebar">
        <Link className="sidebar-brand" to="/" aria-label="ICCT College Library catalog">
          <span className="sidebar-mark"><LibraryBig size={21} aria-hidden="true" /></span>
          <span>ICCT College Library<small>OPERATIONS & INSIGHTS</small></span>
        </Link>
        <div className="sidebar-section-label">WORKSPACE</div>
        <nav aria-label="Primary navigation">
          <Link className="nav-item" to="/staff/loans"><LibraryBig size={18} aria-hidden="true" /> Loan desk</Link>
          <Link className="nav-item" to="/manage/resources"><LibraryBig size={18} aria-hidden="true" /> Resources</Link>
          <Link className="nav-item active" to="/manage/users" aria-current="page"><UserPlus size={18} aria-hidden="true" /> Accounts</Link>
        </nav>
        <div className="sidebar-footer">
          <div className="avatar" aria-hidden="true">{user.fullName.slice(0, 1).toUpperCase()}</div>
          <div className="user-summary"><strong>{user.fullName}</strong><span>{user.role.toLowerCase()}</span></div>
          <button className="icon-button" onClick={onLogout} aria-label="Sign out" title="Sign out" type="button">
            <LogOut size={17} aria-hidden="true" />
          </button>
        </div>
      </aside>
      <main className="main-content" id="main-content">
        <header className="page-header">
          <div>
            <p className="eyebrow">ICCT COLLEGE · ADMINISTRATION</p>
            <h1>Manage accounts</h1>
            <p className="muted">{isAdmin
              ? "Create active librarian and member accounts for the college library."
              : "Create active member accounts for the college library."}</p>
          </div>
          <Link className="secondary-button" to="/">Browse catalog</Link>
        </header>
        <section className="management-grid admin-account-grid" aria-label="Create a library account">
          <article className="panel">
            <div className="panel-heading">
              <div className="heading-icon soft"><UserPlus size={20} aria-hidden="true" /></div>
              <div><h2>Create account</h2><p>{isAdmin
                ? "Administrators can add librarians and members."
                : "Librarians can add members only."}</p></div>
            </div>
            <form className="form-stack" onSubmit={createUser}>
              <label htmlFor="account-full-name">Full name</label>
              <input
                autoComplete="name"
                id="account-full-name"
                maxLength="120"
                name="fullName"
                onChange={updateField}
                required
                value={form.fullName}
              />
              <label htmlFor="account-email">College email</label>
              <input
                autoComplete="email"
                id="account-email"
                maxLength="254"
                name="email"
                onChange={updateField}
                required
                type="email"
                value={form.email}
              />
              <label htmlFor="account-role">Account type</label>
              <select disabled={!isAdmin} id="account-role" name="role" onChange={updateField} value={form.role}>
                <option value="MEMBER">Member</option>
                {isAdmin && <option value="LIBRARIAN">Librarian</option>}
              </select>
              <label htmlFor="account-password">Temporary password</label>
              <input
                autoComplete="new-password"
                id="account-password"
                minLength="8"
                maxLength="128"
                name="password"
                onChange={updateField}
                required
                type="password"
                value={form.password}
              />
              <p className="hint">
                Use at least 8 characters. Share the password privately with the account holder.
                {form.role === "MEMBER" && " Members must change this temporary password at first sign-in."}
              </p>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="primary-button" disabled={saving} type="submit">
                {saving ? "Creating account..." : "Create account"}
              </button>
            </form>
          </article>
          <section className="panel info-panel" aria-labelledby="account-guidance-title">
            <div className="panel-heading">
              <div className="heading-icon soft"><LibraryBig size={20} aria-hidden="true" /></div>
              <div><h2 id="account-guidance-title">Account access</h2><p>Passwords are securely hashed by the server.</p></div>
            </div>
            {createdUser ? (
              <div className="account-created" role="status">
                <p className="form-success">Account created successfully.</p>
                <dl>
                  <div><dt>Name</dt><dd>{createdUser.fullName}</dd></div>
                  <div><dt>Email</dt><dd>{createdUser.email}</dd></div>
                  <div><dt>Role</dt><dd>{createdUser.role === "LIBRARIAN" ? "Librarian" : "Member"}</dd></div>
                </dl>
                <p className="muted">
                  The password is not displayed or recoverable here. Share it through a secure channel.
                  {createdUser.role === "MEMBER" && " The member must change this temporary password at first sign-in."}
                </p>
              </div>
            ) : (
              <>
                <h3>Before you create an account</h3>
                <ul>
                  <li>Confirm the person’s name and email address.</li>
                  <li>{isAdmin
                    ? "Choose Member for borrowers or Librarian for authorized staff."
                    : "Librarians can create Member accounts only."}</li>
                  <li>Use a unique password and communicate it privately.</li>
                </ul>
                <p className="empty-note">Administrator accounts cannot be created from this page.</p>
              </>
            )}
          </section>
        </section>
        <footer className="page-footer">ICCT College Library · Digital Library Operations</footer>
      </main>
    </div>
  );
}

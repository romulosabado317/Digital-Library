import { useEffect, useState } from "react";
import { ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight, LibraryBig, LogOut, Search, ShieldCheck } from "lucide-react";
import { Link, NavLink, Route, Routes, useParams } from "react-router-dom";
import { api } from "./services/api.js";

function Login({ onLogin, notice }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      onLogin(data.data.user);
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message ?? "Unable to sign in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand-mark"><LibraryBig aria-hidden="true" size={27} /></div>
        <p className="eyebrow">Digital Library</p>
        <h1 id="login-title">Welcome back</h1>
        <p className="muted">Sign in to manage your library account and borrowing activity.</p>
        {notice && <p className="form-error" role="status">{notice}</p>}
        <form className="form-stack" onSubmit={submit}>
          <label htmlFor="email">Email address</label>
          <input
            autoComplete="username"
            id="email"
            name="email"
            onChange={(event) => setEmail(event.target.value)}
            required
            type="email"
            value={email}
          />
          <label htmlFor="password">Password</label>
          <input
            autoComplete="current-password"
            id="password"
            name="password"
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" disabled={submitting} type="submit">
            {submitting ? "Signing in..." : "Sign in"}
            {!submitting && <ArrowRight aria-hidden="true" size={17} />}
          </button>
        </form>
        <p className="catalog-prompt">Looking for a resource? <Link to="/catalog">Browse the catalog</Link></p>
        <p className="login-note"><ShieldCheck aria-hidden="true" size={15} /> Secure account access</p>
      </section>
    </main>
  );
}

function CatalogPage({ user }) {
  const [search, setSearch] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [categories, setCategories] = useState([]);
  const [resources, setResources] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadResources({
    nextPage = page,
    nextSearch = search,
    nextType = resourceType,
    nextCategory = categoryId,
  } = {}) {
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/resources", {
        params: {
          page: nextPage,
          limit: 12,
          ...(nextSearch ? { search: nextSearch } : {}),
          ...(nextType ? { resourceType: nextType } : {}),
          ...(nextCategory ? { categoryId: nextCategory } : {}),
        },
      });
      setResources(data.data);
      setPage(data.meta.page);
      setTotalPages(Math.max(data.meta.totalPages, 1));
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message ?? "The resource catalog could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadResources({ nextPage: 1 });
    api.get("/categories")
      .then(({ data }) => setCategories(data.data))
      .catch(() => setError("Resource categories could not be loaded."));
  }, []);

  function submitSearch(event) {
    event.preventDefault();
    void loadResources({ nextPage: 1 });
  }

  function changeType(event) {
    const nextType = event.target.value;
    setResourceType(nextType);
    void loadResources({ nextPage: 1, nextType });
  }

  function changeCategory(event) {
    const nextCategory = event.target.value;
    setCategoryId(nextCategory);
    void loadResources({ nextPage: 1, nextCategory });
  }

  return (
    <main className="catalog-page">
      <header className="catalog-header">
        <Link className="catalog-brand" to="/"><span className="sidebar-mark"><LibraryBig size={21} aria-hidden="true" /></span> Digital Library</Link>
        <nav aria-label="Catalog navigation" className="catalog-nav">
          <Link to="/catalog" aria-current="page">Catalog</Link>
          {user?.role === "MEMBER"
            ? <Link to="/my-loans">My account</Link>
            : <Link to="/">Sign in</Link>}
        </nav>
      </header>
      <section className="catalog-hero">
        <p className="eyebrow">DISCOVER LEARNING RESOURCES</p>
        <h1>Find your next resource</h1>
        <p className="muted">Search the library catalog by title, description, or author.</p>
        <form className="catalog-search" onSubmit={submitSearch} role="search">
          <label className="sr-only" htmlFor="catalog-search">Search resources</label>
          <Search size={19} aria-hidden="true" />
          <input
            id="catalog-search"
            name="search"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title, description, or author"
            type="search"
            value={search}
          />
          <button className="primary-button" type="submit">Search</button>
        </form>
      </section>
      <section className="catalog-results" aria-labelledby="catalog-results-title">
        <div className="catalog-results-header">
          <div><h2 id="catalog-results-title">Library catalog</h2><p className="muted">Explore available academic resources.</p></div>
          <div className="catalog-filters">
            <label className="filter-control" htmlFor="resource-type">
              <span>Format</span>
              <select id="resource-type" onChange={changeType} value={resourceType}>
                <option value="">All formats</option>
                <option value="BOOK">Books</option>
                <option value="JOURNAL">Journals</option>
                <option value="THESIS">Theses</option>
                <option value="MEDIA">Media</option>
                <option value="DIGITAL_RESOURCE">Digital resources</option>
              </select>
            </label>
            <label className="filter-control" htmlFor="resource-category">
              <span>Category</span>
              <select id="resource-category" onChange={changeCategory} value={categoryId}>
                <option value="">All categories</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
          </div>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        {loading ? (
          <p className="loading-state" role="status">Loading resources...</p>
        ) : resources.length ? (
          <>
            <div className="resource-grid">
              {resources.map((resource) => (
                <article className="resource-card" key={resource.id}>
                  <div className="resource-cover"><BookOpen size={26} aria-hidden="true" /></div>
                  <div className="resource-card-content">
                    <span className="resource-type">{resource.resourceType.replaceAll("_", " ")}</span>
                    <h3><Link to={`/catalog/${resource.id}`}>{resource.title}</Link></h3>
                    <p>{resource.authors?.map(({ author }) => author.name).join(", ") || "Author not listed"}</p>
                    <div className="resource-card-footer">
                      <span>{resource.category?.name || "Uncategorized"}</span>
                      <span>{resource._count?.copies ?? 0} copies</span>
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <nav className="pagination" aria-label="Catalog pages">
              <button
                className="secondary-button"
                disabled={page <= 1}
                onClick={() => void loadResources({ nextPage: page - 1 })}
                type="button"
              >
                <ChevronLeft size={17} aria-hidden="true" /> Previous
              </button>
              <span aria-live="polite">Page {page} of {totalPages}</span>
              <button
                className="secondary-button"
                disabled={page >= totalPages}
                onClick={() => void loadResources({ nextPage: page + 1 })}
                type="button"
              >
                Next <ChevronRight size={17} aria-hidden="true" />
              </button>
            </nav>
          </>
        ) : (
          <p className="empty-note" role="status">No resources match your search. Try another title or format.</p>
        )}
      </section>
    </main>
  );
}

function ResourceDetailPage({ user }) {
  const { id } = useParams();
  const [resource, setResource] = useState(null);
  const [availableCopies, setAvailableCopies] = useState(0);
  const [loading, setLoading] = useState(true);
  const [reserving, setReserving] = useState(false);
  const [error, setError] = useState("");
  const [reservationError, setReservationError] = useState("");
  const [reservationMessage, setReservationMessage] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    api.get(`/resources/${encodeURIComponent(id)}`)
      .then(({ data }) => {
        if (active) {
          setResource(data.data.resource);
          setAvailableCopies(data.data.availableCopies);
        }
      })
      .catch((requestError) => {
        if (active) {
          setError(requestError.response?.status === 404
            ? "This resource is not available in the catalog."
            : requestError.response?.data?.error?.message ?? "The resource details could not be loaded.");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [id]);

  async function reserveResource() {
    setReservationError("");
    setReservationMessage("");
    setReserving(true);
    try {
      const { data } = await api.post("/reservations", { resourceId: id });
      setReservationMessage(`You are in position ${data.data.reservation.queuePosition} in the reservation queue.`);
    } catch (requestError) {
      setReservationError(requestError.response?.data?.error?.message ?? "The reservation could not be created.");
    } finally {
      setReserving(false);
    }
  }

  return (
    <main className="catalog-page">
      <header className="catalog-header">
        <Link className="catalog-brand" to="/catalog"><span className="sidebar-mark"><LibraryBig size={21} aria-hidden="true" /></span> Digital Library</Link>
        <nav className="catalog-nav" aria-label="Resource navigation">
          {user?.role === "MEMBER" && <Link to="/my-loans">My account</Link>}
          <Link to="/catalog">Back to catalog</Link>
        </nav>
      </header>
      <section className="detail-panel">
        {loading ? <p className="loading-state" role="status">Loading resource details...</p>
          : error ? <p className="form-error" role="alert">{error}</p>
            : resource && (
              <>
                <div className="resource-cover detail-cover"><BookOpen size={34} aria-hidden="true" /></div>
                <p className="eyebrow">{resource.resourceType.replaceAll("_", " ")}</p>
                <h1>{resource.title}</h1>
                <p className="resource-authors">{resource.authors?.map(({ author }) => author.name).join(", ") || "Author not listed"}</p>
                <p className="muted">{resource.description || "No description is available for this resource."}</p>
                <dl className="resource-metadata">
                  <div><dt>Category</dt><dd>{resource.category?.name || "Uncategorized"}</dd></div>
                  <div><dt>Publisher</dt><dd>{resource.publisher?.name || "Not listed"}</dd></div>
                  <div><dt>Publication year</dt><dd>{resource.publicationYear || "Not listed"}</dd></div>
                  <div><dt>ISBN</dt><dd>{resource.isbn || "Not listed"}</dd></div>
                  <div><dt>Physical copies</dt><dd>{resource._count?.copies ?? 0}</dd></div>
                  <div><dt>Available to borrow</dt><dd>{availableCopies}</dd></div>
                </dl>
                {user?.role === "MEMBER" && availableCopies === 0 && resource.resourceType !== "DIGITAL_RESOURCE" && (
                  <div className="reservation-action">
                    <p className="muted">No copies are currently available. Join the queue to see a ready-for-pickup update in your member account.</p>
                    <button className="primary-button" disabled={reserving || Boolean(reservationMessage)} onClick={() => void reserveResource()} type="button">
                      {reserving ? "Joining queue..." : reservationMessage ? "In reservation queue" : "Reserve this resource"}
                    </button>
                  </div>
                )}
                {!user && availableCopies === 0 && resource.resourceType !== "DIGITAL_RESOURCE" && (
                  <p className="muted reservation-action">
                    Sign in to your member account to join the reservation queue. <Link to="/">Sign in</Link>
                  </p>
                )}
                {reservationMessage && <p className="form-success" role="status">{reservationMessage}</p>}
                {reservationError && <p className="form-error" role="alert">{reservationError}</p>}
              </>
            )}
      </section>
    </main>
  );
}

function MemberLoansPage({ user, onLogout }) {
  const [loans, setLoans] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancellingId, setCancellingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadMemberAccount() {
    setError("");
    try {
      const [loansResponse, reservationsResponse] = await Promise.all([
        api.get("/loans/me"),
        api.get("/reservations/me"),
      ]);
      setLoans(loansResponse.data.data);
      setReservations(reservationsResponse.data.data);
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message ?? "Your account could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadMemberAccount(); }, []);

  async function cancelReservation(reservation) {
    setError("");
    setMessage("");
    setCancellingId(reservation.id);
    try {
      await api.delete(`/reservations/${encodeURIComponent(reservation.id)}`);
      setMessage(`Reservation for "${reservation.resource.title}" cancelled.`);
      await loadMemberAccount();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message ?? "The reservation could not be cancelled.");
    } finally {
      setCancellingId("");
    }
  }

  return (
    <main className="catalog-page">
      <header className="catalog-header">
        <Link className="catalog-brand" to="/catalog"><span className="sidebar-mark"><LibraryBig size={21} aria-hidden="true" /></span> Digital Library</Link>
        <nav aria-label="Member navigation" className="catalog-nav">
          <Link to="/catalog">Catalog</Link>
          <button className="text-button" onClick={onLogout} type="button">Sign out</button>
        </nav>
      </header>
      <section className="catalog-results" aria-labelledby="member-loans-title">
        <p className="eyebrow">MEMBER ACCOUNT</p>
        <h1 id="member-loans-title">My loans</h1>
        <p className="muted">Signed in as {user.fullName}. Your borrowing records are private to your account.</p>
        {loading ? <p className="loading-state" role="status">Loading your account...</p>
          : error ? <p className="form-error" role="alert">{error}</p>
            : (
              <>
                <h2 className="member-section-title">Reservations</h2>
                {reservations.length ? (
                  <div className="member-loan-list">
                    {reservations.map((reservation) => (
                      <article className="member-loan-card reservation-card" key={reservation.id}>
                        <LibraryBig size={21} aria-hidden="true" />
                        <div>
                          <h2><Link to={`/catalog/${reservation.resource.id}`}>{reservation.resource.title}</Link></h2>
                          <p className="muted">
                            {reservation.status === "WAITING"
                              ? `Queue ticket ${reservation.queuePosition}`
                              : reservation.status === "AVAILABLE" && reservation.expiresAt
                                ? `Ready for pickup until ${new Date(reservation.expiresAt).toLocaleDateString()}`
                                : reservation.status}
                          </p>
                        </div>
                        <div className="loan-due">
                          <span>{reservation.status}</span>
                          {["WAITING", "AVAILABLE"].includes(reservation.status) && (
                            <button
                              className="small-button danger-button"
                              disabled={cancellingId === reservation.id}
                              onClick={() => void cancelReservation(reservation)}
                              type="button"
                            >
                              {cancellingId === reservation.id ? "Cancelling..." : "Cancel"}
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : <p className="empty-note" role="status">You have no reservations. <Link to="/catalog">Browse the catalog</Link>.</p>}
                {message && <p className="form-success" role="status">{message}</p>}
                <h2 className="member-section-title">Loans</h2>
                {loans.length ? (
              <div className="member-loan-list">
                {loans.map((loan) => (
                  <article className="member-loan-card" key={loan.id}>
                    <BookOpen size={21} aria-hidden="true" />
                    <div>
                      <h2>{loan.physicalCopy.resource.title}</h2>
                      <p className="muted">Borrowed <time dateTime={loan.borrowedAt}>{new Date(loan.borrowedAt).toLocaleDateString()}</time></p>
                    </div>
                    <div className="loan-due"><span>{loan.loanStatus}</span><strong>Due {new Date(loan.dueAt).toLocaleDateString()}</strong></div>
                  </article>
                ))}
              </div>
                ) : <p className="empty-note" role="status">You have no borrowing history yet. <Link to="/catalog">Browse resources</Link>.</p>}
              </>
            )}
      </section>
    </main>
  );
}

function ResourceManagementPage({ user, onLogout }) {
  const emptyResource = { title: "", description: "", isbn: "", publicationYear: "", resourceType: "BOOK" };
  const [resources, setResources] = useState([]);
  const [form, setForm] = useState(emptyResource);
  const [editingId, setEditingId] = useState("");
  const [copyFor, setCopyFor] = useState("");
  const [accessionNumber, setAccessionNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadResources() {
    setLoading(true);
    try {
      const { data } = await api.get("/resources", { params: { limit: 100 } });
      setResources(data.data);
      setError("");
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message ?? "Resources could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadResources();
  }, []);

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  function beginEdit(resource) {
    setEditingId(resource.id);
    setForm({
      title: resource.title,
      description: resource.description || "",
      isbn: resource.isbn || "",
      publicationYear: resource.publicationYear || "",
      resourceType: resource.resourceType,
    });
    setMessage("");
  }

  async function saveResource(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    const payload = {
      ...form,
      publicationYear: form.publicationYear ? Number(form.publicationYear) : undefined,
      isbn: form.isbn || undefined,
      description: form.description || undefined,
    };
    try {
      if (editingId) {
        await api.patch(`/resources/${editingId}`, payload);
        setMessage("Resource updated.");
      } else {
        await api.post("/resources", payload);
        setMessage("Resource added.");
      }
      setForm(emptyResource);
      setEditingId("");
      await loadResources();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message ?? "The resource could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function addCopy(event, resourceId) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    try {
      await api.post(`/resources/${resourceId}/copies`, { accessionNumber });
      setMessage("Physical copy added to inventory.");
      setAccessionNumber("");
      setCopyFor("");
      await loadResources();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message ?? "The copy could not be added.");
    } finally {
      setSaving(false);
    }
  }

  async function archiveResource(resource) {
    if (!window.confirm(`Archive "${resource.title}"? Historical loans will be preserved.`)) return;
    setError("");
    setMessage("");
    try {
      await api.delete(`/resources/${resource.id}`);
      setMessage("Resource archived. Existing borrowing history is preserved.");
      if (editingId === resource.id) {
        setEditingId("");
        setForm(emptyResource);
      }
      await loadResources();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message ?? "The resource could not be archived.");
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <aside className="sidebar">
        <Link className="sidebar-brand" to="/" aria-label="Digital Library home">
          <span className="sidebar-mark"><LibraryBig size={21} aria-hidden="true" /></span>
          <span>Digital Library<small>OPERATIONS & INSIGHTS</small></span>
        </Link>
        <div className="sidebar-section-label">WORKSPACE</div>
        <nav aria-label="Primary navigation">
          <NavLink className={({ isActive }) => `nav-item${isActive ? " active" : ""}`} to="/">
            <BookOpen size={18} aria-hidden="true" /> Loan desk
          </NavLink>
          <NavLink className={({ isActive }) => `nav-item${isActive ? " active" : ""}`} to="/manage/resources">
            <LibraryBig size={18} aria-hidden="true" /> Resources
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <div className="avatar" aria-hidden="true">{user.fullName.slice(0, 1).toUpperCase()}</div>
          <div className="user-summary"><strong>{user.fullName}</strong><span>{user.role.toLowerCase()}</span></div>
          <button className="icon-button" onClick={onLogout} aria-label="Sign out" title="Sign out">
            <LogOut size={17} aria-hidden="true" />
          </button>
        </div>
      </aside>
      <main className="main-content" id="main-content">
        <header className="page-header">
          <div><p className="eyebrow">LIBRARY OPERATIONS</p><h1>Resource management</h1><p className="muted">Maintain catalog records and physical copy inventory.</p></div>
          <Link className="secondary-button" to="/">Return to loan desk</Link>
        </header>
        <section className="management-grid">
          <article className="panel">
            <h2>{editingId ? "Edit resource" : "Add a resource"}</h2>
            <form className="form-stack" onSubmit={saveResource}>
              <label htmlFor="resource-title">Title</label>
              <input id="resource-title" name="title" maxLength="250" onChange={updateField} required value={form.title} />
              <label htmlFor="resource-description">Description</label>
              <textarea id="resource-description" name="description" maxLength="5000" onChange={updateField} rows="3" value={form.description} />
              <div className="form-row">
                <div><label htmlFor="resource-isbn">ISBN</label><input id="resource-isbn" name="isbn" maxLength="17" onChange={updateField} value={form.isbn} /></div>
                <div><label htmlFor="resource-year">Publication year</label><input id="resource-year" max="2100" min="1400" name="publicationYear" onChange={updateField} type="number" value={form.publicationYear} /></div>
              </div>
              <label htmlFor="resource-type">Resource format</label>
              <select id="resource-type" name="resourceType" onChange={updateField} value={form.resourceType}>
                <option value="BOOK">Book</option>
                <option value="JOURNAL">Journal</option>
                <option value="THESIS">Thesis</option>
                <option value="MEDIA">Media</option>
                <option value="DIGITAL_RESOURCE">Digital resource</option>
              </select>
              {error && <p className="form-error" role="alert">{error}</p>}
              {message && <p className="form-success" role="status">{message}</p>}
              <button className="primary-button" disabled={saving} type="submit">{saving ? "Saving..." : editingId ? "Save changes" : "Add resource"}</button>
              {editingId && <button className="secondary-button" onClick={() => { setEditingId(""); setForm(emptyResource); }} type="button">Cancel edit</button>}
            </form>
          </article>
          <section className="panel resource-management-list" aria-labelledby="inventory-title">
            <div className="panel-heading">
              <div className="heading-icon soft"><LibraryBig size={20} aria-hidden="true" /></div>
              <div><h2 id="inventory-title">Catalog inventory</h2><p>{resources.length} active resources shown</p></div>
            </div>
            {loading ? <p className="loading-state" role="status">Loading resources...</p>
              : resources.length ? (
                <div className="management-resource-list">
                  {resources.map((resource) => (
                    <article className="management-resource" key={resource.id}>
                      <div className="management-resource-main">
                        <div><strong>{resource.title}</strong><span>{resource.resourceType.replaceAll("_", " ")} · {resource._count?.copies ?? 0} copies</span></div>
                        <div className="management-actions">
                          <button className="small-button" onClick={() => beginEdit(resource)} type="button">Edit</button>
                          <button className="small-button danger-button" onClick={() => void archiveResource(resource)} type="button">Archive</button>
                          <button className="small-button" onClick={() => setCopyFor(copyFor === resource.id ? "" : resource.id)} type="button">Add copy</button>
                        </div>
                      </div>
                      {copyFor === resource.id && (
                        <form className="add-copy-form" onSubmit={(event) => void addCopy(event, resource.id)}>
                          <label htmlFor={`accession-${resource.id}`}>Accession number</label>
                          <input id={`accession-${resource.id}`} maxLength="64" onChange={(event) => setAccessionNumber(event.target.value)} required value={accessionNumber} />
                          <button className="secondary-button" disabled={saving} type="submit">{saving ? "Adding..." : "Save copy"}</button>
                        </form>
                      )}
                    </article>
                  ))}
                </div>
              ) : <p className="empty-note" role="status">No active resources yet. Add the first catalog record.</p>}
          </section>
        </section>
        <footer className="page-footer">Digital Library Operations and Insights Management System</footer>
      </main>
    </div>
  );
}

function LoanDesk({ user, onLogout }) {
  const [members, setMembers] = useState([]);
  const [copies, setCopies] = useState([]);
  const [loans, setLoans] = useState([]);
  const [readyReservations, setReadyReservations] = useState([]);
  const [memberId, setMemberId] = useState("");
  const [copyId, setCopyId] = useState("");
  const [returningId, setReturningId] = useState("");
  const [issuingReservationId, setIssuingReservationId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function loadDesk() {
    setLoading(true);
    setError("");
    try {
      const [membersResponse, copiesResponse, loansResponse, reservationsResponse] = await Promise.all([
        api.get("/users"),
        api.get("/resources/copies", { params: { status: "AVAILABLE" } }),
        api.get("/loans", { params: { status: "ACTIVE" } }),
        api.get("/reservations", { params: { status: "AVAILABLE" } }),
      ]);
      const nextMembers = membersResponse.data.data;
      const nextCopies = copiesResponse.data.data;
      setLoans(loansResponse.data.data);
      setReadyReservations(reservationsResponse.data.data);
      setMembers(nextMembers);
      setCopies(nextCopies);
      setMemberId((current) => nextMembers.some((member) => member.id === current) ? current : "");
      setCopyId((current) => nextCopies.some((copy) => copy.id === current) ? current : "");
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message ?? "Could not load the loan desk.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDesk();
  }, []);

  async function issueLoan(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    setSubmitting(true);
    try {
      const { data } = await api.post("/loans", { memberId, copyId });
      setMessage(`Loan issued. Due ${new Date(data.data.loan.dueAt).toLocaleDateString()}.`);
      setCopyId("");
      await loadDesk();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message ?? "The loan could not be issued.");
    } finally {
      setSubmitting(false);
    }
  }

  async function processReturn(loan) {
    setMessage("");
    setError("");
    setReturningId(loan.id);
    try {
      await api.post(`/loans/${loan.id}/return`);
      setMessage(`Return processed for ${loan.physicalCopy.resource.title}.`);
      await loadDesk();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message ?? "The return could not be processed.");
    } finally {
      setReturningId("");
    }
  }

  async function issueReservedLoan(reservation) {
    setMessage("");
    setError("");
    setIssuingReservationId(reservation.id);
    try {
      const { data } = await api.post("/loans", {
        memberId: reservation.userId,
        copyId: reservation.physicalCopyId,
      });
      setMessage(`Reserved loan issued to ${reservation.user.fullName}. Due ${new Date(data.data.loan.dueAt).toLocaleDateString()}.`);
      await loadDesk();
    } catch (requestError) {
      setError(requestError.response?.data?.error?.message ?? "The reserved loan could not be issued.");
    } finally {
      setIssuingReservationId("");
    }
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <aside className="sidebar">
        <a className="sidebar-brand" href="/" aria-label="Digital Library home">
          <span className="sidebar-mark"><LibraryBig size={21} aria-hidden="true" /></span>
          <span>Digital Library<small>OPERATIONS & INSIGHTS</small></span>
        </a>
        <div className="sidebar-section-label">WORKSPACE</div>
        <nav aria-label="Primary navigation">
          <NavLink className={({ isActive }) => `nav-item${isActive ? " active" : ""}`} to="/">
            <BookOpen size={18} aria-hidden="true" /> Loan desk
          </NavLink>
          <NavLink className="nav-item" to="/catalog">
            <Search size={18} aria-hidden="true" /> Catalog
          </NavLink>
          <NavLink className="nav-item" to="/manage/resources">
            <LibraryBig size={18} aria-hidden="true" /> Resources
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <div className="avatar" aria-hidden="true">{user.fullName.slice(0, 1).toUpperCase()}</div>
          <div className="user-summary"><strong>{user.fullName}</strong><span>{user.role.toLowerCase()}</span></div>
          <button className="icon-button" onClick={onLogout} aria-label="Sign out" title="Sign out">
            <LogOut size={17} aria-hidden="true" />
          </button>
        </div>
      </aside>
      <main className="main-content" id="main-content">
        <header className="page-header">
          <div>
            <p className="eyebrow">LIBRARY OPERATIONS</p>
            <h1>Loan desk</h1>
            <p className="muted">Issue an available physical copy to an active member.</p>
          </div>
          <div className="staff-chip"><span className="online-dot" /> Staff workspace</div>
        </header>

        <section className="content-grid" aria-label="Loan desk">
          <article className="panel issue-panel">
            <div className="panel-heading">
              <div className="heading-icon"><BookOpen size={20} aria-hidden="true" /></div>
              <div><h2>Issue a loan</h2><p>Select a member and an available copy.</p></div>
            </div>
            {loading ? (
              <div className="loading-state" role="status">Loading members and inventory...</div>
            ) : (
              <form className="form-stack" onSubmit={issueLoan}>
                <label htmlFor="member">Member</label>
                <select id="member" required value={memberId} onChange={(event) => setMemberId(event.target.value)}>
                  <option value="">Choose a member</option>
                  {members.map((member) => (
                    <option key={member.id} value={member.id}>{member.fullName} — {member.email}</option>
                  ))}
                </select>

                <label htmlFor="copy">Available resource copy</label>
                <select id="copy" required value={copyId} onChange={(event) => setCopyId(event.target.value)}>
                  <option value="">Choose a copy</option>
                  {copies.map((copy) => (
                    <option key={copy.id} value={copy.id}>
                      {copy.resource.title} · Accession {copy.accessionNumber}
                    </option>
                  ))}
                </select>
                <div className="hint">Standard loan period: 14 days from today.</div>
                {!members.length && (
                  <p className="empty-note" role="status">No active members are available to borrow resources.</p>
                )}
                {!error && copies.length === 0 && (
                  <p className="empty-note" role="status">No available copies to issue right now.</p>
                )}
                <button className="primary-button" disabled={submitting || !members.length || !copies.length} type="submit">
                  {submitting ? "Issuing loan..." : "Confirm loan"}
                  {!submitting && <ArrowRight aria-hidden="true" size={17} />}
                </button>
              </form>
            )}
          </article>
          <aside className="panel info-panel">
            <div className="heading-icon soft"><ShieldCheck size={20} aria-hidden="true" /></div>
            <h2>Before you issue</h2>
            <ul>
              <li>Only active member accounts are listed.</li>
              <li>Inventory availability is checked again when the loan is saved.</li>
              <li>The loan, copy status, notification, and audit record are saved together.</li>
            </ul>
            <div className="availability-count">
              <span>Available copies</span>
              <strong>{loading ? "—" : copies.length}</strong>
            </div>
          </aside>
        </section>
        <section className="panel loans-panel" aria-labelledby="ready-reservations-title">
          <div className="panel-heading">
            <div className="heading-icon soft"><LibraryBig size={20} aria-hidden="true" /></div>
            <div><h2 id="ready-reservations-title">Reservations ready for pickup</h2><p>Issue each held copy to the member it is reserved for.</p></div>
          </div>
          {loading ? <p className="loading-state" role="status">Loading ready reservations...</p>
            : readyReservations.length ? (
              <div className="management-resource-list">
                {readyReservations.map((reservation) => (
                  <article className="management-resource" key={reservation.id}>
                    <div className="management-resource-main">
                      <div>
                        <strong>{reservation.resource.title}</strong>
                        <span>{reservation.user.fullName} · Accession {reservation.physicalCopy.accessionNumber}</span>
                        {reservation.expiresAt && (
                          <span>Hold expires {new Date(reservation.expiresAt).toLocaleString()}</span>
                        )}
                      </div>
                      <button
                        className="small-button"
                        disabled={issuingReservationId === reservation.id}
                        onClick={() => void issueReservedLoan(reservation)}
                        type="button"
                      >
                        {issuingReservationId === reservation.id ? "Issuing..." : "Issue reserved loan"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : <p className="empty-note" role="status">No reservations are waiting for pickup.</p>}
        </section>
        <section className="panel loans-panel" aria-labelledby="active-loans-title">
          <div className="panel-heading">
            <div className="heading-icon soft"><Check size={20} aria-hidden="true" /></div>
            <div><h2 id="active-loans-title">Active loans</h2><p>Process returns and review due dates.</p></div>
          </div>
          {loading ? (
            <div className="loading-state" role="status">Loading active loans...</div>
          ) : loans.length ? (
            <div className="table-scroll" tabIndex="0" role="region" aria-label="Active loans table">
              <table>
                <caption className="sr-only">Active resource loans and return actions</caption>
                <thead>
                  <tr>
                    <th scope="col">Resource</th>
                    <th scope="col">Member</th>
                    <th scope="col">Due date</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loans.map((loan) => (
                    <tr key={loan.id}>
                      <td>{loan.physicalCopy.resource.title}</td>
                      <td>{loan.user.fullName}</td>
                      <td><time dateTime={loan.dueAt}>{new Date(loan.dueAt).toLocaleDateString()}</time></td>
                      <td>
                        <button
                          className="return-button"
                          disabled={returningId === loan.id}
                          onClick={() => processReturn(loan)}
                          type="button"
                        >
                          {returningId === loan.id ? "Processing..." : "Process return"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-note" role="status">There are no active loans to return.</p>
          )}
        </section>
        {message && <p className="form-success" role="status">{message}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <footer className="page-footer">Digital Library Operations and Insights Management System</footer>
      </main>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);
  const [authNotice, setAuthNotice] = useState("");

  useEffect(() => {
    api.get("/auth/me")
      .then(({ data }) => setUser(data.data.user))
      .catch((error) => {
        setUser(null);
        if (error.response?.status !== 401) {
          setAuthNotice("The library service is temporarily unavailable. Try signing in again shortly.");
        }
      })
      .finally(() => setCheckingSession(false));
  }, []);

  async function logout() {
    try {
      await api.post("/auth/logout");
      setAuthNotice("");
    } catch {
      setAuthNotice("The server could not confirm sign-out. Close this browser if you are using a shared device.");
    } finally {
      setUser(null);
    }
  }

  if (checkingSession) {
    return <main className="loading-screen" role="status">Loading your workspace...</main>;
  }
  return (
    <Routes>
      <Route path="/catalog" element={<CatalogPage user={user} />} />
      <Route path="/catalog/:id" element={<ResourceDetailPage user={user} />} />
      <Route path="/my-loans" element={user?.role === "MEMBER"
        ? <MemberLoansPage user={user} onLogout={logout} />
        : <Login onLogin={setUser} notice={authNotice} />} />
      <Route path="/manage/resources" element={["ADMIN", "LIBRARIAN"].includes(user?.role)
        ? <ResourceManagementPage user={user} onLogout={logout} />
        : user?.role === "MEMBER"
          ? <MemberLoansPage user={user} onLogout={logout} />
          : <Login onLogin={setUser} notice={authNotice} />} />
      <Route
        path="/"
        element={!user
          ? <Login onLogin={setUser} notice={authNotice} />
          : user.role === "MEMBER"
            ? <MemberLoansPage user={user} onLogout={logout} />
            : ["ADMIN", "LIBRARIAN"].includes(user.role)
            ? <LoanDesk user={user} onLogout={logout} />
            : (
              <main className="login-shell grid min-h-screen place-items-center">
                <section className="login-card" aria-labelledby="access-title">
                  <div className="brand-mark"><ShieldCheck aria-hidden="true" size={27} /></div>
                  <h1 id="access-title">Staff access required</h1>
                  <p className="muted">This first workspace is for administrators and librarians.</p>
                  <button className="secondary-button" onClick={logout}>Sign out</button>
                </section>
              </main>
            )}
      />
      <Route
        path="*"
        element={
          <main className="login-shell grid min-h-screen place-items-center">
            <section className="login-card">
              <h1>Page not found</h1>
              <p className="muted">The page you requested does not exist in this workspace.</p>
              <Link className="secondary-button" to="/">Return to loan desk</Link>
            </section>
          </main>
        }
      />
    </Routes>
  );
}

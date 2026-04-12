import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { StudentShellProvider, useStudentShell } from "../../context/StudentShellContext";
import BrandLogo from "../BrandLogo/BrandLogo";
import StudentNotifications from "../StudentNotifications/StudentNotifications";
import "./Layout.css";

function StudentSidebar() {
  const shell = useStudentShell();

  return (
    <aside className="student-sidebar">
      <nav className="student-nav" aria-label="Main">
        <NavLink to="/dashboard" className={({ isActive }) => (isActive ? "sn-link active" : "sn-link")}>
          <span className="sn-ic" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="9" rx="1" />
              <rect x="14" y="3" width="7" height="5" rx="1" />
              <rect x="14" y="12" width="7" height="9" rx="1" />
              <rect x="3" y="16" width="7" height="5" rx="1" />
            </svg>
          </span>
          Dashboard
        </NavLink>
        <NavLink to="/my-tickets" className={({ isActive }) => (isActive ? "sn-link active" : "sn-link")}>
          <span className="sn-ic" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
            </svg>
          </span>
          My Tickets
        </NavLink>
        <NavLink to="/create-ticket" className={({ isActive }) => (isActive ? "sn-link active" : "sn-link")}>
          <span className="sn-ic" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 8v8M8 12h8" />
            </svg>
          </span>
          Create Ticket
        </NavLink>
        <NavLink to="/profile" className={({ isActive }) => (isActive ? "sn-link active" : "sn-link")}>
          <span className="sn-ic" aria-hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </span>
          Profile
        </NavLink>
      </nav>

      <div className="sidebar-section">
        <p className="sidebar-heading">Quick Filters</p>
        <label className="sf-check">
          <input
            type="checkbox"
            checked={shell.filterPlumbing}
            onChange={(e) => shell.setFilterPlumbing(e.target.checked)}
          />
          Plumbing
        </label>
        <label className="sf-check">
          <input
            type="checkbox"
            checked={shell.filterElectrical}
            onChange={(e) => shell.setFilterElectrical(e.target.checked)}
          />
          Electrical
        </label>
        <label className="sf-check">
          <input
            type="checkbox"
            checked={shell.filterSafety}
            onChange={(e) => shell.setFilterSafety(e.target.checked)}
          />
          Safety
        </label>
      </div>

      <div className="sidebar-section">
        <p className="sidebar-heading">Status</p>
        <label className="sf-check">
          <input
            type="checkbox"
            checked={shell.statusOpen}
            onChange={(e) => shell.setStatusOpen(e.target.checked)}
          />
          Open
        </label>
        <label className="sf-check">
          <input
            type="checkbox"
            checked={shell.statusInProgress}
            onChange={(e) => shell.setStatusInProgress(e.target.checked)}
          />
          In Progress
        </label>
        <label className="sf-check">
          <input
            type="checkbox"
            checked={shell.statusResolved}
            onChange={(e) => shell.setStatusResolved(e.target.checked)}
          />
          Resolved
        </label>
      </div>
    </aside>
  );
}

function StudentChrome({ children }) {
  const { user, logout } = useAuth();
  const shell = useStudentShell();
  const navigate = useNavigate();
  const location = useLocation();

  const onLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="student-app">
      <header className="top-header">
        <div className="top-header-inner">
          <Link to="/dashboard" className="brand-lockup">
            <BrandLogo />
            <span className="brand-text">FixMyCampus</span>
          </Link>

          <div className="header-search">
            <span className="header-search-icon" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
            </span>
            <input
              type="search"
              placeholder="Search tickets, locations, or keywords"
              value={shell.search}
              onChange={(e) => shell.setSearch(e.target.value)}
              aria-label="Search tickets"
            />
          </div>

          <div className="header-actions">
            <a className="header-link" href="https://www.bennett.edu.in" target="_blank" rel="noreferrer">
              More about Bennett
            </a>
            <StudentNotifications refreshKey={location.pathname} />
            <Link to="/create-ticket" className="btn btn-primary header-cta">
              Create New Ticket
            </Link>
            <Link to="/profile" className="header-profile header-profile--link">
              <div className="avatar" aria-hidden>
                {user?.name?.charAt(0)?.toUpperCase() || "?"}
              </div>
              <div className="header-profile-text">
                <span className="hp-name">{user?.name}</span>
                <span className="hp-sub">Student</span>
              </div>
            </Link>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onLogout}>
              Log out
            </button>
          </div>
        </div>
      </header>

      <div className="student-body">
        <StudentSidebar />
        <div className="student-main">{children}</div>
      </div>

      <footer className="site-footer">
        <div className="site-footer-inner site-footer-inner--simple">
          <p className="site-footer-line">
            <strong>FixMyCampus</strong>
            <span className="footer-dot">•</span>
            University Facilities
          </p>
        </div>
      </footer>
    </div>
  );
}

function StaffChrome({ children }) {
  const { user, logout, isStaff, isAdmin } = useAuth();
  const navigate = useNavigate();

  const onLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="staff-app">
      <header className="top-header top-header--staff">
        <div className="top-header-inner">
          <Link to="/" className="brand-lockup">
            <BrandLogo />
            <span className="brand-text">FixMyCampus</span>
          </Link>
          <nav className="staff-top-nav">
            {isStaff && (
              <NavLink to="/staff" className={({ isActive }) => (isActive ? "header-link active" : "header-link")}>
                Staff desk
              </NavLink>
            )}
            {isAdmin && (
              <NavLink to="/admin" className={({ isActive }) => (isActive ? "header-link active" : "header-link")}>
                Admin
              </NavLink>
            )}
          </nav>
          <div className="header-actions">
            <NavLink to="/profile" className={({ isActive }) => (isActive ? "header-link active" : "header-link")}>
              Profile
            </NavLink>
            <span className="hp-name">{user?.name}</span>
            <span className="role-pill">{user?.role}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onLogout}>
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="staff-main">{children}</main>
    </div>
  );
}

function Layout({ children }) {
  const { isStudent } = useAuth();

  if (isStudent) {
    return (
      <StudentShellProvider>
        <StudentChrome>{children}</StudentChrome>
      </StudentShellProvider>
    );
  }

  return <StaffChrome>{children}</StaffChrome>;
}

export default Layout;

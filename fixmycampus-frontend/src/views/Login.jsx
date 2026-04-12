import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import BrandLogo from "../components/BrandLogo/BrandLogo";
import { handleLogin } from "../controllers/authController";
import { useAuth } from "../context/AuthContext";
import "./Auth.css";

function Login() {
  const { login, logout, user, ready } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await handleLogin({ email, password }, login);
    setLoading(false);
    if (!result.success) {
      setError(result.message);
      return;
    }
    navigate(from || "/", { replace: true });
  };

  return (
    <div className="auth-landing">
      <header className="auth-top">
        <div className="auth-top-inner">
          <Link to="/login" className="auth-brand">
            <BrandLogo />
            <span>FixMyCampus</span>
          </Link>
          <span className="auth-tagline">Report and track campus issues easily.</span>
        </div>
      </header>

      <main className="auth-hero">
        <div className="auth-illus" aria-hidden>
          <div className="auth-illus-map" />
          <div className="auth-illus-people">
            <span className="auth-bubble auth-bubble--1" />
            <span className="auth-bubble auth-bubble--2" />
            <span className="auth-bubble auth-bubble--3" />
          </div>
        </div>
        <div className="auth-form-wrap">
          {!ready ? (
            <p className="auth-loading">Loading…</p>
          ) : user ? (
            <>
              <h1 className="auth-hero-title">You&apos;re signed in</h1>
              <p className="auth-hero-sub">
                Signed in as <strong>{user.name}</strong> ({user.email}).
              </p>
              <div className="auth-signed-in-actions">
                <Link to={from || "/"} className="btn btn-primary auth-submit">
                  Continue to app
                </Link>
                <button
                  type="button"
                  className="btn btn-secondary auth-submit"
                  onClick={() => {
                    logout();
                    setEmail("");
                    setPassword("");
                  }}
                >
                  Sign out
                </button>
              </div>
            </>
          ) : (
            <>
              <h1 className="auth-hero-title">Welcome back</h1>
              <p className="auth-hero-sub">Sign in to your FixMyCampus account</p>
              {error && <p className="auth-error">{error}</p>}
              <form onSubmit={onSubmit} className="auth-form">
                <label>
                  University email
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="example@bennett.edu.in"
                    required
                    autoComplete="email"
                  />
                </label>
                <label>
                  Password
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                    autoComplete="current-password"
                  />
                </label>
                <div className="auth-row">
                  <label className="auth-check">
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                    Remember me
                  </label>
                  <a href="#" className="auth-link">
                    Forgot password?
                  </a>
                </div>
                <button type="submit" className="btn btn-primary auth-submit" disabled={loading}>
                  {loading ? "Signing in…" : "Log in"}
                </button>
              </form>
              <p className="auth-switch">
                Don&apos;t have an account? <Link to="/register">Create a new account</Link>
              </p>
            </>
          )}
        </div>
      </main>

      <section className="auth-features" aria-label="Features">
        <div className="auth-features-inner">
          <div className="auth-feature">
            <span className="auth-feature-icon">!</span>
            <h3>Report incidents</h3>
            <p>Submit photos and descriptions in seconds.</p>
          </div>
          <div className="auth-feature">
            <span className="auth-feature-icon auth-feature-icon--list">≡</span>
            <h3>Track tickets</h3>
            <p>Real-time updates from campus services.</p>
          </div>
          <div className="auth-feature">
            <span className="auth-feature-icon auth-feature-icon--bell">⌕</span>
            <h3>Campus updates</h3>
            <p>Maintenance schedules and alerts.</p>
          </div>
        </div>
      </section>

      <footer className="auth-footer">
        <div className="auth-footer-inner auth-footer-inner--simple">
          <strong>FixMyCampus</strong>
          <p className="auth-footer-tag">Making campus maintenance transparent and efficient.</p>
        </div>
      </footer>
    </div>
  );
}

export default Login;

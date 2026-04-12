import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function HomeRedirect() {
  const { user, ready } = useAuth();

  if (!ready) {
    return <div style={{ padding: "2rem", textAlign: "center" }}>Loading…</div>;
  }
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  if (user.role === "student") {
    return <Navigate to="/dashboard" replace />;
  }
  if (user.role === "staff") {
    return <Navigate to="/staff" replace />;
  }
  if (user.role === "admin") {
    return <Navigate to="/admin" replace />;
  }
  return <Navigate to="/login" replace />;
}

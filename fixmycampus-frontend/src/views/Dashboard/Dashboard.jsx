import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../../components/Layout/Layout";
import StatCard from "../../components/StatCard/StatCard";
import TicketCard from "../../components/TicketCard/TicketCard";
import { useAuth } from "../../context/AuthContext";
import { useStudentShell } from "../../context/StudentShellContext";
import { fetchMyTickets } from "../../controllers/ticketController";
import { ticketMatchesStudentFilters } from "../../utils/ticketFilters";
import "./Dashboard.css";

/** Must render under `Layout` so `StudentShellProvider` is an ancestor (see `useStudentShell`). */
function DashboardContent() {
  const { user } = useAuth();
  const shell = useStudentShell();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await fetchMyTickets();
      if (!cancelled) {
        setTickets(Array.isArray(list) ? list : []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(
    () => tickets.filter((t) => ticketMatchesStudentFilters(t, shell)),
    [tickets, shell]
  );

  const stats = useMemo(() => {
    const total = tickets.length;
    const open = tickets.filter((t) => t.status === "open").length;
    const inProgress = tickets.filter((t) =>
      ["in_progress", "reopened", "awaiting_confirmation"].includes(t.status)
    ).length;
    const resolved = tickets.filter((t) => t.status === "closed").length;
    return { total, open, inProgress, resolved };
  }, [tickets]);

  const sortedTickets = useMemo(() => {
    return [...filtered].sort(
      (a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
    );
  }, [filtered]);

  const initial = user?.name?.charAt(0)?.toUpperCase() || "?";

  return (
    <div className="dash-page">
      {loading ? (
        <p className="dash-loading">Loading…</p>
      ) : (
        <div className="dash-stats-row">
          <StatCard title="Total Tickets" value={stats.total} variant="total" />
          <StatCard title="Open" value={stats.open} variant="open" />
          <StatCard title="In Progress" value={stats.inProgress} variant="inprogress" />
          <StatCard title="Resolved" value={stats.resolved} variant="resolved" />
        </div>
      )}

      <section className="dash-section">
        <div className="dash-section-head">
          <div>
            <h2 className="dash-section-title">My Tickets</h2>
            <p className="dash-section-sub">Overview of recent campus reports and their current status.</p>
          </div>
          <div className="dash-section-actions">
            <Link to="/create-ticket" className="btn btn-primary">
              Create New Ticket
            </Link>
          </div>
        </div>

        <div className="dash-ticket-grid">
          {sortedTickets.map((ticket) => (
            <TicketCard key={ticket._id} ticket={ticket} userInitial={initial} />
          ))}
        </div>
        {!loading && sortedTickets.length === 0 && (
          <p className="dash-empty">
            {tickets.length === 0
              ? "No tickets yet. Create your first report to get started."
              : "No tickets match your search or filters."}
          </p>
        )}
      </section>
    </div>
  );
}

function Dashboard() {
  return (
    <Layout>
      <DashboardContent />
    </Layout>
  );
}

export default Dashboard;

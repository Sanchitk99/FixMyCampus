import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "../components/Layout/Layout";
import TicketCard from "../components/TicketCard/TicketCard";
import { useAuth } from "../context/AuthContext";
import { useStudentShell } from "../context/StudentShellContext";
import { getMyTickets } from "../services/ticketService";
import { ticketMatchesStudentFilters } from "../utils/ticketFilters";
import "./MyTickets.css";

/** Must render under `Layout` so `StudentShellProvider` is an ancestor (see `useStudentShell`). */
function MyTicketsContent() {
  const { user } = useAuth();
  const shell = useStudentShell();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await getMyTickets();
      setTickets(Array.isArray(data) ? data : []);
    } catch {
      setError("Failed to load tickets");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(
    () => tickets.filter((t) => ticketMatchesStudentFilters(t, shell)),
    [tickets, shell]
  );

  const sorted = useMemo(() => {
    return [...filtered].sort(
      (a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
    );
  }, [filtered]);

  const initial = user?.name?.charAt(0)?.toUpperCase() || "?";

  return (
    <div className="mt-page">
      {error && <p className="mt-error">{error}</p>}
      <div className="mt-section-head">
        <div>
          <h2 className="mt-section-title">My Tickets</h2>
          <p className="mt-section-sub">All of your campus maintenance reports in one place.</p>
        </div>
        <div className="mt-section-actions">
          <span className="mt-filter-hint">Filter</span>
          <Link to="/create-ticket" className="btn btn-primary">
            Create New Ticket
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="mt-loading">Loading…</p>
      ) : (
        <div className="mt-grid">
          {sorted.map((t) => (
            <TicketCard key={t._id} ticket={t} userInitial={initial} />
          ))}
        </div>
      )}
      {!loading && sorted.length === 0 && (
        <p className="mt-empty">
          {tickets.length === 0
            ? "You have not submitted any tickets yet."
            : "No tickets match your search or filters."}
        </p>
      )}
    </div>
  );
}

function MyTickets() {
  return (
    <Layout>
      <MyTicketsContent />
    </Layout>
  );
}

export default MyTickets;

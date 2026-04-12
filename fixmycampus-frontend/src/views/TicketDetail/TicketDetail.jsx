import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Layout from "../../components/Layout/Layout";
import { confirmTicket, getMyTicketById, reopenTicket } from "../../services/ticketService";
import { formatTicketStatus, statusToCssClass } from "../../utils/ticketStatus";
import { formatRelativeTime } from "../../utils/time";
import { formatTicketDisplayId } from "../../utils/ticketDisplay";
import { useAuth } from "../../context/AuthContext";
import "./TicketDetail.css";

function TicketDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const data = await getMyTicketById(id);
        if (!cancelled) setTicket(data);
      } catch (e) {
        if (!cancelled) {
          setError(e.response?.data?.message || "Could not load ticket");
          setTicket(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const timeline = useMemo(() => {
    if (!ticket) return [];
    const items = [
      {
        key: "reported",
        when: ticket.createdAt,
        text: `Reported by ${user?.name || "you"}`,
      },
    ];
    const notes = [...(ticket.progressNotes || [])].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );
    for (const n of notes) {
      const who = n.author?.name || "Staff";
      items.push({
        key: n._id || n.createdAt,
        when: n.createdAt,
        text: `${who}: ${n.body}`,
      });
    }
    return items.sort((a, b) => new Date(b.when) - new Date(a.when));
  }, [ticket, user?.name]);

  const onConfirm = async () => {
    setActionBusy(true);
    setError("");
    try {
      await confirmTicket(id);
      const data = await getMyTicketById(id);
      setTicket(data);
    } catch (e) {
      setError(e.response?.data?.message || "Could not confirm");
    } finally {
      setActionBusy(false);
    }
  };

  const onReopen = async () => {
    const reason = window.prompt("What still needs to be fixed?");
    if (reason === null) return;
    setActionBusy(true);
    setError("");
    try {
      await reopenTicket(id, reason);
      const data = await getMyTicketById(id);
      setTicket(data);
    } catch (e) {
      setError(e.response?.data?.message || "Could not reopen");
    } finally {
      setActionBusy(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <p className="td-loading">Loading…</p>
      </Layout>
    );
  }

  if (!ticket) {
    return (
      <Layout>
        <div className="td-error-wrap">
          <p className="td-error">{error || "Ticket not found"}</p>
          <Link to="/my-tickets" className="btn btn-primary">
            Back to My Tickets
          </Link>
        </div>
      </Layout>
    );
  }

  const displayId = formatTicketDisplayId(ticket._id);
  const statusLabel = formatTicketStatus(ticket.status);
  const thumb = ticket.images?.[0];

  return (
    <Layout>
      <div className="td-page">
        <button type="button" className="td-back btn btn-ghost" onClick={() => navigate(-1)}>
          ← Back
        </button>

        <header className="td-header-card">
          <div>
            <p className="td-id">Ticket #{displayId}</p>
            <h1 className="td-title">{ticket.title}</h1>
            <p className="td-meta">
              <span>Category: {ticket.category?.name || "—"}</span>
              <span className="td-meta-sep">·</span>
              <span>Location: {ticket.location}</span>
              <span className="td-meta-sep">·</span>
              <span>Reported: {formatRelativeTime(ticket.createdAt)}</span>
            </p>
          </div>
          <span className={`td-status-pill ${statusToCssClass(ticket.status)}`}>{statusLabel}</span>
        </header>

        {error && <p className="td-banner-error">{error}</p>}

        <section className="td-card">
          <h2 className="td-card-title">Issue Description</h2>
          <p className="td-desc">{ticket.description}</p>
          {ticket.otherDetails ? (
            <p className="td-other">
              <strong>Other details:</strong> {ticket.otherDetails}
            </p>
          ) : null}
          {thumb ? (
            <img className="td-image" src={thumb} alt="Issue" />
          ) : null}
          <div className="td-avatar-row">
            <span className="td-avatar">{user?.name?.charAt(0)?.toUpperCase() || "?"}</span>
          </div>
        </section>

        <section className="td-card td-timeline-card">
          <h2 className="td-card-title">Ticket Activity Timeline</h2>
          <ul className="td-timeline">
            {timeline.map((item) => (
              <li key={item.key} className="td-tl-item">
                <span className="td-tl-time">{formatRelativeTime(item.when)}</span>
                <span className="td-tl-text">{item.text}</span>
              </li>
            ))}
          </ul>
          {ticket.status === "awaiting_confirmation" && (
            <div className="td-your-actions">
              <p className="td-actions-title">This ticket is ready for your review</p>
              {ticket.resolutionProofUrl && (
                <a
                  href={ticket.resolutionProofUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="td-proof-link"
                >
                  View completion proof
                </a>
              )}
              <div className="td-action-btns">
                <button type="button" className="btn btn-primary" disabled={actionBusy} onClick={onConfirm}>
                  Confirm resolved
                </button>
                <button type="button" className="btn btn-secondary" disabled={actionBusy} onClick={onReopen}>
                  Reopen ticket
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </Layout>
  );
}

export default TicketDetail;

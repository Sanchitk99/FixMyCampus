import { Link } from "react-router-dom";
import { formatTicketStatus, statusToCssClass } from "../../utils/ticketStatus";
import { formatRelativeTime } from "../../utils/time";
import { formatTicketDisplayId } from "../../utils/ticketDisplay";
import "./TicketCard.css";

function TicketCard({ ticket, userInitial }) {
  const thumb = ticket.images?.[0];
  const category = ticket.category?.name || "Category";
  const when = formatRelativeTime(ticket.updatedAt || ticket.createdAt);
  const displayId = formatTicketDisplayId(ticket._id);

  return (
    <article className="ticket-card">
      <div className="ticket-card-top">
        <div className="ticket-card-headline">
          <h3 className="ticket-card-title">{ticket.title}</h3>
          <p className="ticket-card-meta">
            {category}
            <span className="ticket-card-dot">•</span>
            Building: {ticket.location}
            <span className="ticket-card-dot">•</span>
            Reported {when}
          </p>
        </div>
        <span className="ticket-card-id">Ticket #{displayId}</span>
      </div>
      <div className="ticket-card-mid">
        {thumb ? (
          <img className="ticket-card-thumb" src={thumb} alt="" />
        ) : (
          <div className="ticket-card-thumb ticket-card-thumb--empty" aria-hidden>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </div>
        )}
        <p className="ticket-card-desc">{ticket.description}</p>
      </div>
      <div className="ticket-card-foot">
        <div className="ticket-card-foot-left">
          <span className="ticket-card-avatar" aria-hidden>
            {userInitial || "?"}
          </span>
          <span className={`ticket-card-badge ${statusToCssClass(ticket.status)}`}>
            {formatTicketStatus(ticket.status)}
          </span>
        </div>
        <div className="ticket-card-actions">
          <Link to={`/my-tickets/${ticket._id}`} className="ticket-card-link">
            View
          </Link>
        </div>
      </div>
    </article>
  );
}

export default TicketCard;

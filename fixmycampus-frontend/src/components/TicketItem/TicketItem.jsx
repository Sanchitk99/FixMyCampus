import { formatTicketStatus, statusToCssClass } from "../../utils/ticketStatus";
import "./TicketItem.css";

function TicketItem({ title, location, status, time }) {
  const label = formatTicketStatus(status);
  const cls = statusToCssClass(status);

  return (
    <div className="ticket-item">
      <div className="ticket-title">{title}</div>
      <div className="ticket-location">{location}</div>
      <div className={`ticket-status ${cls}`}>{label}</div>
      <div className="ticket-time">{time}</div>
    </div>
  );
}

export default TicketItem;

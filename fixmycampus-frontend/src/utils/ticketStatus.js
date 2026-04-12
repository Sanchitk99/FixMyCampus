export function formatTicketStatus(status) {
  const map = {
    open: "Open",
    in_progress: "In Progress",
    awaiting_confirmation: "Awaiting Reapproval",
    closed: "Resolved",
    reopened: "In Progress",
  };
  return map[status] || status;
}

export function statusToCssClass(status) {
  return String(status || "")
    .toLowerCase()
    .replace(/_/g, "-");
}

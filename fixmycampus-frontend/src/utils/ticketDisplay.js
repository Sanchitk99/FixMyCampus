/** Short public-style id for UI (e.g. Ticket #C-1034). */
export function formatTicketDisplayId(mongoId) {
  if (!mongoId) return "—";
  const hex = String(mongoId).replace(/[^a-f0-9]/gi, "");
  const tail = hex.slice(-4).toUpperCase().padStart(4, "0");
  return `C-${tail}`;
}

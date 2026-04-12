function categoryKeywordMatch(categoryName, keyword) {
  return String(categoryName || "")
    .toLowerCase()
    .includes(keyword.toLowerCase());
}

/**
 * Client-side filters for dashboard / my tickets (sidebar + header search).
 */
export function ticketMatchesStudentFilters(ticket, shell) {
  const q = shell.search.trim().toLowerCase();
  if (q) {
    const blob = [
      ticket.title,
      ticket.location,
      ticket.description,
      ticket.category?.name,
      ticket.department?.name,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!blob.includes(q)) return false;
  }

  const catOn =
    shell.filterPlumbing || shell.filterElectrical || shell.filterSafety;
  if (catOn) {
    const name = ticket.category?.name || "";
    let ok = false;
    if (shell.filterPlumbing && categoryKeywordMatch(name, "plumb")) ok = true;
    if (shell.filterElectrical && categoryKeywordMatch(name, "electric"))
      ok = true;
    if (shell.filterSafety && categoryKeywordMatch(name, "safe")) ok = true;
    if (!ok) return false;
  }

  const statOn =
    shell.statusOpen || shell.statusInProgress || shell.statusResolved;
  if (statOn) {
    const s = ticket.status;
    let ok = false;
    if (shell.statusOpen && s === "open") ok = true;
    if (
      shell.statusInProgress &&
      ["in_progress", "reopened", "awaiting_confirmation"].includes(s)
    )
      ok = true;
    if (shell.statusResolved && s === "closed") ok = true;
    if (!ok) return false;
  }

  return true;
}

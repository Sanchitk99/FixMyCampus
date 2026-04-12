import { useEffect, useState } from "react";
import Layout from "../../components/Layout/Layout";
import { completeStaffTicket, getStaffTickets, updateStaffTicket } from "../../services/staffService";
import { formatTicketStatus, statusToCssClass } from "../../utils/ticketStatus";
import { formatRelativeTime } from "../../utils/time";
import "./StaffDashboard.css";

function StaffDashboard() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [progressNote, setProgressNote] = useState("");
  const [busyId, setBusyId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await getStaffTickets();
      setTickets(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.response?.data?.message || "Failed to load tickets");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onAddProgress = async (id) => {
    if (!progressNote.trim()) {
      setError("Add a progress note");
      return;
    }
    setBusyId(id);
    setError("");
    try {
      await updateStaffTicket(id, { status: "in_progress", progressNote });
      setProgressNote("");
      setExpanded(null);
      await load();
    } catch (e) {
      setError(e.response?.data?.message || "Update failed");
    } finally {
      setBusyId(null);
    }
  };

  const onComplete = async (id, e) => {
    e.preventDefault();
    const form = e.target;
    const file = form.proof?.files?.[0];
    if (!file) {
      setError("Proof image is required");
      return;
    }
    const fd = new FormData();
    fd.append("proof", file);
    const note = form.resolutionNote?.value?.trim();
    if (note) {
      fd.append("resolutionNote", note);
    }
    setBusyId(id);
    setError("");
    try {
      await completeStaffTicket(id, fd);
      form.reset();
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Could not complete ticket");
    } finally {
      setBusyId(null);
    }
  };

  const onStart = async (id) => {
    setBusyId(id);
    setError("");
    try {
      await updateStaffTicket(id, { status: "in_progress" });
      await load();
    } catch (e) {
      setError(e.response?.data?.message || "Could not update");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Layout>
      <div className="sd-wrap">
        <h2 className="sd-title">Staff desk</h2>
        <p className="sd-sub">Tickets assigned to your department</p>
        {error && <p className="sd-error">{error}</p>}
        {loading ? (
          <p>Loading…</p>
        ) : (
          <ul className="sd-list">
            {tickets.map((t) => (
              <li key={t._id} className="sd-card">
                <div className="sd-head">
                  <div>
                    <div className="sd-t">{t.title}</div>
                    <div className="sd-meta">
                      {t.location} · {t.student?.name || "Student"} ·{" "}
                      {formatRelativeTime(t.updatedAt || t.createdAt)}
                    </div>
                  </div>
                  <span className={`sd-badge ${statusToCssClass(t.status)}`}>
                    {formatTicketStatus(t.status)}
                  </span>
                </div>
                <p className="sd-desc">{t.description}</p>
                {t.otherDetails ? (
                  <p className="sd-other">
                    <strong>Other details:</strong> {t.otherDetails}
                  </p>
                ) : null}
                {t.status === "awaiting_confirmation" && t.resolutionProofUrl && (
                  <p>
                    <a href={t.resolutionProofUrl} target="_blank" rel="noreferrer" className="sd-link">
                      View submitted proof
                    </a>
                  </p>
                )}
                {(t.status === "open" || t.status === "in_progress" || t.status === "reopened") && (
                  <div className="sd-actions">
                    {t.status === "open" && (
                      <button
                        type="button"
                        className="sd-btn"
                        disabled={busyId === t._id}
                        onClick={() => onStart(t._id)}
                      >
                        Start work
                      </button>
                    )}
                    <button
                      type="button"
                      className="sd-btn secondary"
                      onClick={() => setExpanded(expanded === t._id ? null : t._id)}
                    >
                      {expanded === t._id ? "Hide" : "Add progress"}
                    </button>
                  </div>
                )}
                {expanded === t._id && (
                  <div className="sd-panel">
                    <textarea
                      placeholder="What did you do?"
                      value={progressNote}
                      onChange={(e) => setProgressNote(e.target.value)}
                      rows={3}
                    />
                    <button
                      type="button"
                      className="sd-btn"
                      disabled={busyId === t._id}
                      onClick={() => onAddProgress(t._id)}
                    >
                      Save progress
                    </button>
                  </div>
                )}
                {(t.status === "open" || t.status === "in_progress" || t.status === "reopened") && (
                  <form className="sd-complete" onSubmit={(e) => onComplete(t._id, e)}>
                    <div className="sd-complete-row">
                      <label>
                        Completion proof (image)
                        <input type="file" name="proof" accept="image/*" required />
                      </label>
                      <label>
                        Resolution note
                        <input type="text" name="resolutionNote" placeholder="Optional" />
                      </label>
                    </div>
                    <button type="submit" className="sd-btn success" disabled={busyId === t._id}>
                      Mark done & send for student approval
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {!loading && tickets.length === 0 && (
          <p className="sd-empty">No tickets for your department right now.</p>
        )}
      </div>
    </Layout>
  );
}

export default StaffDashboard;

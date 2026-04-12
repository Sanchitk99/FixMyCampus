import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getNotifications, markNotificationRead } from "../../services/notificationService";
import { formatRelativeTime } from "../../utils/time";
import "./StudentNotifications.css";

function IconBell() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export default function StudentNotifications({ refreshKey }) {
  const wrapRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  const unreadCount = items.filter((n) => !n.read).length;

  const load = async () => {
    setLoading(true);
    try {
      const list = await getNotifications();
      setItems(Array.isArray(list) ? list : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [refreshKey]);

  useEffect(() => {
    if (!open) return;
    load();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const onItemActivate = async (n) => {
    if (!n.read && n._id) {
      try {
        await markNotificationRead(n._id);
        setItems((prev) => prev.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
      } catch {
        /* keep UI usable */
      }
    }
  };

  const ticketId = (n) => {
    const t = n.ticket;
    if (!t) return null;
    if (typeof t === "object" && t._id) return t._id;
    return typeof t === "string" ? t : null;
  };

  return (
    <div className="student-notif" ref={wrapRef}>
      <button
        type="button"
        className="icon-btn notif-btn"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <IconBell />
        {unreadCount > 0 ? <span className="notif-badge">{unreadCount > 9 ? "9+" : unreadCount}</span> : null}
      </button>
      {open ? (
        <div className="student-notif-panel" role="dialog" aria-label="Notifications">
          <div className="student-notif-panel-head">
            <span>Notifications</span>
            {loading ? <span className="student-notif-loading">Updating…</span> : null}
          </div>
          <ul className="student-notif-list">
            {items.length === 0 && !loading ? (
              <li className="student-notif-empty">No notifications yet.</li>
            ) : null}
            {items.map((n) => {
              const tid = ticketId(n);
              const inner = (
                <>
                  <p className={`student-notif-msg ${n.read ? "" : "student-notif-msg--unread"}`}>{n.message}</p>
                  <span className="student-notif-time">{formatRelativeTime(n.createdAt)}</span>
                  {tid ? (
                    <span className="student-notif-view">View ticket</span>
                  ) : null}
                </>
              );
              const className = `student-notif-item${n.read ? "" : " student-notif-item--unread"}`;
              if (tid) {
                return (
                  <li key={n._id}>
                    <Link
                      to={`/my-tickets/${tid}`}
                      className={className}
                      onClick={() => onItemActivate(n)}
                    >
                      {inner}
                    </Link>
                  </li>
                );
              }
              return (
                <li key={n._id}>
                  <button type="button" className={className} onClick={() => onItemActivate(n)}>
                    {inner}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

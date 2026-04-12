import { useEffect, useState } from "react";
import Layout from "../../components/Layout/Layout";
import {
  createCategory,
  createDepartment,
  createStaffUser,
  deleteCategory,
  deleteDepartment,
  getAdminCategories,
  getAdminStats,
  getAdminTickets,
  getDepartments,
  getStaffAccounts,
  getStaffUsers,
  reassignTicket,
} from "../../services/adminService";
import { formatTicketStatus, statusToCssClass } from "../../utils/ticketStatus";
import "./AdminDashboard.css";

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "tickets", label: "Tickets" },
  { id: "staff", label: "Staff" },
  { id: "departments", label: "Departments" },
  { id: "categories", label: "Categories" },
];

function AdminDashboard() {
  const ticketStatusOptions = [
    { value: "all", label: "All statuses" },
    { value: "open", label: "Open" },
    { value: "in_progress", label: "In Progress" },
    { value: "awaiting_confirmation", label: "Awaiting Reapproval" },
    { value: "closed", label: "Resolved" },
    { value: "reopened", label: "Reopened" },
  ];

  const [tab, setTab] = useState("overview");
  const [stats, setStats] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [ticketStatusFilter, setTicketStatusFilter] = useState("all");
  const [departments, setDepartments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [deptName, setDeptName] = useState("");
  const [deptCode, setDeptCode] = useState("");
  const [catName, setCatName] = useState("");
  const [catDeptId, setCatDeptId] = useState("");

  const [staffList, setStaffList] = useState([]);
  const [staffName, setStaffName] = useState("");
  const [staffEmail, setStaffEmail] = useState("");
  const [staffPassword, setStaffPassword] = useState("");
  const [staffDeptId, setStaffDeptId] = useState("");
  const [staffSuccess, setStaffSuccess] = useState("");

  const [reassignDept, setReassignDept] = useState({});
  const [reassignStaff, setReassignStaff] = useState({});
  const [staffOptions, setStaffOptions] = useState({});

  const refreshOverview = async () => {
    const s = await getAdminStats();
    setStats(s);
  };

  const refreshTickets = async (statusFilter = ticketStatusFilter) => {
    const t = await getAdminTickets(statusFilter);
    setTickets(Array.isArray(t) ? t : []);
  };

  const refreshDepartments = async () => {
    const d = await getDepartments();
    setDepartments(Array.isArray(d) ? d : []);
    if (d?.[0]?._id && !catDeptId) {
      setCatDeptId(d[0]._id);
    }
    if (d?.[0]?._id && !staffDeptId) {
      setStaffDeptId(d[0]._id);
    }
  };

  const refreshCategories = async () => {
    const c = await getAdminCategories();
    setCategories(Array.isArray(c) ? c : []);
  };

  const refreshStaffList = async () => {
    const list = await getStaffAccounts();
    setStaffList(Array.isArray(list) ? list : []);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError("");
      try {
        await Promise.all([refreshOverview(), refreshTickets(), refreshDepartments(), refreshCategories()]);
      } catch (e) {
        if (!cancelled) {
          setError(e.response?.data?.message || "Failed to load admin data");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (tab !== "staff" || loading) return;
    let cancelled = false;
    (async () => {
      try {
        await refreshStaffList();
      } catch (e) {
        if (!cancelled) {
          setError(e.response?.data?.message || "Could not load staff");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, loading]);

  const loadStaffForTicket = async (ticketId, departmentId) => {
    if (!departmentId) return;
    try {
      const list = await getStaffUsers(departmentId);
      setStaffOptions((prev) => ({ ...prev, [ticketId]: list }));
    } catch {
      setStaffOptions((prev) => ({ ...prev, [ticketId]: [] }));
    }
  };

  useEffect(() => {
    if (tab !== "tickets") return;
    tickets.forEach((t) => {
      const deptId = t.department?._id || t.department;
      if (deptId) {
        loadStaffForTicket(t._id, deptId);
      }
    });
  }, [tab, tickets]);

  const onReassign = async (ticketId) => {
    const departmentId = reassignDept[ticketId];
    if (!departmentId) {
      setError("Select a department");
      return;
    }
    const assignedStaffId = reassignStaff[ticketId] || "";
    setError("");
    try {
      await reassignTicket(ticketId, {
        departmentId,
        assignedStaffId: assignedStaffId || undefined,
      });
      await refreshTickets();
    } catch (e) {
      setError(e.response?.data?.message || "Reassign failed");
    }
  };

  const onTicketStatusFilterChange = async (nextStatus) => {
    setTicketStatusFilter(nextStatus);
    setError("");
    try {
      await refreshTickets(nextStatus);
    } catch (e) {
      setError(e.response?.data?.message || "Could not filter tickets");
    }
  };

  const addDepartment = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await createDepartment({ name: deptName, code: deptCode });
      setDeptName("");
      setDeptCode("");
      await refreshDepartments();
    } catch (err) {
      setError(err.response?.data?.message || "Could not create department");
    }
  };

  const addStaff = async (e) => {
    e.preventDefault();
    setError("");
    setStaffSuccess("");
    if (!staffDeptId) {
      setError("Select a department");
      return;
    }
    try {
      await createStaffUser({
        name: staffName.trim(),
        email: staffEmail.trim(),
        password: staffPassword,
        departmentId: staffDeptId,
      });
      setStaffName("");
      setStaffEmail("");
      setStaffPassword("");
      setStaffSuccess("Staff account created. They can sign in with the email and password you set.");
      await refreshStaffList();
    } catch (err) {
      setError(err.response?.data?.message || "Could not create staff user");
    }
  };

  const addCategory = async (e) => {
    e.preventDefault();
    if (!catDeptId) {
      setError("Select a department");
      return;
    }
    setError("");
    try {
      await createCategory({ name: catName, departmentId: catDeptId });
      setCatName("");
      await refreshCategories();
    } catch (err) {
      setError(err.response?.data?.message || "Could not create category");
    }
  };

  return (
    <Layout>
      <div className="ad-wrap">
        <h2 className="ad-title">Admin</h2>
        <div className="ad-tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? "ad-tab active" : "ad-tab"}
              onClick={() => {
                setTab(t.id);
                setStaffSuccess("");
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        {error && <p className="ad-error">{error}</p>}
        {loading ? (
          <p>Loading…</p>
        ) : (
          <>
            {tab === "overview" && stats && (
              <div className="ad-stats">
                <div className="ad-stat">
                  <span>Total</span>
                  <strong>{stats.total}</strong>
                </div>
                <div className="ad-stat">
                  <span>Open</span>
                  <strong>{stats.open}</strong>
                </div>
                <div className="ad-stat">
                  <span>In progress</span>
                  <strong>{stats.in_progress}</strong>
                </div>
                <div className="ad-stat">
                  <span>Awaiting Reapproval</span>
                  <strong>{stats.awaiting_confirmation}</strong>
                </div>
                <div className="ad-stat">
                  <span>Closed</span>
                  <strong>{stats.closed}</strong>
                </div>
              </div>
            )}

            {tab === "staff" && (
              <div className="ad-section">
                <p className="ad-hint">
                  Create accounts for department staff. They sign in at the same login page as everyone else.
                  Public registration remains students only.
                </p>
                {staffSuccess && <p className="ad-success">{staffSuccess}</p>}
                <form className="ad-staff-form" onSubmit={addStaff}>
                  <label>
                    Full name
                    <input
                      value={staffName}
                      onChange={(e) => setStaffName(e.target.value)}
                      required
                    />
                  </label>
                  <label>
                    Work email
                    <input
                      type="email"
                      value={staffEmail}
                      onChange={(e) => setStaffEmail(e.target.value)}
                      required
                      autoComplete="off"
                    />
                  </label>
                  <label>
                    Initial password
                    <input
                      type="password"
                      value={staffPassword}
                      onChange={(e) => setStaffPassword(e.target.value)}
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
                  </label>
                  <label>
                    Department
                    <select value={staffDeptId} onChange={(e) => setStaffDeptId(e.target.value)} required>
                      {departments.map((d) => (
                        <option key={d._id} value={d._id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" className="ad-staff-submit">
                    Add staff member
                  </button>
                </form>
                <h3 className="ad-subheading">Staff accounts</h3>
                <div className="ad-table-wrap">
                  <table className="ad-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Email</th>
                        <th>Department</th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffList.map((s) => (
                        <tr key={s._id}>
                          <td>{s.name}</td>
                          <td>{s.email}</td>
                          <td>{s.department?.name || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {staffList.length === 0 && <p className="ad-empty">No staff accounts yet.</p>}
                </div>
              </div>
            )}

            {tab === "tickets" && (
              <div className="ad-table-wrap">
                <div className="ad-ticket-controls">
                  <label htmlFor="ad-ticket-status-filter">Status</label>
                  <select
                    id="ad-ticket-status-filter"
                    value={ticketStatusFilter}
                    onChange={(e) => onTicketStatusFilterChange(e.target.value)}
                  >
                    {ticketStatusOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <table className="ad-table">
                  <thead>
                    <tr>
                      <th>Title / category</th>
                      <th>Status</th>
                      <th>Department</th>
                      <th>Reassign</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((t) => (
                      <tr key={t._id}>
                        <td>
                          <div className="ad-cell-title">{t.title}</div>
                          {t.category?.name && (
                            <div className="ad-cell-meta">{t.category.name}</div>
                          )}
                          {t.otherDetails ? (
                            <div className="ad-cell-other" title={t.otherDetails}>
                              Other: {t.otherDetails.length > 80 ? `${t.otherDetails.slice(0, 80)}…` : t.otherDetails}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <span className={`ad-badge ${statusToCssClass(t.status)}`}>
                            {formatTicketStatus(t.status)}
                          </span>
                        </td>
                        <td>{t.department?.name || "—"}</td>
                        <td>
                          {t.status !== "closed" && (
                            <div className="ad-reassign">
                              <select
                                value={reassignDept[t._id] || t.department?._id || ""}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setReassignDept((prev) => ({ ...prev, [t._id]: v }));
                                  setReassignStaff((prev) => ({ ...prev, [t._id]: "" }));
                                  loadStaffForTicket(t._id, v);
                                }}
                              >
                                {departments.map((d) => (
                                  <option key={d._id} value={d._id}>
                                    {d.name}
                                  </option>
                                ))}
                              </select>
                              <select
                                value={reassignStaff[t._id] || ""}
                                onChange={(e) =>
                                  setReassignStaff((prev) => ({ ...prev, [t._id]: e.target.value }))
                                }
                              >
                                <option value="">— staff (optional) —</option>
                                {(staffOptions[t._id] || []).map((s) => (
                                  <option key={s._id} value={s._id}>
                                    {s.name}
                                  </option>
                                ))}
                              </select>
                              <button type="button" className="ad-small" onClick={() => onReassign(t._id)}>
                                Apply
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {tickets.length === 0 && <p className="ad-empty">No tickets yet.</p>}
              </div>
            )}

            {tab === "departments" && (
              <div className="ad-section">
                <form className="ad-inline" onSubmit={addDepartment}>
                  <input
                    placeholder="Name"
                    value={deptName}
                    onChange={(e) => setDeptName(e.target.value)}
                    required
                  />
                  <input
                    placeholder="Code (optional)"
                    value={deptCode}
                    onChange={(e) => setDeptCode(e.target.value)}
                  />
                  <button type="submit">Add department</button>
                </form>
                <ul className="ad-simple-list">
                  {departments.map((d) => (
                    <li key={d._id}>
                      <span>
                        {d.name} {d.code ? `(${d.code})` : ""}
                      </span>
                      <button
                        type="button"
                        className="ad-small danger"
                        onClick={async () => {
                          if (!window.confirm("Delete this department?")) return;
                          try {
                            await deleteDepartment(d._id);
                            await refreshDepartments();
                          } catch (err) {
                            setError(err.response?.data?.message || "Delete failed");
                          }
                        }}
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {tab === "categories" && (
              <div className="ad-section">
                <form className="ad-inline" onSubmit={addCategory}>
                  <input
                    placeholder="Category name"
                    value={catName}
                    onChange={(e) => setCatName(e.target.value)}
                    required
                  />
                  <select value={catDeptId} onChange={(e) => setCatDeptId(e.target.value)}>
                    {departments.map((d) => (
                      <option key={d._id} value={d._id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                  <button type="submit">Add category</button>
                </form>
                <ul className="ad-simple-list">
                  {categories.map((c) => (
                    <li key={c._id}>
                      <span>
                        {c.name} — {c.department?.name || "Dept"}
                      </span>
                      <button
                        type="button"
                        className="ad-small danger"
                        onClick={async () => {
                          if (!window.confirm("Delete this category?")) return;
                          try {
                            await deleteCategory(c._id);
                            await refreshCategories();
                          } catch (err) {
                            setError(err.response?.data?.message || "Delete failed");
                          }
                        }}
                      >
                        Delete
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}

export default AdminDashboard;

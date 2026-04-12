import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import Layout from "../../components/Layout/Layout";
import { handleCreateTicket } from "../../controllers/ticketController";
import { fetchCategories } from "../../services/publicService";
import "./CreateTicket.css";

function CreateTicket() {
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [categories, setCategories] = useState([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [otherDetails, setOtherDetails] = useState("");
  const [files, setFiles] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const selectedCategory = categories.find((c) => c._id === categoryId);
  const showOtherDetails = Boolean(selectedCategory?.isOther);

  useEffect(() => {
    fetchCategories()
      .then((list) => {
        setCategories(Array.isArray(list) ? list : []);
        if (list?.[0]?._id) {
          setCategoryId(list[0]._id);
        }
      })
      .catch(() => setError("Could not load categories"));
  }, []);

  const addFiles = (list) => {
    const next = Array.from(list || []).filter((f) => f.type.startsWith("image/"));
    setFiles((prev) => [...prev, ...next].slice(0, 5));
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!categoryId) {
      setError("Select a category");
      return;
    }
    if (showOtherDetails && otherDetails.trim().length < 10) {
      setError('Please add at least 10 characters in "Other details" so the issue can be routed.');
      return;
    }
    setLoading(true);
    const fd = new FormData();
    fd.append("title", title);
    fd.append("description", description);
    fd.append("location", location);
    fd.append("categoryId", categoryId);
    if (showOtherDetails) {
      fd.append("otherDetails", otherDetails.trim());
    }
    for (const f of files) {
      fd.append("images", f);
    }
    const result = await handleCreateTicket(fd);
    setLoading(false);
    if (!result.success) {
      setError(result.message);
      return;
    }
    navigate("/my-tickets");
  };

  return (
    <Layout>
      <div className="ct-page">
        <h1 className="ct-heading">Create New Ticket</h1>
        <p className="ct-sub">Report a campus issue so the facilities team can review and resolve it.</p>
        {error && <p className="ct-error">{error}</p>}

        <form className="ct-panel" onSubmit={onSubmit}>
          <div className="ct-row-2">
            <label className="ct-field">
              <span className="ct-label">Ticket Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ticket title here"
                required
              />
            </label>
            <label className="ct-field">
              <span className="ct-label">Category</span>
              <select
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setOtherDetails("");
                }}
                required
              >
                <option value="">Select Category</option>
                {categories.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                    {c.department?.name ? ` — ${c.department.name}` : ""}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {showOtherDetails && (
            <label className="ct-field">
              <span className="ct-label">Other details (required)</span>
              <textarea
                value={otherDetails}
                onChange={(e) => setOtherDetails(e.target.value)}
                rows={4}
                placeholder="Describe the work needed (e.g. carpenter for a door, signage, etc.). Staff can reassign this ticket to the right team."
                required
                minLength={10}
              />
            </label>
          )}

          <label className="ct-field">
            <span className="ct-label">Location</span>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Enter building / hostel / room number"
              required
            />
            <span className="ct-hint">
              Examples: Building B Block, Hostel C2, A Block, P Block, N Block, C1, C6, D2, C9, D4
            </span>
          </label>

          <label className="ct-field">
            <span className="ct-label">Description</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              placeholder="Describe the issue in detail so the maintenance team can understand the problem."
              required
            />
          </label>

          <div className="ct-field">
            <span className="ct-label">Upload Image</span>
            <div
              className={`ct-dropzone ${dragOver ? "ct-dropzone--active" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="ct-file-input"
                tabIndex={-1}
                aria-hidden
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <span className="ct-drop-ic" aria-hidden>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </span>
              <p className="ct-drop-title">Upload Photo</p>
              <p className="ct-drop-text">Drag and drop or select an image.</p>
              <button
                type="button"
                className="btn btn-secondary ct-browse"
                onClick={() => fileInputRef.current?.click()}
              >
                Select image
              </button>
              {files.length > 0 && (
                <ul className="ct-file-list">
                  {files.map((f, i) => (
                    <li key={`${f.name}-${i}`}>
                      {f.name}
                      <button
                        type="button"
                        className="ct-remove-file"
                        onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="ct-actions">
            <Link to="/my-tickets" className="btn btn-ghost">
              Cancel
            </Link>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "Submitting…" : "Submit Ticket"}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}

export default CreateTicket;

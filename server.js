const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const HOST = String(process.env.HOST || "localhost").trim();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, "data");
const DB_PATH = process.env.FIXMYCAMPUS_DB_PATH || path.join(DATA_DIR, "fixmycampus.db");
const FIXMYCAMPUS_BASE_URL = String(process.env.FIXMYCAMPUS_BASE_URL || "").trim().replace(/\/+$/, "");
const SESSION_COOKIE = "fixmycampus_session";
const MICROSOFT_OAUTH_COOKIE = "fixmycampus_microsoft_oauth";
const MAX_BODY_SIZE = 8 * 1024 * 1024;
const EMAIL_VERIFICATION_TTL_MS = 1000 * 60 * 60 * 24;
const PASSWORD_RESET_TTL_MS = 1000 * 60 * 30;
const UNIVERSITY_SSO_TTL_MS = 1000 * 60 * 15;
const MICROSOFT_OAUTH_TTL_MS = 1000 * 60 * 10;
const MICROSOFT_CALLBACK_PATH = "/auth/microsoft/callback";
const MICROSOFT_SCOPE = "openid profile email";
const MICROSOFT_CLIENT_ID = String(process.env.MICROSOFT_CLIENT_ID || "").trim();
const MICROSOFT_TENANT_ID = String(process.env.MICROSOFT_TENANT_ID || "").trim();
const MICROSOFT_CLIENT_SECRET = String(process.env.MICROSOFT_CLIENT_SECRET || "").trim();
const MICROSOFT_REDIRECT_URI = String(process.env.MICROSOFT_REDIRECT_URI || "").trim();
const UNIVERSITY_EMAIL_DOMAIN = String(process.env.UNIVERSITY_EMAIL_DOMAIN || "bennett.edu.in").trim().toLowerCase();
const LEGACY_DEMO_EMAILS = new Set([
  "student@fixmycampus.edu",
  "faculty@fixmycampus.edu",
  "admin@fixmycampus.edu",
  "plumbing@fixmycampus.edu",
  "electrical@fixmycampus.edu",
  "safety@fixmycampus.edu",
  "internet@fixmycampus.edu",
  "cleanliness@fixmycampus.edu",
  "facilities@fixmycampus.edu"
]);
const CATEGORY_OPTIONS = [
  "Plumbing",
  "Electrical",
  "Safety",
  "Internet",
  "Cleanliness",
  "Other"
];
const STATUS_OPTIONS = ["open", "in_progress", "resolved"];
const PRIORITY_OPTIONS = ["low", "medium", "high", "emergency"];
const SUPPORT_STATUS_OPTIONS = ["open", "in_review", "waiting_for_user", "resolved"];
const SUPPORT_TOPIC_OPTIONS = ["general_help", "ticket_help", "false_update", "account_access"];
const DEPARTMENT_OPTIONS = [
  "Plumbing Department",
  "Electrical Department",
  "Safety Department",
  "IT Support Department",
  "Sanitation Department",
  "General Facilities Department"
];
const CATEGORY_DEPARTMENT_MAP = {
  Plumbing: "Plumbing Department",
  Electrical: "Electrical Department",
  Safety: "Safety Department",
  Internet: "IT Support Department",
  Cleanliness: "Sanitation Department",
  Other: "General Facilities Department"
};
const DUPLICATE_STOP_WORDS = new Set([
  "a", "an", "and", "are", "at", "be", "by", "for", "from", "in", "is", "it",
  "of", "on", "or", "the", "to", "with", "this", "that", "near", "inside",
  "outside", "building", "block", "hostel", "room", "floor", "issue", "problem"
]);

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON");
initializeDatabase();
ensureSchema();
normalizeLegacyData();
seedDatabase();

let microsoftOpenIdConfigurationCache = null;
let microsoftJwksCache = null;

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student',
      department TEXT NOT NULL,
      email_verified INTEGER NOT NULL DEFAULT 1,
      email_verification_token TEXT,
      email_verification_sent_at TEXT,
      password_reset_token TEXT,
      password_reset_sent_at TEXT,
      sso_login_token TEXT,
      sso_login_sent_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      location TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      owner_user_id INTEGER NOT NULL,
      image_data TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ticket_updates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      author_user_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      status TEXT,
      image_data TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE CASCADE,
      FOREIGN KEY (author_user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ticket_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      reporter_user_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      image_data TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE CASCADE,
      FOREIGN KEY (reporter_user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ticket_feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL UNIQUE,
      reporter_user_id INTEGER NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE CASCADE,
      FOREIGN KEY (reporter_user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ticket_supporters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(ticket_id, user_id),
      FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      ticket_id INTEGER NOT NULL,
      ticket_update_id INTEGER,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
      FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE CASCADE,
      FOREIGN KEY (ticket_update_id) REFERENCES ticket_updates (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS support_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requester_user_id INTEGER NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (requester_user_id) REFERENCES users (id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS support_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id INTEGER NOT NULL,
      sender_user_id INTEGER NOT NULL,
      message TEXT,
      image_data TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES support_conversations (id) ON DELETE CASCADE,
      FOREIGN KEY (sender_user_id) REFERENCES users (id) ON DELETE CASCADE
    );
  `);
}

function ensureSchema() {
  ensureColumn("tickets", "assigned_department", "TEXT");
  ensureColumn("tickets", "assigned_by_user_id", "INTEGER");
  ensureColumn("tickets", "priority", "TEXT");
  ensureColumn("users", "email_verified", "INTEGER NOT NULL DEFAULT 1");
  ensureColumn("users", "email_verification_token", "TEXT");
  ensureColumn("users", "email_verification_sent_at", "TEXT");
  ensureColumn("users", "password_reset_token", "TEXT");
  ensureColumn("users", "password_reset_sent_at", "TEXT");
  ensureColumn("users", "sso_login_token", "TEXT");
  ensureColumn("users", "sso_login_sent_at", "TEXT");
  ensureColumn("users", "student_id", "TEXT");
  ensureColumn("users", "faculty_id", "TEXT");
  ensureColumn("users", "phone", "TEXT");
  ensureColumn("users", "alternate_email", "TEXT");
  ensureColumn("users", "campus_address", "TEXT");
  ensureColumn("users", "bio", "TEXT");
  ensureColumn("users", "profile_image_data", "TEXT");
  ensureColumn("ticket_updates", "image_data", "TEXT");
  ensureColumn("ticket_reports", "image_data", "TEXT");
  ensureColumn("support_conversations", "topic", "TEXT");
  ensureColumn("support_conversations", "linked_ticket_id", "INTEGER");
  ensureColumn("support_conversations", "unread_for_admin", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn("support_conversations", "unread_for_requester", "INTEGER NOT NULL DEFAULT 0");
}

function ensureColumn(tableName, columnName, columnDefinition) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  const exists = columns.some((column) => column.name === columnName);
  if (!exists) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
  }
}

function normalizeLegacyData() {
  db.prepare("UPDATE users SET role = 'admin' WHERE role = 'staff'").run();
  db.prepare("UPDATE tickets SET priority = 'medium' WHERE priority IS NULL").run();
  db.prepare("UPDATE users SET email_verified = 1 WHERE email_verified IS NULL").run();
  db.prepare("UPDATE support_conversations SET topic = 'general_help' WHERE topic IS NULL").run();
  db.prepare("UPDATE support_conversations SET unread_for_admin = 0 WHERE unread_for_admin IS NULL").run();
  db.prepare("UPDATE support_conversations SET unread_for_requester = 0 WHERE unread_for_requester IS NULL").run();
  db.prepare("UPDATE support_conversations SET status = 'open' WHERE status IS NULL").run();

  db.prepare(`
    UPDATE tickets
    SET assigned_department = CASE category
      WHEN 'Plumbing' THEN 'Plumbing Department'
      WHEN 'Electrical' THEN 'Electrical Department'
      WHEN 'Safety' THEN 'Safety Department'
      WHEN 'Internet' THEN 'IT Support Department'
      WHEN 'Cleanliness' THEN 'Sanitation Department'
      ELSE 'General Facilities Department'
    END
    WHERE assigned_department IS NULL AND status IN ('in_progress', 'resolved')
  `).run();
}

function seedDatabase() {
  const now = Date.now();
  const studentId = ensureUser({
    fullName: "Name",
    email: "student@fixmycampus.edu",
    password: "password123",
    role: "student",
    department: "Course"
  });
  const facultyId = ensureUser({
    fullName: "Professor Meera Rao",
    email: "faculty@fixmycampus.edu",
    password: "password123",
    role: "faculty",
    department: "School of Engineering"
  });
  const adminId = ensureUser({
    fullName: "Campus Admin",
    email: "admin@fixmycampus.edu",
    password: "password123",
    role: "admin",
    department: "Campus Administration"
  });
  const plumbingId = ensureUser({
    fullName: "Plumbing Desk",
    email: "plumbing@fixmycampus.edu",
    password: "password123",
    role: "department",
    department: "Plumbing Department"
  });
  ensureUser({
    fullName: "Electrical Desk",
    email: "electrical@fixmycampus.edu",
    password: "password123",
    role: "department",
    department: "Electrical Department"
  });
  ensureUser({
    fullName: "Safety Desk",
    email: "safety@fixmycampus.edu",
    password: "password123",
    role: "department",
    department: "Safety Department"
  });
  ensureUser({
    fullName: "IT Support Desk",
    email: "internet@fixmycampus.edu",
    password: "password123",
    role: "department",
    department: "IT Support Department"
  });
  ensureUser({
    fullName: "Sanitation Desk",
    email: "cleanliness@fixmycampus.edu",
    password: "password123",
    role: "department",
    department: "Sanitation Department"
  });
  ensureUser({
    fullName: "General Facilities Desk",
    email: "facilities@fixmycampus.edu",
    password: "password123",
    role: "department",
    department: "General Facilities Department"
  });

  const existingTickets = db.prepare("SELECT COUNT(*) AS count FROM tickets").get().count;
  if (existingTickets > 0) {
    return;
  }

  const sampleTickets = [
    {
      title: "Leaking vents in BLA-210",
      category: "Plumbing",
      priority: "high",
      location: "Building B Block – BLA-210",
      description: "Water dripping from the AC vents inside BLA-210. The floor becomes slippery and students are facing difficulty during lectures.",
      status: "in_progress",
      ownerUserId: studentId,
      assignedDepartment: "Plumbing Department",
      assignedByUserId: adminId,
      imageData: buildLeakingImage(),
      createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString()
    },
    {
      title: "Flickering lights in Hostel Corridor",
      category: "Electrical",
      priority: "high",
      location: "Hostel C9, 11th Floor",
      description: "Continuous flickering of lights in the hostel corridor outside room 1107. The area feels unsafe at night.",
      status: "open",
      ownerUserId: facultyId,
      assignedDepartment: null,
      assignedByUserId: null,
      imageData: buildCorridorImage(),
      createdAt: new Date(now - 5 * 60 * 60 * 1000).toISOString()
    },
    {
      title: "Broken staircase railing near Library",
      category: "Safety",
      priority: "emergency",
      location: "Central Library West Staircase",
      description: "The metal railing is loose on the first floor staircase and needs immediate repair.",
      status: "resolved",
      ownerUserId: studentId,
      assignedDepartment: "Safety Department",
      assignedByUserId: adminId,
      createdAt: new Date(now - 26 * 60 * 60 * 1000).toISOString()
    },
    {
      title: "Water cooler not functioning",
      category: "Plumbing",
      priority: "medium",
      location: "Academic Block A, Ground Floor",
      description: "The water cooler near the academic block lobby has not been dispensing water since yesterday evening.",
      status: "resolved",
      ownerUserId: facultyId,
      assignedDepartment: "Plumbing Department",
      assignedByUserId: adminId,
      createdAt: new Date(now - 50 * 60 * 60 * 1000).toISOString()
    },
    {
      title: "Dustbins overflowing in cafeteria",
      category: "Cleanliness",
      priority: "medium",
      location: "Main Cafeteria",
      description: "The dustbins have not been cleared after lunch hours and the area needs cleaning.",
      status: "resolved",
      ownerUserId: studentId,
      assignedDepartment: "Sanitation Department",
      assignedByUserId: adminId,
      createdAt: new Date(now - 72 * 60 * 60 * 1000).toISOString()
    },
    {
      title: "Slow Wi-Fi in Seminar Hall",
      category: "Internet",
      priority: "low",
      location: "Seminar Hall 2",
      description: "Wi-Fi speed drops heavily during classes making it difficult to access course material.",
      status: "resolved",
      ownerUserId: facultyId,
      assignedDepartment: "IT Support Department",
      assignedByUserId: adminId,
      createdAt: new Date(now - 96 * 60 * 60 * 1000).toISOString()
    }
  ];

  let primaryTicketId = 0;
  for (const ticket of sampleTickets) {
    const insertedId = createTicket({
      ...ticket,
      updatedAt: ticket.createdAt
    });
    if (ticket.title === "Leaking vents in BLA-210") {
      primaryTicketId = insertedId;
    }
  }

  addTicketUpdate({
    ticketId: primaryTicketId,
    authorUserId: studentId,
    message: "Reported by Student",
    status: "open",
    createdAt: new Date(now - 2 * 60 * 60 * 1000).toISOString()
  });
  addTicketUpdate({
    ticketId: primaryTicketId,
    authorUserId: adminId,
    message: "Assigned to Plumbing Department by Admin",
    status: "open",
    createdAt: new Date(now - 70 * 60 * 1000).toISOString()
  });
  addTicketUpdate({
    ticketId: primaryTicketId,
    authorUserId: plumbingId,
    message: "Maintenance team dispatched",
    status: "in_progress",
    createdAt: new Date(now - 15 * 60 * 1000).toISOString()
  });
}

function ensureUser(user) {
  const existing = getUserByEmail(user.email);
  if (existing) {
    return Number(existing.id);
  }

  return createUser(user);
}

function createUser({ fullName, email, password, role, department }) {
  const now = new Date().toISOString();
  const passwordHash = hashPassword(password);
  const result = db.prepare(`
    INSERT INTO users (full_name, email, password_hash, role, department, email_verified, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(fullName, email.toLowerCase(), passwordHash, role, department, 1, now);
  return Number(result.lastInsertRowid);
}

function createTicket(ticket) {
  const result = db.prepare(`
    INSERT INTO tickets
      (code, title, category, priority, location, description, status, owner_user_id, assigned_department, assigned_by_user_id, image_data, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    nextTicketCode(ticket.category),
    ticket.title,
    ticket.category,
    ticket.priority || "medium",
    ticket.location,
    ticket.description,
    ticket.status || "open",
    ticket.ownerUserId,
    ticket.assignedDepartment || null,
    ticket.assignedByUserId || null,
    ticket.imageData || null,
    ticket.createdAt,
    ticket.updatedAt
  );

  return Number(result.lastInsertRowid);
}

function addTicketUpdate({ ticketId, authorUserId, message, status, imageData, createdAt }) {
  const result = db.prepare(`
    INSERT INTO ticket_updates (ticket_id, author_user_id, message, status, image_data, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(ticketId, authorUserId, message, status || null, imageData || null, createdAt);
  return Number(result.lastInsertRowid);
}

function addTicketReport({ ticketId, reporterUserId, message, imageData, createdAt }) {
  db.prepare(`
    INSERT INTO ticket_reports (ticket_id, reporter_user_id, message, image_data, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(ticketId, reporterUserId, message, imageData || null, createdAt);
}

function upsertTicketFeedback({ ticketId, reporterUserId, rating, comment, createdAt }) {
  db.prepare(`
    INSERT INTO ticket_feedback (ticket_id, reporter_user_id, rating, comment, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(ticket_id) DO UPDATE SET
      reporter_user_id = excluded.reporter_user_id,
      rating = excluded.rating,
      comment = excluded.comment,
      created_at = excluded.created_at
  `).run(ticketId, reporterUserId, rating, comment || null, createdAt);
}

function addNotification({ userId, ticketId, ticketUpdateId, type, message, createdAt }) {
  const result = db.prepare(`
    INSERT INTO notifications (user_id, ticket_id, ticket_update_id, type, message, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).run(userId, ticketId, ticketUpdateId || null, type, message, createdAt);
  return Number(result.lastInsertRowid);
}

function ensureSupportConversation(requesterUserId) {
  const existing = db.prepare(`
    SELECT *
    FROM support_conversations
    WHERE requester_user_id = ?
  `).get(requesterUserId);

  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO support_conversations (requester_user_id, topic, status, unread_for_admin, unread_for_requester, created_at, updated_at)
    VALUES (?, 'general_help', 'open', 0, 0, ?, ?)
  `).run(requesterUserId, now, now);

  return db.prepare(`
    SELECT *
    FROM support_conversations
    WHERE id = ?
  `).get(Number(result.lastInsertRowid));
}

function addSupportMessage({ conversationId, senderUserId, senderRole, message, imageData, createdAt }) {
  const result = db.prepare(`
    INSERT INTO support_messages (conversation_id, sender_user_id, message, image_data, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(conversationId, senderUserId, message || null, imageData || null, createdAt);

  db.prepare(`
    UPDATE support_conversations
    SET updated_at = ?,
        status = ?,
        unread_for_admin = ?,
        unread_for_requester = ?
    WHERE id = ?
  `).run(
    createdAt,
    senderRole === "admin" ? "waiting_for_user" : "open",
    senderRole === "admin" ? 0 : 1,
    senderRole === "admin" ? 1 : 0,
    conversationId
  );

  return Number(result.lastInsertRowid);
}

function nextTicketCode(category) {
  const count = db.prepare("SELECT COUNT(*) AS count FROM tickets").get().count;
  const prefix = (category || "T").trim().charAt(0).toUpperCase() || "T";
  return `${prefix}-${1001 + count}`;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const digest = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${digest}`;
}

function verifyPassword(password, storedHash) {
  const [salt, originalDigest] = String(storedHash || "").split(":");
  if (!salt || !originalDigest) {
    return false;
  }

  const candidateDigest = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(originalDigest, "hex"), Buffer.from(candidateDigest, "hex"));
}

function generateToken() {
  return crypto.randomBytes(24).toString("hex");
}

function isTokenValid(sentAt, ttlMs) {
  if (!sentAt) {
    return false;
  }
  const timestamp = Date.parse(sentAt);
  if (Number.isNaN(timestamp)) {
    return false;
  }
  return Date.now() - timestamp <= ttlMs;
}

function createSession(userId) {
  const sessionId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO sessions (id, user_id, created_at)
    VALUES (?, ?, ?)
  `).run(sessionId, userId, new Date().toISOString());
  return sessionId;
}

function deleteSession(sessionId) {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

function deleteSessionsForUser(userId) {
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) {
    return cookies;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey) {
      continue;
    }
    cookies[rawKey] = decodeURIComponent(rawValue.join("=") || "");
  }

  return cookies;
}

function getSessionUser(request) {
  const cookies = parseCookies(request.headers.cookie);
  const sessionId = cookies[SESSION_COOKIE];
  if (!sessionId) {
    return null;
  }

  const row = db.prepare(`
    SELECT users.*
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.id = ?
  `).get(sessionId);

  if (!row) {
    return null;
  }

  return {
    id: Number(row.id),
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    department: row.department,
    emailVerified: Boolean(row.email_verified),
    studentId: row.student_id || "",
    facultyId: row.faculty_id || "",
    phone: row.phone || "",
    alternateEmail: row.alternate_email || "",
    campusAddress: row.campus_address || "",
    bio: row.bio || "",
    profileImageData: row.profile_image_data || ""
  };
}

function getUserByEmail(email) {
  const row = db.prepare("SELECT * FROM users WHERE email = ?").get(String(email || "").toLowerCase());
  return row || null;
}

function getUserById(userId) {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  return row || null;
}

function getUserByEmailVerificationToken(token) {
  if (!token) {
    return null;
  }
  return db.prepare("SELECT * FROM users WHERE email_verification_token = ?").get(token) || null;
}

function getUserByPasswordResetToken(token) {
  if (!token) {
    return null;
  }
  return db.prepare("SELECT * FROM users WHERE password_reset_token = ?").get(token) || null;
}

function getUserBySsoLoginToken(token) {
  if (!token) {
    return null;
  }
  return db.prepare("SELECT * FROM users WHERE sso_login_token = ?").get(token) || null;
}

function issueEmailVerificationForUser(userId) {
  const token = generateToken();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users
    SET email_verified = 0,
        email_verification_token = ?,
        email_verification_sent_at = ?,
        sso_login_token = NULL,
        sso_login_sent_at = NULL
    WHERE id = ?
  `).run(token, now, userId);
  return token;
}

function verifyUserEmail(userId) {
  db.prepare(`
    UPDATE users
    SET email_verified = 1,
        email_verification_token = NULL,
        email_verification_sent_at = NULL
    WHERE id = ?
  `).run(userId);
}

function issuePasswordResetForUser(userId) {
  const token = generateToken();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users
    SET password_reset_token = ?,
        password_reset_sent_at = ?
    WHERE id = ?
  `).run(token, now, userId);
  return token;
}

function clearPasswordResetForUser(userId) {
  db.prepare(`
    UPDATE users
    SET password_reset_token = NULL,
        password_reset_sent_at = NULL
    WHERE id = ?
  `).run(userId);
}

function issueSsoLoginForUser(userId) {
  const token = generateToken();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users
    SET sso_login_token = ?,
        sso_login_sent_at = ?
    WHERE id = ?
  `).run(token, now, userId);
  return token;
}

function clearSsoLoginForUser(userId) {
  db.prepare(`
    UPDATE users
    SET sso_login_token = NULL,
        sso_login_sent_at = NULL
    WHERE id = ?
  `).run(userId);
}

function getTicketById(ticketId) {
  return db.prepare(`
    SELECT
      tickets.*,
      users.full_name AS owner_name,
      users.email AS owner_email,
      users.department AS owner_department,
      users.role AS owner_role
    FROM tickets
    JOIN users ON users.id = tickets.owner_user_id
    WHERE tickets.id = ?
  `).get(ticketId);
}

function getTicketUpdates(ticketId) {
  return db.prepare(`
    SELECT ticket_updates.*, users.full_name AS author_name, users.role AS author_role
    FROM ticket_updates
    JOIN users ON users.id = ticket_updates.author_user_id
    WHERE ticket_updates.ticket_id = ?
    ORDER BY datetime(ticket_updates.created_at) DESC, ticket_updates.id DESC
  `).all(ticketId);
}

function getTicketReports(ticketId) {
  return db.prepare(`
    SELECT ticket_reports.*, users.full_name AS reporter_name, users.role AS reporter_role
    FROM ticket_reports
    JOIN users ON users.id = ticket_reports.reporter_user_id
    WHERE ticket_reports.ticket_id = ?
    ORDER BY datetime(ticket_reports.created_at) DESC, ticket_reports.id DESC
  `).all(ticketId);
}

function getTicketFeedback(ticketId) {
  return db.prepare(`
    SELECT ticket_feedback.*, users.full_name AS reporter_name
    FROM ticket_feedback
    JOIN users ON users.id = ticket_feedback.reporter_user_id
    WHERE ticket_feedback.ticket_id = ?
  `).get(ticketId);
}

function deleteTicketById(ticketId) {
  db.prepare(`
    UPDATE support_conversations
    SET linked_ticket_id = NULL
    WHERE linked_ticket_id = ?
  `).run(ticketId);

  const result = db.prepare(`
    DELETE FROM tickets
    WHERE id = ?
  `).run(ticketId);

  return Number(result?.changes || 0) > 0;
}

function addTicketSupporter(ticketId, userId, createdAt) {
  const result = db.prepare(`
    INSERT INTO ticket_supporters (ticket_id, user_id, created_at)
    VALUES (?, ?, ?)
    ON CONFLICT(ticket_id, user_id) DO NOTHING
  `).run(ticketId, userId, createdAt);
  return Number(result?.changes || 0) > 0;
}

function getActiveTicketForSupport(ticketId) {
  return db.prepare(`
    SELECT
      tickets.id,
      tickets.code,
      tickets.title,
      tickets.category,
      tickets.location,
      tickets.status,
      tickets.owner_user_id,
      tickets.created_at,
      tickets.updated_at,
      (
        SELECT COUNT(*)
        FROM ticket_supporters
        WHERE ticket_supporters.ticket_id = tickets.id
      ) AS supporter_count
    FROM tickets
    WHERE tickets.id = ? AND tickets.status IN ('open', 'in_progress')
  `).get(ticketId);
}

function normalizeDuplicateText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeDuplicateText(value) {
  const normalized = normalizeDuplicateText(value);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !DUPLICATE_STOP_WORDS.has(token));
}

function tokenSimilarity(leftTokens, rightTokens) {
  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  if (leftSet.size === 0 || rightSet.size === 0) {
    return 0;
  }

  let intersection = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) {
      intersection += 1;
    }
  }

  const union = leftSet.size + rightSet.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function locationSimilarity(leftLocation, rightLocation) {
  const leftNormalized = normalizeDuplicateText(leftLocation);
  const rightNormalized = normalizeDuplicateText(rightLocation);
  if (!leftNormalized || !rightNormalized) {
    return 0;
  }

  if (leftNormalized === rightNormalized) {
    return 1;
  }

  if (leftNormalized.includes(rightNormalized) || rightNormalized.includes(leftNormalized)) {
    return 0.85;
  }

  return tokenSimilarity(tokenizeDuplicateText(leftNormalized), tokenizeDuplicateText(rightNormalized));
}

function duplicateReason(match) {
  if (match.isExact) {
    return "Exact title and location match in the same category.";
  }
  if (match.locationScore >= 0.8 && match.titleScore >= 0.4) {
    return "Very similar location and title.";
  }
  if (match.titleScore >= 0.6) {
    return "Very similar issue title.";
  }
  return "Similar complaint found in active tickets.";
}

function findPotentialDuplicateTickets(values, limit = 5) {
  const category = String(values.category || "").trim();
  const title = String(values.title || "").trim();
  const location = String(values.location || "").trim();
  const description = String(values.description || "").trim();

  if (!category || !title || !location) {
    return [];
  }

  const titleNormalized = normalizeDuplicateText(title);
  const locationNormalized = normalizeDuplicateText(location);
  const titleTokens = tokenizeDuplicateText(title);
  const descriptionTokens = tokenizeDuplicateText(description);

  const candidates = db.prepare(`
    SELECT
      tickets.id,
      tickets.code,
      tickets.title,
      tickets.category,
      tickets.priority,
      tickets.location,
      tickets.description,
      tickets.status,
      tickets.owner_user_id,
      tickets.created_at,
      tickets.updated_at,
      (
        SELECT COUNT(*)
        FROM ticket_supporters
        WHERE ticket_supporters.ticket_id = tickets.id
      ) AS supporter_count
    FROM tickets
    WHERE tickets.status IN ('open', 'in_progress')
    ORDER BY datetime(tickets.updated_at) DESC, tickets.id DESC
    LIMIT 140
  `).all();

  const ranked = [];
  for (const candidate of candidates) {
    const candidateTitleNormalized = normalizeDuplicateText(candidate.title);
    const candidateLocationNormalized = normalizeDuplicateText(candidate.location);
    const sameCategory = candidate.category === category;
    const isExact = sameCategory && titleNormalized === candidateTitleNormalized && locationNormalized === candidateLocationNormalized;

    const titleScore = tokenSimilarity(titleTokens, tokenizeDuplicateText(candidate.title));
    const descriptionScore = tokenSimilarity(descriptionTokens, tokenizeDuplicateText(candidate.description || ""));
    const locationScore = locationSimilarity(location, candidate.location);

    let score = (titleScore * 0.62) + (locationScore * 0.26) + (descriptionScore * 0.12);
    if (!sameCategory) {
      score *= 0.62;
    }
    if (sameCategory && (titleScore >= 0.45 || locationScore >= 0.72)) {
      score = Math.min(1, score + 0.06);
    }

    const isStrong = isExact
      || score >= 0.64
      || (sameCategory && titleScore >= 0.5 && locationScore >= 0.45);

    if (!isStrong) {
      continue;
    }

    ranked.push({
      ...candidate,
      duplicateScore: score,
      titleScore,
      descriptionScore,
      locationScore,
      isExact,
      reason: duplicateReason({ isExact, titleScore, locationScore })
    });
  }

  ranked.sort((left, right) => {
    if (left.isExact !== right.isExact) {
      return left.isExact ? -1 : 1;
    }
    if (right.duplicateScore !== left.duplicateScore) {
      return right.duplicateScore - left.duplicateScore;
    }
    return String(right.updated_at || "").localeCompare(String(left.updated_at || ""));
  });

  return ranked.slice(0, limit);
}

function getNotificationsForUser(userId, limit = 20) {
  return db.prepare(`
    SELECT notifications.*, tickets.code AS ticket_code, tickets.title AS ticket_title
    FROM notifications
    JOIN tickets ON tickets.id = notifications.ticket_id
    WHERE notifications.user_id = ?
    ORDER BY datetime(notifications.created_at) DESC, notifications.id DESC
    LIMIT ?
  `).all(userId, limit);
}

function getUnreadNotificationCount(userId) {
  const row = db.prepare(`
    SELECT COUNT(*) AS count
    FROM notifications
    WHERE user_id = ? AND is_read = 0
  `).get(userId);
  return Number(row?.count || 0);
}

function getNotificationById(notificationId) {
  return db.prepare(`
    SELECT notifications.*, tickets.code AS ticket_code, tickets.title AS ticket_title
    FROM notifications
    JOIN tickets ON tickets.id = notifications.ticket_id
    WHERE notifications.id = ?
  `).get(notificationId);
}

function markNotificationRead(notificationId, userId) {
  db.prepare(`
    UPDATE notifications
    SET is_read = 1
    WHERE id = ? AND user_id = ?
  `).run(notificationId, userId);
}

function getSupportConversationById(conversationId) {
  return db.prepare(`
    SELECT
      support_conversations.*,
      users.full_name AS requester_name,
      users.email AS requester_email,
      users.department AS requester_department,
      users.role AS requester_role,
      tickets.code AS linked_ticket_code,
      tickets.title AS linked_ticket_title
    FROM support_conversations
    JOIN users ON users.id = support_conversations.requester_user_id
    LEFT JOIN tickets ON tickets.id = support_conversations.linked_ticket_id
    WHERE support_conversations.id = ?
  `).get(conversationId);
}

function getSupportConversationForUser(userId) {
  return db.prepare(`
    SELECT
      support_conversations.*,
      users.full_name AS requester_name,
      users.email AS requester_email,
      users.department AS requester_department,
      users.role AS requester_role,
      tickets.code AS linked_ticket_code,
      tickets.title AS linked_ticket_title
    FROM support_conversations
    JOIN users ON users.id = support_conversations.requester_user_id
    LEFT JOIN tickets ON tickets.id = support_conversations.linked_ticket_id
    WHERE support_conversations.requester_user_id = ?
  `).get(userId);
}

function getSupportConversationsForAdmin() {
  return db.prepare(`
    SELECT
      support_conversations.*,
      users.full_name AS requester_name,
      users.email AS requester_email,
      users.department AS requester_department,
      users.role AS requester_role,
      tickets.code AS linked_ticket_code,
      tickets.title AS linked_ticket_title,
      (
        SELECT support_messages.message
        FROM support_messages
        WHERE support_messages.conversation_id = support_conversations.id
        ORDER BY datetime(support_messages.created_at) DESC, support_messages.id DESC
        LIMIT 1
      ) AS last_message,
      (
        SELECT support_messages.image_data
        FROM support_messages
        WHERE support_messages.conversation_id = support_conversations.id
        ORDER BY datetime(support_messages.created_at) DESC, support_messages.id DESC
        LIMIT 1
    ) AS last_image
    FROM support_conversations
    JOIN users ON users.id = support_conversations.requester_user_id
    LEFT JOIN tickets ON tickets.id = support_conversations.linked_ticket_id
    ORDER BY datetime(support_conversations.updated_at) DESC, support_conversations.id DESC
  `).all();
}

function getSupportMessages(conversationId) {
  return db.prepare(`
    SELECT
      support_messages.*,
      users.full_name AS sender_name,
      users.role AS sender_role
    FROM support_messages
    JOIN users ON users.id = support_messages.sender_user_id
    WHERE support_messages.conversation_id = ?
    ORDER BY datetime(support_messages.created_at) ASC, support_messages.id ASC
  `).all(conversationId);
}

function getAvailableSupportTicketsForUser(userId) {
  return db.prepare(`
    SELECT id, code, title, status
    FROM tickets
    WHERE owner_user_id = ?
    ORDER BY datetime(updated_at) DESC, id DESC
    LIMIT 20
  `).all(userId);
}

function updateSupportConversationContext(conversationId, { topic, linkedTicketId, updatedAt }) {
  db.prepare(`
    UPDATE support_conversations
    SET topic = ?,
        linked_ticket_id = ?,
        updated_at = ?
    WHERE id = ?
  `).run(topic, linkedTicketId || null, updatedAt, conversationId);
}

function updateSupportConversationStatus(conversationId, status, updatedAt) {
  db.prepare(`
    UPDATE support_conversations
    SET status = ?,
        updated_at = ?
    WHERE id = ?
  `).run(status, updatedAt, conversationId);
}

function markSupportConversationRead(conversationId, viewerRole) {
  if (viewerRole === "admin") {
    db.prepare(`
      UPDATE support_conversations
      SET unread_for_admin = 0
      WHERE id = ?
    `).run(conversationId);
    return;
  }

  db.prepare(`
    UPDATE support_conversations
    SET unread_for_requester = 0
    WHERE id = ?
  `).run(conversationId);
}

function getUnreadSupportConversationCount(user) {
  if (user.role === "admin") {
    const row = db.prepare(`
      SELECT COUNT(*) AS count
      FROM support_conversations
      WHERE unread_for_admin > 0
    `).get();
    return Number(row?.count || 0);
  }

  const row = db.prepare(`
    SELECT unread_for_requester AS count
    FROM support_conversations
    WHERE requester_user_id = ?
  `).get(user.id);
  return Number(row?.count || 0);
}

function getTicketStats(user) {
  const scope = buildTicketScope(user);
  const rows = db.prepare(`
    SELECT status, COUNT(*) AS count
    FROM tickets
    ${scope.whereClause}
    GROUP BY status
  `).all(...scope.params);

  const stats = { total: 0, open: 0, in_progress: 0, resolved: 0 };
  for (const row of rows) {
    const count = Number(row.count);
    stats.total += count;
    if (row.status in stats) {
      stats[row.status] = count;
    }
  }
  return stats;
}

function buildTicketScope(user) {
  if (user.role === "admin") {
    return { whereClause: "", params: [] };
  }

  if (user.role === "department") {
    return {
      whereClause: "WHERE tickets.assigned_department = ?",
      params: [user.department]
    };
  }

  return {
    whereClause: "WHERE tickets.owner_user_id = ?",
    params: [user.id]
  };
}

function getTickets(user, filters) {
  const conditions = [];
  const params = [];

  if (user.role === "department") {
    conditions.push("tickets.assigned_department = ?");
    params.push(user.department);
  } else if (user.role !== "admin") {
    conditions.push("tickets.owner_user_id = ?");
    params.push(user.id);
  }

  if (filters.categories.length > 0) {
    conditions.push(`tickets.category IN (${filters.categories.map(() => "?").join(", ")})`);
    params.push(...filters.categories);
  }

  if (filters.statuses.length > 0) {
    conditions.push(`tickets.status IN (${filters.statuses.map(() => "?").join(", ")})`);
    params.push(...filters.statuses);
  }

  if (filters.priorities.length > 0) {
    conditions.push(`tickets.priority IN (${filters.priorities.map(() => "?").join(", ")})`);
    params.push(...filters.priorities);
  }

  if (filters.query) {
    conditions.push("(tickets.title LIKE ? OR tickets.location LIKE ? OR tickets.description LIKE ? OR tickets.code LIKE ?)");
    const likeValue = `%${filters.query}%`;
    params.push(likeValue, likeValue, likeValue, likeValue);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return db.prepare(`
    SELECT tickets.*, users.full_name AS owner_name
    FROM tickets
    JOIN users ON users.id = tickets.owner_user_id
    ${whereClause}
    ORDER BY
      CASE WHEN tickets.status = 'resolved' THEN 1 ELSE 0 END ASC,
      datetime(tickets.updated_at) DESC,
      tickets.id DESC
  `).all(...params);
}

function getCommunityComplaintFeed(user, limit = 8) {
  if (!canCreateTicket(user)) {
    return [];
  }

  return db.prepare(`
    SELECT
      tickets.id,
      tickets.code,
      tickets.title,
      tickets.category,
      tickets.priority,
      tickets.location,
      tickets.status,
      tickets.owner_user_id,
      tickets.created_at,
      tickets.updated_at,
      (
        SELECT COUNT(*)
        FROM ticket_supporters
        WHERE ticket_supporters.ticket_id = tickets.id
      ) AS supporter_count
    FROM tickets
    WHERE tickets.status IN ('open', 'in_progress')
    ORDER BY datetime(tickets.updated_at) DESC, tickets.id DESC
    LIMIT ?
  `).all(limit);
}

function userCanAccessTicket(user, ticket) {
  if (user.role === "admin") {
    return true;
  }

  if (user.role === "department") {
    return ticket.assigned_department === user.department;
  }

  return Number(ticket.owner_user_id) === Number(user.id);
}

function parseFilters(searchParams) {
  return {
    query: searchParams.get("q") ? searchParams.get("q").trim() : "",
    categories: searchParams.getAll("category").filter(Boolean),
    statuses: searchParams.getAll("status").filter(Boolean),
    priorities: searchParams.getAll("priority").filter(Boolean)
  };
}

function buildAbsoluteUrl(request, pathname) {
  const baseUrl = FIXMYCAMPUS_BASE_URL || `http://${request.headers.host || `${HOST}:${PORT}`}`;
  return `${baseUrl}${pathname}`;
}

function isMicrosoftSsoConfigured() {
  return false;
}

function getUniversitySsoEntryPath() {
  return "/university-sso";
}

function getMicrosoftRedirectUri(request) {
  return MICROSOFT_REDIRECT_URI || buildAbsoluteUrl(request, MICROSOFT_CALLBACK_PATH);
}

function base64UrlEncode(value) {
  const buffer = Buffer.isBuffer(value) ? value : Buffer.from(String(value || ""), "utf8");
  return buffer.toString("base64url");
}

function parseBase64UrlJson(value) {
  return JSON.parse(Buffer.from(String(value || ""), "base64url").toString("utf8"));
}

function getCookieSignature(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function createPkceCodeVerifier() {
  return crypto.randomBytes(32).toString("base64url");
}

function createPkceCodeChallenge(codeVerifier) {
  return crypto.createHash("sha256").update(codeVerifier).digest("base64url");
}

function createMicrosoftOauthState(request) {
  return {
    state: crypto.randomBytes(24).toString("base64url"),
    nonce: crypto.randomBytes(24).toString("base64url"),
    codeVerifier: createPkceCodeVerifier(),
    redirectUri: getMicrosoftRedirectUri(request),
    createdAt: new Date().toISOString()
  };
}

function serializeMicrosoftOauthState(data) {
  const payload = base64UrlEncode(JSON.stringify(data));
  const signature = getCookieSignature(payload, MICROSOFT_CLIENT_SECRET);
  return `${payload}.${signature}`;
}

function readMicrosoftOauthState(serialized) {
  if (!isMicrosoftSsoConfigured() || !serialized) {
    return null;
  }

  const [payload, signature] = String(serialized).split(".");
  if (!payload || !signature) {
    return null;
  }

  const expectedSignature = getCookieSignature(payload, MICROSOFT_CLIENT_SECRET);
  if (expectedSignature.length !== signature.length) {
    return null;
  }

  const isValidSignature = crypto.timingSafeEqual(
    Buffer.from(expectedSignature, "utf8"),
    Buffer.from(signature, "utf8")
  );

  if (!isValidSignature) {
    return null;
  }

  try {
    const data = parseBase64UrlJson(payload);
    if (!data || typeof data !== "object") {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setMicrosoftOauthCookie(serializedState) {
  return `${MICROSOFT_OAUTH_COOKIE}=${encodeURIComponent(serializedState)}; HttpOnly; Path=/; Max-Age=${Math.floor(MICROSOFT_OAUTH_TTL_MS / 1000)}; SameSite=Lax`;
}

function clearMicrosoftOauthCookie() {
  return `${MICROSOFT_OAUTH_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;
}

function getMicrosoftAuthorizationUrl(request, stateData) {
  const url = new URL(`https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize`);
  url.searchParams.set("client_id", MICROSOFT_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", stateData.redirectUri || getMicrosoftRedirectUri(request));
  url.searchParams.set("response_mode", "query");
  url.searchParams.set("scope", MICROSOFT_SCOPE);
  url.searchParams.set("state", stateData.state);
  url.searchParams.set("nonce", stateData.nonce);
  url.searchParams.set("code_challenge", createPkceCodeChallenge(stateData.codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

async function getMicrosoftOpenIdConfiguration() {
  if (microsoftOpenIdConfigurationCache) {
    return microsoftOpenIdConfigurationCache;
  }

  const response = await fetch(`https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/v2.0/.well-known/openid-configuration`);
  if (!response.ok) {
    throw new Error(`Microsoft discovery request failed with status ${response.status}.`);
  }

  const configuration = await response.json();
  microsoftOpenIdConfigurationCache = configuration;
  return configuration;
}

async function getMicrosoftJwk(kid) {
  if (microsoftJwksCache?.has(kid)) {
    return microsoftJwksCache.get(kid);
  }

  const metadata = await getMicrosoftOpenIdConfiguration();
  const response = await fetch(metadata.jwks_uri);
  if (!response.ok) {
    throw new Error(`Microsoft signing key request failed with status ${response.status}.`);
  }

  const jwks = await response.json();
  microsoftJwksCache = new Map((jwks.keys || []).map((key) => [key.kid, key]));
  return microsoftJwksCache.get(kid) || null;
}

function decodeJwt(token) {
  const [headerPart, payloadPart, signaturePart] = String(token || "").split(".");
  if (!headerPart || !payloadPart || !signaturePart) {
    throw new Error("Microsoft returned an invalid identity token.");
  }

  return {
    raw: token,
    signingInput: `${headerPart}.${payloadPart}`,
    signature: signaturePart,
    header: parseBase64UrlJson(headerPart),
    payload: parseBase64UrlJson(payloadPart)
  };
}

async function verifyMicrosoftIdToken(idToken, expectedNonce) {
  const decoded = decodeJwt(idToken);
  const metadata = await getMicrosoftOpenIdConfiguration();
  const signingKey = await getMicrosoftJwk(decoded.header.kid);

  if (decoded.header.alg !== "RS256" || !signingKey) {
    throw new Error("Microsoft returned an identity token with an unsupported signature.");
  }

  const publicKey = crypto.createPublicKey({
    key: {
      kty: signingKey.kty,
      n: signingKey.n,
      e: signingKey.e
    },
    format: "jwk"
  });

  const isSignatureValid = crypto.verify(
    "RSA-SHA256",
    Buffer.from(decoded.signingInput, "utf8"),
    publicKey,
    Buffer.from(decoded.signature, "base64url")
  );

  if (!isSignatureValid) {
    throw new Error("Microsoft identity token signature verification failed.");
  }

  const claims = decoded.payload;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const expectedIssuer = String(metadata.issuer || "").replace("{tenantid}", MICROSOFT_TENANT_ID);

  if (claims.aud !== MICROSOFT_CLIENT_ID) {
    throw new Error("Microsoft identity token audience mismatch.");
  }

  if (claims.iss !== expectedIssuer) {
    throw new Error("Microsoft identity token issuer mismatch.");
  }

  if (String(claims.tid || "") !== MICROSOFT_TENANT_ID) {
    throw new Error("Microsoft identity token tenant mismatch.");
  }

  if (!claims.exp || Number(claims.exp) <= nowSeconds) {
    throw new Error("Microsoft identity token has expired.");
  }

  if (claims.nbf && Number(claims.nbf) > nowSeconds) {
    throw new Error("Microsoft identity token is not active yet.");
  }

  if (expectedNonce && claims.nonce !== expectedNonce) {
    throw new Error("Microsoft identity token nonce mismatch.");
  }

  return claims;
}

async function exchangeMicrosoftAuthorizationCode(code, stateData) {
  const response = await fetch(`https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: MICROSOFT_CLIENT_ID,
      client_secret: MICROSOFT_CLIENT_SECRET,
      code,
      code_verifier: stateData.codeVerifier,
      grant_type: "authorization_code",
      redirect_uri: stateData.redirectUri,
      scope: MICROSOFT_SCOPE
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const errorMessage = payload?.error_description || payload?.error || `Token request failed with status ${response.status}.`;
    throw new Error(errorMessage);
  }

  return payload;
}

function getMicrosoftIdentityEmail(claims) {
  return String(claims.preferred_username || claims.email || claims.upn || "").trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function statusLabel(status) {
  if (status === "in_progress") {
    return "In Progress";
  }
  if (status === "resolved") {
    return "Resolved";
  }
  return "Open";
}

function roleLabel(role) {
  if (role === "faculty") {
    return "Faculty";
  }
  if (role === "admin") {
    return "Admin";
  }
  if (role === "department") {
    return "Department";
  }
  return "Student";
}

function supportStatusLabel(status) {
  if (status === "in_review") {
    return "In Review";
  }
  if (status === "waiting_for_user") {
    return "Waiting for User";
  }
  if (status === "resolved") {
    return "Resolved";
  }
  return "Open";
}

function supportTopicLabel(topic) {
  if (topic === "ticket_help") {
    return "Ticket Help";
  }
  if (topic === "false_update") {
    return "False Update";
  }
  if (topic === "account_access") {
    return "Account Access";
  }
  return "General Help";
}

function canCreateTicket(user) {
  return user.role === "student" || user.role === "faculty";
}

function canAssignTicket(user) {
  return user.role === "admin";
}

function canDepartmentUpdate(user, ticket) {
  return user.role === "department" && ticket.assigned_department && ticket.assigned_department === user.department;
}

function canReporterEscalate(user, ticket) {
  return (user.role === "student" || user.role === "faculty") && Number(ticket.owner_user_id) === Number(user.id);
}

function canReporterManageResolvedTicket(user, ticket) {
  return canReporterEscalate(user, ticket) && ticket.status === "resolved";
}

function canReporterDeleteTicket(user, ticket) {
  return canReporterEscalate(user, ticket) && ticket.status === "open";
}

function hasDepartmentProgress(updates) {
  return updates.some((update) => update.author_role === "department");
}

function truncateText(value, maxLength = 96) {
  const text = String(value || "").trim();
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 3)}...`;
}

function buildProgressNotificationMessage(ticket, departmentName, updateMessage, nextStatus) {
  const summary = truncateText(updateMessage || `Ticket status changed to ${statusLabel(nextStatus)}.`, 84);
  return `${departmentName} updated Ticket #${ticket.code}: ${summary}`;
}

function notifyProgressUpdate(ticket, actorUser, updateId, updateMessage, nextStatus, createdAt) {
  const recipientIds = new Set();
  if (ticket.owner_user_id && Number(ticket.owner_user_id) !== Number(actorUser.id)) {
    recipientIds.add(Number(ticket.owner_user_id));
  }
  if (ticket.assigned_by_user_id && Number(ticket.assigned_by_user_id) !== Number(actorUser.id)) {
    recipientIds.add(Number(ticket.assigned_by_user_id));
  }

  if (recipientIds.size === 0) {
    return;
  }

  const message = buildProgressNotificationMessage(ticket, actorUser.department, updateMessage, nextStatus);
  for (const recipientId of recipientIds) {
    addNotification({
      userId: recipientId,
      ticketId: ticket.id,
      ticketUpdateId: updateId,
      type: "ticket_progress",
      message,
      createdAt
    });
  }
}

function assignmentLabel(ticket) {
  return ticket.assigned_department || "Pending Admin Assignment";
}

function renderSupportStatusPill(status) {
  return `<span class="support-status-pill ${escapeHtml(status || "open")}">${escapeHtml(supportStatusLabel(status || "open"))}</span>`;
}

function renderSupportContextLine(conversation) {
  const items = [supportTopicLabel(conversation.topic || "general_help"), supportStatusLabel(conversation.status || "open")];
  if (conversation.linked_ticket_code) {
    items.push(`Ticket #${conversation.linked_ticket_code}`);
  }
  return items.join(" · ");
}

function reporterDisplayLabel(viewer, reporterUserId, reporterName, reporterRole = "") {
  if (viewer.role === "admin") {
    return reporterRole ? `${reporterName} (${roleLabel(reporterRole)})` : reporterName;
  }
  if (Number(viewer.id) === Number(reporterUserId)) {
    return "You";
  }
  return "Anonymous Reporter";
}

function renderReporterIdentityLine(viewer, ticket) {
  if (viewer.role === "admin") {
    return `<p class="reporter-detail-line">Reporter: ${escapeHtml(ticket.owner_name)} · ${escapeHtml(ticket.owner_email)} · ${escapeHtml(ticket.owner_department)} · ${escapeHtml(roleLabel(ticket.owner_role))}</p>`;
  }
  if (Number(viewer.id) === Number(ticket.owner_user_id)) {
    return `<p class="reporter-detail-line">Reporter: You</p>`;
  }
  if (viewer.role === "department") {
    return `<p class="reporter-detail-line">Reporter: Anonymous</p>`;
  }
  return "";
}

function suggestedDepartment(category) {
  return CATEGORY_DEPARTMENT_MAP[category] || "General Facilities Department";
}

function getStudentIdFormatForDepartment(department) {
  const normalized = String(department || "").trim().toLowerCase();

  if (/\b(llb|law|blb)\b/.test(normalized)) {
    return {
      course: "LLB",
      example: "L24BLBU0000",
      pattern: /^L\d{2}BLBU\d{4}$/i
    };
  }

  if (/\b(bba)\b/.test(normalized)) {
    return {
      course: "BBA",
      example: "M24BBAU0000",
      pattern: /^M\d{2}BBAU\d{4}$/i
    };
  }

  if (/\b(cse|computer science|btech|b\.tech|engineering)\b/.test(normalized)) {
    return {
      course: "BTech",
      example: "S24CSEU0000",
      pattern: /^S\d{2}CSEU\d{4}$/i
    };
  }

  return null;
}

function parseUniversityEmail(email) {
  const normalized = String(email || "").trim().toLowerCase();
  const parts = normalized.split("@");
  const hasSingleAt = parts.length === 2;
  const localPart = hasSingleAt ? parts[0] : "";
  const domainPart = hasSingleAt ? parts[1] : "";
  const isUniversityDomain = Boolean(
    localPart
    && domainPart
    && (domainPart === UNIVERSITY_EMAIL_DOMAIN || domainPart.endsWith(`.${UNIVERSITY_EMAIL_DOMAIN}`))
  );
  const isStudentFormat = /^s\d{2}[a-z]{3,8}\d{4}$/i.test(localPart);

  return {
    normalized,
    localPart,
    domainPart,
    isUniversityDomain,
    isStudentFormat
  };
}

function validateRoleBasedUniversityEmail(email, role) {
  const parsed = parseUniversityEmail(email);
  if (!parsed.isUniversityDomain) {
    return {
      ok: false,
      message: `Use your university email ending with @${UNIVERSITY_EMAIL_DOMAIN}.`
    };
  }

  if (role === "student" && !parsed.isStudentFormat) {
    return {
      ok: false,
      message: `Student email must look like s24cseu0458@${UNIVERSITY_EMAIL_DOMAIN}.`
    };
  }

  if (role === "faculty" && parsed.isStudentFormat) {
    return {
      ok: false,
      message: "Faculty email cannot use the student roll-number format."
    };
  }

  return { ok: true };
}

function isLegacyDemoEmail(email) {
  return LEGACY_DEMO_EMAILS.has(String(email || "").trim().toLowerCase());
}

function priorityLabel(priority) {
  if (priority === "emergency") {
    return "Emergency";
  }
  if (priority === "high") {
    return "High";
  }
  if (priority === "low") {
    return "Low";
  }
  return "Medium";
}

function formatRelative(dateValue) {
  const date = new Date(dateValue);
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.max(1, Math.round(diffMs / 60000));

  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function buildLeakingImage() {
  return svgToDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#5f5346"/>
          <stop offset="100%" stop-color="#91816b"/>
        </linearGradient>
      </defs>
      <rect width="160" height="160" rx="22" fill="url(#bg)"/>
      <rect x="12" y="14" width="136" height="32" rx="8" fill="#3a332b"/>
      <rect x="18" y="22" width="28" height="8" rx="4" fill="#f4e7cc" opacity="0.65"/>
      <rect x="56" y="22" width="50" height="8" rx="4" fill="#f4e7cc" opacity="0.45"/>
      <path d="M24 52h112" stroke="#d5cdbd" stroke-width="4" opacity="0.4"/>
      <path d="M34 74h92" stroke="#efe9db" stroke-width="3" opacity="0.25"/>
      <ellipse cx="80" cy="124" rx="52" ry="18" fill="#d7d1c3" opacity="0.45"/>
      <ellipse cx="54" cy="122" rx="10" ry="4" fill="#ffffff" opacity="0.65"/>
      <ellipse cx="77" cy="128" rx="13" ry="4" fill="#ffffff" opacity="0.55"/>
      <ellipse cx="101" cy="120" rx="9" ry="3" fill="#ffffff" opacity="0.55"/>
      <path d="M54 44c0 18-6 26-6 38" stroke="#ffffff" stroke-width="2" opacity="0.55"/>
      <path d="M82 44c0 18 5 26 5 42" stroke="#ffffff" stroke-width="2" opacity="0.5"/>
      <path d="M106 44c0 16-4 24-4 35" stroke="#ffffff" stroke-width="2" opacity="0.45"/>
      <ellipse cx="48" cy="90" rx="3" ry="6" fill="#ffffff" opacity="0.7"/>
      <ellipse cx="87" cy="93" rx="3" ry="6" fill="#ffffff" opacity="0.62"/>
      <ellipse cx="102" cy="86" rx="3" ry="6" fill="#ffffff" opacity="0.58"/>
    </svg>
  `);
}

function buildCorridorImage() {
  return svgToDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160">
      <defs>
        <linearGradient id="hall" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#fafbfd"/>
          <stop offset="100%" stop-color="#cbd2db"/>
        </linearGradient>
      </defs>
      <rect width="160" height="160" rx="22" fill="url(#hall)"/>
      <path d="M16 18h128v18H16z" fill="#fefefe"/>
      <path d="M28 18h8v124h-8zM124 18h8v124h-8z" fill="#c0c7d1"/>
      <path d="M50 18h6v124h-6zM104 18h6v124h-6z" fill="#d8dde4"/>
      <path d="M42 144 80 92l38 52" fill="#adb6c2" opacity="0.45"/>
      <path d="M80 20v120" stroke="#d6dde7" stroke-width="4"/>
      <path d="M16 54h128" stroke="#cfd7e1" stroke-width="3"/>
      <path d="M16 88h128" stroke="#d6dde7" stroke-width="3"/>
      <path d="M40 32h20v6H40zM100 32h20v6h-20z" fill="#fff4a8"/>
      <path d="M60 32h20v6H60zM80 32h20v6H80z" fill="#fff2bc" opacity="0.78"/>
    </svg>
  `);
}

function svgToDataUrl(svg) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg.replace(/\s+/g, " ").trim())}`;
}

function renderFlash(message, type = "error") {
  if (!message) {
    return "";
  }

  return `<div class="flash-banner ${type}">${escapeHtml(message)}</div>`;
}

function renderThemeBootScriptTag() {
  return `
    <script>
      (function () {
        try {
          var key = "fixmycampus_theme";
          var stored = localStorage.getItem(key);
          var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
          var theme = (stored === "dark" || stored === "light") ? stored : (prefersDark ? "dark" : "light");
          document.documentElement.setAttribute("data-theme", theme);
        } catch (error) {}
      })();
    </script>
  `;
}

function renderThemeControllerScriptTag() {
  return `
    <script>
      (function () {
        var key = "fixmycampus_theme";
        var root = document.documentElement;

        function getTheme() {
          return root.getAttribute("data-theme") === "dark" ? "dark" : "light";
        }

        function syncThemeUi(theme) {
          var isDark = theme === "dark";
          document.querySelectorAll("[data-theme-toggle]").forEach(function (button) {
            button.setAttribute("aria-pressed", String(isDark));
          });
          document.querySelectorAll("[data-theme-toggle-label]").forEach(function (label) {
            label.textContent = isDark ? "Light mode" : "Dark mode";
          });
        }

        function setTheme(theme, persist) {
          root.setAttribute("data-theme", theme);
          if (persist) {
            try {
              localStorage.setItem(key, theme);
            } catch (error) {}
          }
          syncThemeUi(theme);
        }

        document.addEventListener("click", function (event) {
          var toggle = event.target.closest("[data-theme-toggle]");
          if (!toggle) {
            return;
          }
          event.preventDefault();
          setTheme(getTheme() === "dark" ? "light" : "dark", true);
        });

        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", function () {
            syncThemeUi(getTheme());
          });
        } else {
          syncThemeUi(getTheme());
        }
      })();
    </script>
  `;
}

function renderDocument(title, bodyClass, content, { includeAppScript = false } = {}) {
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${escapeHtml(title)}</title>
        <link rel="stylesheet" href="/css/style.css">
        <link rel="stylesheet" href="/app-extra.css">
        ${renderThemeBootScriptTag()}
      </head>
      <body class="${escapeHtml(bodyClass)}">
        ${content}
        ${renderThemeControllerScriptTag()}
        ${includeAppScript ? '<script src="/js/app.js"></script>' : ""}
      </body>
    </html>
  `;
}

function renderBrand() {
  return `
    <a class="brand-mark" href="/" aria-label="FixMyCampus home">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12.2 2.6c1.7 0 2.8 1.4 2.8 2.9 0 .5-.1.9-.3 1.3l2.7 2.6a3 3 0 0 1 3.3.7 2.9 2.9 0 0 1 0 4 3 3 0 0 1-3.2.7l-2.7 2.7c.2.4.3.8.3 1.3A2.8 2.8 0 0 1 12.2 23a2.8 2.8 0 0 1-2.9-2.8c0-.5.1-.9.3-1.3L6.9 16a3 3 0 0 1-3.2-.7 2.9 2.9 0 0 1 0-4 3 3 0 0 1 3.2-.7l2.7-2.6A3 3 0 0 1 9.3 5c0-1.5 1.2-2.4 2.9-2.4Zm-3.8 7.5L6.8 11.7l1.6 1.6 1.6-1.6-1.6-1.6Zm9.2 0L16 11.7l1.6 1.6 1.6-1.6-1.6-1.6ZM12.2 5a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8Zm0 12.2a.9.9 0 1 0 0 1.8.9.9 0 0 0 0-1.8Zm-.9-8.3v5.6h1.8V8.9h-1.8Z"/>
      </svg>
      <span>FixMyCampus</span>
    </a>
  `;
}

function renderUserAvatar(user, className = "avatar-button", ariaLabel = "Profile") {
  if (user.profileImageData) {
    return `
      <span class="${className} has-image" aria-label="${escapeHtml(ariaLabel)}">
        <img src="${user.profileImageData}" alt="${escapeHtml(user.fullName)}" class="avatar-image">
      </span>
    `;
  }

  return `
    <span class="${className}" aria-label="${escapeHtml(ariaLabel)}">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4 0-7 2-7 4.5V20h14v-1.5C19 16 16 14 12 14Z"/></svg>
    </span>
  `;
}

function renderThemeToggleButton(extraClass = "") {
  const className = extraClass ? `theme-toggle-button ${extraClass}` : "theme-toggle-button";
  return `
    <button class="${className}" type="button" data-theme-toggle aria-pressed="false">
      <span class="theme-toggle-icon" aria-hidden="true">◐</span>
      <span data-theme-toggle-label>Dark mode</span>
    </button>
  `;
}

function renderHeroPanel() {
  return `
    <section class="hero-panel">
      <div class="campus-illustration" aria-hidden="true">
        <div class="map-board">
          <div class="map-grid"></div>
          <div class="map-note note-a"></div>
          <div class="map-note note-b"></div>
          <div class="map-note note-c"></div>
          <div class="map-note note-d"></div>
        </div>
        <div class="student student-left"><span class="head"></span><span class="body"></span><span class="laptop"></span></div>
        <div class="student student-center"><span class="head"></span><span class="body"></span><span class="laptop"></span></div>
        <div class="student student-right"><span class="head"></span><span class="body"></span><span class="laptop"></span></div>
        <span class="blob blob-left"></span>
        <span class="blob blob-top"></span>
        <span class="bench"></span>
        <span class="signpost"></span>
      </div>

      <div class="feature-strip">
        <article class="feature-item">
          <div class="feature-icon blue">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a2.5 2.5 0 0 1 2.5 2.5v7a2.5 2.5 0 1 1-5 0v-7A2.5 2.5 0 0 1 12 2Zm-1 15h2v2h-2v-2Zm0 3h2v2h-2v-2Z"/></svg>
          </div>
          <div><h2>Report incidents</h2><p>Submit photos and descriptions in seconds</p></div>
        </article>
        <article class="feature-item">
          <div class="feature-icon blue">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h13v2H8V5Zm0 6h13v2H8v-2Zm0 6h13v2H8v-2ZM3.5 6.3 5 8l2.3-3 .7.6L5 9.3 2.8 7.1l.7-.8Zm0 6L5 14l2.3-3 .7.6L5 15.3l-2.2-2.2.7-.8Zm0 6L5 20l2.3-3 .7.6L5 21.3l-2.2-2.2.7-.8Z"/></svg>
          </div>
          <div><h2>Track tickets</h2><p>Real-time updates from campus services</p></div>
        </article>
        <article class="feature-item">
          <div class="feature-icon blue">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a2.5 2.5 0 0 0 2.4-2h-4.8A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 1 0-14 0v5l-2 2v1h18v-1l-2-2Z"/></svg>
          </div>
          <div><h2>Campus updates</h2><p>Maintenance schedules and alerts</p></div>
        </article>
      </div>
    </section>
  `;
}

function renderAuthPage({ title, heading, subheading, formMarkup }) {
  return renderDocument(
    title,
    "auth-page",
    `
      <div class="site-shell">
        <header class="auth-header">
          <div class="brand-row">
            ${renderBrand()}
            <span class="header-tagline">Report and track campus issues easily.</span>
          </div>
          <nav class="top-links" aria-label="Top links">
            ${renderThemeToggleButton("auth-theme-toggle")}
            <a href="#">Help Center</a>
            <a href="#">Contact IT</a>
          </nav>
        </header>

        <main class="auth-main">
          ${renderHeroPanel()}
          <section class="login-panel">
            <div class="login-copy">
              <h1>${escapeHtml(heading)}</h1>
              <p>${escapeHtml(subheading)}</p>
            </div>
            ${formMarkup}
          </section>
        </main>

        <footer class="auth-footer">
          <div>
            <strong>FixMyCampus</strong>
            <p>Making campus maintenance transparent and efficient.</p>
          </div>
          <div class="footer-links-block">
            <strong>Resources</strong>
            <nav class="footer-links" aria-label="Footer links">
             
              <a href="#">Support</a>
              <a href="#">Privacy</a>
              <a href="#">Terms</a>
            </nav>
          </div>
        </footer>
      </div>
    `
  );
}

function renderAuthInfoPage({ title, heading, subheading, bodyMarkup }) {
  return renderAuthPage({
    title,
    heading,
    subheading,
    formMarkup: `<section class="login-form auth-info-panel">${bodyMarkup}</section>`
  });
}

function renderNotificationBell(user, notifications, unreadCount) {
  const previewItems = notifications.length > 0
    ? notifications.slice(0, 5).map((notification) => `
        <a class="notification-preview-item ${notification.is_read ? "" : "unread"}" href="/notifications/${notification.id}/open">
          <strong>${escapeHtml(notification.ticket_title)}</strong>
          <span>${escapeHtml(notification.message)}</span>
          <small>${escapeHtml(formatRelative(notification.created_at))}</small>
        </a>
      `).join("")
    : '<div class="notification-empty">No notifications yet.</div>';

  return `
    <div class="notification-menu">
      <a class="icon-button bell-button" href="/notifications" aria-label="Open notifications">
        ${unreadCount > 0 ? `<span class="badge">${escapeHtml(String(Math.min(unreadCount, 99)))}</span>` : ""}
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a2.5 2.5 0 0 0 2.4-2H9.6A2.5 2.5 0 0 0 12 22Zm7-6V11a7 7 0 1 0-14 0v5l-2 2v1h18v-1l-2-2Z"/></svg>
      </a>
      <div class="notification-preview">
        <div class="notification-preview-head">
          <strong>Notifications</strong>
          <span>${escapeHtml(String(unreadCount))} unread</span>
        </div>
        <div class="notification-preview-list">${previewItems}</div>
        <a class="notification-preview-link" href="/notifications">View all notifications</a>
      </div>
    </div>
  `;
}

function renderAppShell({ title, user, currentNav, filters, searchValue, content, currentPath }) {
  const notifications = getNotificationsForUser(user.id, 5);
  const unreadNotificationCount = getUnreadNotificationCount(user.id);

  return renderDocument(
    title,
    "app-page",
    `
      <div class="app-shell">
        ${renderAppHeader(user, searchValue, notifications, unreadNotificationCount)}
        <div class="app-layout">
          ${renderSidebar(currentNav, filters || { query: "", categories: [], statuses: [], priorities: [] }, user)}
          <main class="content-area">${content}</main>
        </div>
        ${renderSupportDrawer(user, currentPath || "/tickets")}
        <footer class="app-footer">
          <div>
            <strong>FixMyCampus · University Facilities</strong>
            <p>Need help? Visit the Facilities support page or contact the help desk at (555) 012-3456</p>
          </div>
          <nav class="footer-links" aria-label="Footer links">
            <a href="#">Privacy</a>
            <a href="#">Terms</a>
            <a href="#">Contact</a>
          </nav>
        </footer>
      </div>
    `,
    { includeAppScript: true }
  );
}

function renderAppHeader(user, searchValue, notifications, unreadNotificationCount) {
  return `
    <header class="app-header">
      ${renderBrand()}
      <form class="search-bar-form" action="/tickets" method="GET">
        <label class="search-bar" aria-label="Search tickets">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 3a7.5 7.5 0 0 1 5.9 12.1l4.2 4.2-1.4 1.4-4.2-4.2A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z"/></svg>
          <input type="search" name="q" value="${escapeHtml(searchValue || "")}" placeholder="Search tickets, locations, or keywords">
        </label>
      </form>
      <div class="header-center-link">Campus Resources</div>
      <div class="header-actions">
        ${renderThemeToggleButton()}
        ${renderNotificationBell(user, notifications, unreadNotificationCount)}
        ${canCreateTicket(user) ? '<a class="primary-button compact" href="/tickets/new">Create New Ticket</a>' : ""}
        <div class="profile-header-group">
          <a class="profile-link" href="/profile" aria-label="Open profile">
            ${renderUserAvatar(user)}
          </a>
          <div class="profile-meta">
            <a class="profile-meta-link" href="/profile">
              <strong>${escapeHtml(user.fullName)}</strong>
              <span>${escapeHtml(user.department)} · ${escapeHtml(roleLabel(user.role))}</span>
            </a>
            <form class="logout-form" action="/logout" method="POST">
              <button class="logout-link" type="submit">Sign out</button>
            </form>
          </div>
        </div>
      </div>
    </header>
  `;
}

function renderSidebar(currentNav, filters, user) {
  const unreadSupportCount = getUnreadSupportConversationCount(user);
  return `
    <aside class="sidebar">
      <nav class="sidebar-nav" aria-label="Sidebar navigation">
        <a href="/tickets" class="${currentNav === "dashboard" ? "current" : ""}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 3a7.5 7.5 0 0 1 5.9 12.1l4.2 4.2-1.4 1.4-4.2-4.2A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z"/></svg>
          <span>Dashboard</span>
        </a>
        <a href="/tickets" class="${currentNav === "tickets" ? "current" : ""}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v12H4V6Zm2 2v2h4V8H6Zm6 0v2h6V8h-6Zm-6 4v2h4v-2H6Zm6 0v2h6v-2h-6Z"/></svg>
          <span>${canCreateTicket(user) ? "My Tickets" : "Ticket Queue"}</span>
        </a>
        ${canCreateTicket(user) ? `
          <a href="/tickets/new" class="${currentNav === "create" ? "current" : ""}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5a1 1 0 0 1 1 1v5h5a1 1 0 1 1 0 2h-5v5a1 1 0 1 1-2 0v-5H6a1 1 0 1 1 0-2h5V6a1 1 0 0 1 1-1Z"/></svg>
            <span>Create Ticket</span>
          </a>
        ` : ""}
        <a href="/profile" class="${currentNav === "profile" ? "current" : ""}">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4 0-7 2-7 4.5V20h14v-1.5C19 16 16 14 12 14Z"/></svg>
          <span>Profile</span>
        </a>
      </nav>

      <form action="/tickets" method="GET" class="sidebar-filter-form" data-sidebar-filters>
        <input type="hidden" name="q" value="${escapeHtml(filters.query || "")}">
        <section class="filter-group">
          <h2>Quick Filters</h2>
          ${["Plumbing", "Electrical", "Safety"].map((category) => `
            <label><input type="checkbox" name="category" value="${category}" ${filters.categories.includes(category) ? "checked" : ""}> <span>${category}</span></label>
          `).join("")}
        </section>

        <section class="filter-group">
          <h2>Status</h2>
          ${STATUS_OPTIONS.map((status) => `
            <label><input type="checkbox" name="status" value="${status}" ${filters.statuses.includes(status) ? "checked" : ""}> <span>${statusLabel(status)}</span></label>
          `).join("")}
        </section>

        <section class="filter-group">
          <h2>Priority</h2>
          ${PRIORITY_OPTIONS.map((priority) => `
            <label><input type="checkbox" name="priority" value="${priority}" ${filters.priorities.includes(priority) ? "checked" : ""}> <span>${priorityLabel(priority)}</span></label>
          `).join("")}
        </section>
      </form>

      <section class="support-card">
        <h2>Support</h2>
        <p>Report a problem with the site or get help from Facilities.</p>
        <a href="#">Contact Facilities</a>
        <button class="support-chat-trigger" type="button" data-open-support-drawer>
          ${unreadSupportCount > 0 ? `<span class="support-chat-badge" data-support-unread-badge="">${escapeHtml(String(Math.min(unreadSupportCount, 99)))}</span>` : ""}
          ${user.role === "admin" ? "Open Admin Support Inbox" : "Contact Admin Support"}
        </button>
      </section>
    </aside>
  `;
}

function renderTicketImage(ticket, large = false) {
  if (ticket.image_data) {
    return `<img class="ticket-thumb-image ${large ? "large" : ""}" src="${ticket.image_data}" alt="${escapeHtml(ticket.title)}">`;
  }

  const fallbackClass = ticket.category === "Electrical" ? "corridor-thumb" : "leaking-thumb";
  return `<div class="ticket-thumb ${large ? "large" : ""} ${fallbackClass}" aria-hidden="true"></div>`;
}

function renderEvidenceImage(imageData, altText) {
  if (!imageData) {
    return "";
  }

  return `
    <div class="evidence-image-wrap">
      <img class="evidence-image" src="${imageData}" alt="${escapeHtml(altText)}">
    </div>
  `;
}

function renderSupportMessageImage(imageData, altText) {
  if (!imageData) {
    return "";
  }

  return `<img class="support-message-image" src="${imageData}" alt="${escapeHtml(altText)}">`;
}

function renderSupportMessageBubble(message, currentUser) {
  const isOwn = Number(message.sender_user_id) === Number(currentUser.id);
  const isAdminSender = message.sender_role === "admin";
  const senderLabel = isOwn
    ? "You"
    : isAdminSender
      ? "Admin Support"
      : currentUser.role === "admin"
        ? `${message.sender_name} (${roleLabel(message.sender_role)})`
        : "Requester";

  return `
    <article class="support-message ${isOwn ? "own" : ""}">
      <div class="support-message-bubble">
        <div class="support-message-head">
          <strong>${escapeHtml(senderLabel)}</strong>
          <span>${escapeHtml(formatRelative(message.created_at))}</span>
        </div>
        ${message.message ? `<p>${escapeHtml(message.message)}</p>` : ""}
        ${renderSupportMessageImage(message.image_data, `${senderLabel} support attachment`)}
      </div>
    </article>
  `;
}

function renderSupportContextEditor(conversation, currentUser) {
  if (currentUser.role === "admin") {
    return "";
  }

  const availableTickets = getAvailableSupportTicketsForUser(currentUser.id);
  const ticketOptions = availableTickets.length > 0
    ? `
      <option value="">No linked ticket</option>
      ${availableTickets.map((ticket) => `
        <option value="${ticket.id}" ${Number(conversation.linked_ticket_id) === Number(ticket.id) ? "selected" : ""}>
          ${escapeHtml(ticket.code)} · ${escapeHtml(truncateText(ticket.title, 42))}
        </option>
      `).join("")}
    `
    : '<option value="">No linked ticket</option>';

  return `
    <div class="support-context-grid">
      <label>
        <span>Topic</span>
        <select name="supportTopic">
          ${SUPPORT_TOPIC_OPTIONS.map((topic) => `
            <option value="${topic}" ${(conversation.topic || "general_help") === topic ? "selected" : ""}>${escapeHtml(supportTopicLabel(topic))}</option>
          `).join("")}
        </select>
      </label>
      <label>
        <span>Linked Ticket</span>
        <select name="linkedTicketId">
          ${ticketOptions}
        </select>
      </label>
    </div>
  `;
}

function renderSupportAdminControls(conversation, currentPath) {
  return `
    <form class="support-status-form" action="/support/conversations/${conversation.id}/status" method="POST">
      <input type="hidden" name="returnTo" value="${escapeHtml(currentPath)}">
      <input type="hidden" name="hashTarget" value="#support-chat-${conversation.id}">
      <label>
        <span>Status</span>
        <select name="status">
          ${SUPPORT_STATUS_OPTIONS.map((status) => `
            <option value="${status}" ${(conversation.status || "open") === status ? "selected" : ""}>${escapeHtml(supportStatusLabel(status))}</option>
          `).join("")}
        </select>
      </label>
      <button class="ghost-button compact" type="submit">Update Status</button>
      ${conversation.linked_ticket_id ? `<a class="text-button" href="/tickets/${conversation.linked_ticket_id}">Open Ticket</a>` : ""}
    </form>
  `;
}

function renderSupportComposer(conversation, currentUser, returnTo, hashTarget, placeholder) {
  return `
    <form class="support-composer" action="/support/messages" method="POST">
      <input type="hidden" name="conversationId" value="${escapeHtml(String(conversation.id))}">
      <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}">
      <input type="hidden" name="hashTarget" value="${escapeHtml(hashTarget)}">
      ${renderSupportContextEditor(conversation, currentUser)}
      <div class="support-input-shell">
        <textarea name="message" placeholder="${escapeHtml(placeholder)}"></textarea>
        <div class="support-composer-toolbar">
          <div class="support-attachment-group">
            <input type="file" accept="image/*" class="hidden-file-input" data-upload-input>
            <input type="hidden" name="imageData" value="" data-upload-hidden>
            <button class="support-attachment-trigger" type="button" aria-label="Attach image" data-upload-zone>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 7h-3.2l-1.6-2H9.8L8.2 7H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Zm-7 9a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-6.2A2.2 2.2 0 1 0 12 14a2.2 2.2 0 0 0 0-4.2Z"/></svg>
            </button>
            <span class="support-attachment-label" data-upload-label>Attach image</span>
            <div class="support-inline-preview upload-preview" data-upload-preview></div>
          </div>
          <button class="primary-button compact" type="submit">Send Message</button>
        </div>
      </div>
    </form>
  `;
}

function renderUserSupportDrawer(user, currentPath) {
  const conversation = ensureSupportConversation(user.id);
  const fullConversation = getSupportConversationForUser(user.id);
  const messages = getSupportMessages(conversation.id);
  const chatBody = messages.length > 0
    ? messages.map((message) => renderSupportMessageBubble(message, user)).join("")
    : '<div class="support-empty">Start a direct conversation with admin support from here.</div>';

  return `
    <div class="support-drawer-backdrop" data-support-backdrop></div>
    <aside class="support-drawer" data-support-drawer data-support-conversation-id="${escapeHtml(String(fullConversation.id))}">
      <div class="support-drawer-header">
        <div>
          <strong>Admin Support</strong>
          <span>Direct help for account or campus issue escalation</span>
        </div>
        <button class="support-drawer-close" type="button" aria-label="Close admin support chat" data-close-support-drawer>&times;</button>
      </div>
      <div class="support-chat-wrap">
        <div class="support-chat-meta">
          <strong>${escapeHtml(fullConversation.requester_name)}</strong>
          <span>${escapeHtml(roleLabel(user.role))} · ${escapeHtml(user.department)}</span>
          <span>${escapeHtml(renderSupportContextLine(fullConversation))}</span>
          ${fullConversation.linked_ticket_id ? `<a class="support-linked-ticket" href="/tickets/${fullConversation.linked_ticket_id}">Open linked ticket #${escapeHtml(fullConversation.linked_ticket_code)}</a>` : ""}
        </div>
        <div class="support-messages">${chatBody}</div>
        ${renderSupportComposer(fullConversation, user, currentPath, "#support-chat", "Write a message to admin support...")}
      </div>
    </aside>
  `;
}

function renderAdminSupportDrawer(user, currentPath) {
  const conversations = getSupportConversationsForAdmin();
  const listMarkup = conversations.length > 0
    ? conversations.map((conversation, index) => `
        <button class="support-conversation-item ${index === 0 ? "active" : ""} ${conversation.unread_for_admin ? "unread" : ""}" type="button" data-support-conversation-trigger data-conversation-id="${escapeHtml(String(conversation.id))}">
          <div class="support-conversation-topline">
            <strong>${escapeHtml(conversation.requester_name)}</strong>
            ${conversation.unread_for_admin ? '<span class="support-unread-dot"></span>' : ""}
          </div>
          <span>${escapeHtml(conversation.requester_department)} · ${escapeHtml(roleLabel(conversation.requester_role))}</span>
          <span>${escapeHtml(renderSupportContextLine(conversation))}</span>
          <small>${escapeHtml(truncateText(conversation.last_message || (conversation.last_image ? "Sent an image attachment." : "No messages yet."), 60))}</small>
        </button>
      `).join("")
    : '<div class="support-empty">No support conversations yet.</div>';

  const panelMarkup = conversations.length > 0
    ? conversations.map((conversation, index) => {
        const messages = getSupportMessages(conversation.id);
        const bodyMarkup = messages.length > 0
          ? messages.map((message) => renderSupportMessageBubble(message, user)).join("")
          : '<div class="support-empty">No messages in this conversation yet.</div>';

        return `
          <section class="support-conversation-panel ${index === 0 ? "active" : ""}" data-support-conversation-panel data-conversation-id="${escapeHtml(String(conversation.id))}">
            <div class="support-chat-meta admin">
              <div>
                <strong>${escapeHtml(conversation.requester_name)}</strong>
                <span>${escapeHtml(conversation.requester_email)} · ${escapeHtml(conversation.requester_department)} · ${escapeHtml(roleLabel(conversation.requester_role))}</span>
                <span>${escapeHtml(supportTopicLabel(conversation.topic || "general_help"))}</span>
              </div>
              <div class="support-meta-actions">
                ${renderSupportStatusPill(conversation.status || "open")}
                ${conversation.unread_for_admin ? '<span class="support-meta-unread">Unread</span>' : ""}
              </div>
            </div>
            ${conversation.linked_ticket_id ? `<div class="support-linked-ticket-row"><a class="support-linked-ticket" href="/tickets/${conversation.linked_ticket_id}">Linked ticket: #${escapeHtml(conversation.linked_ticket_code)} · ${escapeHtml(conversation.linked_ticket_title)}</a></div>` : ""}
            ${renderSupportAdminControls(conversation, currentPath)}
            <div class="support-messages">${bodyMarkup}</div>
            ${renderSupportComposer(conversation, user, currentPath, `#support-chat-${conversation.id}`, `Reply to ${conversation.requester_name}...`)}
          </section>
        `;
      }).join("")
    : '<div class="support-conversation-panel active"><div class="support-empty">Open support conversations will appear here once users start chatting.</div></div>';

  return `
    <div class="support-drawer-backdrop" data-support-backdrop></div>
    <aside class="support-drawer admin" data-support-drawer>
      <div class="support-drawer-header">
        <div>
          <strong>Admin Support Inbox</strong>
          <span>${escapeHtml(String(conversations.length))} conversation${conversations.length === 1 ? "" : "s"} · ${escapeHtml(String(conversations.filter((conversation) => Number(conversation.unread_for_admin) > 0).length))} unread</span>
        </div>
        <button class="support-drawer-close" type="button" aria-label="Close admin support inbox" data-close-support-drawer>&times;</button>
      </div>
      <div class="support-admin-layout">
        <div class="support-conversation-list">${listMarkup}</div>
        <div class="support-conversation-panels">${panelMarkup}</div>
      </div>
    </aside>
  `;
}

function renderSupportDrawer(user, currentPath) {
  if (user.role === "admin") {
    return renderAdminSupportDrawer(user, currentPath);
  }
  return renderUserSupportDrawer(user, currentPath);
}

function renderLoginPage(message = "", type = "error", values = {}) {
  const formMarkup = `
    <form class="login-form" action="/login" method="POST">
      ${renderFlash(message, type)}
      <label for="email">University email</label>
      <input id="email" name="email" type="email" value="${escapeHtml(values.email || "")}" placeholder="name@${escapeHtml(UNIVERSITY_EMAIL_DOMAIN)}" required>
      <label for="password">Password</label>
      <input id="password" name="password" type="password" placeholder="Enter your password" required>
      <div class="form-row">
        <label class="checkbox-row">
          <input type="checkbox" checked disabled>
          <span>Remember me</span>
        </label>
        <a href="/signup">Create account</a>
      </div>
      <div class="form-row">
        <a href="/forgot-password">Forgot password?</a>
        <a href="/resend-verification">Resend verification email</a>
      </div>
      <button class="primary-button" type="submit">Log in</button>
      <div class="demo-box">
        <strong>Demo Accounts</strong>
        <p>Student: <code>student@fixmycampus.edu</code> / <code>password123</code></p>
        <p>Faculty: <code>faculty@fixmycampus.edu</code> / <code>password123</code></p>
        <p>Admin: <code>admin@fixmycampus.edu</code> / <code>password123</code></p>
        <p>Department: <code>plumbing@fixmycampus.edu</code> / <code>password123</code></p>
      </div>
      <p class="account-link">Don’t have an account? <a href="/signup">Create a new account</a></p>
    </form>
  `;

  return renderAuthPage({
    title: "FixMyCampus | Welcome Back",
    heading: "Welcome back",
    subheading: "Sign in to your FixMyCampus account",
    formMarkup
  });
}

function renderSignupPage(message = "", values = {}) {
  const formMarkup = `
    <form class="login-form" action="/signup" method="POST">
      ${renderFlash(message)}
      <label for="fullName">Full name</label>
      <input id="fullName" name="fullName" type="text" value="${escapeHtml(values.fullName || "")}" placeholder="Name" required>
      <label for="department">Department / Course</label>
      <input id="department" name="department" type="text" value="${escapeHtml(values.department || "")}" placeholder="Course" required>
      <label for="accountRole">Account type</label>
      <select id="accountRole" name="accountRole" required>
        <option value="student" ${values.accountRole === "student" || !values.accountRole ? "selected" : ""}>Student</option>
        <option value="faculty" ${values.accountRole === "faculty" ? "selected" : ""}>Faculty</option>
      </select>
      <label for="signupEmail">University email</label>
      <input id="signupEmail" name="email" type="email" value="${escapeHtml(values.email || "")}" placeholder="s24cseu0458@${escapeHtml(UNIVERSITY_EMAIL_DOMAIN)}" required>
      <label for="signupPassword">Password</label>
      <input id="signupPassword" name="password" type="password" placeholder="Create a password" required>
      <label for="confirmPassword">Confirm password</label>
      <input id="confirmPassword" name="confirmPassword" type="password" placeholder="Confirm your password" required>
      <button class="primary-button" type="submit">Create account</button>
      <p class="account-link">Already have an account? <a href="/">Sign in</a></p>
    </form>
  `;

  return renderAuthPage({
    title: "FixMyCampus | Create Account",
    heading: "Create your account",
    subheading: "Join FixMyCampus to report and track campus issues",
    formMarkup
  });
}

function renderVerificationSentPage(email, verificationLink) {
  return renderAuthInfoPage({
    title: "FixMyCampus | Verify Email",
    heading: "Verify your email",
    subheading: "Your account has been created, but email verification is required before sign-in.",
    bodyMarkup: `
      <p>We generated a verification link for <strong>${escapeHtml(email)}</strong>.</p>
      <p>This demo does not send real email yet, so use the link below to complete verification.</p>
      <div class="demo-box">
        <strong>Verification Link</strong>
        <p><a href="${escapeHtml(verificationLink)}">${escapeHtml(verificationLink)}</a></p>
      </div>
      <div class="form-actions">
        <a class="text-button" href="/resend-verification">Resend verification</a>
        <a class="primary-button compact" href="/">Back to sign in</a>
      </div>
    `
  });
}

function renderEmailVerifiedPage() {
  return renderAuthInfoPage({
    title: "FixMyCampus | Email Verified",
    heading: "Email verified",
    subheading: "Your FixMyCampus account is ready to use.",
    bodyMarkup: `
      <p>Your email address has been verified successfully. You can sign in now.</p>
      <div class="form-actions">
        <a class="primary-button compact" href="/">Go to sign in</a>
      </div>
    `
  });
}

function renderResendVerificationPage(message = "", type = "error", values = {}) {
  return renderAuthPage({
    title: "FixMyCampus | Resend Verification",
    heading: "Resend verification email",
    subheading: "Enter your university email and we will generate a fresh verification link.",
    formMarkup: `
      <form class="login-form" action="/resend-verification" method="POST">
        ${renderFlash(message, type)}
        <label for="resendEmail">University email</label>
        <input id="resendEmail" name="email" type="email" value="${escapeHtml(values.email || "")}" placeholder="name@${escapeHtml(UNIVERSITY_EMAIL_DOMAIN)}" required>
        <button class="primary-button" type="submit">Send verification link</button>
        <p class="account-link"><a href="/">Back to sign in</a></p>
      </form>
    `
  });
}

function renderForgotPasswordPage(message = "", type = "error", values = {}) {
  return renderAuthPage({
    title: "FixMyCampus | Reset Password",
    heading: "Forgot your password?",
    subheading: "Enter your university email and we will generate a reset link.",
    formMarkup: `
      <form class="login-form" action="/forgot-password" method="POST">
        ${renderFlash(message, type)}
        <label for="forgotEmail">University email</label>
        <input id="forgotEmail" name="email" type="email" value="${escapeHtml(values.email || "")}" placeholder="name@${escapeHtml(UNIVERSITY_EMAIL_DOMAIN)}" required>
        <button class="primary-button" type="submit">Send reset link</button>
        <p class="account-link"><a href="/">Back to sign in</a></p>
      </form>
    `
  });
}

function renderUniversitySsoPage(message = "", type = "error", values = {}) {
  return renderAuthPage({
    title: "FixMyCampus | University SSO",
    heading: "Sign in to continue",
    subheading: "Enter your university email to receive a one-time sign-in link.",
    formMarkup: `
      <form class="login-form" action="/university-sso" method="POST">
        ${renderFlash(message, type)}
        <label for="ssoEmail">University email</label>
        <input id="ssoEmail" name="email" type="email" value="${escapeHtml(values.email || "")}" placeholder="name@${escapeHtml(UNIVERSITY_EMAIL_DOMAIN)}" required>
        <button class="primary-button" type="submit">Continue</button>
        <p class="account-link"><a href="/">Back to sign in</a></p>
      </form>
    `
  });
}

function renderUniversitySsoReadyPage(email, signInLink) {
  return renderAuthInfoPage({
    title: "FixMyCampus | University SSO",
    heading: "University SSO link ready",
    subheading: "Use the link below to finish signing in.",
    bodyMarkup: `
      <p>We generated a one-time sign-in link for <strong>${escapeHtml(email)}</strong>.</p>
      <p>This demo does not connect to a live identity provider yet, so use the link below to complete University SSO.</p>
      <div class="demo-box">
        <strong>Sign-in Link</strong>
        <p><a href="${escapeHtml(signInLink)}">${escapeHtml(signInLink)}</a></p>
      </div>
      <div class="form-actions">
        <a class="text-button" href="/university-sso">Generate another link</a>
        <a class="primary-button compact" href="/">Back to sign in</a>
      </div>
    `
  });
}

function renderPasswordResetSentPage(email, resetLink) {
  return renderAuthInfoPage({
    title: "FixMyCampus | Password Reset",
    heading: "Password reset link ready",
    subheading: "Use the link below to choose a new password.",
    bodyMarkup: `
      <p>If an account exists for <strong>${escapeHtml(email)}</strong>, a password reset link has been generated.</p>
      <p>This demo does not send real email yet, so use the link below.</p>
      <div class="demo-box">
        <strong>Reset Link</strong>
        <p><a href="${escapeHtml(resetLink)}">${escapeHtml(resetLink)}</a></p>
      </div>
      <div class="form-actions">
        <a class="text-button" href="/forgot-password">Send another link</a>
        <a class="primary-button compact" href="/">Back to sign in</a>
      </div>
    `
  });
}

function renderResetPasswordPage(token, message = "", type = "error") {
  return renderAuthPage({
    title: "FixMyCampus | Choose New Password",
    heading: "Choose a new password",
    subheading: "Reset your FixMyCampus password and sign back in.",
    formMarkup: `
      <form class="login-form" action="/reset-password" method="POST">
        ${renderFlash(message, type)}
        <input type="hidden" name="token" value="${escapeHtml(token)}">
        <label for="newPassword">New password</label>
        <input id="newPassword" name="password" type="password" placeholder="Create a strong password" required>
        <label for="confirmNewPassword">Confirm new password</label>
        <input id="confirmNewPassword" name="confirmPassword" type="password" placeholder="Confirm your new password" required>
        <button class="primary-button" type="submit">Update password</button>
        <p class="account-link"><a href="/">Back to sign in</a></p>
      </form>
    `
  });
}

function renderStatCard(label, value, iconClass, iconPath) {
  return `
    <article class="stat-card">
      <div><span>${escapeHtml(label)}</span><strong>${escapeHtml(String(value))}</strong></div>
      <div class="stat-icon ${iconClass}">
        <svg viewBox="0 0 24 24" aria-hidden="true">${iconPath}</svg>
      </div>
    </article>
  `;
}

function renderCampusComplaintFeed(user, tickets, title, subtitle, compact = false, returnTo = "/tickets") {
  const feedItems = tickets.length > 0
    ? tickets.map((ticket) => `
        <article class="complaint-feed-item">
          <div class="complaint-feed-item-header">
            <strong>${escapeHtml(ticket.title)}</strong>
            <span>Ticket #${escapeHtml(ticket.code)}</span>
          </div>
          <p>${escapeHtml(ticket.category)} · ${escapeHtml(truncateText(ticket.location, compact ? 46 : 62))}</p>
          <div class="complaint-feed-item-meta">
            <span class="complaint-feed-chip priority-${escapeHtml(ticket.priority || "medium")}">${escapeHtml(priorityLabel(ticket.priority || "medium"))}</span>
            <span class="complaint-feed-chip status-${escapeHtml(ticket.status)}">${escapeHtml(statusLabel(ticket.status))}</span>
          </div>
          <small>
            ${Number(ticket.owner_user_id) === Number(user.id) ? "Reported by you" : "Reported by another campus member"}
            · ${escapeHtml(formatRelative(ticket.created_at))}
            · ${escapeHtml(String(Number(ticket.supporter_count || 0) + 1))} affected
          </small>
          ${canCreateTicket(user) && Number(ticket.owner_user_id) !== Number(user.id) ? `
            <div class="complaint-feed-item-actions">
              <form action="/tickets/${ticket.id}/support" method="POST">
                <input type="hidden" name="returnTo" value="${escapeHtml(returnTo)}">
                <button class="ghost-button compact" type="submit">I am also affected</button>
              </form>
            </div>
          ` : ""}
        </article>
      `).join("")
    : `<p class="complaint-feed-empty">No active campus complaints right now. If this issue is new, you can create the first ticket.</p>`;

  return `
    <section class="complaint-feed-card ${compact ? "compact" : ""}">
      <div class="complaint-feed-header">
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(subtitle)}</p>
      </div>
      <div class="complaint-feed-grid">${feedItems}</div>
    </section>
  `;
}

function renderTicketsPage(user, tickets, stats, filters, communityTickets = [], message = "", messageType = "success") {
  const pageTitle = user.role === "admin"
    ? "Admin Ticket Dashboard"
    : user.role === "department"
      ? `${user.department} Queue`
      : "My Tickets";
  const pageSubtitle = user.role === "admin"
    ? "Review reported issues and assign them to the right department."
    : user.role === "department"
      ? "View tickets assigned to your department and update progress."
      : "Overview of recent campus reports and their current status";

  const cards = tickets.length > 0
    ? tickets.map((ticket) => `
        <article class="ticket-card">
          <div class="ticket-card-header">
            <div>
              <h2>${escapeHtml(ticket.title)}</h2>
              <p>${escapeHtml(ticket.category)} · ${escapeHtml(ticket.location)} · Reported ${escapeHtml(formatRelative(ticket.created_at))}</p>
              <p class="assignment-line">Assigned: ${escapeHtml(assignmentLabel(ticket))}</p>
              <p class="priority-line">Priority: ${escapeHtml(priorityLabel(ticket.priority || "medium"))}</p>
            </div>
            <span>Ticket #${escapeHtml(ticket.code)}</span>
          </div>
          <div class="ticket-card-body">
            ${renderTicketImage(ticket)}
            <p>${escapeHtml(ticket.description.length > 72 ? `${ticket.description.slice(0, 72)}...` : ticket.description)}</p>
          </div>
          <div class="ticket-card-footer">
            <button class="mini-avatar" type="button" aria-label="Ticket owner">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4 0-7 2-7 4.5V20h14v-1.5C19 16 16 14 12 14Z"/></svg>
            </button>
            <span class="ticket-priority-tag ${escapeHtml(ticket.priority || "medium")}">${escapeHtml(priorityLabel(ticket.priority || "medium"))}</span>
            <span class="ticket-status-tag ${escapeHtml(ticket.status)}">${escapeHtml(statusLabel(ticket.status))}</span>
            <div class="ticket-actions">
              <a class="text-button" href="/tickets/${ticket.id}">View</a>
              ${(canAssignTicket(user) || canDepartmentUpdate(user, ticket)) ? `<a class="primary-button compact small" href="/tickets/${ticket.id}">Manage</a>` : ""}
            </div>
          </div>
        </article>
      `).join("")
    : `<div class="empty-state"><h2>No tickets found</h2><p>Try changing the filters or create a new ticket to get started.</p></div>`;

  const communityFeed = canCreateTicket(user)
    ? renderCampusComplaintFeed(
      user,
      communityTickets,
      "Campus Complaint Feed",
      "See active campus complaints before creating another ticket.",
      false
    )
    : "";

  return renderAppShell({
    title: "FixMyCampus | My Tickets",
    user,
    currentNav: "tickets",
    filters,
    searchValue: filters.query,
    currentPath: "/tickets",
    content: `
      ${!user.emailVerified ? '<section class="page-heading stacked"><div class="flash-banner error">Your primary email is not verified. Check your profile after changing your email to generate and use a new verification link.</div></section>' : ""}
      ${renderFlash(message, messageType)}
      <section class="stats-grid">
        ${renderStatCard("Total Tickets", stats.total, "pale-blue", '<path d="M8 4h8v2H8V4Zm-2 3h12v13H6V7Zm2 3v2h4v-2H8Zm0 4v2h6v-2H8Z"/>')}
        ${renderStatCard("Open", stats.open, "pale-red", '<path d="M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Zm-1 5v5h2V8h-2Zm0 7v2h2v-2h-2Z"/>')}
        ${renderStatCard("In Progress", stats.in_progress, "pale-yellow", '<path d="m7.2 6.2 2.6 2.6-1.4 1.4-2.6-2.6 1.4-1.4Zm9.6 0 1.4 1.4-2.6 2.6-1.4-1.4 2.6-2.6ZM11 11V5h2v6h-2Zm7 1h-6v-2h6v2Zm-7 7h2v-6h-2v6Zm-5-5h6v2H6v-2Z"/>')}
        ${renderStatCard("Resolved", stats.resolved, "pale-green", '<path d="M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Zm4.1 6.8-5.2 5.5-3-2.8-1.4 1.5 4.5 4.2 6.6-7-1.5-1.4Z"/>')}
      </section>

      <section class="page-heading">
        <div>
          <h1>${escapeHtml(pageTitle)}</h1>
          <p>${escapeHtml(pageSubtitle)}</p>
        </div>
        <div class="page-heading-actions">
          <span class="text-button">Filter</span>
          ${canCreateTicket(user) ? '<a class="primary-button compact" href="/tickets/new">Create New Ticket</a>' : ""}
        </div>
      </section>

      ${communityFeed}

      <section class="ticket-grid">${cards}</section>
    `
  });
}

function renderCreateTicketHiddenValues(values, forceCreate = false) {
  return `
    <input type="hidden" name="title" value="${escapeHtml(values.title || "")}">
    <input type="hidden" name="category" value="${escapeHtml(values.category || "")}">
    <input type="hidden" name="priority" value="${escapeHtml(values.priority || "medium")}">
    <input type="hidden" name="location" value="${escapeHtml(values.location || "")}">
    <input type="hidden" name="description" value="${escapeHtml(values.description || "")}">
    <input type="hidden" name="imageData" value="${escapeHtml(values.imageData || "")}">
    ${forceCreate ? '<input type="hidden" name="forceCreate" value="1">' : ""}
  `;
}

function renderDuplicateMatchPage(user, values, matches, communityTickets, hardBlock = false) {
  const cards = matches.map((ticket) => `
    <article class="complaint-feed-item duplicate-match-item">
      <div class="complaint-feed-item-header">
        <strong>${escapeHtml(ticket.title)}</strong>
        <span>Ticket #${escapeHtml(ticket.code)}</span>
      </div>
      <p>${escapeHtml(ticket.category)} · ${escapeHtml(ticket.location)}</p>
      <div class="complaint-feed-item-meta">
        <span class="complaint-feed-chip priority-${escapeHtml(ticket.priority || "medium")}">${escapeHtml(priorityLabel(ticket.priority || "medium"))}</span>
        <span class="complaint-feed-chip status-${escapeHtml(ticket.status)}">${escapeHtml(statusLabel(ticket.status))}</span>
      </div>
      <small>
        ${escapeHtml(ticket.reason)}
        · ${escapeHtml(Math.round(Number(ticket.duplicateScore || 0) * 100))}% similarity
        · ${escapeHtml(String(Number(ticket.supporter_count || 0) + 1))} affected
      </small>
      <div class="complaint-feed-item-actions">
        ${Number(ticket.owner_user_id) !== Number(user.id) ? `
          <form action="/tickets/${ticket.id}/support" method="POST">
            <input type="hidden" name="returnTo" value="/tickets/new?supportAdded=1">
            <button class="ghost-button compact" type="submit">I am also affected</button>
          </form>
        ` : ""}
        ${Number(ticket.owner_user_id) === Number(user.id) ? `<a class="text-button" href="/tickets/${ticket.id}">Open my ticket</a>` : ""}
      </div>
    </article>
  `).join("");

  const warningMessage = hardBlock
    ? "An active ticket with the same issue already exists. To reduce duplication, please join an existing complaint."
    : "Similar active complaints were found. Join one of these tickets to avoid duplicate reporting.";

  const communityFeed = renderCampusComplaintFeed(
    user,
    communityTickets,
    "Other Active Complaints",
    "These are additional active campus complaints you can review.",
    true,
    "/tickets/new?supportAdded=1"
  );

  return renderAppShell({
    title: "FixMyCampus | Potential Duplicate Detected",
    user,
    currentNav: "create",
    filters: { query: "", categories: [], statuses: [], priorities: [] },
    searchValue: "",
    currentPath: "/tickets/new",
    content: `
      <section class="page-heading stacked">
        <div>
          <h1>Possible Duplicate Complaints Found</h1>
          <p>We found active tickets that look similar to your issue.</p>
        </div>
      </section>

      <section class="form-card">
        ${renderFlash(warningMessage, hardBlock ? "error" : "success")}
        <div class="complaint-feed-grid">${cards}</div>
      </section>

      ${!hardBlock ? `
        <section class="form-card">
          <h2>Create A Separate Ticket</h2>
          <p class="panel-helper">If your issue is genuinely different, you can still create a separate ticket.</p>
          <form class="ticket-form" action="/tickets" method="POST">
            ${renderCreateTicketHiddenValues(values, true)}
            <div class="form-actions">
              <a class="text-button" href="/tickets/new">Back and Edit</a>
              <button class="primary-button compact" type="submit">Create New Ticket Anyway</button>
            </div>
          </form>
        </section>
      ` : `
        <section class="form-card">
          <div class="form-actions">
            <a class="primary-button compact" href="/tickets/new">Back to Create Ticket</a>
          </div>
        </section>
      `}

      ${communityFeed}
    `
  });
}

function renderCreateTicketPage(user, values = {}, message = "", type = "error", communityTickets = []) {
  const communityFeed = renderCampusComplaintFeed(
    user,
    communityTickets,
    "Existing Campus Complaints",
    "Check active complaints first to reduce duplicate tickets.",
    true,
    "/tickets/new?supportAdded=1"
  );

  return renderAppShell({
    title: "FixMyCampus | Create New Ticket",
    user,
    currentNav: "create",
    filters: { query: "", categories: [], statuses: [], priorities: [] },
    searchValue: "",
    currentPath: "/tickets/new",
    content: `
      <section class="page-heading stacked">
        <div>
          <h1>Create New Ticket</h1>
          <p>Report a campus issue so the facilities team can review and resolve it.</p>
        </div>
      </section>

      ${communityFeed}

      <section class="form-card">
        <form class="ticket-form" action="/tickets" method="POST">
          ${renderFlash(message, type)}
          <div class="field-row two-col">
            <label>
              <span>Ticket Title</span>
              <input name="title" type="text" value="${escapeHtml(values.title || "")}" placeholder="Ticket Title here" required>
            </label>
            <label>
              <span>Category</span>
              <select name="category" required>
                <option value="">Select Category ▼</option>
                ${CATEGORY_OPTIONS.map((category) => `<option value="${category}" ${values.category === category ? "selected" : ""}>${category}</option>`).join("")}
              </select>
            </label>
          </div>

          <div class="field-row two-col">
            <label>
              <span>Priority</span>
              <select name="priority" required>
                ${PRIORITY_OPTIONS.map((priority) => `<option value="${priority}" ${String(values.priority || "medium") === priority ? "selected" : ""}>${priorityLabel(priority)}</option>`).join("")}
              </select>
            </label>
            <label>
              <span>Suggested Department</span>
              <input type="text" value="${escapeHtml(values.category ? suggestedDepartment(values.category) : "Will be mapped by admin after submission")}" readonly>
            </label>
          </div>

          <label>
            <span>Location</span>
            <input name="location" type="text" value="${escapeHtml(values.location || "")}" placeholder="Enter building / hostel / room number" required>
            <small>Examples: Building B Block, Hostel C2, A Block, P Block, N Block, C1, C6, D2, C9, D4</small>
          </label>

          <label>
            <span>Description</span>
            <textarea name="description" placeholder="Describe the issue in detail so the maintenance team can understand the problem." required>${escapeHtml(values.description || "")}</textarea>
          </label>

          <label class="upload-label">
            <span>Upload Image</span>
            <input type="file" accept="image/*" class="hidden-file-input" data-upload-input>
            <input type="hidden" name="imageData" value="${escapeHtml(values.imageData || "")}" data-upload-hidden>
            <div class="upload-zone" data-upload-zone>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 7h-3.2l-1.6-2H9.8L8.2 7H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Zm-7 9a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-6.2A2.2 2.2 0 1 0 12 14a2.2 2.2 0 0 0 0-4.2Z"/></svg>
              <strong data-upload-label>Upload Photo</strong>
              <p>Drag and drop or select an image</p>
              <div class="upload-preview" data-upload-preview>
                ${values.imageData ? `<img class="upload-preview-image" src="${values.imageData}" alt="Upload preview">` : ""}
              </div>
            </div>
          </label>

          <div class="form-actions">
            <a class="text-button" href="/tickets">Cancel</a>
            <button class="primary-button compact" type="submit">Submit Ticket</button>
          </div>
        </form>
      </section>
    `
  });
}

function renderProfileImageEditor(user, profileValues) {
  const hasImage = Boolean(profileValues.profileImageData);
  return `
    <div class="profile-avatar-editor ${hasImage ? "has-image" : ""}" data-profile-image-editor>
      <input
        id="profileImageInput"
        type="file"
        accept="image/*"
        class="hidden-file-input"
        data-profile-image-input
        form="profile-form"
      >
      <input
        type="hidden"
        name="profileImageData"
        value="${escapeHtml(profileValues.profileImageData)}"
        data-profile-image-hidden
        form="profile-form"
      >
      <div class="profile-avatar-shell">
        <div class="profile-avatar-display ${hasImage ? "has-image" : ""}" data-profile-image-display tabindex="0" aria-label="Profile photo editor">
          ${hasImage
            ? `<img src="${profileValues.profileImageData}" alt="${escapeHtml(profileValues.fullName)}" class="profile-avatar-image" data-profile-image-img>`
            : `<span class="profile-avatar-fallback" data-profile-image-fallback>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4 0-7 2-7 4.5V20h14v-1.5C19 16 16 14 12 14Z"/></svg>
              </span>`}
          <button class="profile-avatar-edit-trigger" type="button" data-profile-image-toggle>Edit</button>
        </div>

        <div class="profile-avatar-actions" data-profile-image-menu>
          <button class="profile-avatar-action" type="button" data-profile-image-view ${hasImage ? "" : "disabled"}>View</button>
          <button class="profile-avatar-action" type="button" data-profile-image-change>Change</button>
          <button class="profile-avatar-action danger" type="button" data-profile-image-remove ${hasImage ? "" : "disabled"}>Remove</button>
        </div>
      </div>

      <p class="profile-avatar-hint">Hover the avatar to edit your profile photo.</p>

      <div class="profile-image-modal" data-profile-image-modal>
        <button class="profile-image-backdrop" type="button" aria-label="Close image preview" data-profile-image-close></button>
        <div class="profile-image-dialog" role="dialog" aria-modal="true" aria-label="Profile photo preview">
          <button class="profile-image-close" type="button" aria-label="Close image preview" data-profile-image-close>&times;</button>
          <img src="${hasImage ? profileValues.profileImageData : ""}" alt="${escapeHtml(profileValues.fullName)}" class="profile-image-modal-img" data-profile-image-modal-img>
        </div>
      </div>
    </div>
  `;
}

function renderProfileImagePreview(profileValues) {
  const hasImage = Boolean(profileValues.profileImageData);
  return `
    <div class="profile-avatar-editor profile-avatar-static ${hasImage ? "has-image" : ""}">
      <div class="profile-avatar-shell">
        <div class="profile-avatar-display ${hasImage ? "has-image" : ""}" aria-label="Profile photo">
          ${hasImage
            ? `<img src="${profileValues.profileImageData}" alt="${escapeHtml(profileValues.fullName)}" class="profile-avatar-image">`
            : `<span class="profile-avatar-fallback">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4 0-7 2-7 4.5V20h14v-1.5C19 16 16 14 12 14Z"/></svg>
              </span>`}
        </div>
      </div>
      <p class="profile-avatar-hint">Use Edit Profile to update your profile photo.</p>
    </div>
  `;
}

function renderProfileDetailItem(label, value, fallback = "Not provided") {
  const text = String(value || "").trim();
  return `
    <article class="profile-detail-item">
      <span>${escapeHtml(label)}</span>
      <strong>${text ? escapeHtml(text) : `<em>${escapeHtml(fallback)}</em>`}</strong>
    </article>
  `;
}

function renderProfilePage(user, values = {}, message = "", type = "success", options = {}) {
  const isEditMode = Boolean(options.isEditMode);
  const studentIdFormat = user.role === "student" ? getStudentIdFormatForDepartment(values.department ?? user.department ?? "") : null;
  const idLabel = user.role === "faculty" ? "Faculty ID" : "Student ID";
  const idValue = user.role === "faculty" ? (values.facultyId ?? user.facultyId ?? "") : (values.studentId ?? user.studentId ?? "");
  const profileValues = {
    fullName: values.fullName ?? user.fullName ?? "",
    department: values.department ?? user.department ?? "",
    email: values.email ?? user.email ?? "",
    studentId: values.studentId ?? user.studentId ?? "",
    facultyId: values.facultyId ?? user.facultyId ?? "",
    phone: values.phone ?? user.phone ?? "",
    alternateEmail: values.alternateEmail ?? user.alternateEmail ?? "",
    campusAddress: values.campusAddress ?? user.campusAddress ?? "",
    bio: values.bio ?? user.bio ?? "",
    profileImageData: values.profileImageData ?? user.profileImageData ?? ""
  };

  return renderAppShell({
    title: "FixMyCampus | Profile",
    user,
    currentNav: "profile",
    filters: { query: "", categories: [], statuses: [], priorities: [] },
    searchValue: "",
    currentPath: "/profile",
    content: `
      <section class="page-heading stacked">
        <div>
          <h1>My Profile</h1>
          <p>Manage your personal and campus details for better ticket communication.</p>
        </div>
      </section>

      <section class="profile-layout">
        <article class="profile-summary-card">
          ${isEditMode ? renderProfileImageEditor(user, profileValues) : renderProfileImagePreview(profileValues)}
          <h2>${escapeHtml(profileValues.fullName)}</h2>
          <p>${escapeHtml(roleLabel(user.role))}</p>
          <div class="profile-summary-meta">
            <span>${escapeHtml(profileValues.email)}</span>
            <span>${escapeHtml(profileValues.department)}</span>
            <span>${user.emailVerified ? "Email verified" : "Email verification pending"}</span>
          </div>
        </article>

        ${isEditMode ? `
          <section class="form-card profile-form-card">
            <form id="profile-form" class="ticket-form profile-form profile-edit-form" action="/profile" method="POST">
              ${renderFlash(message, type)}
              ${!user.emailVerified ? '<div class="flash-banner error">Your primary email is not verified yet. Updating the email address will require a new verification link.</div>' : ""}
              <div class="field-row two-col">
                <label>
                  <span>Full Name</span>
                  <input name="fullName" type="text" value="${escapeHtml(profileValues.fullName)}" required>
                </label>
                <label>
                  <span>Department / Course</span>
                  <input name="department" type="text" value="${escapeHtml(profileValues.department)}" required>
                </label>
              </div>

              <div class="field-row two-col">
                <label>
                  <span>Primary Email</span>
                  <input name="email" type="email" value="${escapeHtml(profileValues.email)}" required>
                </label>
                <label>
                  <span>${idLabel}</span>
                  <input
                    name="${user.role === "faculty" ? "facultyId" : "studentId"}"
                    type="text"
                    value="${escapeHtml(idValue)}"
                    placeholder="${user.role === "faculty" ? "FAC-2026-104" : escapeHtml(studentIdFormat?.example || "S24CSEU0000")}"
                  >
                </label>
              </div>

              <div class="field-row two-col">
                <label>
                  <span>Alternate Email</span>
                  <input name="alternateEmail" type="email" value="${escapeHtml(profileValues.alternateEmail)}" placeholder="alternate@example.com">
                </label>
                <label>
                  <span>Phone Number</span>
                  <input name="phone" type="text" value="${escapeHtml(profileValues.phone)}" placeholder="+91 98765 43210">
                </label>
              </div>

              <label>
                <span>Campus Address</span>
                <input name="campusAddress" type="text" value="${escapeHtml(profileValues.campusAddress)}" placeholder="Hostel / Block / Room / Office">
              </label>

              <label>
                <span>About You</span>
                <textarea name="bio" placeholder="Add a short note about yourself or the best way to contact you.">${escapeHtml(profileValues.bio)}</textarea>
              </label>

              <div class="form-actions">
                <a class="text-button" href="/profile">Cancel</a>
                <button class="primary-button compact" type="submit">Save Profile</button>
              </div>
            </form>
          </section>
        ` : `
          <section class="form-card profile-form-card profile-readonly-card">
            ${renderFlash(message, type)}
            ${!user.emailVerified ? '<div class="flash-banner error">Your primary email is not verified yet. Updating the email address will require a new verification link.</div>' : ""}
            <div class="profile-readonly-grid">
              ${renderProfileDetailItem("Full Name", profileValues.fullName)}
              ${renderProfileDetailItem("Department / Course", profileValues.department)}
              ${renderProfileDetailItem("Primary Email", profileValues.email)}
              ${renderProfileDetailItem(idLabel, idValue)}
              ${renderProfileDetailItem("Alternate Email", profileValues.alternateEmail)}
              ${renderProfileDetailItem("Phone Number", profileValues.phone)}
              ${renderProfileDetailItem("Campus Address", profileValues.campusAddress)}
              ${renderProfileDetailItem("Email Status", user.emailVerified ? "Verified" : "Verification pending")}
            </div>
            <div class="profile-bio-card">
              <span>About You</span>
              <p>${escapeHtml(profileValues.bio || "No profile note added yet.")}</p>
            </div>
            <div class="form-actions">
              <a class="text-button" href="/tickets">Back to Tickets</a>
              <a class="primary-button compact" href="/profile?edit=1">Edit Profile</a>
            </div>
          </section>
        `}
      </section>
    `
  });
}

function renderNotificationsPage(user, notifications) {
  const items = notifications.length > 0
    ? notifications.map((notification) => `
        <a class="notification-page-item ${notification.is_read ? "" : "unread"}" href="/notifications/${notification.id}/open">
          <div class="notification-page-item-body">
            <strong>${escapeHtml(notification.ticket_title)}</strong>
            <p>${escapeHtml(notification.message)}</p>
          </div>
          <div class="notification-page-item-meta">
            <span>Ticket #${escapeHtml(notification.ticket_code)}</span>
            <span>${escapeHtml(formatRelative(notification.created_at))}</span>
          </div>
        </a>
      `).join("")
    : `<div class="empty-state"><h2>No notifications yet</h2><p>New department progress updates will show up here.</p></div>`;

  return renderAppShell({
    title: "FixMyCampus | Notifications",
    user,
    currentNav: "tickets",
    filters: { query: "", categories: [], statuses: [], priorities: [] },
    searchValue: "",
    currentPath: "/notifications",
    content: `
      <section class="page-heading stacked">
        <div>
          <h1>Notifications</h1>
          <p>Track recent progress updates and open the exact ticket where a change was made.</p>
        </div>
      </section>

      <section class="notification-page-list">
        ${items}
      </section>
    `
  });
}

function renderTicketControlPanel(user, ticket, message, type) {
  if (canAssignTicket(user)) {
    return `
      <section class="staff-update-card">
        <h2>Admin Assignment</h2>
        ${renderFlash(message, type)}
        <form action="/tickets/${ticket.id}/assign" method="POST">
          <p class="panel-helper">Suggested department: ${escapeHtml(suggestedDepartment(ticket.category))}</p>
          <select name="assignedDepartment" required>
            <option value="">Assign To Department</option>
            ${DEPARTMENT_OPTIONS.map((department) => `<option value="${department}" ${ticket.assigned_department === department ? "selected" : ""}>${department}</option>`).join("")}
          </select>
          <div class="staff-update-actions">
            <span class="assignment-status-inline">${escapeHtml(assignmentLabel(ticket))}</span>
            <button class="primary-button compact" type="submit">Assign Ticket</button>
          </div>
        </form>
      </section>
    `;
  }

  if (canDepartmentUpdate(user, ticket)) {
    return `
      <section class="staff-update-card">
        <h2>Department Progress Update</h2>
        ${renderFlash(message, type)}
        <form action="/tickets/${ticket.id}/updates" method="POST">
          <textarea name="message" placeholder="Add Progress Update"></textarea>
          <label class="upload-label compact-upload-label">
            <span>Attach Fix Image</span>
            <input type="file" accept="image/*" class="hidden-file-input" data-upload-input>
            <input type="hidden" name="imageData" value="" data-upload-hidden>
            <div class="upload-zone compact-upload-zone" data-upload-zone>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 7h-3.2l-1.6-2H9.8L8.2 7H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Zm-7 9a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-6.2A2.2 2.2 0 1 0 12 14a2.2 2.2 0 0 0 0-4.2Z"/></svg>
              <strong data-upload-label>Upload Fix Photo</strong>
              <p>Attach a photo showing the repair or on-site progress.</p>
              <div class="upload-preview" data-upload-preview></div>
            </div>
          </label>
          <div class="staff-update-actions">
            <select name="status">
              <option value="">Update Ticket Status</option>
              ${STATUS_OPTIONS.map((status) => `<option value="${status}" ${ticket.status === status ? "selected" : ""}>${statusLabel(status)}</option>`).join("")}
            </select>
            <button class="primary-button compact" type="submit">Post Update</button>
          </div>
        </form>
      </section>
    `;
  }

  return `
    <section class="staff-update-card">
      <h2>Progress Visibility</h2>
      ${renderFlash(message, type)}
      <p class="panel-helper">Assigned Department: ${escapeHtml(assignmentLabel(ticket))}</p>
      <p class="panel-helper">Current Status: ${escapeHtml(statusLabel(ticket.status))}</p>
      <p class="panel-helper">You can view the full progress timeline here. Only the admin can assign tickets and only the assigned department can post progress updates.</p>
    </section>
  `;
}

function renderReporterEscalationSection(user, ticket, updates, reports, message = "", type = "error") {
  const reportList = reports.length > 0
    ? reports.map((report) => `
        <article class="report-item">
          <div class="report-item-head">
            <strong>${escapeHtml(reporterDisplayLabel(user, report.reporter_user_id, report.reporter_name, report.reporter_role))}</strong>
            <span>${escapeHtml(formatRelative(report.created_at))}</span>
          </div>
          <p>${escapeHtml(report.message)}</p>
          ${renderEvidenceImage(report.image_data, `Reporter evidence for ticket ${ticket.code}`)}
        </article>
      `).join("")
    : `<p class="panel-helper">No reporter concerns have been raised for this ticket.</p>`;

  return `
    <section class="report-section-card">
      <div class="report-section-header">
        <div>
          <h2>Reporter Escalations to Admin</h2>
          <p class="panel-helper">If the reporter believes a department update is inaccurate, they can flag it here for admin review.</p>
        </div>
      </div>
      <div class="report-list">${reportList}</div>
      ${canReporterEscalate(user, ticket) ? `
        <div class="report-form-wrap">
          ${renderFlash(message, type)}
          ${hasDepartmentProgress(updates) ? `
            <form action="/tickets/${ticket.id}/reports" method="POST" class="report-form">
              <textarea name="message" placeholder="Explain which department update looks incorrect and why."></textarea>
              <label class="upload-label compact-upload-label">
                <span>Attach Image Evidence</span>
                <input type="file" accept="image/*" class="hidden-file-input" data-upload-input>
                <input type="hidden" name="imageData" value="" data-upload-hidden>
                <div class="upload-zone compact-upload-zone" data-upload-zone>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 7h-3.2l-1.6-2H9.8L8.2 7H5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Zm-7 9a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-6.2A2.2 2.2 0 1 0 12 14a2.2 2.2 0 0 0 0-4.2Z"/></svg>
                  <strong data-upload-label>Upload Evidence Photo</strong>
                  <p>Show why the resolution or update is incorrect.</p>
                  <div class="upload-preview" data-upload-preview></div>
                </div>
              </label>
              <div class="report-form-actions">
                <button class="primary-button compact" type="submit">Report to Admin</button>
              </div>
            </form>
          ` : `<p class="panel-helper">This option becomes available once the assigned department has posted a progress update.</p>`}
        </div>
      ` : ""}
    </section>
  `;
}

function renderResolvedTicketSection(user, ticket, feedback, message = "", type = "error") {
  const feedbackMarkup = feedback
    ? `
      <div class="feedback-summary">
        <strong>Reporter Rating: ${escapeHtml(String(feedback.rating))}/5</strong>
        <span>${escapeHtml(formatRelative(feedback.created_at))}</span>
        <p>${escapeHtml(feedback.comment || "No written feedback provided.")}</p>
      </div>
    `
    : '<p class="panel-helper">No satisfaction feedback has been submitted for this resolved ticket yet.</p>';

  return `
    <section class="report-section-card">
      <div class="report-section-header">
        <div>
          <h2>Resolved Ticket Actions</h2>
          <p class="panel-helper">Once a ticket is marked resolved, the original reporter can rate the resolution or request a reopen if the issue is still not fixed.</p>
        </div>
      </div>
      ${feedbackMarkup}
      ${canReporterManageResolvedTicket(user, ticket) ? `
        <div class="resolved-actions-grid">
          <form action="/tickets/${ticket.id}/feedback" method="POST" class="report-form">
            ${renderFlash(message, type)}
            <label>
              <span class="form-inline-label">Satisfaction Rating</span>
              <select name="rating" required>
                <option value="">Select rating</option>
                <option value="5">5 - Excellent</option>
                <option value="4">4 - Good</option>
                <option value="3">3 - Acceptable</option>
                <option value="2">2 - Poor</option>
                <option value="1">1 - Very Poor</option>
              </select>
            </label>
            <textarea name="comment" placeholder="Share how well the issue was resolved."></textarea>
            <div class="report-form-actions">
              <button class="primary-button compact" type="submit">Submit Feedback</button>
            </div>
          </form>
          <form action="/tickets/${ticket.id}/reopen" method="POST" class="report-form">
            <label>
              <span class="form-inline-label">Request Reopen</span>
            </label>
            <textarea name="reason" placeholder="Explain why this resolved ticket should be reopened." required></textarea>
            <div class="report-form-actions">
              <button class="ghost-button compact" type="submit">Reopen Ticket</button>
            </div>
          </form>
        </div>
      ` : ""}
    </section>
  `;
}

function renderDeleteTicketSection(user, ticket) {
  if (!canReporterDeleteTicket(user, ticket)) {
    return "";
  }

  return `
    <section class="report-section-card">
      <div class="report-section-header">
        <div>
          <h2>Delete Ticket</h2>
          <p class="panel-helper">This permanently removes the ticket, its timeline updates, escalation reports, and feedback records.</p>
        </div>
      </div>
      <form action="/tickets/${ticket.id}/delete" method="POST" class="report-form" onsubmit="return confirm('Delete this ticket permanently? This action cannot be undone.');">
        <div class="report-form-actions">
          <button class="ghost-button compact" type="submit">Delete Ticket</button>
        </div>
      </form>
    </section>
  `;
}

function renderTicketDetailPage(user, ticket, updates, reports, feedback, controlMessage = "", controlType = "error", reportMessage = "", reportType = "error", resolvedMessage = "", resolvedType = "success") {
  return renderAppShell({
    title: `FixMyCampus | ${ticket.title}`,
    user,
    currentNav: "tickets",
    filters: { query: "", categories: [], statuses: [], priorities: [] },
    searchValue: "",
    currentPath: `/tickets/${ticket.id}`,
    content: `
      <div class="detail-page">
        <section class="detail-summary-card">
          <div>
            <span class="detail-ticket-id">Ticket #${escapeHtml(ticket.code)}</span>
            <h1>${escapeHtml(ticket.title)}</h1>
            <p>Category: ${escapeHtml(ticket.category)} <span>Priority: ${escapeHtml(priorityLabel(ticket.priority || "medium"))}</span> <span>Location: ${escapeHtml(ticket.location)}</span> <span>Assigned: ${escapeHtml(assignmentLabel(ticket))}</span> <span>Reported: ${escapeHtml(formatRelative(ticket.created_at))}</span></p>
            ${renderReporterIdentityLine(user, ticket)}
          </div>
          <div class="status-pill status-${escapeHtml(ticket.status)}">${escapeHtml(statusLabel(ticket.status).toUpperCase())}</div>
        </section>

        <section class="detail-issue-card">
          <h2>Issue Description</h2>
          <p>${escapeHtml(ticket.description)}</p>
          <div class="detail-media-row">${renderTicketImage(ticket, true)}</div>
          <button class="mini-avatar" type="button" aria-label="Ticket owner">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4 0-7 2-7 4.5V20h14v-1.5C19 16 16 14 12 14Z"/></svg>
          </button>
        </section>

        <section class="detail-bottom-grid">
          <div class="detail-timeline-column">
            <h2>Ticket Activity Timeline</h2>
            <div class="timeline">
              ${updates.map((update) => `
                <article class="timeline-card ${update.author_role === "student" ? "marker-card" : ""}">
                  ${update.author_role === "student" ? `
                    <button class="mini-avatar" type="button" aria-label="Reporter">
                      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm0 2c-4 0-7 2-7 4.5V20h14v-1.5C19 16 16 14 12 14Z"/></svg>
                    </button>
                ` : ""}
                <div class="${update.author_role === "student" ? "timeline-card-body" : ""}">
                  <span>${escapeHtml(formatRelative(update.created_at))}</span>
                  <strong>${escapeHtml(update.message)}</strong>
                  ${renderEvidenceImage(update.image_data, `${update.author_name} evidence for ticket ${ticket.code}`)}
                </div>
              </article>
            `).join("")}
          </div>
          </div>

          <div class="detail-side-column">
            ${renderTicketControlPanel(user, ticket, controlMessage, controlType)}
          </div>
        </section>

        ${renderReporterEscalationSection(user, ticket, updates, reports, reportMessage, reportType)}
        ${ticket.status === "resolved" ? renderResolvedTicketSection(user, ticket, feedback, resolvedMessage, resolvedType) : ""}
        ${renderDeleteTicketSection(user, ticket)}
      </div>
    `
  });
}

function parseRequestBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        reject(new Error("Payload too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on("end", () => {
      const rawBody = Buffer.concat(chunks).toString("utf8");
      const params = new URLSearchParams(rawBody);
      const data = {};
      for (const [key, value] of params.entries()) {
        if (key in data) {
          const current = data[key];
          data[key] = Array.isArray(current) ? [...current, value] : [current, value];
        } else {
          data[key] = value;
        }
      }
      resolve(data);
    });

    request.on("error", reject);
  });
}

function redirect(response, location, cookies = []) {
  const headers = { Location: location };
  if (cookies.length > 0) {
    headers["Set-Cookie"] = cookies;
  }
  response.writeHead(302, headers);
  response.end();
}

function setSessionCookie(sessionId) {
  return `${SESSION_COOKIE}=${encodeURIComponent(sessionId)}; HttpOnly; Path=/; SameSite=Lax`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`;
}

function sendHtml(response, html, statusCode = 200, headers = {}) {
  response.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    ...headers
  });
  response.end(html);
}

function sendText(response, body, statusCode, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, { "Content-Type": contentType });
  response.end(body);
}

function serveStaticFile(response, filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    sendText(response, "Not found", 404);
    return;
  }

  const ext = path.extname(filePath);
  const contentType = ext === ".css"
    ? "text/css; charset=utf-8"
    : ext === ".js"
      ? "application/javascript; charset=utf-8"
      : "application/octet-stream";

  response.writeHead(200, { "Content-Type": contentType });
  fs.createReadStream(filePath).pipe(response);
}

async function handleRequest(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`);
  const pathname = url.pathname;
  const user = getSessionUser(request);
  const cookies = parseCookies(request.headers.cookie);

  if (pathname === "/favicon.ico") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (pathname.startsWith("/css/")) {
    serveStaticFile(response, path.join(ROOT, pathname.replace(/^\/+/, "")));
    return;
  }

  if (pathname === "/app-extra.css") {
    serveStaticFile(response, path.join(ROOT, "app-extra.css"));
    return;
  }

  if (pathname === "/js/app.js") {
    serveStaticFile(response, path.join(ROOT, "public", "js", "app.js"));
    return;
  }

  if (pathname === "/health") {
    sendText(response, JSON.stringify({ ok: true }), 200, "application/json; charset=utf-8");
    return;
  }

  if (request.method === "GET" && pathname === "/") {
    if (user) {
      redirect(response, "/tickets");
      return;
    }
    sendHtml(response, renderLoginPage());
    return;
  }

  if (request.method === "POST" && pathname === "/login") {
    const form = await parseRequestBody(request);
    const submittedEmail = String(form.email || "").trim().toLowerCase();
    const foundUser = getUserByEmail(submittedEmail);

    if (!foundUser || !verifyPassword(form.password || "", foundUser.password_hash)) {
      sendHtml(response, renderLoginPage("Invalid email or password.", "error", { email: submittedEmail }), 401);
      return;
    }

    if (foundUser.role === "student" || foundUser.role === "faculty") {
      if (!isLegacyDemoEmail(submittedEmail)) {
        const emailValidation = validateRoleBasedUniversityEmail(submittedEmail, foundUser.role);
        if (!emailValidation.ok) {
          sendHtml(response, renderLoginPage(emailValidation.message, "error", { email: submittedEmail }), 403);
          return;
        }
      }
    }

    if (!foundUser.email_verified) {
      sendHtml(
        response,
        renderLoginPage("Please verify your email before signing in.", "error", { email: submittedEmail }),
        403
      );
      return;
    }

    const sessionId = createSession(foundUser.id);
    redirect(response, "/tickets", [setSessionCookie(sessionId)]);
    return;
  }

  if (request.method === "GET" && pathname === "/signup") {
    if (user) {
      redirect(response, "/tickets");
      return;
    }
    sendHtml(response, renderSignupPage());
    return;
  }

  if (request.method === "GET" && pathname === "/university-sso") {
    redirect(response, "/");
    return;
  }

  if (request.method === "POST" && pathname === "/university-sso") {
    redirect(response, "/");
    return;
  }

  if (request.method === "GET" && pathname === "/university-sso/complete") {
    redirect(response, "/");
    return;
  }

  if (request.method === "GET" && pathname === "/auth/microsoft/start") {
    redirect(response, "/");
    return;
  }

  if (request.method === "GET" && pathname === MICROSOFT_CALLBACK_PATH) {
    redirect(response, "/");
    return;
  }

  if (request.method === "POST" && pathname === "/signup") {
    const form = await parseRequestBody(request);
    const fullName = String(form.fullName || "").trim();
    const department = String(form.department || "").trim();
    const accountRole = String(form.accountRole || "student").trim();
    const email = String(form.email || "").trim().toLowerCase();
    const password = String(form.password || "");
    const confirmPassword = String(form.confirmPassword || "");

    if (!fullName || !department || !email || !password) {
      sendHtml(response, renderSignupPage("All fields are required.", form), 400);
      return;
    }

    if (password.length < 8) {
      sendHtml(response, renderSignupPage("Password must be at least 8 characters long.", form), 400);
      return;
    }

    if (password !== confirmPassword) {
      sendHtml(response, renderSignupPage("Passwords do not match.", form), 400);
      return;
    }

    if (getUserByEmail(email)) {
      sendHtml(response, renderSignupPage("An account with that email already exists.", form), 409);
      return;
    }

    if (!["student", "faculty"].includes(accountRole)) {
      sendHtml(response, renderSignupPage("Please choose a valid account type.", form), 400);
      return;
    }

    const emailValidation = validateRoleBasedUniversityEmail(email, accountRole);
    if (!emailValidation.ok) {
      sendHtml(response, renderSignupPage(emailValidation.message, form), 400);
      return;
    }

    const newUserId = createUser({
      fullName,
      email,
      password,
      role: accountRole,
      department
    });
    const verificationToken = issueEmailVerificationForUser(newUserId);
    const verificationLink = buildAbsoluteUrl(request, `/verify-email?token=${verificationToken}`);
    sendHtml(response, renderVerificationSentPage(email, verificationLink), 201);
    return;
  }

  if (request.method === "GET" && pathname === "/resend-verification") {
    if (user) {
      redirect(response, "/tickets");
      return;
    }
    sendHtml(response, renderResendVerificationPage());
    return;
  }

  if (request.method === "POST" && pathname === "/resend-verification") {
    const form = await parseRequestBody(request);
    const email = String(form.email || "").trim().toLowerCase();
    if (!email) {
      sendHtml(response, renderResendVerificationPage("University email is required.", "error", { email }), 400);
      return;
    }

    const foundUser = getUserByEmail(email);
    if (!foundUser) {
      sendHtml(
        response,
        renderResendVerificationPage(
          "If that account exists, you can safely try signing in or submit this form again after checking the address.",
          "success",
          { email }
        ),
        200
      );
      return;
    }

    if (foundUser.email_verified) {
      sendHtml(response, renderResendVerificationPage("That email is already verified. You can sign in.", "success", { email }), 200);
      return;
    }

    const verificationToken = issueEmailVerificationForUser(foundUser.id);
    const verificationLink = buildAbsoluteUrl(request, `/verify-email?token=${verificationToken}`);
    sendHtml(response, renderVerificationSentPage(email, verificationLink));
    return;
  }

  if (request.method === "GET" && pathname === "/verify-email") {
    const token = String(url.searchParams.get("token") || "").trim();
    const foundUser = getUserByEmailVerificationToken(token);

    if (!foundUser || !isTokenValid(foundUser.email_verification_sent_at, EMAIL_VERIFICATION_TTL_MS)) {
      sendHtml(
        response,
        renderResendVerificationPage("That verification link is invalid or has expired. Request a new one.", "error"),
        400
      );
      return;
    }

    verifyUserEmail(foundUser.id);
    sendHtml(response, renderEmailVerifiedPage());
    return;
  }

  if (request.method === "GET" && pathname === "/forgot-password") {
    if (user) {
      redirect(response, "/tickets");
      return;
    }
    sendHtml(response, renderForgotPasswordPage());
    return;
  }

  if (request.method === "POST" && pathname === "/forgot-password") {
    const form = await parseRequestBody(request);
    const email = String(form.email || "").trim().toLowerCase();
    if (!email) {
      sendHtml(response, renderForgotPasswordPage("University email is required.", "error", { email }), 400);
      return;
    }

    const foundUser = getUserByEmail(email);
    const token = foundUser ? issuePasswordResetForUser(foundUser.id) : generateToken();
    const resetLink = buildAbsoluteUrl(request, `/reset-password?token=${token}`);
    sendHtml(response, renderPasswordResetSentPage(email, resetLink));
    return;
  }

  if (request.method === "GET" && pathname === "/reset-password") {
    const token = String(url.searchParams.get("token") || "").trim();
    const foundUser = getUserByPasswordResetToken(token);

    if (!foundUser || !isTokenValid(foundUser.password_reset_sent_at, PASSWORD_RESET_TTL_MS)) {
      sendHtml(response, renderForgotPasswordPage("That password reset link is invalid or has expired.", "error"), 400);
      return;
    }

    sendHtml(response, renderResetPasswordPage(token));
    return;
  }

  if (request.method === "POST" && pathname === "/reset-password") {
    const form = await parseRequestBody(request);
    const token = String(form.token || "").trim();
    const password = String(form.password || "");
    const confirmPassword = String(form.confirmPassword || "");
    const foundUser = getUserByPasswordResetToken(token);

    if (!foundUser || !isTokenValid(foundUser.password_reset_sent_at, PASSWORD_RESET_TTL_MS)) {
      sendHtml(response, renderForgotPasswordPage("That password reset link is invalid or has expired.", "error"), 400);
      return;
    }

    if (password.length < 8) {
      sendHtml(response, renderResetPasswordPage(token, "Password must be at least 8 characters long.", "error"), 400);
      return;
    }

    if (password !== confirmPassword) {
      sendHtml(response, renderResetPasswordPage(token, "Passwords do not match.", "error"), 400);
      return;
    }

    db.prepare(`
      UPDATE users
      SET password_hash = ?
      WHERE id = ?
    `).run(hashPassword(password), foundUser.id);
    clearPasswordResetForUser(foundUser.id);
    clearSsoLoginForUser(foundUser.id);
    deleteSessionsForUser(foundUser.id);

    sendHtml(response, renderLoginPage("Password updated successfully. You can sign in now.", "success", { email: foundUser.email }));
    return;
  }

  if (request.method === "POST" && pathname === "/logout") {
    const sessionId = cookies[SESSION_COOKIE];
    if (sessionId) {
      deleteSession(sessionId);
    }
    redirect(response, "/", [clearSessionCookie()]);
    return;
  }

  if (!user) {
    redirect(response, "/");
    return;
  }

  if (request.method === "GET" && pathname === "/tickets") {
    const filters = parseFilters(url.searchParams);
    const tickets = getTickets(user, filters);
    const stats = getTicketStats(user);
    const communityTickets = canCreateTicket(user) ? getCommunityComplaintFeed(user, 10) : [];
    const supportAdded = url.searchParams.get("supportAdded") === "1";
    const deleted = url.searchParams.get("deleted") === "1";
    const pageMessages = [];
    if (supportAdded) {
      pageMessages.push("You have been marked as affected on the existing complaint.");
    }
    if (deleted) {
      pageMessages.push("Your ticket was deleted successfully.");
    }
    const pageMessage = pageMessages.join(" ");
    sendHtml(response, renderTicketsPage(user, tickets, stats, filters, communityTickets, pageMessage, "success"));
    return;
  }

  if (request.method === "GET" && pathname === "/notifications") {
    sendHtml(response, renderNotificationsPage(user, getNotificationsForUser(user.id, 100)));
    return;
  }

  if (request.method === "POST" && pathname === "/support/messages") {
    const form = await parseRequestBody(request);
    const conversationId = Number(form.conversationId || 0);
    const message = String(form.message || "").trim();
    const imageData = String(form.imageData || "").trim();
    const supportTopic = SUPPORT_TOPIC_OPTIONS.includes(String(form.supportTopic || "").trim())
      ? String(form.supportTopic || "").trim()
      : "general_help";
    const linkedTicketId = Number(form.linkedTicketId || 0);
    const returnTo = String(form.returnTo || "/tickets").startsWith("/") ? String(form.returnTo || "/tickets") : "/tickets";
    const hashTarget = String(form.hashTarget || "#support-chat").startsWith("#") ? String(form.hashTarget || "#support-chat") : "#support-chat";

    if (imageData && !imageData.startsWith("data:image/")) {
      sendText(response, "Uploaded support image format is invalid.", 400);
      return;
    }

    const conversation = getSupportConversationById(conversationId);
    if (!conversation) {
      sendText(response, "Support conversation not found.", 404);
      return;
    }

    const canAccessConversation = user.role === "admin"
      ? true
      : Number(conversation.requester_user_id) === Number(user.id);

    if (!canAccessConversation) {
      sendText(response, "You cannot post to this support conversation.", 403);
      return;
    }

    let nextLinkedTicketId = Number(conversation.linked_ticket_id || 0);
    let contextChanged = false;
    if (user.role !== "admin") {
      nextLinkedTicketId = 0;
      if (linkedTicketId > 0) {
        const linkedTicket = getTicketById(linkedTicketId);
        if (!linkedTicket || !userCanAccessTicket(user, linkedTicket)) {
          sendText(response, "You cannot link that ticket to support.", 403);
          return;
        }
        nextLinkedTicketId = linkedTicketId;
      }

      if ((conversation.topic || "general_help") !== supportTopic || Number(conversation.linked_ticket_id || 0) !== nextLinkedTicketId) {
        updateSupportConversationContext(conversationId, {
          topic: supportTopic,
          linkedTicketId: nextLinkedTicketId || null,
          updatedAt: new Date().toISOString()
        });
        contextChanged = true;
      }
    }

    if (!message && !imageData) {
      if (contextChanged) {
        redirect(response, `${returnTo}${hashTarget}`);
        return;
      }
      redirect(response, `${returnTo}${hashTarget}`);
      return;
    }

    addSupportMessage({
      conversationId,
      senderUserId: user.id,
      senderRole: user.role,
      message,
      imageData,
      createdAt: new Date().toISOString()
    });

    redirect(response, `${returnTo}${hashTarget}`);
    return;
  }

  const supportStatusMatch = pathname.match(/^\/support\/conversations\/(\d+)\/status$/);
  if (request.method === "POST" && supportStatusMatch) {
    if (user.role !== "admin") {
      sendText(response, "Only admin can update support conversation status.", 403);
      return;
    }

    const conversationId = Number(supportStatusMatch[1]);
    const conversation = getSupportConversationById(conversationId);
    if (!conversation) {
      sendText(response, "Support conversation not found.", 404);
      return;
    }

    const form = await parseRequestBody(request);
    const status = String(form.status || "").trim();
    const returnTo = String(form.returnTo || "/tickets").startsWith("/") ? String(form.returnTo || "/tickets") : "/tickets";
    const hashTarget = String(form.hashTarget || `#support-chat-${conversationId}`).startsWith("#") ? String(form.hashTarget || `#support-chat-${conversationId}`) : `#support-chat-${conversationId}`;

    if (!SUPPORT_STATUS_OPTIONS.includes(status)) {
      sendText(response, "Support status is invalid.", 400);
      return;
    }

    updateSupportConversationStatus(conversationId, status, new Date().toISOString());
    redirect(response, `${returnTo}${hashTarget}`);
    return;
  }

  const supportReadMatch = pathname.match(/^\/support\/conversations\/(\d+)\/read$/);
  if (request.method === "POST" && supportReadMatch) {
    const conversationId = Number(supportReadMatch[1]);
    const conversation = getSupportConversationById(conversationId);
    if (!conversation) {
      sendText(response, JSON.stringify({ ok: false }), 404, "application/json; charset=utf-8");
      return;
    }

    const canAccessConversation = user.role === "admin"
      ? true
      : Number(conversation.requester_user_id) === Number(user.id);

    if (!canAccessConversation) {
      sendText(response, JSON.stringify({ ok: false }), 403, "application/json; charset=utf-8");
      return;
    }

    markSupportConversationRead(conversationId, user.role);
    sendText(response, JSON.stringify({ ok: true }), 200, "application/json; charset=utf-8");
    return;
  }

  const openNotificationMatch = pathname.match(/^\/notifications\/(\d+)\/open$/);
  if (request.method === "GET" && openNotificationMatch) {
    const notificationId = Number(openNotificationMatch[1]);
    const notification = getNotificationById(notificationId);
    if (!notification || Number(notification.user_id) !== Number(user.id)) {
      sendText(response, "Notification not found", 404);
      return;
    }

    markNotificationRead(notificationId, user.id);
    redirect(response, `/tickets/${notification.ticket_id}`);
    return;
  }

  if (request.method === "GET" && pathname === "/profile") {
    const isEditMode = url.searchParams.get("edit") === "1";
    const currentUser = getUserById(user.id);
    const profileUser = {
      ...user,
      fullName: currentUser?.full_name || user.fullName,
      email: currentUser?.email || user.email,
      department: currentUser?.department || user.department,
      emailVerified: Boolean(currentUser?.email_verified),
      studentId: currentUser?.student_id || "",
      facultyId: currentUser?.faculty_id || "",
      phone: currentUser?.phone || "",
      alternateEmail: currentUser?.alternate_email || "",
      campusAddress: currentUser?.campus_address || "",
      bio: currentUser?.bio || "",
      profileImageData: currentUser?.profile_image_data || user.profileImageData || ""
    };
    sendHtml(response, renderProfilePage(profileUser, {}, "", "success", { isEditMode }));
    return;
  }

  if (request.method === "POST" && pathname === "/profile") {
    const form = await parseRequestBody(request);
    const values = {
      fullName: String(form.fullName || "").trim(),
      department: String(form.department || "").trim(),
      email: String(form.email || "").trim().toLowerCase(),
      studentId: String(form.studentId || "").trim(),
      facultyId: String(form.facultyId || "").trim(),
      phone: String(form.phone || "").trim(),
      alternateEmail: String(form.alternateEmail || "").trim(),
      campusAddress: String(form.campusAddress || "").trim(),
      bio: String(form.bio || "").trim(),
      profileImageData: String(form.profileImageData || "").trim()
    };

    const profileUser = {
      ...user,
      ...values
    };

    if (!values.fullName || !values.department || !values.email) {
      sendHtml(response, renderProfilePage(profileUser, values, "Full name, department, and primary email are required.", "error", { isEditMode: true }), 400);
      return;
    }

    const emailOwner = getUserByEmail(values.email);
    if (emailOwner && Number(emailOwner.id) !== Number(user.id)) {
      sendHtml(response, renderProfilePage(profileUser, values, "That primary email is already used by another account.", "error", { isEditMode: true }), 409);
      return;
    }

    if (values.alternateEmail) {
      const altEmailOwner = getUserByEmail(values.alternateEmail);
      if (altEmailOwner && Number(altEmailOwner.id) !== Number(user.id)) {
        sendHtml(response, renderProfilePage(profileUser, values, "That alternate email is already used by another account.", "error", { isEditMode: true }), 409);
        return;
      }
    }

    if (values.profileImageData && !values.profileImageData.startsWith("data:image/")) {
      sendHtml(response, renderProfilePage(profileUser, values, "Uploaded profile image format is invalid.", "error", { isEditMode: true }), 400);
      return;
    }

    if (user.role === "student" && values.studentId) {
      const studentIdFormat = getStudentIdFormatForDepartment(values.department);
      if (studentIdFormat && !studentIdFormat.pattern.test(values.studentId)) {
        sendHtml(
          response,
          renderProfilePage(
            profileUser,
            values,
            `Student ID format is invalid for ${studentIdFormat.course}. Use a value like ${studentIdFormat.example}.`,
            "error",
            { isEditMode: true }
          ),
          400
        );
        return;
      }
    }

    const currentUser = getUserById(user.id);
    const emailChanged = String(currentUser?.email || "").toLowerCase() !== values.email;
    let profileMessage = "Profile updated successfully.";
    let profileMessageType = "success";
    let nextEmailVerified = Boolean(currentUser?.email_verified);

    db.prepare(`
      UPDATE users
      SET full_name = ?, email = ?, department = ?, student_id = ?, faculty_id = ?, phone = ?, alternate_email = ?, campus_address = ?, bio = ?, profile_image_data = ?,
          email_verified = CASE WHEN ? THEN 0 ELSE email_verified END,
          email_verification_token = CASE WHEN ? THEN NULL ELSE email_verification_token END,
          email_verification_sent_at = CASE WHEN ? THEN NULL ELSE email_verification_sent_at END
      WHERE id = ?
    `).run(
      values.fullName,
      values.email,
      values.department,
      values.studentId || null,
      values.facultyId || null,
      values.phone || null,
      values.alternateEmail || null,
      values.campusAddress || null,
      values.bio || null,
      values.profileImageData || null,
      emailChanged ? 1 : 0,
      emailChanged ? 1 : 0,
      emailChanged ? 1 : 0,
      user.id
    );

    if (emailChanged) {
      const verificationToken = issueEmailVerificationForUser(user.id);
      const verificationLink = buildAbsoluteUrl(request, `/verify-email?token=${verificationToken}`);
      profileMessage = `Primary email changed. Verify it here: ${verificationLink}`;
      profileMessageType = "error";
      nextEmailVerified = false;
      deleteSessionsForUser(user.id);
      const sessionId = cookies[SESSION_COOKIE];
      if (sessionId) {
        db.prepare(`
          INSERT INTO sessions (id, user_id, created_at)
          VALUES (?, ?, ?)
        `).run(sessionId, user.id, new Date().toISOString());
      }
    }

    const updatedUser = {
      ...user,
      fullName: values.fullName,
      email: values.email,
      department: values.department,
      emailVerified: nextEmailVerified,
      studentId: values.studentId,
      facultyId: values.facultyId,
      phone: values.phone,
      alternateEmail: values.alternateEmail,
      campusAddress: values.campusAddress,
      bio: values.bio,
      profileImageData: values.profileImageData
    };

    sendHtml(response, renderProfilePage(updatedUser, {}, profileMessage, profileMessageType, { isEditMode: false }));
    return;
  }

  if (request.method === "GET" && pathname === "/tickets/new") {
    if (!canCreateTicket(user)) {
      sendText(response, "Only student and faculty accounts can create tickets.", 403);
      return;
    }
    const communityTickets = getCommunityComplaintFeed(user, 8);
    const supportAdded = url.searchParams.get("supportAdded") === "1";
    const pageMessage = supportAdded ? "You have been added as affected on an existing complaint." : "";
    const pageMessageType = supportAdded ? "success" : "error";
    sendHtml(response, renderCreateTicketPage(user, {}, pageMessage, pageMessageType, communityTickets));
    return;
  }

  if (request.method === "POST" && pathname === "/tickets") {
    if (!canCreateTicket(user)) {
      sendText(response, "Only student and faculty accounts can create tickets.", 403);
      return;
    }

    const form = await parseRequestBody(request);
    const values = {
      title: String(form.title || "").trim(),
      category: String(form.category || "").trim(),
      priority: String(form.priority || "medium").trim(),
      location: String(form.location || "").trim(),
      description: String(form.description || "").trim(),
      imageData: String(form.imageData || "").trim()
    };
    const forceCreate = String(form.forceCreate || "").trim() === "1";
    const communityTickets = getCommunityComplaintFeed(user, 8);

    if (!values.title || !values.category || !values.location || !values.description) {
      sendHtml(response, renderCreateTicketPage(user, values, "Title, category, location, and description are required.", "error", communityTickets), 400);
      return;
    }

    if (!CATEGORY_OPTIONS.includes(values.category)) {
      sendHtml(response, renderCreateTicketPage(user, values, "Please select a valid category.", "error", communityTickets), 400);
      return;
    }

    if (!PRIORITY_OPTIONS.includes(values.priority)) {
      sendHtml(response, renderCreateTicketPage(user, values, "Please select a valid priority.", "error", communityTickets), 400);
      return;
    }

    if (values.imageData && !values.imageData.startsWith("data:image/")) {
      sendHtml(response, renderCreateTicketPage(user, values, "Uploaded image format is invalid.", "error", communityTickets), 400);
      return;
    }

    const duplicateMatches = findPotentialDuplicateTickets(values, 5);
    const hasExactDuplicate = duplicateMatches.some((match) => match.isExact);
    if (hasExactDuplicate) {
      sendHtml(response, renderDuplicateMatchPage(user, values, duplicateMatches, communityTickets, true), 409);
      return;
    }

    if (duplicateMatches.length > 0 && !forceCreate) {
      sendHtml(response, renderDuplicateMatchPage(user, values, duplicateMatches, communityTickets, false), 409);
      return;
    }

    const now = new Date().toISOString();
    const ticketId = createTicket({
      title: values.title,
      category: values.category,
      priority: values.priority,
      location: values.location,
      description: values.description,
      status: "open",
      ownerUserId: user.id,
      assignedDepartment: null,
      assignedByUserId: null,
      imageData: values.imageData || null,
      createdAt: now,
      updatedAt: now
    });

    addTicketUpdate({
      ticketId,
      authorUserId: user.id,
      message: `Reported by ${roleLabel(user.role)}`,
      status: "open",
      createdAt: now
    });

    redirect(response, `/tickets/${ticketId}`);
    return;
  }

  const supportMatch = pathname.match(/^\/tickets\/(\d+)\/support$/);
  if (request.method === "POST" && supportMatch) {
    if (!canCreateTicket(user)) {
      sendText(response, "Only student and faculty accounts can support tickets.", 403);
      return;
    }

    const ticketId = Number(supportMatch[1]);
    const ticket = getActiveTicketForSupport(ticketId);
    if (!ticket) {
      sendText(response, "That complaint is not available for support.", 404);
      return;
    }

    const form = await parseRequestBody(request);
    const requestedReturnTo = String(form.returnTo || "/tickets/new").trim();
    const safeReturnTo = requestedReturnTo.startsWith("/") ? requestedReturnTo : "/tickets/new";
    const alreadyHasSupportParam = /(?:\?|&)supportAdded=1(?:&|$)/.test(safeReturnTo);
    const redirectTarget = alreadyHasSupportParam
      ? safeReturnTo
      : `${safeReturnTo}${safeReturnTo.includes("?") ? "&" : "?"}supportAdded=1`;

    addTicketSupporter(ticketId, user.id, new Date().toISOString());
    redirect(response, redirectTarget);
    return;
  }

  const detailMatch = pathname.match(/^\/tickets\/(\d+)$/);
  if (request.method === "GET" && detailMatch) {
    const ticketId = Number(detailMatch[1]);
    const ticket = getTicketById(ticketId);
    if (!ticket || !userCanAccessTicket(user, ticket)) {
      sendText(response, "Ticket not found", 404);
      return;
    }

    const updates = getTicketUpdates(ticketId);
    const reports = getTicketReports(ticketId);
    const feedback = getTicketFeedback(ticketId);
    sendHtml(response, renderTicketDetailPage(user, ticket, updates, reports, feedback));
    return;
  }

  const assignMatch = pathname.match(/^\/tickets\/(\d+)\/assign$/);
  if (request.method === "POST" && assignMatch) {
    const ticketId = Number(assignMatch[1]);
    const ticket = getTicketById(ticketId);
    if (!ticket || !userCanAccessTicket(user, ticket)) {
      sendText(response, "Ticket not found", 404);
      return;
    }

    if (!canAssignTicket(user)) {
      sendText(response, "Only admin can assign tickets.", 403);
      return;
    }

    const form = await parseRequestBody(request);
    const assignedDepartment = String(form.assignedDepartment || "").trim();
    if (!DEPARTMENT_OPTIONS.includes(assignedDepartment)) {
      const updates = getTicketUpdates(ticketId);
      const reports = getTicketReports(ticketId);
      const feedback = getTicketFeedback(ticketId);
      sendHtml(response, renderTicketDetailPage(user, ticket, updates, reports, feedback, "Please choose a valid department for assignment."), 400);
      return;
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE tickets
      SET assigned_department = ?, assigned_by_user_id = ?, updated_at = ?
      WHERE id = ?
    `).run(assignedDepartment, user.id, now, ticketId);

    addTicketUpdate({
      ticketId,
      authorUserId: user.id,
      message: `Assigned to ${assignedDepartment} by Admin`,
      status: ticket.status,
      createdAt: now
    });

    redirect(response, `/tickets/${ticketId}`);
    return;
  }

  const updateMatch = pathname.match(/^\/tickets\/(\d+)\/updates$/);
  if (request.method === "POST" && updateMatch) {
    const ticketId = Number(updateMatch[1]);
    const ticket = getTicketById(ticketId);
    if (!ticket || !userCanAccessTicket(user, ticket)) {
      sendText(response, "Ticket not found", 404);
      return;
    }

    if (!canDepartmentUpdate(user, ticket)) {
      sendText(response, "Only the assigned department can update this ticket.", 403);
      return;
    }

    const form = await parseRequestBody(request);
    const message = String(form.message || "").trim();
    const nextStatus = String(form.status || "").trim();
    const imageData = String(form.imageData || "").trim();

    if (!message && !nextStatus) {
      const updates = getTicketUpdates(ticketId);
      const reports = getTicketReports(ticketId);
      const feedback = getTicketFeedback(ticketId);
      sendHtml(response, renderTicketDetailPage(user, ticket, updates, reports, feedback, "Add a message or select a new status."), 400);
      return;
    }

    if (nextStatus && !STATUS_OPTIONS.includes(nextStatus)) {
      const updates = getTicketUpdates(ticketId);
      const reports = getTicketReports(ticketId);
      const feedback = getTicketFeedback(ticketId);
      sendHtml(response, renderTicketDetailPage(user, ticket, updates, reports, feedback, "Please choose a valid ticket status."), 400);
      return;
    }

    if (imageData && !imageData.startsWith("data:image/")) {
      const updates = getTicketUpdates(ticketId);
      const reports = getTicketReports(ticketId);
      const feedback = getTicketFeedback(ticketId);
      sendHtml(response, renderTicketDetailPage(user, ticket, updates, reports, feedback, "Uploaded proof image format is invalid."), 400);
      return;
    }

    const appliedStatus = nextStatus || ticket.status;
    const now = new Date().toISOString();

    const updateId = addTicketUpdate({
      ticketId,
      authorUserId: user.id,
      message: message || `Ticket status changed to ${statusLabel(appliedStatus)}`,
      status: appliedStatus,
      imageData,
      createdAt: now
    });

    db.prepare(`
      UPDATE tickets
      SET status = ?, updated_at = ?
      WHERE id = ?
    `).run(appliedStatus, now, ticketId);

    notifyProgressUpdate(ticket, user, updateId, message, appliedStatus, now);

    redirect(response, `/tickets/${ticketId}`);
    return;
  }

  const reportMatch = pathname.match(/^\/tickets\/(\d+)\/reports$/);
  if (request.method === "POST" && reportMatch) {
    const ticketId = Number(reportMatch[1]);
    const ticket = getTicketById(ticketId);
    if (!ticket || !userCanAccessTicket(user, ticket)) {
      sendText(response, "Ticket not found", 404);
      return;
    }

    if (!canReporterEscalate(user, ticket)) {
      sendText(response, "Only the original reporter can flag a false department update.", 403);
      return;
    }

    const updates = getTicketUpdates(ticketId);
    const reports = getTicketReports(ticketId);
    if (!hasDepartmentProgress(updates)) {
      const feedback = getTicketFeedback(ticketId);
      sendHtml(response, renderTicketDetailPage(user, ticket, updates, reports, feedback, "", "error", "A department progress update must exist before you can report it to admin."), 400);
      return;
    }

    const form = await parseRequestBody(request);
    const message = String(form.message || "").trim();
    const imageData = String(form.imageData || "").trim();
    if (!message) {
      const feedback = getTicketFeedback(ticketId);
      sendHtml(response, renderTicketDetailPage(user, ticket, updates, reports, feedback, "", "error", "Please explain why you believe the department update is incorrect."), 400);
      return;
    }

    if (imageData && !imageData.startsWith("data:image/")) {
      const feedback = getTicketFeedback(ticketId);
      sendHtml(response, renderTicketDetailPage(user, ticket, updates, reports, feedback, "", "error", "Uploaded evidence image format is invalid."), 400);
      return;
    }

    addTicketReport({
      ticketId,
      reporterUserId: user.id,
      message,
      imageData,
      createdAt: new Date().toISOString()
    });

    redirect(response, `/tickets/${ticketId}`);
    return;
  }

  const feedbackMatch = pathname.match(/^\/tickets\/(\d+)\/feedback$/);
  if (request.method === "POST" && feedbackMatch) {
    const ticketId = Number(feedbackMatch[1]);
    const ticket = getTicketById(ticketId);
    if (!ticket || !userCanAccessTicket(user, ticket)) {
      sendText(response, "Ticket not found", 404);
      return;
    }

    if (!canReporterManageResolvedTicket(user, ticket)) {
      sendText(response, "Only the original reporter can rate a resolved ticket.", 403);
      return;
    }

    const form = await parseRequestBody(request);
    const rating = Number(form.rating || 0);
    const comment = String(form.comment || "").trim();
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      const updates = getTicketUpdates(ticketId);
      const reports = getTicketReports(ticketId);
      const feedback = getTicketFeedback(ticketId);
      sendHtml(response, renderTicketDetailPage(user, ticket, updates, reports, feedback, "", "error", "", "error", "Please choose a satisfaction rating between 1 and 5.", "error"), 400);
      return;
    }

    upsertTicketFeedback({
      ticketId,
      reporterUserId: user.id,
      rating,
      comment,
      createdAt: new Date().toISOString()
    });

    redirect(response, `/tickets/${ticketId}`);
    return;
  }

  const reopenMatch = pathname.match(/^\/tickets\/(\d+)\/reopen$/);
  if (request.method === "POST" && reopenMatch) {
    const ticketId = Number(reopenMatch[1]);
    const ticket = getTicketById(ticketId);
    if (!ticket || !userCanAccessTicket(user, ticket)) {
      sendText(response, "Ticket not found", 404);
      return;
    }

    if (!canReporterManageResolvedTicket(user, ticket)) {
      sendText(response, "Only the original reporter can reopen a resolved ticket.", 403);
      return;
    }

    const form = await parseRequestBody(request);
    const reason = String(form.reason || "").trim();
    if (!reason) {
      const updates = getTicketUpdates(ticketId);
      const reports = getTicketReports(ticketId);
      const feedback = getTicketFeedback(ticketId);
      sendHtml(response, renderTicketDetailPage(user, ticket, updates, reports, feedback, "", "error", "", "error", "Please explain why the ticket should be reopened.", "error"), 400);
      return;
    }

    const now = new Date().toISOString();
    db.prepare(`
      UPDATE tickets
      SET status = ?, updated_at = ?
      WHERE id = ?
    `).run("open", now, ticketId);

    addTicketUpdate({
      ticketId,
      authorUserId: user.id,
      message: `Reporter requested reopen: ${reason}`,
      status: "open",
      createdAt: now
    });

    redirect(response, `/tickets/${ticketId}`);
    return;
  }

  const deleteMatch = pathname.match(/^\/tickets\/(\d+)\/delete$/);
  if (request.method === "POST" && deleteMatch) {
    const ticketId = Number(deleteMatch[1]);
    const ticket = getTicketById(ticketId);
    if (!ticket || !userCanAccessTicket(user, ticket)) {
      sendText(response, "Ticket not found", 404);
      return;
    }

    if (!canReporterDeleteTicket(user, ticket)) {
      sendText(response, "Only the original reporter can delete this ticket.", 403);
      return;
    }

    const deleted = deleteTicketById(ticketId);
    if (!deleted) {
      sendText(response, "Ticket not found", 404);
      return;
    }

    redirect(response, "/tickets?deleted=1");
    return;
  }

  sendText(response, "Not found", 404);
}

function startServer(port = PORT) {
  return new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      handleRequest(request, response).catch((error) => {
        console.error(error);
        sendText(response, "Internal server error", 500);
      });
    });

    server.listen(port, HOST, () => {
      const address = server.address();
      resolve({
        server,
        port: typeof address === "object" && address ? address.port : port
      });
    });
  });
}

if (require.main === module) {
  startServer().then(({ port }) => {
    console.log(`FixMyCampus running at http://${HOST}:${port}`);
  });
}

module.exports = {
  startServer
};

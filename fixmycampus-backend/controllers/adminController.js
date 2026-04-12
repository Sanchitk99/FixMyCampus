import { validationResult } from "express-validator";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { Ticket, TICKET_STATUSES } from "../models/Ticket.js";
import { Department } from "../models/Department.js";
import { Category } from "../models/Category.js";
import { User } from "../models/User.js";
import { notifyUser } from "../utils/notifications.js";

const ticketPopulate = [
  { path: "category", select: "name isOther" },
  { path: "department", select: "name code" },
  { path: "student", select: "name email" },
  { path: "assignedStaff", select: "name email" },
];

export const listStaffByDepartment = async (req, res) => {
  const { departmentId } = req.query;
  if (!departmentId || !mongoose.Types.ObjectId.isValid(departmentId)) {
    return res.status(400).json({ message: "departmentId query required" });
  }
  const list = await User.find({ role: "staff", department: departmentId })
    .select("name email")
    .sort({ name: 1 });
  res.json(list);
};

export const listAllTickets = async (req, res) => {
  const { status } = req.query;
  const query = {};
  if (status) {
    if (!TICKET_STATUSES.includes(status)) {
      return res.status(400).json({ message: "Invalid ticket status filter" });
    }
    query.status = status;
  }
  const tickets = await Ticket.find(query)
    .sort({ updatedAt: -1 })
    .populate(ticketPopulate);
  res.json(tickets);
};

export const reassignTicket = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid ticket id" });
  }
  const { departmentId, assignedStaffId } = req.body;
  if (!mongoose.Types.ObjectId.isValid(departmentId)) {
    return res.status(400).json({ message: "Invalid department" });
  }
  const dept = await Department.findById(departmentId);
  if (!dept) {
    return res.status(404).json({ message: "Department not found" });
  }
  const ticket = await Ticket.findById(id);
  if (!ticket) {
    return res.status(404).json({ message: "Ticket not found" });
  }
  ticket.department = departmentId;
  if (assignedStaffId) {
    if (!mongoose.Types.ObjectId.isValid(assignedStaffId)) {
      return res.status(400).json({ message: "Invalid staff user" });
    }
    const staff = await User.findOne({
      _id: assignedStaffId,
      role: "staff",
      department: departmentId,
    });
    if (!staff) {
      return res.status(400).json({ message: "Staff must belong to the selected department" });
    }
    ticket.assignedStaff = assignedStaffId;
  } else {
    ticket.assignedStaff = null;
  }
  if (ticket.status === "closed") {
    return res.status(400).json({ message: "Cannot reassign a closed ticket" });
  }
  await ticket.save();
  const populated = await Ticket.findById(ticket._id).populate(ticketPopulate);
  if (ticket.assignedStaff) {
    await notifyUser(
      ticket.assignedStaff,
      `Ticket "${ticket.title}" was assigned to you by admin.`,
      ticket._id
    );
  }
  res.json(populated);
};

export const getStats = async (req, res) => {
  const [total, byStatus] = await Promise.all([
    Ticket.countDocuments(),
    Ticket.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);
  const statusMap = Object.fromEntries(byStatus.map((s) => [s._id, s.count]));
  res.json({
    total,
    open: statusMap.open || 0,
    in_progress: statusMap.in_progress || 0,
    awaiting_confirmation: statusMap.awaiting_confirmation || 0,
    closed: statusMap.closed || 0,
    reopened: statusMap.reopened || 0,
  });
};

export const listDepartments = async (req, res) => {
  const list = await Department.find().sort({ name: 1 });
  res.json(list);
};

export const createDepartment = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }
  const { name, code } = req.body;
  const dept = await Department.create({ name, code: code || "" });
  res.status(201).json(dept);
};

export const updateDepartment = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid id" });
  }
  const { name, code } = req.body;
  const dept = await Department.findByIdAndUpdate(
    id,
    { name, code: code ?? undefined },
    { new: true, runValidators: true }
  );
  if (!dept) {
    return res.status(404).json({ message: "Department not found" });
  }
  res.json(dept);
};

export const deleteDepartment = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid id" });
  }
  const inUse = await Category.exists({ department: id });
  if (inUse) {
    return res.status(400).json({ message: "Department has categories; remove them first" });
  }
  const deleted = await Department.findByIdAndDelete(id);
  if (!deleted) {
    return res.status(404).json({ message: "Department not found" });
  }
  res.json({ ok: true });
};

export const listCategories = async (req, res) => {
  const list = await Category.find().populate("department", "name code").sort({ name: 1 });
  res.json(list);
};

export const createCategory = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }
  const { name, departmentId, isOther } = req.body;
  if (!mongoose.Types.ObjectId.isValid(departmentId)) {
    return res.status(400).json({ message: "Invalid department" });
  }
  const dept = await Department.findById(departmentId);
  if (!dept) {
    return res.status(404).json({ message: "Department not found" });
  }
  const cat = await Category.create({
    name,
    department: departmentId,
    isOther: Boolean(isOther),
  });
  const populated = await Category.findById(cat._id).populate("department", "name code");
  res.status(201).json(populated);
};

export const updateCategory = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid id" });
  }
  const { name, departmentId, isOther } = req.body;
  const update = {};
  if (name !== undefined) update.name = name;
  if (isOther !== undefined) update.isOther = Boolean(isOther);
  if (departmentId !== undefined) {
    if (!mongoose.Types.ObjectId.isValid(departmentId)) {
      return res.status(400).json({ message: "Invalid department" });
    }
    const dept = await Department.findById(departmentId);
    if (!dept) {
      return res.status(404).json({ message: "Department not found" });
    }
    update.department = departmentId;
  }
  const cat = await Category.findByIdAndUpdate(id, update, { new: true, runValidators: true }).populate(
    "department",
    "name code"
  );
  if (!cat) {
    return res.status(404).json({ message: "Category not found" });
  }
  res.json(cat);
};

export const deleteCategory = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid id" });
  }
  const inUse = await Ticket.exists({ category: id });
  if (inUse) {
    return res.status(400).json({ message: "Category is used by tickets" });
  }
  const deleted = await Category.findByIdAndDelete(id);
  if (!deleted) {
    return res.status(404).json({ message: "Category not found" });
  }
  res.json({ ok: true });
};

export const listStaffAccounts = async (req, res) => {
  const list = await User.find({ role: "staff" })
    .select("name email department createdAt")
    .populate("department", "name code")
    .sort({ name: 1 });
  res.json(list);
};

export const createStaffUser = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }
  const { name, email, password, departmentId } = req.body;
  if (!mongoose.Types.ObjectId.isValid(departmentId)) {
    return res.status(400).json({ message: "Invalid department" });
  }
  const dept = await Department.findById(departmentId);
  if (!dept) {
    return res.status(404).json({ message: "Department not found" });
  }
  const normalizedEmail = email.toLowerCase().trim();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    return res.status(400).json({ message: "This email is already registered" });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    role: "staff",
    department: departmentId,
  });
  const safe = await User.findById(user._id)
    .select("-passwordHash")
    .populate("department", "name code");
  res.status(201).json(safe);
};

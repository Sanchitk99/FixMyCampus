import { validationResult } from "express-validator";
import mongoose from "mongoose";
import { Category } from "../models/Category.js";
import { Ticket } from "../models/Ticket.js";
import { User } from "../models/User.js";
import { uploadBufferToCloudinary, isCloudinaryConfigured } from "../config/cloudinary.js";
import { notifyUser } from "../utils/notifications.js";

const ticketPopulate = [
  { path: "category", select: "name isOther" },
  { path: "department", select: "name code" },
  { path: "student", select: "name email" },
  { path: "assignedStaff", select: "name email" },
];

export const createTicket = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }
  const { title, description, location, categoryId, otherDetails } = req.body;
  if (!mongoose.Types.ObjectId.isValid(categoryId)) {
    return res.status(400).json({ message: "Invalid category" });
  }
  const category = await Category.findById(categoryId).populate("department");
  if (!category) {
    return res.status(400).json({ message: "Category not found" });
  }
  const otherTrim = (otherDetails || "").trim();
  if (category.isOther) {
    if (otherTrim.length < 10) {
      return res.status(400).json({
        message:
          'Please describe your issue in "Other details" (at least 10 characters) so staff can route it.',
      });
    }
  }
  const images = [];
  if (req.files?.length) {
    if (isCloudinaryConfigured()) {
      for (let i = 0; i < req.files.length; i++) {
        const file = req.files[i];
        const result = await uploadBufferToCloudinary(
          file.buffer,
          "fixmycampus/tickets",
          `ticket_${Date.now()}_${i}`
        );
        images.push(result.secure_url);
      }
    }
    // If Cloudinary is not configured, skip image upload but still save the ticket.
  }
  const ticket = await Ticket.create({
    title,
    description,
    location,
    category: category._id,
    department: category.department._id,
    student: req.user._id,
    status: "open",
    images,
    otherDetails: category.isOther ? otherTrim : "",
  });
  const populated = await Ticket.findById(ticket._id).populate(ticketPopulate);
  res.status(201).json(populated);
};

export const getMyTickets = async (req, res) => {
  const tickets = await Ticket.find({ student: req.user._id })
    .sort({ createdAt: -1 })
    .populate(ticketPopulate);
  res.json(tickets);
};

export const getMyTicketById = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid ticket id" });
  }
  const ticket = await Ticket.findOne({ _id: id, student: req.user._id })
    .populate(ticketPopulate)
    .populate({ path: "progressNotes", populate: { path: "author", select: "name role" } });
  if (!ticket) {
    return res.status(404).json({ message: "Ticket not found" });
  }
  res.json(ticket);
};

export const confirmTicket = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid ticket id" });
  }
  const ticket = await Ticket.findById(id);
  if (!ticket) {
    return res.status(404).json({ message: "Ticket not found" });
  }
  if (ticket.student.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: "Forbidden" });
  }
  if (ticket.status !== "awaiting_confirmation") {
    return res.status(400).json({ message: "Ticket is not awaiting your confirmation" });
  }
  ticket.status = "closed";
  ticket.closedAt = new Date();
  await ticket.save();
  const populated = await Ticket.findById(ticket._id).populate(ticketPopulate);
  if (ticket.assignedStaff) {
    await notifyUser(
      ticket.assignedStaff,
      `Ticket "${ticket.title}" was confirmed closed by the student.`,
      ticket._id
    );
  }
  res.json(populated);
};

export const reopenTicket = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid ticket id" });
  }
  const ticket = await Ticket.findById(id);
  if (!ticket) {
    return res.status(404).json({ message: "Ticket not found" });
  }
  if (ticket.student.toString() !== req.user._id.toString()) {
    return res.status(403).json({ message: "Forbidden" });
  }
  if (ticket.status !== "awaiting_confirmation") {
    return res.status(400).json({ message: "You can only reopen a ticket pending your confirmation" });
  }
  const { reason } = req.body;
  ticket.status = "in_progress";
  ticket.reopenCount = (ticket.reopenCount || 0) + 1;
  ticket.resolutionProofUrl = null;
  ticket.resolutionNote = "";
  ticket.progressNotes.push({
    author: req.user._id,
    body: `Student reopened: ${reason || "Issue not resolved"}`,
  });
  await ticket.save();
  const populated = await Ticket.findById(ticket._id).populate(ticketPopulate);
  const notified = new Set();
  const msg = `Ticket "${ticket.title}" was reopened by the student.`;
  if (ticket.assignedStaff) {
    await notifyUser(ticket.assignedStaff, msg, ticket._id);
    notified.add(ticket.assignedStaff.toString());
  }
  const deptStaff = await User.find({ role: "staff", department: ticket.department });
  for (const u of deptStaff) {
    if (!notified.has(u._id.toString())) {
      await notifyUser(u._id, msg, ticket._id);
    }
  }
  res.json(populated);
};

import { validationResult } from "express-validator";
import mongoose from "mongoose";
import { Ticket } from "../models/Ticket.js";
import { uploadBufferToCloudinary, isCloudinaryConfigured } from "../config/cloudinary.js";
import { notifyUser } from "../utils/notifications.js";

const ticketPopulate = [
  { path: "category", select: "name isOther" },
  { path: "department", select: "name code" },
  { path: "student", select: "name email" },
  { path: "assignedStaff", select: "name email" },
];

const sameDepartment = (ticket, staff) =>
  ticket.department.toString() === staff.department?._id?.toString() ||
  ticket.department.toString() === staff.department?.toString();

export const listStaffTickets = async (req, res) => {
  if (!req.user.department) {
    return res.status(400).json({ message: "Staff account has no department assigned" });
  }
  const tickets = await Ticket.find({ department: req.user.department })
    .sort({ updatedAt: -1 })
    .populate(ticketPopulate);
  res.json(tickets);
};

export const getStaffTicket = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid ticket id" });
  }
  const ticket = await Ticket.findById(id).populate(ticketPopulate);
  if (!ticket) {
    return res.status(404).json({ message: "Ticket not found" });
  }
  if (!sameDepartment(ticket, req.user)) {
    return res.status(403).json({ message: "Forbidden" });
  }
  res.json(ticket);
};

export const updateStaffTicket = async (req, res) => {
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
  if (!sameDepartment(ticket, req.user)) {
    return res.status(403).json({ message: "Forbidden" });
  }
  const { status, progressNote } = req.body;

  if (status) {
    const allowed = ["open", "in_progress"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    if (ticket.status === "awaiting_confirmation" || ticket.status === "closed") {
      return res.status(400).json({ message: "Cannot change status from current state" });
    }
    ticket.status = status;
  }

  if (progressNote?.trim()) {
    ticket.progressNotes.push({
      author: req.user._id,
      body: progressNote.trim(),
    });
    if (ticket.status === "open") {
      ticket.status = "in_progress";
    }
  }

  if (!ticket.assignedStaff) {
    ticket.assignedStaff = req.user._id;
  }

  await ticket.save();
  const populated = await Ticket.findById(ticket._id).populate(ticketPopulate);
  const notifyStudent = Boolean(status || progressNote?.trim());
  if (notifyStudent && ticket.student) {
    const msg = progressNote?.trim()
      ? `Update on "${ticket.title}": ${progressNote.trim().slice(0, 120)}${progressNote.trim().length > 120 ? "…" : ""}`
      : `Your ticket "${ticket.title}" status is now ${ticket.status}.`;
    await notifyUser(ticket.student, msg, ticket._id);
  }
  res.json(populated);
};

export const completeStaffTicket = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: "Invalid ticket id" });
  }
  if (!isCloudinaryConfigured()) {
    return res.status(503).json({ message: "Image upload is not configured" });
  }
  const file = req.file;
  if (!file) {
    return res.status(400).json({ message: "Proof image is required" });
  }
  const ticket = await Ticket.findById(id);
  if (!ticket) {
    return res.status(404).json({ message: "Ticket not found" });
  }
  if (!sameDepartment(ticket, req.user)) {
    return res.status(403).json({ message: "Forbidden" });
  }
  if (ticket.status !== "in_progress" && ticket.status !== "open") {
    return res.status(400).json({ message: "Ticket must be open or in progress to complete" });
  }
  const result = await uploadBufferToCloudinary(
    file.buffer,
    "fixmycampus/resolution",
    `resolution_${id}_${Date.now()}`
  );
  ticket.resolutionProofUrl = result.secure_url;
  ticket.resolutionNote = (req.body.resolutionNote || "").trim();
  ticket.status = "awaiting_confirmation";
  if (!ticket.assignedStaff) {
    ticket.assignedStaff = req.user._id;
  }
  await ticket.save();
  const populated = await Ticket.findById(ticket._id).populate(ticketPopulate);
  await notifyUser(
    ticket.student,
    `Your ticket "${ticket.title}" is ready for your confirmation.`,
    ticket._id
  );
  res.json(populated);
};

import mongoose from "mongoose";

export const TICKET_STATUSES = [
  "open",
  "in_progress",
  "awaiting_confirmation",
  "closed",
  "reopened",
];

const progressNoteSchema = new mongoose.Schema(
  {
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    body: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const ticketSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: true,
    },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    assignedStaff: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    status: {
      type: String,
      enum: TICKET_STATUSES,
      default: "open",
    },
    images: [{ type: String }],
    /** Extra explanation when category is "Other" (e.g. carpenter work). */
    otherDetails: { type: String, default: "", trim: true },
    resolutionProofUrl: { type: String, default: null },
    resolutionNote: { type: String, default: "" },
    progressNotes: [progressNoteSchema],
    reopenCount: { type: Number, default: 0 },
    closedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const Ticket = mongoose.model("Ticket", ticketSchema);

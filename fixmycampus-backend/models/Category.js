import mongoose from "mongoose";

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    /** When true, student must provide extra text (routed by admin from General/Triage). */
    isOther: { type: Boolean, default: false },
    department: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      required: true,
    },
  },
  { timestamps: true }
);

export const Category = mongoose.model("Category", categorySchema);

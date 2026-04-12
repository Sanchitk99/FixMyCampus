import mongoose from "mongoose";

const departmentSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, trim: true, default: "" },
  },
  { timestamps: true }
);

export const Department = mongoose.model("Department", departmentSchema);

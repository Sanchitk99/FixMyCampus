import { loadEnv } from "../config/loadEnv.js";
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectDB, mongoTlsHint } from "../config/db.js";

loadEnv();
import { User } from "../models/User.js";
import { Department } from "../models/Department.js";
import { Category } from "../models/Category.js";

const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@college.edu";
const adminPassword = process.env.SEED_ADMIN_PASSWORD || "admin123";
const staffEmail = process.env.SEED_STAFF_EMAIL || "staff@college.edu";
const staffPassword = process.env.SEED_STAFF_PASSWORD || "staff123";

async function ensureCategory(name, departmentId, isOther = false) {
  let c = await Category.findOne({ name });
  if (!c) {
    c = await Category.create({ name, department: departmentId, isOther });
    console.log("Created category:", name, isOther ? "(Other)" : "");
  } else {
    const update = {};
    if (isOther && !c.isOther) update.isOther = true;
    if (String(c.department) !== String(departmentId)) update.department = departmentId;
    if (Object.keys(update).length) {
      await Category.updateOne({ _id: c._id }, { $set: update });
      console.log("Updated category:", name, update);
    }
  }
}

async function run() {
  // Bypass failing Atlas TLS: npm run seed:local (MongoDB Community must be running on 127.0.0.1:27017)
  if (process.argv.includes("--local")) {
    process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/fixmycampus";
    console.log("[seed] --local → using mongodb://127.0.0.1:27017/fixmycampus\n");
  }
  await connectDB();
  const hash = (p) => bcrypt.hash(p, 10);

  let deptMaintenance = await Department.findOne({ code: "MAINT" });
  if (!deptMaintenance) {
    deptMaintenance = await Department.create({ name: "Maintenance", code: "MAINT" });
  }
  let deptIT = await Department.findOne({ code: "IT" });
  if (!deptIT) {
    deptIT = await Department.create({ name: "IT Support", code: "IT" });
  }
  let deptGeneral = await Department.findOne({ code: "GEN" });
  if (!deptGeneral) {
    deptGeneral = await Department.create({
      name: "General / Triage",
      code: "GEN",
    });
    console.log("Created department: General / Triage (for 'Other' tickets)");
  }

  const cats = [
    { name: "Electrical / Lighting", department: deptMaintenance._id, isOther: false },
    { name: "Plumbing", department: deptMaintenance._id, isOther: false },
    { name: "HVAC / AC", department: deptMaintenance._id, isOther: false },
    { name: "Lab Equipment", department: deptIT._id, isOther: false },
    { name: "Network / Wi‑Fi", department: deptIT._id, isOther: false },
    { name: "Housekeeping", department: deptMaintenance._id, isOther: false },
    { name: "Construction", department: deptMaintenance._id, isOther: false },
  ];
  for (const c of cats) {
    await ensureCategory(c.name, c.department, c.isOther);
  }
  await ensureCategory("Other", deptGeneral._id, true);

  let admin = await User.findOne({ email: adminEmail });
  if (!admin) {
    admin = await User.create({
      name: "System Admin",
      email: adminEmail,
      passwordHash: await hash(adminPassword),
      role: "admin",
    });
    console.log("Created admin:", adminEmail, "/", adminPassword);
  } else {
    console.log("Admin already exists:", adminEmail);
  }

  let staff = await User.findOne({ email: staffEmail });
  if (!staff) {
    staff = await User.create({
      name: "Department Staff",
      email: staffEmail,
      passwordHash: await hash(staffPassword),
      role: "staff",
      department: deptMaintenance._id,
    });
    console.log("Created staff:", staffEmail, "/", staffPassword);
  } else {
    console.log("Staff already exists:", staffEmail);
  }

  await mongoose.connection.close();
  console.log("Seed done.");
}

run().catch((e) => {
  mongoTlsHint(e);
  console.error(e);
  process.exit(1);
});

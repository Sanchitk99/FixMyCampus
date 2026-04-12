import bcrypt from "bcryptjs";
import { validationResult } from "express-validator";
import { User } from "../models/User.js";
import { signToken } from "../utils/jwt.js";

const userResponse = (user) => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  department: user.department
    ? typeof user.department === "object"
      ? user.department
      : user.department
    : null,
});

export const register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }
  const { name, email, password } = req.body;
  const existing = await User.findOne({ email });
  if (existing) {
    return res.status(400).json({ message: "Email already registered" });
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    name,
    email,
    passwordHash,
    role: "student",
  });
  const token = signToken({ userId: user._id.toString() });
  res.status(201).json({ token, user: userResponse(user) });
};

export const login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: errors.array()[0].msg });
  }
  const { email, password } = req.body;
  const user = await User.findOne({ email }).populate("department");
  if (!user) {
    return res.status(401).json({ message: "Invalid credentials" });
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(401).json({ message: "Invalid credentials" });
  }
  const token = signToken({ userId: user._id.toString() });
  res.json({
    token,
    user: userResponse(user),
  });
};

export const me = async (req, res) => {
  res.json({ user: userResponse(req.user) });
};

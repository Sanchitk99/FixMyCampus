import { verifyToken } from "../utils/jwt.js";
import { User } from "../models/User.js";

export const authMiddleware = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authentication required" });
    }
    const token = header.slice(7);
    const decoded = verifyToken(token);
    const user = await User.findById(decoded.userId).select("-passwordHash").populate("department");
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    req.user = user;
    req.tokenPayload = decoded;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};

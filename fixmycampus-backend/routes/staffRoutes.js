import { Router } from "express";
import { body } from "express-validator";
import {
  listStaffTickets,
  getStaffTicket,
  updateStaffTicket,
  completeStaffTicket,
} from "../controllers/staffController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRoles } from "../middleware/roleMiddleware.js";
import { uploadMemory } from "../middleware/uploadMiddleware.js";

const router = Router();

router.use(authMiddleware, requireRoles("staff"));

router.get("/tickets", listStaffTickets);
router.get("/tickets/:id", getStaffTicket);

router.patch(
  "/tickets/:id",
  [
    body("status").optional().isIn(["open", "in_progress", "reopened"]),
    body("progressNote").optional().trim(),
  ],
  updateStaffTicket
);

router.post(
  "/tickets/:id/complete",
  uploadMemory.single("proof"),
  [body("resolutionNote").optional().trim().isLength({ max: 2000 })],
  completeStaffTicket
);

export default router;

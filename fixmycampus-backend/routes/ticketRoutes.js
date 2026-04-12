import { Router } from "express";
import { body } from "express-validator";
import {
  createTicket,
  getMyTickets,
  getMyTicketById,
  confirmTicket,
  reopenTicket,
} from "../controllers/ticketController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRoles } from "../middleware/roleMiddleware.js";
import { uploadMemory } from "../middleware/uploadMiddleware.js";

const router = Router();

router.use(authMiddleware, requireRoles("student"));

router.post(
  "/",
  uploadMemory.array("images", 5),
  [
    body("title").trim().notEmpty().withMessage("Title is required"),
    body("description").trim().notEmpty().withMessage("Description is required"),
    body("location").trim().notEmpty().withMessage("Location is required"),
    body("categoryId").notEmpty().withMessage("Category is required"),
  ],
  createTicket
);

router.get("/my", getMyTickets);
router.get("/my/:id", getMyTicketById);

router.post("/:id/confirm", confirmTicket);

router.post(
  "/:id/reopen",
  [body("reason").optional().trim().isLength({ max: 2000 })],
  reopenTicket
);

export default router;

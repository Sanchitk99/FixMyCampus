import { Router } from "express";
import { listMyNotifications, markNotificationRead } from "../controllers/notificationController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = Router();

router.use(authMiddleware);

router.get("/", listMyNotifications);
router.patch("/:id/read", markNotificationRead);

export default router;

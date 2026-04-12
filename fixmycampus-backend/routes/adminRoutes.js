import { Router } from "express";
import { body } from "express-validator";
import {
  listStaffAccounts,
  createStaffUser,
  listStaffByDepartment,
  listAllTickets,
  reassignTicket,
  getStats,
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../controllers/adminController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";
import { requireRoles } from "../middleware/roleMiddleware.js";

const router = Router();

router.use(authMiddleware, requireRoles("admin"));

router.get("/staff", listStaffAccounts);
router.post(
  "/staff",
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").isEmail().normalizeEmail().withMessage("Valid email required"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
    body("departmentId").notEmpty().withMessage("departmentId is required"),
  ],
  createStaffUser
);
router.get("/staff-users", listStaffByDepartment);
router.get("/stats", getStats);
router.get("/tickets", listAllTickets);

router.patch(
  "/tickets/:id/reassign",
  [
    body("departmentId").notEmpty().withMessage("departmentId is required"),
    body("assignedStaffId").optional({ nullable: true }),
  ],
  reassignTicket
);

router.get("/departments", listDepartments);
router.post(
  "/departments",
  [body("name").trim().notEmpty().withMessage("Name is required")],
  createDepartment
);
router.patch(
  "/departments/:id",
  [body("name").optional().trim().notEmpty(), body("code").optional().trim()],
  updateDepartment
);
router.delete("/departments/:id", deleteDepartment);

router.get("/categories", listCategories);
router.post(
  "/categories",
  [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("departmentId").notEmpty().withMessage("departmentId is required"),
  ],
  createCategory
);
router.patch(
  "/categories/:id",
  [body("name").optional().trim().notEmpty(), body("departmentId").optional().notEmpty()],
  updateCategory
);
router.delete("/categories/:id", deleteCategory);

export default router;

import { Router } from "express";
import { getPublicCategories } from "../controllers/publicController.js";

const router = Router();

router.get("/categories", getPublicCategories);

export default router;

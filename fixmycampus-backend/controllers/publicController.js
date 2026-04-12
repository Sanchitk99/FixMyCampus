import { Category } from "../models/Category.js";

export const getPublicCategories = async (req, res) => {
  const list = await Category.find().populate("department", "name code").sort({ name: 1 });
  res.json(list);
};

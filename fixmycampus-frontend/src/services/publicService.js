import API from "./api";

export const fetchCategories = async () => {
  const response = await API.get("/public/categories");
  return response.data;
};

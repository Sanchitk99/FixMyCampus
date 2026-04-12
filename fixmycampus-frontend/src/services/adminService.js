import API from "./api";

export const getStaffUsers = async (departmentId) => {
  const response = await API.get("/admin/staff-users", { params: { departmentId } });
  return response.data;
};

export const getStaffAccounts = async () => {
  const response = await API.get("/admin/staff");
  return response.data;
};

export const createStaffUser = async (payload) => {
  const response = await API.post("/admin/staff", payload);
  return response.data;
};

export const getAdminStats = async () => {
  const response = await API.get("/admin/stats");
  return response.data;
};

export const getAdminTickets = async (status = "all") => {
  const params = status && status !== "all" ? { status } : undefined;
  const response = await API.get("/admin/tickets", { params });
  return response.data;
};

export const reassignTicket = async (id, payload) => {
  const response = await API.patch(`/admin/tickets/${id}/reassign`, payload);
  return response.data;
};

export const getDepartments = async () => {
  const response = await API.get("/admin/departments");
  return response.data;
};

export const createDepartment = async (payload) => {
  const response = await API.post("/admin/departments", payload);
  return response.data;
};

export const updateDepartment = async (id, payload) => {
  const response = await API.patch(`/admin/departments/${id}`, payload);
  return response.data;
};

export const deleteDepartment = async (id) => {
  const response = await API.delete(`/admin/departments/${id}`);
  return response.data;
};

export const getAdminCategories = async () => {
  const response = await API.get("/admin/categories");
  return response.data;
};

export const createCategory = async (payload) => {
  const response = await API.post("/admin/categories", payload);
  return response.data;
};

export const updateCategory = async (id, payload) => {
  const response = await API.patch(`/admin/categories/${id}`, payload);
  return response.data;
};

export const deleteCategory = async (id) => {
  const response = await API.delete(`/admin/categories/${id}`);
  return response.data;
};

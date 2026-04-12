import API from "./api";

export const getStaffTickets = async () => {
  const response = await API.get("/staff/tickets");
  return response.data;
};

export const getStaffTicket = async (id) => {
  const response = await API.get(`/staff/tickets/${id}`);
  return response.data;
};

export const updateStaffTicket = async (id, payload) => {
  const response = await API.patch(`/staff/tickets/${id}`, payload);
  return response.data;
};

export const completeStaffTicket = async (id, formData) => {
  const response = await API.post(`/staff/tickets/${id}/complete`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

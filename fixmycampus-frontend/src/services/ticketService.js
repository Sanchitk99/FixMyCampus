import API from "./api";

export const createTicket = async (formData) => {
  const response = await API.post("/tickets", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return response.data;
};

export const getMyTickets = async () => {
  const response = await API.get("/tickets/my");
  return response.data;
};

export const getMyTicketById = async (id) => {
  const response = await API.get(`/tickets/my/${id}`);
  return response.data;
};

export const confirmTicket = async (id) => {
  const response = await API.post(`/tickets/${id}/confirm`);
  return response.data;
};

export const reopenTicket = async (id, reason) => {
  const response = await API.post(`/tickets/${id}/reopen`, { reason });
  return response.data;
};

import { createTicket, getMyTickets } from "../services/ticketService";

export const handleCreateTicket = async (formData) => {
  try {
    const data = await createTicket(formData);
    return {
      success: true,
      ticket: data,
    };
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || "Failed to create ticket",
    };
  }
};

export const fetchMyTickets = async () => {
  try {
    const tickets = await getMyTickets();
    return tickets;
  } catch (error) {
    console.error(error);
    return [];
  }
};

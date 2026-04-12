import { Notification } from "../models/Notification.js";

export const notifyUser = async (userId, message, ticketId = null) => {
  await Notification.create({ user: userId, message, ticket: ticketId });
};

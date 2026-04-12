import API from "./api";

export const getNotifications = async () => {
  const response = await API.get("/notifications");
  return response.data;
};

export const markNotificationRead = async (id) => {
  const response = await API.patch(`/notifications/${id}/read`);
  return response.data;
};

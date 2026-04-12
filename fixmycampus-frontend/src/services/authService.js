import API from "./api";

export const registerUser = async (payload) => {
  const response = await API.post("/auth/register", payload);
  return response.data;
};

export const loginUser = async (credentials) => {
  const response = await API.post("/auth/login", credentials);
  return response.data;
};

export const fetchMe = async () => {
  const response = await API.get("/auth/me");
  return response.data;
};

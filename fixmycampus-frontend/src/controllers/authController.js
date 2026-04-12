import { loginUser, registerUser } from "../services/authService";

export const handleLogin = async (credentials, login) => {
  try {
    const data = await loginUser(credentials);
    login(data.user, data.token);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || "Login failed",
    };
  }
};

export const handleRegister = async (payload, login) => {
  try {
    const data = await registerUser(payload);
    login(data.user, data.token);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      message: error.response?.data?.message || "Registration failed",
    };
  }
};

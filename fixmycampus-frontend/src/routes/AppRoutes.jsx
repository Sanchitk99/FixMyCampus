import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import HomeRedirect from "../components/HomeRedirect/HomeRedirect";
import ProtectedRoute from "../components/ProtectedRoute/ProtectedRoute";
import Login from "../views/Login";
import Register from "../views/Register";
import Dashboard from "../views/Dashboard/Dashboard";
import CreateTicket from "../views/CreateTicket/CreateTicket";
import MyTickets from "../views/MyTickets";
import TicketDetail from "../views/TicketDetail/TicketDetail";
import Profile from "../views/Profile";
import StaffDashboard from "../views/Staff/StaffDashboard";
import AdminDashboard from "../views/Admin/AdminDashboard";

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route
          path="/dashboard"
          element={
            <ProtectedRoute roles={["student"]}>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/create-ticket"
          element={
            <ProtectedRoute roles={["student"]}>
              <CreateTicket />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-tickets/:id"
          element={
            <ProtectedRoute roles={["student"]}>
              <TicketDetail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/my-tickets"
          element={
            <ProtectedRoute roles={["student"]}>
              <MyTickets />
            </ProtectedRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute roles={["student", "staff", "admin"]}>
              <Profile />
            </ProtectedRoute>
          }
        />

        <Route
          path="/staff"
          element={
            <ProtectedRoute roles={["staff"]}>
              <StaffDashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={["admin"]}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default AppRoutes;

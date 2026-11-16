// Routes for this area of the staff console. Paths are relative to /staff.
import { Route } from "react-router";
import { DashboardPage } from "../pages/home/Dashboard";
import { ProfilePage } from "../pages/home/Profile";

export const homeRoutes = [
  <Route key="dashboard" path="dashboard" element={<DashboardPage />} />,
  <Route key="profile" path="profile" element={<ProfilePage />} />,
];

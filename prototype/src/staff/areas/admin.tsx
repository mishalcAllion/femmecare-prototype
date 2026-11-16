// Routes for this area of the staff console. Paths are relative to /staff.
import { Route } from "react-router";
import { ReportCentrePage, ReportPage } from "../pages/admin/Reports";
import { UsersPage } from "../pages/admin/Users";
import { SettingsPage } from "../pages/admin/Settings";
import { AuditPage } from "../pages/admin/Audit";
import { IntegrationsPage } from "../pages/admin/Integrations";

export const adminRoutes = [
  <Route key="reports" path="reports" element={<ReportCentrePage />} />,
  <Route key="reports/:id" path="reports/:id" element={<ReportPage />} />,
  <Route key="users" path="users" element={<UsersPage />} />,
  <Route key="settings" path="settings" element={<SettingsPage />} />,
  <Route key="audit" path="audit" element={<AuditPage />} />,
  <Route key="integrations" path="integrations" element={<IntegrationsPage />} />,
];

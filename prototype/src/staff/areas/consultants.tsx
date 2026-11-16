// Routes for this area of the staff console. Paths are relative to /staff.
import { Route } from "react-router";
import { ApplicationReviewPage, ApplicationsPage } from "../pages/consultants/Applications";
import { ConsultantsListPage } from "../pages/consultants/ConsultantsList";
import { ConsultantProfilePage } from "../pages/consultants/ConsultantProfile";
import { NetworkPage } from "../pages/consultants/Network";
import { ConsultantOrderPage, ConsultantOrdersPage } from "../pages/consultants/ConsultantOrders";
import { PaymentsPage } from "../pages/consultants/Payments";
import { RefundsPage } from "../pages/consultants/Refunds";
import { PromotionsPage, RanksPage, ReturnsPage } from "../pages/consultants/Later";

export const consultantRoutes = [
  <Route key="applications" path="applications" element={<ApplicationsPage />} />,
  <Route key="applications/:id" path="applications/:id" element={<ApplicationReviewPage />} />,
  <Route key="consultants" path="consultants" element={<ConsultantsListPage />} />,
  <Route key="consultants/:id" path="consultants/:id" element={<ConsultantProfilePage />} />,
  <Route key="network" path="network" element={<NetworkPage />} />,
  <Route key="consultant-orders" path="consultant-orders" element={<ConsultantOrdersPage />} />,
  <Route key="consultant-orders/:id" path="consultant-orders/:id" element={<ConsultantOrderPage />} />,
  <Route key="payments" path="payments" element={<PaymentsPage />} />,
  <Route key="refunds" path="refunds" element={<RefundsPage />} />,
  <Route key="promotions" path="promotions" element={<PromotionsPage />} />,
  <Route key="ranks" path="ranks" element={<RanksPage />} />,
  <Route key="returns" path="returns" element={<ReturnsPage />} />,
];

// Routes for this area of the staff console. Paths are relative to /staff.
import { Route } from "react-router";
import { BankDetailsPage } from "../pages/finance/BankDetails";
import { CommissionPage } from "../pages/finance/Commission";
import { MonthEndPage } from "../pages/finance/MonthEnd";
import { PayoutBatchPage, PayoutsPage } from "../pages/finance/Payouts";
import { StatementPage, StatementsPage } from "../pages/finance/Statements";

export const financeRoutes = [
  <Route key="bank-details" path="bank-details" element={<BankDetailsPage />} />,
  <Route key="commission" path="commission" element={<CommissionPage />} />,
  <Route key="month-end" path="month-end" element={<MonthEndPage />} />,
  <Route key="payouts" path="payouts" element={<PayoutsPage />} />,
  <Route key="payouts/:id" path="payouts/:id" element={<PayoutBatchPage />} />,
  <Route key="statements" path="statements" element={<StatementsPage />} />,
  <Route key="statements/:consultantId/:month" path="statements/:consultantId/:month" element={<StatementPage />} />,
];

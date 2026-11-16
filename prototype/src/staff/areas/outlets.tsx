// Routes for this area of the staff console. Paths are relative to /staff.
import { Route } from "react-router";
import { OutletDashboard } from "../pages/outlets/OutletDashboard";
import { OutletsList } from "../pages/outlets/OutletsList";
import { OutletForm } from "../pages/outlets/OutletForm";
import { OutletPage } from "../pages/outlets/OutletPage";
import { OutletOrders } from "../pages/outlets/OutletOrders";
import { NewOutletOrder } from "../pages/outlets/NewOutletOrder";
import { OutletOrderPage } from "../pages/outlets/OutletOrderPage";
import { Backorders } from "../pages/outlets/Backorders";
import { LostSales } from "../pages/outlets/LostSales";
import { Invoices } from "../pages/outlets/Invoices";
import { DeliveryNotePrint, InvoicePrint } from "../pages/outlets/Documents";
import { OutletPayments } from "../pages/outlets/OutletPayments";

export const outletRoutes = [
  <Route key="outlet-dashboard" path="outlet-dashboard" element={<OutletDashboard />} />,
  <Route key="outlets" path="outlets" element={<OutletsList />} />,
  <Route key="outlets/new" path="outlets/new" element={<OutletForm />} />,
  <Route key="outlets/:id" path="outlets/:id" element={<OutletPage />} />,
  <Route key="outlets/:id/edit" path="outlets/:id/edit" element={<OutletForm />} />,
  <Route key="outlet-orders" path="outlet-orders" element={<OutletOrders />} />,
  <Route key="outlet-orders/new" path="outlet-orders/new" element={<NewOutletOrder />} />,
  <Route key="outlet-orders/:id" path="outlet-orders/:id" element={<OutletOrderPage />} />,
  <Route key="backorders" path="backorders" element={<Backorders />} />,
  <Route key="lost-sales" path="lost-sales" element={<LostSales />} />,
  <Route key="invoices" path="invoices" element={<Invoices />} />,
  <Route key="invoices/:id" path="invoices/:id" element={<InvoicePrint />} />,
  <Route key="delivery-notes/:id" path="delivery-notes/:id" element={<DeliveryNotePrint />} />,
  <Route key="outlet-payments" path="outlet-payments" element={<OutletPayments />} />,
];

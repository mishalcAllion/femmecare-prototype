// Routes for this area of the staff console. Paths are relative to /staff.
import { Route } from "react-router";
import { StockPage } from "../pages/inventory/Stock";
import { GrnListPage, GrnNewPage, GrnPage } from "../pages/inventory/Grn";
import { TransfersPage } from "../pages/inventory/Transfers";
import { BatchPage } from "../pages/inventory/Batch";
import { CountPage, CountsPage } from "../pages/inventory/Counts";
import { LedgerPage } from "../pages/inventory/Ledger";
import { ProductNewPage, ProductPage, ProductsPage } from "../pages/inventory/Products";
import { LabelsPage } from "../pages/inventory/Labels";

export const inventoryRoutes = [
  <Route key="stock" path="stock" element={<StockPage />} />,
  <Route key="grn" path="grn" element={<GrnListPage />} />,
  <Route key="grn/new" path="grn/new" element={<GrnNewPage />} />,
  <Route key="grn/:id" path="grn/:id" element={<GrnPage />} />,
  <Route key="transfers" path="transfers" element={<TransfersPage />} />,
  <Route key="batches/:id" path="batches/:id" element={<BatchPage />} />,
  <Route key="counts" path="counts" element={<CountsPage />} />,
  <Route key="counts/:id" path="counts/:id" element={<CountPage />} />,
  <Route key="stock-ledger" path="stock-ledger" element={<LedgerPage />} />,
  <Route key="products" path="products" element={<ProductsPage />} />,
  <Route key="products/new" path="products/new" element={<ProductNewPage />} />,
  <Route key="products/:id" path="products/:id" element={<ProductPage />} />,
  <Route key="labels" path="labels" element={<LabelsPage />} />,
];

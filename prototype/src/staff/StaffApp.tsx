// Staff console routes. Each area keeps its own route file in ./areas.

import { Route, Routes } from "react-router";
import { StaffLayout } from "./StaffLayout";
import { StaffLogin } from "./StaffLogin";
import { NotFound } from "./guard";
import { WorkQueue } from "./pages/WorkQueue";
import { homeRoutes } from "./areas/home";
import { outletRoutes } from "./areas/outlets";
import { logisticsRoutes } from "./areas/logistics";
import { inventoryRoutes } from "./areas/inventory";
import { consultantRoutes } from "./areas/consultants";
import { financeRoutes } from "./areas/finance";
import { adminRoutes } from "./areas/admin";

export function StaffApp() {
  return (
    <Routes>
      <Route path="login" element={<StaffLogin />} />
      <Route element={<StaffLayout />}>
        <Route index element={<WorkQueue />} />
        {homeRoutes}
        {outletRoutes}
        {logisticsRoutes}
        {inventoryRoutes}
        {consultantRoutes}
        {financeRoutes}
        {adminRoutes}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

// Consultant app (phone first) at /app. Not signed in goes to /signin; a suspended
// or closed account goes to /app/blocked.

import { Navigate, Route, Routes, useLocation } from "react-router";
import { useConsultant } from "@/lib/fc";
import { CartProvider } from "./cart";
import { AppShell } from "./shell";
import { Home } from "./Home";
import { Shop, ShopProduct } from "./Shop";
import { Cart } from "./Checkout";
import { Pay } from "./Pay";
import { OrderPage, OrdersList, Receipt } from "./Orders";
import { Team } from "./Team";
import { Earnings, Statement } from "./Earnings";
import { Invite } from "./Invite";
import { Profile } from "./Profile";
import { Notifications } from "./Notifications";
import { AppNotFound, Blocked } from "./Blocked";

export function ConsultantApp() {
  const c = useConsultant();
  const loc = useLocation();
  if (!c) return <Navigate to="/signin" replace state={{ from: loc.pathname + loc.search }} />;
  const blockedPath = loc.pathname.replace(/\/+$/, "") === "/app/blocked";
  if (c.status !== "active" && !blockedPath) return <Navigate to="/app/blocked" replace />;
  if (blockedPath) return <Blocked />;
  return (
    <CartProvider consultantId={c.id}>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Home />} />
          <Route path="shop" element={<Shop />} />
          <Route path="shop/:id" element={<ShopProduct />} />
          <Route path="cart" element={<Cart />} />
          <Route path="orders" element={<OrdersList />} />
          <Route path="orders/:id" element={<OrderPage />} />
          <Route path="orders/:id/pay" element={<Pay />} />
          <Route path="orders/:id/receipt" element={<Receipt />} />
          <Route path="team" element={<Team />} />
          <Route path="earnings" element={<Earnings />} />
          <Route path="earnings/:month" element={<Statement />} />
          <Route path="invite" element={<Invite />} />
          <Route path="profile" element={<Profile />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="*" element={<AppNotFound />} />
        </Route>
      </Routes>
    </CartProvider>
  );
}

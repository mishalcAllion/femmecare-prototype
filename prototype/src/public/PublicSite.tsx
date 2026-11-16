// Public website (femmecare.lk): home, products at MRP, invite links, the join
// form and consultant sign-in.

import { Route, Routes } from "react-router";
import { PublicLayout } from "./layout";
import { Home } from "./Home";
import { Catalogue, ProductPage } from "./Products";
import { InviteLanding } from "./Invite";
import { JoinDone, JoinPage } from "./Join";
import { SignIn } from "./SignIn";
import { NotFound } from "./NotFound";

export function PublicSite() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Home />} />
        <Route path="products" element={<Catalogue />} />
        <Route path="products/:id" element={<ProductPage />} />
        <Route path="r/:number" element={<InviteLanding />} />
        <Route path="join" element={<JoinPage />} />
        <Route path="join/done" element={<JoinDone />} />
        <Route path="signin" element={<SignIn />} />
        <Route path="signin/reset" element={<SignIn />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}

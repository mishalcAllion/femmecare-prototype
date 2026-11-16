// Routes for this area of the staff console. Paths are relative to /staff.
import { Route } from "react-router";
import { DispatchBoard } from "../pages/logistics/DispatchBoard";
import { DispatchPage } from "../pages/logistics/DispatchPage";
import { SignedNoteConfirm, SignedNotes } from "../pages/logistics/SignedNotes";

export const logisticsRoutes = [
  <Route key="dispatch" path="dispatch" element={<DispatchBoard />} />,
  <Route key="dispatch/:id" path="dispatch/:id" element={<DispatchPage />} />,
  <Route key="pod" path="pod" element={<SignedNotes />} />,
  <Route key="pod/:id" path="pod/:id" element={<SignedNoteConfirm />} />,
];

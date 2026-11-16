// Top-level routes: public website at /, consultant app at /app, staff console at /staff.

import { BrowserRouter, Route, Routes, useLocation } from "react-router";
import { ThemeProvider } from "@/lib/theme";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DemoPanel } from "@/demo/DemoPanel";
import { StaffApp } from "@/staff/StaffApp";
import { ConsultantApp } from "@/consultant/ConsultantApp";
import { PublicSite } from "@/public/PublicSite";

function Themed({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const staff = loc.pathname.startsWith("/staff");
  return (
    <ThemeProvider forcedTheme={staff ? undefined : "light"}>
      {children}
    </ThemeProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/+$/, "") || "/"}>
      <Themed>
        <TooltipProvider>
          <Routes>
            <Route path="/staff/*" element={<StaffApp />} />
            <Route path="/app/*" element={<ConsultantApp />} />
            <Route path="/*" element={<PublicSite />} />
          </Routes>
          <DemoPanel />
          <Toaster position="top-center" richColors closeButton />
        </TooltipProvider>
      </Themed>
    </BrowserRouter>
  );
}

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { loadSavedDb, replaceDb } from "@/domain/db";
import { generate } from "@/domain/seed/generate";
import "@/demo/automation";

async function boot() {
  const saved = await loadSavedDb();
  if (saved && saved.version === 1 && Array.isArray(saved.products)) replaceDb(saved);
  else replaceDb(generate("month_end"), { markChanged: false });
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void boot();

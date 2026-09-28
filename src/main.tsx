import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { loadLicensedLensGrotesk } from "./font-loader";
import "./styles.css";
import "./ui-refresh.css";

void loadLicensedLensGrotesk();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

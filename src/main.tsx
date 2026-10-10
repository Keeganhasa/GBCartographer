import React from "react";
import ReactDOM from "react-dom/client";
import PaintApp from "./PaintApp";
import { TooltipProvider } from "./ui/kit";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";
import "./ui/theme.css";
import "./paint.css";
import { applyFont, applyTheme, loadFont, loadTheme } from "./ui/theme";

// The theme and font picked last time.
applyTheme(loadTheme(), false);
applyFont(loadFont(), false);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TooltipProvider>
      <PaintApp />
    </TooltipProvider>
  </React.StrictMode>,
);

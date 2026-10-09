import React from "react";
import ReactDOM from "react-dom/client";
import PaintApp from "./PaintApp";
import "./ui/theme.css";
import "./paint.css";
import { applyFont, applyTheme, loadFont, loadTheme } from "./ui/theme";

// The theme and font picked last time.
applyTheme(loadTheme(), false);
applyFont(loadFont(), false);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PaintApp />
  </React.StrictMode>,
);

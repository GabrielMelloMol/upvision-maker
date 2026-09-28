import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@fontsource/outfit/600.css";
import "@fontsource/outfit/700.css";
import "@fontsource/work-sans/400.css";
import "@fontsource/work-sans/500.css";
import "@fontsource/work-sans/600.css";
import "@fontsource/dancing-script/700.css";
import "@fontsource/fredoka/600.css";
import "@fontsource/hanken-grotesk/800.css";
import "@fontsource/lobster/400.css";
import "@fontsource/pacifico/400.css";
import "@fontsource/playfair-display/800.css";
import "./styles.css";
import { ToastProvider } from "./ui/Toast";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>,
);

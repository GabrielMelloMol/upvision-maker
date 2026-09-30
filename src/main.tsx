import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { ToastProvider } from "./ui/Toast";
import { applyWindowStyle } from "./ui/windowStyle";
import { installGlass } from "./ui/glass";
import { installErrorLogging } from "./diagnostics/log";

void applyWindowStyle();
installGlass();
installErrorLogging();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>,
);

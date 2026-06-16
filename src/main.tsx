import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { hydrateOriginFromUrl } from "./lib/bookingOrigin";

hydrateOriginFromUrl();

createRoot(document.getElementById("root")!).render(<App />);

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { CollectionProvider } from "./collection";
import { DecksProvider } from "./decks";
import { WishlistProvider } from "./wishlist";
import { AuthProvider } from "./auth";
import "./styles.css";
import { applyTheme, getTheme } from "./theme";

applyTheme(getTheme());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter
      basename={import.meta.env.BASE_URL.replace(/\/$/, "") || "/"}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <AuthProvider>
      <CollectionProvider>
        <DecksProvider>
          <WishlistProvider>
            <App />
          </WishlistProvider>
        </DecksProvider>
      </CollectionProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

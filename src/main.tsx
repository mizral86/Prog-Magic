import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { CollectionProvider } from "./collection";
import { DecksProvider } from "./decks";
import { WishlistProvider } from "./wishlist";
import { AuthProvider } from "./auth";
import { FriendsProvider } from "./friendsContext";
import "./styles.css";
import { applyTheme, getTheme } from "./theme";
import { checkMetaUpdate } from "./metagame";
import { installStorageGuard } from "./storageGuard";

installStorageGuard();
applyTheme(getTheme());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, "") || "/"}>
      <AuthProvider>
      <FriendsProvider>
      <CollectionProvider>
        <DecksProvider>
          <WishlistProvider>
            <App />
          </WishlistProvider>
        </DecksProvider>
      </CollectionProvider>
      </FriendsProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

// Toglie l'animazione di apertura (index.html) quando l'app è pronta.
(window as unknown as { __hideSplash?: () => void }).__hideSplash?.();

// Una volta al giorno: ci sono mazzi del meta più nuovi sul sito? Se sì
// vengono scaricati e usati subito (vedi metagame.ts).
setTimeout(() => void checkMetaUpdate(), 3000);

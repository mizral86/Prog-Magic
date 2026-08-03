import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import SearchPage from "./pages/SearchPage";
import CollectionPage from "./pages/CollectionPage";
import DecksPage from "./pages/DecksPage";
import SimulatorPage from "./pages/SimulatorPage";
import PlayPage from "./pages/PlayPage";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/cerca" replace />} />
        <Route path="/cerca" element={<SearchPage />} />
        <Route path="/collezione" element={<CollectionPage />} />
        <Route path="/mazzi" element={<DecksPage />} />
        <Route path="/simula" element={<SimulatorPage />} />
        <Route path="/gioca" element={<PlayPage />} />
        <Route path="*" element={<Navigate to="/cerca" replace />} />
      </Route>
    </Routes>
  );
}

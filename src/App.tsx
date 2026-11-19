import { lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import SearchPage from "./pages/SearchPage";
const CollectionPage = lazy(() => import("./pages/CollectionPage"));
const DecksPage = lazy(() => import("./pages/DecksPage"));
const SimulatorPage = lazy(() => import("./pages/SimulatorPage"));
const PlayPage = lazy(() => import("./pages/PlayPage"));
const ScanPage = lazy(() => import("./pages/ScanPage"));
const AccountPage = lazy(() => import("./pages/AccountPage"));
const FriendsPage = lazy(() => import("./pages/FriendsPage"));
const GroupsPage = lazy(() => import("./pages/GroupsPage"));

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
        <Route path="/scansiona" element={<ScanPage />} />
        <Route path="/amici" element={<FriendsPage />} />
        <Route path="/amici/:id" element={<FriendsPage />} />
        <Route path="/gruppi" element={<GroupsPage />} />
        <Route path="/gruppi/:gid" element={<GroupsPage />} />
        <Route path="/gruppi/:gid/torneo/:tid" element={<GroupsPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/cerca" replace />} />
      </Route>
    </Routes>
  );
}

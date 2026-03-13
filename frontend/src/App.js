import { useMemo, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import "./App.css";
import HeaderBar from "./components/HeaderBar";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminDashboard from "./pages/AdminDashboard";
import AuthPage from "./pages/AuthPage";
import DelegateDashboard from "./pages/DelegateDashboard";
import LiveResultsPage from "./pages/LiveResultsPage";

const STORAGE_KEY = "ses_asamblea_auth";

function getStoredAuth() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function App() {
  const [auth, setAuth] = useState(getStoredAuth());

  const homeRedirect = useMemo(() => {
    if (!auth?.accessToken) {
      return "/";
    }
    return auth.role === "admin" ? "/admin" : "/delegado";
  }, [auth]);

  const handleAuthSuccess = (payload) => {
    const authSession = {
      accessToken: payload.access_token,
      role: payload.role,
      userName: payload.user_name,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(authSession));
    setAuth(authSession);
  };

  const handleLogout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setAuth(null);
  };

  return (
    <BrowserRouter>
      <div className="app-shell" data-testid="app-shell">
        <HeaderBar auth={auth} onLogout={handleLogout} />
        <main data-testid="app-main-content">
          <Routes>
            <Route
              path="/"
              element={
                auth?.accessToken ? <Navigate to={homeRedirect} replace /> : <AuthPage onAuthSuccess={handleAuthSuccess} />
              }
            />
            <Route
              path="/delegado"
              element={
                <ProtectedRoute auth={auth} role="delegate">
                  <DelegateDashboard auth={auth} />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute auth={auth} role="admin">
                  <AdminDashboard auth={auth} />
                </ProtectedRoute>
              }
            />
            <Route path="/resultados" element={<LiveResultsPage />} />
            <Route path="*" element={<Navigate to={homeRedirect} replace />} />
          </Routes>
        </main>
        <Toaster richColors position="top-right" closeButton />
      </div>
    </BrowserRouter>
  );
}

export default App;

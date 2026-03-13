import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ auth, role, children }) {
  if (!auth?.accessToken) {
    return <Navigate to="/" replace />;
  }

  if (role && auth.role !== role) {
    return <Navigate to={auth.role === "admin" ? "/admin" : "/delegado"} replace />;
  }

  return children;
}

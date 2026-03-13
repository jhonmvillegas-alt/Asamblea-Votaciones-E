const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

if (!BACKEND_URL) {
  throw new Error("Falta REACT_APP_BACKEND_URL en frontend/.env");
}

const API_BASE = `${BACKEND_URL}/api`;

async function apiRequest(path, options = {}) {
  const { method = "GET", token, body } = options;
  const headers = {};

  if (body) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || "Ocurrió un error en la solicitud");
  }
  return data;
}

export const api = {
  registerDelegate: (payload) =>
    apiRequest("/auth/register-delegate", { method: "POST", body: payload }),
  loginDelegate: (payload) => apiRequest("/auth/login-delegate", { method: "POST", body: payload }),
  loginAdmin: (payload) => apiRequest("/auth/login-admin", { method: "POST", body: payload }),
  getProfile: (token) => apiRequest("/auth/me", { token }),

  getActivePoint: (token) => apiRequest("/voting/active-point", { token }),
  castVote: (token, payload) => apiRequest("/voting/vote", { method: "POST", token, body: payload }),
  getPublicResults: () => apiRequest("/voting/results/public"),
  getLiveState: () => apiRequest("/live/state"),

  uploadDelegates: (token, delegates) =>
    apiRequest("/admin/delegates/upload", {
      method: "POST",
      token,
      body: { delegates },
    }),
  getDelegatesSummary: (token) => apiRequest("/admin/delegates/summary", { token }),
  createPoint: (token, payload) => apiRequest("/admin/points", { method: "POST", token, body: payload }),
  getPoints: (token) => apiRequest("/admin/points", { token }),
  openPoint: (token, pointId) => apiRequest(`/admin/points/${pointId}/open`, { method: "POST", token }),
  closePoint: (token, pointId) => apiRequest(`/admin/points/${pointId}/close`, { method: "POST", token }),
  getDirectivaResults: (token, pointId = "") =>
    apiRequest(`/voting/results/directiva${pointId ? `?point_id=${pointId}` : ""}`, { token }),
};

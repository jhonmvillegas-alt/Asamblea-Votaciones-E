import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "../lib/api";
import { parseDelegatesFile, parsePointsFile } from "../lib/importParsers";

const initialRegister = { document_id: "", password: "" };
const initialDelegateLogin = { document_id: "", password: "" };
const initialAdminLogin = { username: "", password: "" };

export default function AuthPage({ onAuthSuccess }) {
  const [activeTab, setActiveTab] = useState("delegado");
  const [registerForm, setRegisterForm] = useState(initialRegister);
  const [delegateLoginForm, setDelegateLoginForm] = useState(initialDelegateLogin);
  const [adminLoginForm, setAdminLoginForm] = useState(initialAdminLogin);
  const [bootstrapStatus, setBootstrapStatus] = useState(null);
  const [bootstrapForm, setBootstrapForm] = useState({ admin_username: "", admin_password: "" });
  const [bootstrapDelegates, setBootstrapDelegates] = useState([]);
  const [bootstrapPoints, setBootstrapPoints] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadBootstrapStatus = async () => {
    try {
      const status = await api.getBootstrapStatus();
      setBootstrapStatus(status);
      if (status.setup_required) {
        setActiveTab("setup");
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  useEffect(() => {
    loadBootstrapStatus();
  }, []);

  useEffect(() => {
    if (bootstrapStatus && !bootstrapStatus.setup_required && activeTab === "setup") {
      setActiveTab("admin");
    }
  }, [bootstrapStatus, activeTab]);

  const handleRegister = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await api.registerDelegate(registerForm);
      toast.success(response.message);
      setRegisterForm(initialRegister);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelegateLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await api.loginDelegate(delegateLoginForm);
      onAuthSuccess(response);
      toast.success(`Bienvenido/a ${response.user_name}`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAdminLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await api.loginAdmin(adminLoginForm);
      onAuthSuccess(response);
      toast.success("Acceso de mesa directiva concedido");
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelegatesBootstrapFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const delegates = await parseDelegatesFile(file);
      setBootstrapDelegates(delegates);
      toast.success(`Delegados cargados desde archivo: ${delegates.length}`);
    } catch {
      toast.error("No se pudo leer el archivo de delegados. Use CSV o Excel válido.");
    }
  };

  const handlePointsBootstrapFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      const points = await parsePointsFile(file);
      setBootstrapPoints(points);
      toast.success(`Preguntas/puntos cargados: ${points.length}`);
    } catch {
      toast.error("No se pudo leer el archivo de preguntas. Use CSV o Excel válido.");
    }
  };

  const handleBootstrapInitialize = async (event) => {
    event.preventDefault();
    setLoading(true);
    try {
      const response = await api.initializeBootstrap({
        ...bootstrapForm,
        delegates: bootstrapDelegates,
        points: bootstrapPoints,
      });
      toast.success(response.message || "Configuración inicial completada");
      setAdminLoginForm({
        username: bootstrapForm.admin_username,
        password: bootstrapForm.admin_password,
      });
      setActiveTab("admin");
      await loadBootstrapStatus();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-2 lg:py-10 lg:px-8" data-testid="auth-page">
      <div className="ses-card ses-appear flex flex-col justify-between p-6 lg:p-8" data-testid="auth-intro-card">
        <div className="space-y-4">
          <p className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-bold uppercase tracking-widest text-blue-700" data-testid="auth-live-badge">
            Registro único • Votación punto a punto
          </p>
          <h2 className="text-4xl font-black leading-tight text-slate-900 sm:text-5xl" data-testid="auth-main-title">
            Elecciones Asamblea de Delegados SES
          </h2>
          <p className="text-sm text-slate-600 sm:text-base" data-testid="auth-main-description">
            Cada delegado se registra una sola vez con su documento del padrón. La votación se habilita en vivo por la
            mesa directiva y los resultados aparecen en caliente.
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3" data-testid="auth-feature-grid">
          <article className="rounded-lg border border-slate-200 bg-slate-50 p-4" data-testid="auth-feature-registro">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Registros</p>
            <p className="text-xl font-extrabold text-slate-900">300 delegados</p>
          </article>
          <article className="rounded-lg border border-slate-200 bg-slate-50 p-4" data-testid="auth-feature-votos">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Opciones de voto</p>
            <p className="text-sm font-bold text-slate-900">1. Aprobado / 2. No aprobado / 3. Abstención / 4. Voto en blanco</p>
          </article>
        </div>
      </div>

      <div className="ses-card ses-appear p-6 lg:p-8" data-testid="auth-forms-card">
        <div className="mb-4 flex gap-2 rounded-lg bg-slate-100 p-1" data-testid="auth-tab-switcher">
          <button
            data-testid="auth-tab-delegado"
            type="button"
            onClick={() => setActiveTab("delegado")}
            className={`w-full rounded-md px-4 py-2 text-sm font-bold transition-colors ${
              activeTab === "delegado" ? "bg-white text-blue-700" : "text-slate-600"
            }`}
          >
            Delegado
          </button>
          <button
            data-testid="auth-tab-admin"
            type="button"
            onClick={() => setActiveTab("admin")}
            className={`w-full rounded-md px-4 py-2 text-sm font-bold transition-colors ${
              activeTab === "admin" ? "bg-white text-blue-700" : "text-slate-600"
            }`}
          >
            Mesa directiva
          </button>
          {bootstrapStatus?.setup_required && (
            <button
              data-testid="auth-tab-setup"
              type="button"
              onClick={() => setActiveTab("setup")}
              className={`w-full rounded-md px-4 py-2 text-sm font-bold transition-colors ${
                activeTab === "setup" ? "bg-white text-blue-700" : "text-slate-600"
              }`}
            >
              Configuración inicial
            </button>
          )}
        </div>

        {activeTab === "delegado" ? (
          <div className="space-y-6" data-testid="delegado-auth-panel">
            <form className="space-y-3" onSubmit={handleRegister} data-testid="delegado-register-form">
              <h3 className="text-xl font-bold text-slate-900">1) Registro único</h3>
              <label className="block text-sm font-medium text-slate-700" htmlFor="register-document">
                Documento
              </label>
              <input
                data-testid="register-document-input"
                id="register-document"
                value={registerForm.document_id}
                onChange={(event) => setRegisterForm((prev) => ({ ...prev, document_id: event.target.value }))}
                className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:border-blue-500 focus:outline-none"
                placeholder="Ej: 91234567"
                required
              />
              <label className="block text-sm font-medium text-slate-700" htmlFor="register-password">
                Contraseña (mínimo 6 caracteres)
              </label>
              <input
                data-testid="register-password-input"
                id="register-password"
                type="password"
                value={registerForm.password}
                onChange={(event) => setRegisterForm((prev) => ({ ...prev, password: event.target.value }))}
                className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:border-blue-500 focus:outline-none"
                required
              />
              <button
                data-testid="register-submit-button"
                className="h-11 w-full rounded-md bg-blue-600 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                type="submit"
                disabled={loading}
              >
                Completar registro
              </button>
            </form>

            <form className="space-y-3" onSubmit={handleDelegateLogin} data-testid="delegado-login-form">
              <h3 className="text-xl font-bold text-slate-900">2) Iniciar sesión como delegado</h3>
              <label className="block text-sm font-medium text-slate-700" htmlFor="login-document">
                Documento
              </label>
              <input
                data-testid="delegate-login-document-input"
                id="login-document"
                value={delegateLoginForm.document_id}
                onChange={(event) =>
                  setDelegateLoginForm((prev) => ({ ...prev, document_id: event.target.value }))
                }
                className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:border-blue-500 focus:outline-none"
                required
              />
              <label className="block text-sm font-medium text-slate-700" htmlFor="login-password">
                Contraseña
              </label>
              <input
                data-testid="delegate-login-password-input"
                id="login-password"
                type="password"
                value={delegateLoginForm.password}
                onChange={(event) =>
                  setDelegateLoginForm((prev) => ({ ...prev, password: event.target.value }))
                }
                className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:border-blue-500 focus:outline-none"
                required
              />
              <button
                data-testid="delegate-login-submit-button"
                className="h-11 w-full rounded-md bg-emerald-600 text-sm font-bold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                type="submit"
                disabled={loading}
              >
                Entrar al panel de votación
              </button>
            </form>
          </div>
        ) : activeTab === "admin" ? (
          <div className="space-y-4" data-testid="admin-auth-panel">
            <form className="space-y-3" onSubmit={handleAdminLogin} data-testid="admin-login-form">
              <h3 className="text-xl font-bold text-slate-900">Ingreso mesa directiva</h3>
              <p className="text-sm text-slate-600" data-testid="admin-login-help-text">
                Desde aquí puedes modificar votantes y preguntas de la asamblea en cualquier momento.
              </p>
              <label className="block text-sm font-medium text-slate-700" htmlFor="admin-username">
                Usuario
              </label>
              <input
                data-testid="admin-username-input"
                id="admin-username"
                value={adminLoginForm.username}
                onChange={(event) => setAdminLoginForm((prev) => ({ ...prev, username: event.target.value }))}
                className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:border-blue-500 focus:outline-none"
                required
              />
              <label className="block text-sm font-medium text-slate-700" htmlFor="admin-password">
                Contraseña
              </label>
              <input
                data-testid="admin-password-input"
                id="admin-password"
                type="password"
                value={adminLoginForm.password}
                onChange={(event) => setAdminLoginForm((prev) => ({ ...prev, password: event.target.value }))}
                className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:border-blue-500 focus:outline-none"
                required
              />
              <button
                data-testid="admin-login-submit-button"
                className="h-11 w-full rounded-md bg-slate-900 text-sm font-bold text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                type="submit"
                disabled={loading}
              >
                Ingresar como administrador
              </button>
            </form>

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3" data-testid="admin-credentials-note">
              <p className="text-sm text-blue-800">
                Las credenciales del administrador son de configuración interna de la mesa directiva.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4" data-testid="setup-auth-panel">
            {bootstrapStatus?.setup_required ? (
              <form className="space-y-4" onSubmit={handleBootstrapInitialize} data-testid="bootstrap-initialize-form">
                <h3 className="text-xl font-bold text-slate-900">Asistente inicial (primer uso)</h3>
                <p className="text-sm text-slate-600" data-testid="bootstrap-help-text">
                  Crea el administrador y carga votantes/preguntas para habilitar la asamblea.
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-slate-700" htmlFor="bootstrap-admin-username">
                      Usuario administrador
                    </label>
                    <input
                      data-testid="bootstrap-admin-username-input"
                      id="bootstrap-admin-username"
                      value={bootstrapForm.admin_username}
                      onChange={(event) =>
                        setBootstrapForm((prev) => ({ ...prev, admin_username: event.target.value }))
                      }
                      className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:border-blue-500 focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700" htmlFor="bootstrap-admin-password">
                      Clave administrador
                    </label>
                    <input
                      data-testid="bootstrap-admin-password-input"
                      id="bootstrap-admin-password"
                      type="password"
                      value={bootstrapForm.admin_password}
                      onChange={(event) =>
                        setBootstrapForm((prev) => ({ ...prev, admin_password: event.target.value }))
                      }
                      className="h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:border-blue-500 focus:outline-none"
                      required
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4" data-testid="bootstrap-delegates-upload-card">
                  <p className="text-sm font-bold text-slate-900">Votantes (CSV/Excel)</p>
                  <p className="text-xs text-slate-600">Columnas sugeridas: documento, nombre</p>
                  <input
                    data-testid="bootstrap-delegates-file-input"
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleDelegatesBootstrapFile}
                    className="mt-2 block w-full text-sm"
                  />
                  <p className="mt-2 text-sm text-slate-700" data-testid="bootstrap-delegates-count">
                    Delegados listos para cargar: <strong>{bootstrapDelegates.length}</strong>
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4" data-testid="bootstrap-points-upload-card">
                  <p className="text-sm font-bold text-slate-900">Preguntas/Puntos (CSV/Excel)</p>
                  <p className="text-xs text-slate-600">Columnas sugeridas: orden, titulo, descripcion</p>
                  <input
                    data-testid="bootstrap-points-file-input"
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handlePointsBootstrapFile}
                    className="mt-2 block w-full text-sm"
                  />
                  <p className="mt-2 text-sm text-slate-700" data-testid="bootstrap-points-count">
                    Preguntas listas para cargar: <strong>{bootstrapPoints.length}</strong>
                  </p>
                </div>

                <button
                  data-testid="bootstrap-initialize-submit-button"
                  className="h-11 w-full rounded-md bg-blue-700 text-sm font-bold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                  type="submit"
                  disabled={loading}
                >
                  Inicializar asamblea
                </button>
              </form>
            ) : (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4" data-testid="bootstrap-already-complete-box">
                <p className="text-sm font-bold text-emerald-800">La configuración inicial ya fue completada.</p>
                <p className="text-sm text-emerald-700" data-testid="bootstrap-current-summary">
                  Admins: {bootstrapStatus?.admin_count ?? 0} • Votantes: {bootstrapStatus?.delegates_count ?? 0} • Preguntas:
                  {" "}
                  {bootstrapStatus?.points_count ?? 0}
                </p>
                <button
                  data-testid="bootstrap-go-admin-button"
                  type="button"
                  onClick={() => setActiveTab("admin")}
                  className="mt-3 h-10 w-full rounded-md bg-emerald-700 text-sm font-bold text-white transition-colors hover:bg-emerald-800"
                >
                  Ir a Mesa directiva para modificar datos
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

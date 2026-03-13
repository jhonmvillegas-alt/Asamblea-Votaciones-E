import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api } from "../lib/api";

const normalizeVoteLabel = {
  aprobado: "Aprobado",
  no_aprobado: "No aprobado",
  abstencion: "Abstención",
  en_blanco: "En blanco",
};

export default function AdminDashboard({ auth }) {
  const [summary, setSummary] = useState(null);
  const [points, setPoints] = useState([]);
  const [directivaData, setDirectivaData] = useState({ has_data: false });
  const [delegatesText, setDelegatesText] = useState("");
  const [pointForm, setPointForm] = useState({ title: "", description: "", order: "" });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [summaryData, pointsData, directiva] = await Promise.all([
        api.getDelegatesSummary(auth.accessToken),
        api.getPoints(auth.accessToken),
        api.getDirectivaResults(auth.accessToken),
      ]);
      setSummary(summaryData);
      setPoints(pointsData.points || []);
      setDirectivaData(directiva);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [auth.accessToken]);

  useEffect(() => {
    refresh();
    const poll = setInterval(refresh, 3000);
    return () => clearInterval(poll);
  }, [refresh]);

  const activePointId = useMemo(() => points.find((point) => point.status === "abierta")?.id, [points]);

  const parseDelegates = () =>
    delegatesText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [document_id, ...nameParts] = line.split(",");
        return {
          document_id: document_id?.trim(),
          full_name: nameParts.join(",").trim(),
        };
      })
      .filter((item) => item.document_id && item.full_name);

  const submitDelegates = async (event) => {
    event.preventDefault();
    const delegates = parseDelegates();
    if (!delegates.length) {
      toast.error("Incluya al menos una línea con formato: documento,nombre");
      return;
    }

    try {
      const response = await api.uploadDelegates(auth.accessToken, delegates);
      toast.success(`Cargados: ${response.created} nuevos, ${response.updated} actualizados`);
      setDelegatesText("");
      await refresh();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const submitPoint = async (event) => {
    event.preventDefault();
    try {
      await api.createPoint(auth.accessToken, {
        title: pointForm.title,
        description: pointForm.description,
        order: Number(pointForm.order),
      });
      toast.success("Punto creado");
      setPointForm({ title: "", description: "", order: "" });
      await refresh();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const openPoint = async (pointId) => {
    try {
      await api.openPoint(auth.accessToken, pointId);
      toast.success("Punto abierto para votación");
      await refresh();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const closePoint = async (pointId) => {
    try {
      await api.closePoint(auth.accessToken, pointId);
      toast.success("Punto cerrado");
      await refresh();
    } catch (error) {
      toast.error(error.message);
    }
  };

  if (loading) {
    return (
      <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8" data-testid="admin-loading-screen">
        <div className="ses-card p-8 text-center text-slate-600">Cargando tablero de mesa directiva...</div>
      </section>
    );
  }

  return (
    <section className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1.1fr_1.4fr] lg:px-8" data-testid="admin-dashboard-page">
      <div className="space-y-6">
        <article className="ses-card p-5" data-testid="admin-summary-card">
          <p className="text-xs font-bold uppercase tracking-widest text-blue-700">Participación de registro</p>
          <div className="mt-3 grid grid-cols-3 gap-3" data-testid="admin-summary-grid">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" data-testid="admin-summary-padron">
              <p className="text-xs text-slate-500">Padrón</p>
              <p className="ses-test-mono text-2xl font-black text-slate-900">{summary?.total_in_padron ?? 0}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" data-testid="admin-summary-registrados">
              <p className="text-xs text-slate-500">Registrados</p>
              <p className="ses-test-mono text-2xl font-black text-green-700">{summary?.registrados ?? 0}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" data-testid="admin-summary-pendientes">
              <p className="text-xs text-slate-500">Pendientes</p>
              <p className="ses-test-mono text-2xl font-black text-amber-700">{summary?.pendientes_registro ?? 0}</p>
            </div>
          </div>
        </article>

        <form className="ses-card p-5" onSubmit={submitDelegates} data-testid="admin-upload-delegates-form">
          <h3 className="text-lg font-bold text-slate-900">Cargar padrón de delegados</h3>
          <p className="mt-1 text-sm text-slate-600">Formato por línea: documento,nombre completo</p>
          <textarea
            data-testid="admin-upload-delegates-textarea"
            value={delegatesText}
            onChange={(event) => setDelegatesText(event.target.value)}
            className="mt-3 h-48 w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            placeholder={"900100,ANA PEREZ\n900101,CARLOS RODRIGUEZ"}
          />
          <button
            data-testid="admin-upload-delegates-submit-button"
            type="submit"
            className="mt-3 h-11 w-full rounded-md bg-blue-600 text-sm font-bold text-white transition-colors hover:bg-blue-700"
          >
            Cargar / actualizar delegados
          </button>
        </form>

        <form className="ses-card p-5" onSubmit={submitPoint} data-testid="admin-create-point-form">
          <h3 className="text-lg font-bold text-slate-900">Crear punto del orden del día</h3>
          <div className="mt-3 space-y-3">
            <input
              data-testid="admin-point-title-input"
              value={pointForm.title}
              onChange={(event) => setPointForm((prev) => ({ ...prev, title: event.target.value }))}
              className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="Título del punto"
              required
            />
            <textarea
              data-testid="admin-point-description-input"
              value={pointForm.description}
              onChange={(event) => setPointForm((prev) => ({ ...prev, description: event.target.value }))}
              className="h-24 w-full rounded-md border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="Descripción para delegados"
              required
            />
            <input
              data-testid="admin-point-order-input"
              value={pointForm.order}
              onChange={(event) => setPointForm((prev) => ({ ...prev, order: event.target.value }))}
              className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm focus:border-blue-500 focus:outline-none"
              placeholder="Orden (1,2,3...)"
              min="1"
              max="40"
              type="number"
              required
            />
          </div>
          <button
            data-testid="admin-create-point-submit-button"
            type="submit"
            className="mt-3 h-11 w-full rounded-md bg-slate-900 text-sm font-bold text-white transition-colors hover:bg-slate-700"
          >
            Crear punto
          </button>
        </form>
      </div>

      <div className="space-y-6">
        <article className="ses-card p-5" data-testid="admin-points-list-card">
          <h3 className="text-lg font-bold text-slate-900">Gestión de votación punto a punto</h3>
          <div className="mt-3 space-y-3" data-testid="admin-points-list">
            {points.length === 0 ? (
              <p className="text-sm text-slate-600" data-testid="admin-points-empty-message">
                Aún no hay puntos creados.
              </p>
            ) : (
              points.map((point) => (
                <article key={point.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4" data-testid={`admin-point-item-${point.id}`}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-widest text-slate-500" data-testid={`admin-point-order-${point.id}`}>
                        Punto {point.order}
                      </p>
                      <h4 className="text-base font-bold text-slate-900" data-testid={`admin-point-title-${point.id}`}>
                        {point.title}
                      </h4>
                    </div>
                    <p
                      className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                        point.status === "abierta"
                          ? "bg-green-100 text-green-700"
                          : point.status === "cerrada"
                            ? "bg-slate-200 text-slate-700"
                            : "bg-amber-100 text-amber-700"
                      }`}
                      data-testid={`admin-point-status-${point.id}`}
                    >
                      {point.status}
                    </p>
                  </div>

                  <p className="mt-2 text-sm text-slate-600" data-testid={`admin-point-description-${point.id}`}>
                    {point.description}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2" data-testid={`admin-point-actions-${point.id}`}>
                    <button
                      data-testid={`admin-open-point-button-${point.id}`}
                      type="button"
                      onClick={() => openPoint(point.id)}
                      disabled={point.status === "abierta"}
                      className="h-10 rounded-md bg-green-600 px-4 text-sm font-bold text-white transition-colors hover:bg-green-700 disabled:opacity-40"
                    >
                      Abrir votación
                    </button>
                    <button
                      data-testid={`admin-close-point-button-${point.id}`}
                      type="button"
                      onClick={() => closePoint(point.id)}
                      disabled={point.status !== "abierta"}
                      className="h-10 rounded-md bg-red-600 px-4 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-40"
                    >
                      Cerrar votación
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
          <p className="mt-3 text-sm text-slate-600" data-testid="admin-active-point-indicator">
            Punto activo: {activePointId ? `sí (${points.find((item) => item.id === activePointId)?.title})` : "ninguno"}
          </p>
        </article>

        <article className="ses-card p-5" data-testid="admin-directiva-results-card">
          <h3 className="text-lg font-bold text-slate-900">Resultados visibles para mesa directiva</h3>
          {directivaData?.has_data ? (
            <>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="admin-directiva-totals-grid">
                {Object.keys(normalizeVoteLabel).map((key) => (
                  <div key={key} className="rounded-lg border border-slate-200 bg-slate-50 p-3" data-testid={`admin-directiva-total-${key}`}>
                    <p className="text-xs text-slate-500">{normalizeVoteLabel[key]}</p>
                    <p className="ses-test-mono text-2xl font-black text-slate-900">{directivaData?.totals?.[key] ?? 0}</p>
                  </div>
                ))}
              </div>

              <p className="mt-3 text-sm text-slate-700" data-testid="admin-directiva-current-point">
                Punto observado: <strong>{directivaData?.point?.title}</strong>
              </p>
              <p className="ses-test-mono text-sm text-slate-600" data-testid="admin-directiva-point-votes-count">
                Votos emitidos en este punto: {directivaData?.stats?.votaron_este_punto ?? 0}
              </p>

              <div className="mt-3 max-h-80 overflow-auto rounded-md border border-slate-200" data-testid="admin-directiva-votes-table-wrapper">
                <table className="w-full border-collapse text-left text-sm" data-testid="admin-directiva-votes-table">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="px-3 py-2">Delegado</th>
                      <th className="px-3 py-2">Documento</th>
                      <th className="px-3 py-2">Voto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {directivaData.votes?.length ? (
                      directivaData.votes.map((vote, index) => (
                        <tr key={`${vote.delegate_id}-${index}`} className="border-t border-slate-200" data-testid={`admin-directiva-vote-row-${index}`}>
                          <td className="px-3 py-2" data-testid={`admin-directiva-vote-name-${index}`}>
                            {vote.delegate_name}
                          </td>
                          <td className="ses-test-mono px-3 py-2" data-testid={`admin-directiva-vote-document-${index}`}>
                            {vote.document_id}
                          </td>
                          <td className="px-3 py-2" data-testid={`admin-directiva-vote-choice-${index}`}>
                            {vote.choice_label}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td className="px-3 py-3 text-slate-500" colSpan={3} data-testid="admin-directiva-votes-empty-message">
                          Aún no hay votos emitidos para este punto.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-600" data-testid="admin-directiva-no-data-message">
              Cree y abra un punto para iniciar el seguimiento en tiempo real.
            </p>
          )}
        </article>
      </div>
    </section>
  );
}

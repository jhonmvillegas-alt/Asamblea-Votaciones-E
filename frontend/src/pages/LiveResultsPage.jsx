import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../lib/api";

const chartPalette = {
  aprobado: "#16A34A",
  no_aprobado: "#DC2626",
  abstencion: "#64748B",
  en_blanco: "#CBD5E1",
};

const chartLabels = {
  aprobado: "1. Aprobado",
  no_aprobado: "2. No aprobado",
  abstencion: "3. Abstención",
  en_blanco: "4. Voto en blanco",
};

export default function LiveResultsPage() {
  const [state, setState] = useState(null);

  const loadState = useCallback(async () => {
    try {
      const response = await api.getLiveState();
      setState(response);
    } catch {
      setState(null);
    }
  }, []);

  useEffect(() => {
    loadState();
    const poll = setInterval(loadState, 2000);
    return () => clearInterval(poll);
  }, [loadState]);

  const chartData = useMemo(() => {
    const activeResults = state?.active_results;
    if (!activeResults) {
      return [];
    }
    return Object.keys(chartLabels).map((key) => ({
      key,
      opcion: chartLabels[key],
      votos: activeResults[key] ?? 0,
    }));
  }, [state]);

  const chartWidth = useMemo(() => Math.max(560, chartData.length * 180), [chartData.length]);

  return (
    <section className="mx-auto w-full max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8" data-testid="live-results-page">
      <article className="ses-card ses-appear overflow-hidden" data-testid="live-hero-card">
        <div className="ses-live-pulse px-6 py-2 text-xs font-bold uppercase tracking-widest text-white" data-testid="live-hero-banner">
          Resultados en vivo de la asamblea
        </div>
        <div className="grid gap-4 p-6 lg:grid-cols-[1.3fr_1fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500" data-testid="live-current-point-label">
              Punto actualmente abierto
            </p>
            <h2 className="mt-1 text-3xl font-black text-slate-900 sm:text-4xl" data-testid="live-current-point-title">
              {state?.active_point ? state.active_point.title : "Esperando apertura del próximo punto"}
            </h2>
            <p className="mt-2 text-sm text-slate-600" data-testid="live-current-point-description">
              {state?.active_point?.description || "La mesa directiva abrirá la votación cuando corresponda."}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3" data-testid="live-participation-stats">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4" data-testid="live-total-padron-card">
              <p className="text-xs uppercase tracking-widest text-slate-500">Padrón</p>
              <p className="ses-test-mono text-3xl font-black text-slate-900">{state?.total_in_padron ?? 0}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4" data-testid="live-registered-card">
              <p className="text-xs uppercase tracking-widest text-slate-500">Registrados</p>
              <p className="ses-test-mono text-3xl font-black text-blue-700">{state?.registrados ?? 0}</p>
            </div>
          </div>
        </div>
      </article>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <article className="ses-card p-5" data-testid="live-chart-card">
          <h3 className="text-lg font-bold text-slate-900">Conteo del punto activo</h3>
          {chartData.length ? (
            <div className="mt-4 overflow-x-auto" data-testid="live-active-results-chart">
              <BarChart data={chartData} width={chartWidth} height={280}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="opcion" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="votos" radius={[8, 8, 0, 0]}>
                  {chartData.map((entry) => (
                    <Cell key={entry.key} fill={chartPalette[entry.key]} />
                  ))}
                </Bar>
              </BarChart>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-600" data-testid="live-chart-empty-message">
              Sin datos activos en este momento.
            </p>
          )}
        </article>

        <article className="ses-card p-5" data-testid="live-points-history-card">
          <h3 className="text-lg font-bold text-slate-900">Puntos y estado</h3>
          <div className="mt-3 max-h-[22rem] space-y-3 overflow-auto pr-1" data-testid="live-points-history-list">
            {(state?.all_points || []).length ? (
              state.all_points.map((point) => (
                <div key={point.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3" data-testid={`live-point-item-${point.id}`}>
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-900" data-testid={`live-point-title-${point.id}`}>
                      {point.order}. {point.title}
                    </p>
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${
                        point.status === "abierta"
                          ? "bg-green-100 text-green-700"
                          : point.status === "cerrada"
                            ? "bg-slate-200 text-slate-700"
                            : "bg-amber-100 text-amber-700"
                      }`}
                      data-testid={`live-point-status-${point.id}`}
                    >
                      {point.status}
                    </span>
                  </div>
                  <p className="ses-test-mono mt-2 text-xs text-slate-600" data-testid={`live-point-total-votes-${point.id}`}>
                    Total votos: {point.results?.total_votes ?? 0}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-600" data-testid="live-points-history-empty-message">
                Aún no hay puntos creados.
              </p>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}

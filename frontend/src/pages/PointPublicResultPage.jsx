import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../lib/api";

const optionStyles = {
  aprobado: "text-green-700",
  no_aprobado: "text-red-700",
  abstencion: "text-slate-700",
  en_blanco: "text-slate-500",
};

const chartPalette = {
  aprobado: "#16A34A",
  no_aprobado: "#DC2626",
  abstencion: "#64748B",
  en_blanco: "#CBD5E1",
};

export default function PointPublicResultPage() {
  const { pointId } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const cardRef = useRef(null);

  const chartData = useMemo(
    () =>
      Object.keys(optionStyles).map((key) => ({
        key,
        option: data?.choice_labels?.[key] || key,
        votes: data?.results?.[key] ?? 0,
      })),
    [data]
  );

  useEffect(() => {
    async function fetchPoint() {
      try {
        const response = await api.getPublicPointResult(pointId);
        setData(response);
      } catch (error) {
        toast.error(error.message);
      } finally {
        setLoading(false);
      }
    }
    fetchPoint();
  }, [pointId]);

  const downloadImage = async () => {
    if (!cardRef.current) {
      return;
    }
    try {
      const canvas = await html2canvas(cardRef.current, { scale: 2, backgroundColor: "#F8FAFC" });
      const link = document.createElement("a");
      link.download = `resultado_punto_${data?.point?.order || "ses"}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } catch {
      toast.error("No se pudo generar la imagen de resultados");
    }
  };

  if (loading) {
    return (
      <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8" data-testid="public-point-loading-page">
        <div className="ses-card p-6 text-slate-600">Cargando resultados del punto...</div>
      </section>
    );
  }

  if (!data?.point) {
    return (
      <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8" data-testid="public-point-not-found-page">
        <div className="ses-card p-6 text-slate-600">No se encontró el punto solicitado.</div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-4xl space-y-4 px-4 py-8 sm:px-6 lg:px-8" data-testid="public-point-results-page">
      <div className="flex flex-wrap justify-end gap-2" data-testid="public-point-actions">
        <button
          data-testid="public-point-download-image-button"
          type="button"
          onClick={downloadImage}
          className="h-10 rounded-md bg-blue-700 px-4 text-sm font-bold text-white transition-colors hover:bg-blue-800"
        >
          Descargar imagen para compartir
        </button>
      </div>

      <article ref={cardRef} className="ses-card bg-slate-50 p-6" data-testid="public-point-share-card">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-500" data-testid="public-point-order-label">
          Punto {data.point.order}
        </p>
        <h2 className="mt-1 text-4xl font-black text-slate-900" data-testid="public-point-title">
          {data.point.title}
        </h2>
        <p className="mt-2 text-sm text-slate-700" data-testid="public-point-description">
          {data.point.description}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="public-point-results-grid">
          {Object.keys(optionStyles).map((key) => (
            <div key={key} className="rounded-lg border border-slate-200 bg-white p-3" data-testid={`public-point-result-${key}`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{data.choice_labels[key]}</p>
              <p className={`ses-test-mono mt-1 text-3xl font-black ${optionStyles[key]}`}>
                {data.results?.[key] ?? 0}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-5 rounded-lg border border-slate-200 bg-white p-3" data-testid="public-point-results-chart-card">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500" data-testid="public-point-results-chart-title">
            Gráfico rápido del punto
          </p>
          <div className="mt-2 h-48" data-testid="public-point-results-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="option" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="votes" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry) => (
                    <Cell key={entry.key} fill={chartPalette[entry.key]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <p className="ses-test-mono mt-4 text-sm text-slate-700" data-testid="public-point-total-votes">
          Total votos en el punto: {data.results?.total_votes ?? 0}
        </p>
      </article>
    </section>
  );
}

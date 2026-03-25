import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock3, Vote } from "lucide-react";
import { toast } from "sonner";
import { api } from "../lib/api";

const voteButtons = [
  { value: "aprobado", label: "1. Aprobado", className: "bg-green-600 hover:bg-green-700 text-white" },
  { value: "no_aprobado", label: "2. No aprobado", className: "bg-red-600 hover:bg-red-700 text-white" },
  { value: "abstencion", label: "3. Abstención", className: "bg-slate-600 hover:bg-slate-700 text-white" },
  { value: "en_blanco", label: "4. Voto en blanco", className: "bg-slate-200 hover:bg-slate-300 text-slate-900" },
];

export default function DelegateDashboard({ auth }) {
  const [profile, setProfile] = useState(null);
  const [activePointState, setActivePointState] = useState({ has_active_point: false });
  const [loading, setLoading] = useState(true);
  const [submittingVote, setSubmittingVote] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [me, activePoint] = await Promise.all([api.getProfile(auth.accessToken), api.getActivePoint(auth.accessToken)]);
      setProfile(me);
      setActivePointState(activePoint);
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

  const onVote = async (choice) => {
    if (!activePointState?.point?.id || submittingVote) {
      return;
    }

    setSubmittingVote(true);
    try {
      const response = await api.castVote(auth.accessToken, {
        point_id: activePointState.point.id,
        choice,
      });
      toast.success(response.message);
      await refresh();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmittingVote(false);
    }
  };

  if (loading) {
    return (
      <section className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-8" data-testid="delegate-loading-screen">
        <div className="ses-card p-8 text-center text-slate-600">Cargando panel del delegado...</div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8 sm:px-6 lg:px-8" data-testid="delegate-dashboard-page">
      <div className="ses-card ses-appear p-5" data-testid="delegate-profile-card">
        <p className="text-xs font-bold uppercase tracking-widest text-blue-700">Delegado autenticado</p>
        <h2 className="mt-1 text-3xl font-black text-slate-900" data-testid="delegate-profile-name">
          {profile?.display_name}
        </h2>
        <p className="ses-test-mono text-sm text-slate-600" data-testid="delegate-profile-document">
          Documento: {profile?.document_id}
        </p>
      </div>

      {!activePointState?.has_active_point ? (
        <div className="ses-card ses-appear p-6 text-center" data-testid="delegate-no-active-point-card">
          <Clock3 className="mx-auto mb-3 h-8 w-8 text-slate-500" />
          <h3 className="text-xl font-bold text-slate-900">No hay punto abierto en este momento</h3>
          <p className="mt-2 text-sm text-slate-600" data-testid="delegate-no-active-point-message">
            Mantenga esta pantalla abierta. En cuanto la mesa directiva abra un punto, podrá votar aquí.
          </p>
        </div>
      ) : (
        <>
          <div className="ses-card ses-appear p-5" data-testid="delegate-active-point-card">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-widest text-green-700 ses-status-live" data-testid="delegate-live-status">
                Votación activa
              </p>
              <span
                className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-600"
                data-testid="delegate-point-order"
              >
                Punto {activePointState.point.order}
              </span>
            </div>

            <h3 className="text-2xl font-black text-slate-900" data-testid="delegate-point-title">
              {activePointState.point.title}
            </h3>
            <p className="mt-2 text-sm text-slate-600" data-testid="delegate-point-description">
              {activePointState.point.description}
            </p>

            {activePointState.has_voted ? (
              <div className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 p-4" data-testid="delegate-vote-confirmation-box">
                <p className="text-sm font-bold text-emerald-800">
                  <CheckCircle2 className="mr-1 inline h-4 w-4" />
                  Ya votó este punto: {activePointState.my_vote?.choice_label}
                </p>
              </div>
            ) : (
              <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="delegate-vote-options-grid">
                {voteButtons.map((item) => (
                  <button
                    key={item.value}
                    data-testid={`delegate-vote-option-${item.value}`}
                    type="button"
                    onClick={() => onVote(item.value)}
                    disabled={submittingVote}
                    className={`h-20 rounded-lg text-lg font-black uppercase tracking-wide transition-transform active:scale-95 disabled:opacity-60 ${item.className}`}
                  >
                    <Vote className="mr-2 inline h-5 w-5" />
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="ses-card ses-appear p-5" data-testid="delegate-live-count-card">
            <h3 className="text-lg font-bold text-slate-900">Conteo en caliente del punto activo</h3>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4" data-testid="delegate-live-count-grid">
              {voteButtons.map((item) => (
                <article key={item.value} className="rounded-lg border border-slate-200 bg-slate-50 p-3" data-testid={`delegate-live-count-${item.value}`}>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{item.label}</p>
                  <p className="ses-test-mono mt-1 text-2xl font-bold text-slate-900">
                    {activePointState?.results?.[item.value] ?? 0}
                  </p>
                </article>
              ))}
            </div>
            <p className="ses-test-mono mt-3 text-sm text-slate-600" data-testid="delegate-total-votes-active-point">
              Total de votos emitidos: {activePointState?.results?.total_votes ?? 0}
            </p>
          </div>
        </>
      )}
    </section>
  );
}

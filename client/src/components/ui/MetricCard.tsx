import SurfaceCard from "./SurfaceCard";
import StatusPill from "./StatusPill";

type MetricCardTone = "rose" | "violet" | "mint" | "amber" | "slate";

type MetricCardProps = {
  label: string;
  value: string;
  delta: string;
  tone?: MetricCardTone;
  subtitle?: string;
};

const cardTone: Record<MetricCardTone, string> = {
  rose: "bg-[#fff3e2]",
  violet: "bg-[#efebff]",
  mint: "bg-[#dff8ff]",
  amber: "bg-[#fff4dd]",
  slate: "bg-white",
};

const iconTone: Record<MetricCardTone, string> = {
  rose: "bg-amber-100 text-amber-500",
  violet: "bg-violet-100 text-violet-500",
  mint: "bg-cyan-100 text-cyan-500",
  amber: "bg-amber-100 text-amber-500",
  slate: "bg-slate-100 text-slate-500",
};

function MetricCard({ label, value, delta, tone = "slate", subtitle = "From Last Day" }: MetricCardProps): JSX.Element {
  return (
    <SurfaceCard className={["p-3", cardTone[tone]].join(" ")}>
      <div className="flex items-start gap-3">
        <div className={["grid h-10 w-10 place-items-center rounded-xl text-lg", iconTone[tone]].join(" ")}>◌</div>
        <div className="flex-1">
          <p className="text-3xl font-semibold leading-none text-slate-700">{value}</p>
          <p className="mt-1 text-xs font-medium text-slate-500">{label}</p>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <StatusPill label={`↗ ${delta}`} tone="mint" />
        <p className="text-xs text-slate-400">{subtitle}</p>
      </div>
    </SurfaceCard>
  );
}

export default MetricCard;
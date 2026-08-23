type StatusPillTone = "rose" | "violet" | "mint" | "amber" | "slate";

type StatusPillProps = {
  label: string;
  tone?: StatusPillTone;
};

const toneClasses: Record<StatusPillTone, string> = {
  rose: "bg-rose-100 text-rose-700",
  violet: "bg-violet-100 text-violet-700",
  mint: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
  slate: "bg-slate-100 text-slate-600",
};

function StatusPill({ label, tone = "slate" }: StatusPillProps): JSX.Element {
  return <span className={["rounded-full px-3 py-1 text-xs font-semibold tracking-tight", toneClasses[tone]].join(" ")}>{label}</span>;
}

export default StatusPill;
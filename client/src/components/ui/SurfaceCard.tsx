import { type ReactNode } from "react";

type SurfaceCardProps = {
  children: ReactNode;
  className?: string;
};

function SurfaceCard({ children, className = "" }: SurfaceCardProps): JSX.Element {
  return (
    <article
      className={[
        "rounded-[26px] border border-white/90 bg-white/88 p-5 shadow-[0_12px_30px_rgba(80,88,101,0.09)] backdrop-blur-sm",
        className,
      ].join(" ")}
    >
      {children}
    </article>
  );
}

export default SurfaceCard;
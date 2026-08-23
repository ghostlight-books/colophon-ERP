export type StatItem = {
  value: string;
  label: string;
};

type StatsGridProps = {
  items: StatItem[];
};

function StatsGrid({ items }: StatsGridProps): JSX.Element {
  return (
    <div className="container stats">
      {items.map((item) => (
        <div className="glass stats__item" key={item.label}>
          <div className="stats__num">{item.value}</div>
          <div className="stats__desc">{item.label}</div>
        </div>
      ))}
    </div>
  );
}

export default StatsGrid;
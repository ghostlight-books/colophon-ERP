export type ModuleCard = {
  id: string;
  title: string;
  description: string;
};

type ModuleCardsProps = {
  title: string;
  subtitle: string;
  cards: ModuleCard[];
};

function ModuleCards({ title, subtitle, cards }: ModuleCardsProps): JSX.Element {
  return (
    <section className="section">
      <div className="section__header">
        <h2 className="section__title">{title}</h2>
        <span className="section__subtitle">{subtitle}</span>
      </div>

      <div className="card-grid">
        {cards.map((card, index) => (
          <article className="glass glass-card" key={card.id}>
            <div className="glass-card__label">Module {String(index + 1).padStart(2, "0")}</div>
            <h3 className="glass-card__title">{card.title}</h3>
            <p className="glass-card__body">{card.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export default ModuleCards;
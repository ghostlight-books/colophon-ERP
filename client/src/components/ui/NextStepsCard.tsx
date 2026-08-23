type NextStepsCardProps = {
  title: string;
  subtitle: string;
  body: string;
  sectionId?: string;
};

function NextStepsCard({ title, subtitle, body, sectionId }: NextStepsCardProps): JSX.Element {
  return (
    <section className="section" id={sectionId}>
      <div className="section__header">
        <h2 className="section__title">{title}</h2>
        <span className="section__subtitle">{subtitle}</span>
      </div>

      <div className="glass glass-card">
        <h3 className="glass-card__title">Delivery Path</h3>
        <p className="glass-card__body">{body}</p>
      </div>
    </section>
  );
}

export default NextStepsCard;
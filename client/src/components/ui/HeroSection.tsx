type HeroSectionProps = {
  onExploreHref: string;
  onNextStepsHref: string;
};

function HeroSection({ onExploreHref, onNextStepsHref }: HeroSectionProps): JSX.Element {
  return (
    <header className="hero">
      <span className="hero__kicker">Colophon ERP</span>
      <h1 className="hero__title">Bookstore Operations Hub</h1>
      <p className="hero__sub">
        Inventory, POS, network, purchasing, and finance workflows in one modular workspace.
      </p>

      <div className="hero__cta">
        <a href={onExploreHref} className="glass glass-btn glass-btn--primary">
          Explore Modules
        </a>
        <a href={onNextStepsHref} className="glass glass-btn glass-btn--ghost">
          View Next Steps
        </a>
      </div>
    </header>
  );
}

export default HeroSection;
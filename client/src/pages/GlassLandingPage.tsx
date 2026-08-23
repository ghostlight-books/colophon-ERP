import HeroSection from "../components/ui/HeroSection";
import ModuleCards, { type ModuleCard } from "../components/ui/ModuleCards";
import NextStepsCard from "../components/ui/NextStepsCard";
import StatsGrid, { type StatItem } from "../components/ui/StatsGrid";

const stats: StatItem[] = [
  { value: "5", label: "Core Domains" },
  { value: "API", label: "Backend Ready" },
  { value: "UI", label: "React + Vite" },
];

const moduleCards: ModuleCard[] = [
  {
    id: "inventory",
    title: "Inventory",
    description: "Stock levels, receiving, transfer flows, and ISBN-driven catalog operations.",
  },
  {
    id: "pos",
    title: "Point of Sale",
    description: "Fast register interactions, discounts, and checkout pathways for in-store operations.",
  },
  {
    id: "finance",
    title: "Finance",
    description: "Ledger-ready transactions, reconciliation support, and reporting integration points.",
  },
];

function GlassLandingPage(): JSX.Element {
  return (
    <>
      <div className="scene" aria-hidden="true">
        <div className="scene__blob scene__blob--1"></div>
        <div className="scene__blob scene__blob--2"></div>
        <div className="scene__blob scene__blob--3"></div>
      </div>

      <main className="page">
        <HeroSection onExploreHref="#modules" onNextStepsHref="#next-steps" />
        <StatsGrid items={stats} />

        <div className="container page" id="modules">
          <ModuleCards
            title="Workspace Modules"
            subtitle="Foundation cards wired to your ERP roadmap"
            cards={moduleCards}
          />

          <div className="divider"></div>

          <NextStepsCard
            sectionId="next-steps"
            title="Next Build Steps"
            subtitle="Suggested implementation sequence"
            body="Prioritize inventory listing and receiving, then POS checkout, then purchasing and finance dashboards to complete the initial end-to-end transaction lifecycle."
          />
        </div>
      </main>
    </>
  );
}

export default GlassLandingPage;
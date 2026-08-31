import LibraryBottomNav from "./nav/LibraryBottomNav";
import StoreBottomNav from "./nav/StoreBottomNav";

export interface MobileBottomNavProps {
  workspaceMode?: "bookstore" | "library";
  openOffersCount?: number;
  loanedCount?: number;
}

// Store and Library each have their own dedicated nav component (see ./nav) so
// editing one workspace's tabs can never bleed into the other's.
export default function MobileBottomNav({
  workspaceMode = "library",
  openOffersCount = 0,
  loanedCount,
}: MobileBottomNavProps): JSX.Element {
  if (workspaceMode === "bookstore") {
    return <StoreBottomNav />;
  }

  return <LibraryBottomNav openOffersCount={openOffersCount} loanedCount={loanedCount} />;
}

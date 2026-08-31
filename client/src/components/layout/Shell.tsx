import LibraryShell from "./LibraryShell";
import StoreShell from "./StoreShell";
import type { ShellProps } from "./shellTypes";

export type { ShellNavChild, ShellNavItem, LoggedInUser } from "./shellTypes";

// Store and Library each have their own fully separate shell (chrome, sidebar,
// header, drawer) in ./StoreShell.tsx and ./LibraryShell.tsx. This just picks
// one, so editing one edition's chrome can never bleed into the other's.
function Shell(props: ShellProps): JSX.Element {
  if (props.workspaceMode === "library") {
    return <LibraryShell {...props} />;
  }

  return <StoreShell {...props} />;
}

export default Shell;

import type { ReactNode } from "react";

export type ShellNavChild = {
  key: string;
  label: string;
  to: string;
  icon?: ReactNode;
};

export type ShellNavItem = {
  key: string;
  label: string;
  icon: ReactNode;
  to: string;
  children?: ShellNavChild[];
};

export type LoggedInUser = {
  name: string;
  email: string;
  role: string;
};

export type ShellProps = {
  greeting: string;
  subtitle: string;
  navItems: ShellNavItem[];
  activePath: string;
  onNavigate: (to: string) => void;
  currentUser: LoggedInUser;
  onCurrentUserChange: (user: LoggedInUser) => void;
  workspaceMode?: "bookstore" | "library";
  onWorkspaceModeChange?: (mode: "bookstore" | "library") => void;
  children: ReactNode;
};

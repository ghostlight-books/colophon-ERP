export const SYSTEM_MODULES = ["DASHBOARD", "POS", "CALENDAR", "LISTS", "INTAKE", "INVENTORY", "ACCOUNTING", "SETTINGS_USERS"] as const;
export type SystemModule = (typeof SYSTEM_MODULES)[number];

export const SYSTEM_ROLES = ["OWNER", "ADMIN", "ASSOCIATE", "RECEIVER", "EVENTS_COORDINATOR", "BUYER_MERCHANDISER", "ACCOUNTANT", "CONSIGNOR"] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

export const ROLE_MODULE_ACCESS: Record<SystemRole, readonly SystemModule[]> = {
  OWNER: SYSTEM_MODULES,
  ADMIN: ["DASHBOARD", "POS", "CALENDAR", "LISTS", "INTAKE", "INVENTORY", "ACCOUNTING", "SETTINGS_USERS"],
  ASSOCIATE: ["DASHBOARD", "POS", "CALENDAR", "LISTS", "INTAKE", "INVENTORY"],
  RECEIVER: ["DASHBOARD", "INTAKE", "INVENTORY"],
  EVENTS_COORDINATOR: ["DASHBOARD", "POS", "CALENDAR", "LISTS", "INVENTORY"],
  BUYER_MERCHANDISER: ["DASHBOARD", "LISTS", "INTAKE", "INVENTORY"],
  ACCOUNTANT: ["DASHBOARD", "INVENTORY", "ACCOUNTING"],
  CONSIGNOR: ["DASHBOARD", "INVENTORY"],
};

export function hasModuleAccess(role: string | null | undefined, module: SystemModule): boolean {
  return (ROLE_MODULE_ACCESS[role as SystemRole] ?? []).includes(module);
}

export function normalizeRole(role: string | null | undefined): SystemRole {
  const value = (role ?? "OWNER").toUpperCase().replace(/[ /-]+/g, "_");
  return SYSTEM_ROLES.includes(value as SystemRole) ? value as SystemRole : "OWNER";
}
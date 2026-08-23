export type UserRole = "ADMIN" | "MANAGER" | "CASHIER" | "BUYER";

export interface UserProfile {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

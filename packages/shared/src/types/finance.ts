export interface LedgerEntry {
  id: string;
  accountCode: string;
  amountCents: number;
  direction: "DEBIT" | "CREDIT";
  memo?: string;
  createdAt: string;
}

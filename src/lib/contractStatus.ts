export type ContractStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "signed"
  | "declined"
  | "overridden"
  | "revoked";

export interface ContractWithStatus {
  status: ContractStatus;
}

export function isValidLatestContract(contract: ContractWithStatus | null | undefined): boolean {
  return contract?.status === "signed" || contract?.status === "overridden";
}

export function propertyEditorContract<T extends ContractWithStatus>(contract: T | null | undefined): T | null {
  return contract?.status === "revoked" ? null : contract ?? null;
}
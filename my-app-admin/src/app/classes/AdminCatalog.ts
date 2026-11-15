export type CatalogResource =
  'owners' | 'properties' | 'schools' | 'brokerage-agreements' | 'work-locations' | 'customers';
export interface CatalogRecord {
  id: string;
  name?: string;
  fullName?: string;
  phone?: string;
  active?: boolean;
  status?: string;
  [field: string]: unknown;
}
export interface AuditEntry {
  id: string;
  entityType: string;
  entityId: string;
  actorId: string | null;
  action: string;
  at: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}
export interface AuditPage {
  items: AuditEntry[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}
export interface PriceHistory {
  id: string;
  roomId: string;
  oldPrice: number;
  newPrice: number;
  effectiveFrom: string;
  effectiveTo: string | null;
  changedBy: string;
  reason?: string;
}

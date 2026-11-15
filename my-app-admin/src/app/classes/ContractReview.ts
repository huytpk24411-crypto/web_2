import { RoomSnapshot } from './Room';

export type ContractReviewState = 'pending' | 'done';
export type ContractReviewOutcome = 'PENDING' | 'SUCCESS' | 'ABANDONED';

export interface ContractReviewFees {
  electricityPrice?: number;
  waterPrice?: number;
  serviceFee?: number;
  fees?: Record<string, number | string>;
}

export interface ContractReview {
  deposit: {
    id: string;
    number?: string;
    status: string;
    proposedLease?: { months?: number; startDate?: string; monthlyRent?: number };
  };
  contract:
    | (ContractReviewFees & {
        id: string;
        number?: string;
        status: 'DRAFT' | 'SIGNED' | 'COMPLETED' | 'VOID' | 'CANCELLED';
        createdAt?: string;
        createdOn?: string;
        signedAt?: string;
        startDate?: string;
        endDate?: string;
        monthlyRent?: number;
      })
    | null;
  room: Partial<RoomSnapshot> & ContractReviewFees;
  customer: { name: string; phone?: string; identityMasked?: string };
  employee: { id: string; fullName: string; employeeCode?: string };
  owner: { name: string; phone?: string };
  amounts: { total: number; holdCredit: number; companyShare: number; ownerShare: number };
  depositAt: string;
  daysSinceDeposit: number;
  overdue: boolean;
  outcome: ContractReviewOutcome;
  decidedAt?: string;
  decidedBy?: string | { id?: string; name?: string; fullName?: string };
  note?: string;
}

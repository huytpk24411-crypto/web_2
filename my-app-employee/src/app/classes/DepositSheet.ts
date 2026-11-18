export interface DepositDraftData {
  bookingId: string;
  customerName: string;
  phone: string;
  propertyId: string;
  floor: string;
  roomId: string;
  total: number;
  duration: number;
  startDate: string;
  collectedMethod: 'CASH' | 'BANK_TRANSFER';
  note: string;
  idNumber?: string;
  issuedOn?: string;
  issuedBy?: string;
  permanentAddress?: string;
  frontImageUrl?: string;
  backImageUrl?: string;
}

export interface DepositDraft {
  id: string;
  employeeId: string;
  data: Partial<DepositDraftData>;
  label: { customerName: string; phone: string; roomCode: string; roomName: string };
  createdAt: string;
  updatedAt: string;
}

export interface DepositSheet {
  // A new form has no issued sheet yet. Company data comes exclusively from B2.
  company: { name: string; taxCode: string; address: string; hotline: string } | null;
  deposit: {
    id: string;
    number: string;
    status: string;
    statusLabel: string;
    createdAt: string | null;
    recognitionMonth?: string;
    payrollMonth?: string;
    totalRequired: number;
    holdCredit: number;
    amountDue: number;
    collected: {
      method: 'CASH' | 'BANK_TRANSFER';
      amount: number;
      note: string;
      at: string | null;
    };
    proposedLease: {
      months: number | null;
      startDate: string | null;
      endDate: string | null;
      monthlyRent: number | null;
    };
  };
  hold: { number: string } | null;
  customer: {
    fullName: string;
    phone: string;
    identity: { number: string; issuedDate: string; issuedPlace: string } | null;
    permanentAddress: string;
  };
  employee: { fullName: string; employeeCode: string };
  room: {
    code: string;
    name: string;
    propertyName: string;
    floor: string | null;
    address: string;
    type: string;
    monthlyRent: number | null;
    electricityPrice: number | null;
    waterPrice: number | null;
    fees: { name: string; amount: number }[];
  };
  contract: { id: string; number: string; status: string } | null;
}

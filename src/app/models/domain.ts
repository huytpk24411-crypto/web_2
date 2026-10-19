export type Role = 'CUSTOMER' | 'EMPLOYEE' | 'ADMIN';
export interface Account {
  id: string;
  username: string;
  name: string;
  role: Role;
  phone?: string;
}
export interface Customer {
  id: string;
  accountId: string;
  phone: string;
}
export interface Employee {
  id: string;
  accountId: string;
  name: string;
  position: string;
  phone: string;
  avatar: string;
}
export type StaffStatus = 'ACTIVE' | 'ON_LEAVE' | 'INACTIVE';
export interface StaffProfile {
  archivedAt?: string;
  id: string;
  employeeCode: string;
  fullName: string;
  birthDate: string;
  gender: 'FEMALE' | 'MALE' | 'OTHER';
  phone: string;
  email: string;
  position: string;
  workLocationId: string;
  startDate: string;
  contractType: string;
  status: StaffStatus;
  avatar: string;
}
export interface WorkLocation {
  id: string;
  name: string;
  address: string;
}
export interface RegistrationPeriod {
  id: string;
  name: string;
  weekStart: string;
  opensAt: string;
  closesAt: string;
  maxEmployeesPerShift: number;
}
export interface StaffShift {
  vacanciesToReassign?: number;
  id: string;
  periodId: string;
  workLocationId: string;
  date: string;
  label: string;
  start: string;
  end: string;
  capacity: number;
  needsReassignment?: boolean;
}
export interface ShiftAssignment {
  movedFromAssignmentId?: string;
  id: string;
  employeeId: string;
  shiftId: string;
  status: 'REGISTERED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
}
export interface ShiftTask {
  transfers?: {
    fromShiftId: string;
    toShiftId: string;
    at: string;
    previousAssigneeIds: string[];
  }[];
  id: string;
  title: string;
  originShiftId: string;
  currentShiftId: string;
  assigneeIds: string[];
  doneBy: string[];
  status: 'TODO' | 'IN_PROGRESS' | 'DONE';
  needsReassignment?: boolean;
}
export interface StaffAttendance {
  id: string;
  assignmentId: string;
  checkInAt: string;
  checkOutAt?: string;
}
export interface Property {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  images: string[];
  locationSource?: string;
  locationStatus: 'sourced' | 'demo' | 'pending';
  demo?: boolean;
}
export interface School {
  id: string;
  name: string;
  campus: string;
  address: string;
  lat: number;
  lng: number;
  logo: string;
  source: string;
}
export interface PropertySchool {
  propertyId: string;
  schoolId: string;
  source: string;
}
export interface Room {
  id: string;
  code: string;
  name: string;
  propertyId: string;
  number: string;
  address: string;
  district: string;
  price: number;
  area: number;
  capacity: number;
  type: string;
  status: 'AVAILABLE' | 'HELD' | 'RENTED' | 'MAINTENANCE';
  businessStatus?: 'AVAILABLE' | 'HELD' | 'RENTED' | 'MAINTENANCE';
  publicationStatus: 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
  images: string[];
  featured: boolean;
  hasHistory: boolean;
  amenities: string[];
  description: string;
  floor?: string;
  deposit?: number;
  fees?: Record<string, number | string>;
  propertyName?: string;
  createdAt?: string;
  updatedAt?: string;
  mediaStatus?: 'design-reference' | 'illustrative' | 'confirmed';
}
export interface Favorite {
  customerId: string;
  roomId: string;
}
export interface ContactRequest {
  id: string;
  name: string;
  phone: string;
  email: string;
  message: string;
  status: 'PENDING' | 'RESPONDED';
  createdAt: string;
}
export interface Viewing {
  id: string;
  customerId: string;
  roomIds: string[];
  name: string;
  phone: string;
  at: string;
  note: string;
  status: 'SCHEDULED' | 'CANCELLED';
}
export interface BookingHold {
  id: string;
  customerId: string;
  roomId: string;
  name: string;
  phone: string;
  amount: number;
  status: 'PENDING' | 'CONFIRMED' | 'EXPIRED';
  paymentId?: string;
  expiresAt?: string;
  createdAt: string;
  creditedToDepositId?: string;
  moveIn?: string;
  note?: string;
}
export interface DepositDossier {
  id: string;
  roomId: string;
  customerName: string;
  phone: string;
  total: number;
  holdCredit: number;
  due: number;
  bookingId?: string;
  method: 'QR' | 'CASH';
  status: 'PENDING' | 'CONFIRMED' | 'FORFEITED';
  paymentId?: string;
  createdBy: string;
  address?: string;
  duration?: number;
  startDate?: string;
}
export interface Payment {
  id: string;
  referenceId: string;
  amount: number;
  method: 'QR' | 'CASH';
  status: 'CONFIRMED_DEMO';
  confirmedAt: string;
}
export interface Receipt {
  id: string;
  paymentId: string;
  referenceId: string;
  title: string;
  amount: number;
  name: string;
  roomCode: string;
  createdAt: string;
  demo: true;
}
export interface ShiftPeriod {
  id: string;
  label: string;
  maxPerEmployee: number;
}
export interface Shift {
  id: string;
  periodId: string;
  date: string;
  label: string;
  start: string;
  end: string;
  capacity: number;
  occupied: number;
}
export interface EmployeeShift {
  id: string;
  employeeId: string;
  shiftId: string;
  status: 'REGISTERED' | 'IN_PROGRESS' | 'COMPLETED';
}
export interface Task {
  id: string;
  title: string;
  employeeShiftIds: string[];
  assigneeIds: string[];
  doneBy: string[];
  status: 'TODO' | 'IN_PROGRESS' | 'DONE';
  carriedFrom?: string;
}
export interface Attendance {
  id: string;
  employeeShiftId: string;
  checkInAt: string;
  checkOutAt?: string;
  evidence: string;
  note: string;
  handover?: string;
}
export interface PayrollPeriod {
  id: string;
  label: string;
}
export interface PayrollSlip {
  id: string;
  employeeId: string;
  periodId: string;
  base: number;
  allowance: number;
  brokerageRevenue: number;
  commissionRate: number;
  bonus: number;
  deduction: number;
}
export interface BrokerageDeal {
  id: string;
  depositId?: string;
  roomId: string;
  customerName: string;
  brokerageFee: number;
  status: 'PENDING' | 'COMPLETED' | 'FORFEITED';
  forfeitureReason?: string;
  forfeitedAt?: string;
}
export interface RevenueAllocation {
  id: string;
  dealId: string;
  employeeId: string;
  amount: number;
}
export interface Commission {
  id: string;
  allocationId: string;
  rate: number;
  amount: number;
}

// Logical foreign keys. MongoDB enforces _id/unique indexes; API services and this
// catalog validate references. Embedded snapshots keep historical room information.
const relations = [];
function ref(from, field, to, options = {}) {
  relations.push({ from, field, to, target: "id", optional: true, ...options });
}
ref("Account", "role", "Role", { optional: false });
ref("Account", "roles[].role", "Role", { mirror: true });
ref("AccountRole", "accountId", "Account", { optional: false });
ref("AccountRole", "roleId", "Role", { optional: false });
ref("Customer", "accountId", "Account", { unique: true });
ref("Customer", "createdByEmployeeId", "Employee");
ref("Employee", "accountId", "Account", { optional: false, unique: true });
ref("Favorite", "customerId", "Customer", { optional: false });
ref("Favorite", "roomId", "Room", { optional: false });
ref("PropertySchool", "propertyId", "Property", { optional: false });
ref("PropertySchool", "schoolId", "School", { optional: false });
ref("Property", "nearbySchools[].schoolId", "School", { mirror: true });
ref("Room", "propertyId", "Property", { optional: false });
ref("Room", "ownerId", "Owner", { optional: false });
ref("Room", "tour.roomId", "Room", { mirror: true });
ref("RoomImage", "roomId", "Room", { optional: false });
ref("RoomPriceHistory", "roomId", "Room", {
  optional: false,
  historical: true,
});
ref("RoomPriceHistory", "changedBy", "Account");
ref("BrokerageAgreement", "roomId", "Room", {
  optional: false,
  historical: true,
});
ref("BrokerageAgreement", "ownerId", "Owner", { optional: false });
// Unlike the other customer links, Viewing.customerId is the Account BSON ObjectId.
ref("Viewing", "customerId", "Account", { target: "_id", optional: false });
ref("Viewing", "customerProfileId", "Customer", { optional: false });
ref("Viewing", "employeeId", "Employee");
ref("Viewing", "rooms[].roomId", "Room", { mirror: true, historical: true });
// Viewing.bookingId groups a multi-room viewing checkout (dl-*); it is not a Hold FK.
ref("Viewing", "taskId", "Task");
ref("ViewingDetail", "viewingId", "Viewing", { optional: false });
ref("ViewingDetail", "roomId", "Room", { optional: false, historical: true });
ref("Hold", "customerId", "Customer", { optional: false });
ref("Hold", "roomId", "Room", { optional: false, historical: true });
ref("Hold", "employeeId", "Employee");
ref("Hold", "viewingId", "Viewing");
ref("Hold", "policyVersionId", "Policy", { optional: false });
ref("Hold", "policyLevelId", "PolicyLevel", { optional: false });
ref("Hold", "paymentId", "Payment");
ref("Hold", "companyRevenueId", "CompanyRevenue");
ref("Hold", "creditedToDepositId", "Deposit", { unique: true });
ref("DepositDraft", "employeeId", "Employee", { optional: false });
ref("DepositDraft", "data.roomId", "Room");
ref("DepositDraft", "data.propertyId", "Property");
ref("DepositDraft", "data.bookingId", "Hold");
ref("Deposit", "customerId", "Customer", { optional: false });
ref("Deposit", "employeeId", "Employee", { optional: false });
ref("Deposit", "roomId", "Room", { optional: false, historical: true });
ref("Deposit", "ownerId", "Owner", { optional: false });
ref("Deposit", "holdId", "Hold", { unique: true });
ref("Deposit", "paymentIds[]", "Payment");
ref("Deposit", "contractId", "Contract", { unique: true });
ref("Deposit", "brokerageTransactionId", "BrokerageTransaction", {
  unique: true,
});
ref("Deposit", "decidedBy", "Account");
ref("Deposit", "abandonment.recordedBy", "Employee");
ref("Payment", "holdId", "Hold");
ref("Payment", "depositId", "Deposit");
ref("Payment", "customerId", "Customer");
ref("Payment", "roomId", "Room", { historical: true });
ref("Payment", "confirmedByEmployeeId", "Employee");
ref("Payment", "rejection.employeeId", "Employee");
ref("Payment", "companyRevenueId", "CompanyRevenue");
ref("Payment", "receipt.paymentId", "Payment", { mirror: true });
ref("Receipt", "paymentId", "Payment", { optional: false, unique: true });
ref("Receipt", "customerId", "Customer");
ref("Receipt", "roomId", "Room", { historical: true });
ref("Receipt", "snapshot.holdId", "Hold", { mirror: true });
ref("Contract", "depositId", "Deposit", { optional: false, unique: true });
ref("Contract", "customerId", "Customer", { optional: false });
ref("Contract", "roomId", "Room", { optional: false, historical: true });
ref("Contract", "ownerId", "Owner", { optional: false });
for (const field of ["signedBy", "approvedBy", "decidedBy", "voidedBy"])
  ref("Contract", field, "Account");
ref("BrokerageTransaction", "contractId", "Contract", {
  reservedPrefix: "deposit:",
});
ref("BrokerageTransaction", "depositId", "Deposit");
ref("BrokerageTransaction", "agreementId", "BrokerageAgreement", {
  historical: true,
});
ref("BrokerageTransaction", "employeeRevenueId", "EmployeeRevenue");
ref("BrokerageTransaction", "companyRevenueId", "CompanyRevenue");
ref("BrokerageTransaction", "payrollPeriodId", "PayrollPeriod");
ref("BrokerageTransaction", "employeeId", "Employee");
ref("BrokerageTransaction", "customerId", "Customer");
ref("BrokerageTransaction", "roomId", "Room", { historical: true });
ref("BrokerageTransaction", "decidedBy", "Account");
ref("EmployeeRevenue", "employeeId", "Employee", { optional: false });
ref("EmployeeRevenue", "periodId", "PayrollPeriod", { optional: false });
ref("EmployeeRevenue", "commissionId", "Commission", { unique: true });
ref("CompanyRevenue", "periodId", "PayrollPeriod", {
  optional: false,
  unique: true,
});
ref("Commission", "employeeId", "Employee", { optional: false });
ref("Commission", "periodId", "PayrollPeriod", { optional: false });
ref("Commission", "policyLevelId", "PolicyLevel", { optional: false });
ref("Commission", "policyVersionId", "Policy");
ref("PayrollAdjustment", "periodId", "PayrollPeriod", { optional: false });
ref("PayrollAdjustment", "policyLevelId", "PolicyLevel");
ref("Payslip", "periodId", "PayrollPeriod", { optional: false });
ref("Payslip", "employeeId", "Employee", { optional: false });
ref("Payslip", "commissionId", "Commission", { optional: false, unique: true });
ref("Payslip", "adjustmentId", "PayrollAdjustment", {
  optional: false,
  unique: true,
});
ref("Payslip", "lateness[].attendanceId", "Attendance", { mirror: true });
ref("Payslip", "lateness[].policyLevelId", "PolicyLevel", { mirror: true });
ref("Payslip", "revenueDetails[].contractId", "Contract", { mirror: true });
ref("PayrollPeriod", "closedBy", "Account");
ref("PayrollPeriod", "policyVersionIds[]", "Policy");
ref("Policy", "issuedByAccountId", "Account", { optional: false });
ref("Policy", "levels[].policyId", "Policy", { mirror: true });
ref("Policy", "levels[].id", "PolicyLevel", { mirror: true });
ref("PolicyLevel", "policyId", "Policy", { optional: false });
ref("PeriodRegistration", "periodId", "RegistrationPeriod", {
  optional: false,
});
ref("PeriodRegistration", "employeeId", "Employee", { optional: false });
ref("Shift", "periodId", "RegistrationPeriod", { optional: false });
ref("Shift", "workLocationId", "WorkLocation", { optional: false });
ref("ShiftAssignment", "shiftId", "Shift", { optional: false });
ref("ShiftAssignment", "employeeId", "Employee", { optional: false });
ref("ShiftAssignment", "registrationId", "PeriodRegistration", {
  optional: false,
});
ref("ShiftAssignment", "movedFromAssignmentId", "ShiftAssignment");
ref("ShiftAssignment", "attendance.adjustmentId", "PayrollAdjustment", {
  mirror: true,
});
ref("Attendance", "assignmentId", "ShiftAssignment", {
  optional: false,
  unique: true,
});
ref("Attendance", "adjustmentId", "PayrollAdjustment");
ref("Attendance", "evidence[].id", "AttendanceEvidence", { mirror: true });
ref("ShiftAssignment", "attendance.id", "Attendance", { mirror: true });
ref("ShiftAssignment", "attendance.evidence[].id", "AttendanceEvidence", {
  mirror: true,
});
ref("Payment", "receipt.id", "Receipt", { mirror: true });
ref("Payslip", "revenueDetails[].id", "BrokerageTransaction", { mirror: true });
ref("AttendanceEvidence", "attendanceId", "Attendance", { optional: false });
for (const field of ["createdBy", "confirmedBy", "updatedBy"])
  ref("Task", field, "Account");
ref("Task", "currentShiftId", "Shift");
ref("Task", "viewingId", "Viewing");
ref("Task", "waitingEmployeeIds[]", "Employee", { mirror: true });
ref("Task", "shiftLinks[].shiftId", "Shift", { mirror: true });
ref("Task", "shiftLinks[].id", "TaskShift", { mirror: true });
ref("Task", "shiftLinks[].fromShiftId", "Shift", { mirror: true });
ref("Task", "assignees[].taskShiftId", "TaskShift", { mirror: true });
ref("Task", "assignees[].shiftLinkId", "TaskShift", { mirror: true });
ref("Task", "assignees[].assignmentId", "ShiftAssignment", { mirror: true });
ref("Task", "assignees[].employeeId", "Employee", { mirror: true });
ref("Task", "assignees[].id", "TaskAssignment", { mirror: true });
ref("TaskShift", "taskId", "Task", { optional: false });
ref("TaskShift", "shiftId", "Shift", { optional: false });
ref("TaskShift", "fromShiftId", "Shift");
ref("TaskShift", "fromAssignmentId", "ShiftAssignment");
ref("TaskShift", "by", "Account");
ref("TaskAssignment", "taskId", "Task");
ref("TaskAssignment", "taskShiftId", "TaskShift", { optional: false });
ref("TaskAssignment", "shiftLinkId", "TaskShift", { mirror: true });
ref("TaskAssignment", "assignmentId", "ShiftAssignment", { optional: false });
ref("TaskAssignment", "employeeId", "Employee", { optional: false });
ref("TaskAssignment", "transferredTo", "TaskAssignment");
ref("TaskAssignment", "fromTaskAssignmentId", "TaskAssignment", {
  unique: true,
});
ref("ContactRequest", "respondedBy", "Employee");
ref("Notification", "accountId", "Account", { optional: false });
ref("AuditLog", "actorId", "Account");
ref("PasswordReset", "accountId", "Account", { target: "_id" });

const polymorphic = [
  {
    from: "Room",
    field: "lock.refId",
    discriminator: "lock.kind",
    targets: { HOLD: "Hold", DEPOSIT: "Deposit", CONTRACT: "Contract" },
  },
  {
    from: "Notification",
    field: "entityId",
    discriminator: "entityType",
    dynamicCollection: true,
    historical: true,
  },
  {
    from: "AuditLog",
    field: "entityId",
    discriminator: "entityType",
    dynamicCollection: true,
    historical: true,
  },
];
module.exports = { relations, polymorphic };

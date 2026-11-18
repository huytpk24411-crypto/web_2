const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createDepositService } = require("./services/deposit-service");
const { createPayrollService } = require("./services/payroll-service");

function fixture(period = null, now = new Date("2026-12-31T17:30:00Z")) {
  const empty = {
    findOne: async () => null,
    find: () => ({ toArray: async () => [] }),
  };
  const deps = {
    crypto,
    database: { collection: () => empty },
    requireRole: () => () => {},
    p3Collections: {
      PayrollPeriod: {
        findOne: async (query) => {
          assert.deepEqual(query, { year: 2027, month: 1 });
          return period;
        },
      },
      BrokerageAgreement: {
        find: () => ({
          toArray: async () => [
            {
              id: "agreement",
              feeMethod: "PERCENT_OF_MONTHLY_RENT",
              feeValue: 5000,
            },
          ],
        }),
      },
      CompanyRevenue: empty,
      EmployeeRevenue: empty,
    },
    accountCollection: empty,
    customerCollection: empty,
    employeeCollection: empty,
    snapshotRoom: async (room) => ({ id: room.id }),
  };
  createDepositService(deps);
  createPayrollService(deps);
  const plan = {
    ...deps.p3Plan("Deposit", "deposit-test"),
    opId: "test",
    now,
    compensation: {},
  };
  const deposit = {
    id: "deposit-test",
    employeeId: "employee-test",
    customerId: "customer-test",
    totalRequired: 4200000,
    holdCredit: 0,
    status: "PAID",
  };
  return { deps, plan, deposit, room: { id: "room-test" } };
}

test("first revenue creates an OPEN period for the recognition month in Vietnam and links both revenues", async () => {
  const { deps, plan, deposit, room } = fixture();
  await deps.p3RecognizeDeposit(plan, deposit, room);
  const created = plan.effects.filter(
    (e) => e.kind === "insert" && e.type === "PayrollPeriod",
  );
  assert.equal(created.length, 1);
  const period = created[0].record;
  assert.equal(period.code, "2027-01");
  assert.equal(period.status, "OPEN");
  assert.equal(period.displayStatus, "DANG_MO");
  assert.equal(period.fromDate, "2027-01-01");
  assert.equal(period.toDate, "2027-01-31");
  for (const type of ["CompanyRevenue", "EmployeeRevenue"])
    assert.equal(
      plan.effects.find((e) => e.kind === "insert" && e.type === type).record
        .periodId,
      period.id,
    );
  const transaction = plan.effects.find(
    (e) => e.kind === "insert" && e.type === "BrokerageTransaction",
  ).record;
  assert.equal(transaction.recognitionMonth, "2027-01");
  assert.equal(transaction.companyShare, 2100000);
  assert.equal(transaction.ownerShare, 2100000);
  assert(
    plan.effects.some(
      (e) =>
        e.type === "AuditLog" &&
        e.record.entityType === "PayrollPeriod" &&
        e.record.action === "CREATE",
    ),
  );
});

for (const status of ["OPEN", "CALCULATED"])
  test(`revenue reuses existing ${status} period without creating a second period`, async () => {
    const period = {
      id: "existing",
      code: "2027-01",
      year: 2027,
      month: 1,
      status,
      version: 3,
    };
    const { deps, plan, deposit, room } = fixture(period);
    await deps.p3RecognizeDeposit(plan, deposit, room);
    assert(
      !plan.effects.some(
        (e) => e.kind === "insert" && e.type === "PayrollPeriod",
      ),
    );
    assert.equal(
      plan.effects.find(
        (e) => e.type === "CompanyRevenue" && e.kind === "insert",
      ).record.periodId,
      "existing",
    );
    assert.deepEqual(period, {
      id: "existing",
      code: "2027-01",
      year: 2027,
      month: 1,
      status,
      version: 3,
    });
  });

for (const status of ["CLOSED", "PAID"])
  test(`revenue never reopens or changes a ${status} period`, async () => {
    const period = {
      id: "existing",
      code: "2027-01",
      year: 2027,
      month: 1,
      status,
      version: 6,
    };
    const { deps, plan, deposit, room } = fixture(period);
    await assert.rejects(deps.p3RecognizeDeposit(plan, deposit, room), {
      code: "PAYROLL_CLOSED",
      status: 409,
    });
    assert.deepEqual(plan.effects, []);
    assert.equal(period.status, status);
    assert.equal(period.version, 6);
  });

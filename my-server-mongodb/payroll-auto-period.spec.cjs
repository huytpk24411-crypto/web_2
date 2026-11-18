const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { createDepositService } = require("./services/deposit-service");
const { createPayrollService } = require("./services/payroll-service");

function fixture(
  period = null,
  now = new Date("2026-12-31T17:30:00Z"),
  nextPeriod = null,
  laterPeriods = [],
) {
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
          return (
            [period, nextPeriod, ...laterPeriods].find(
              (row) =>
                row && row.year === query.year && row.month === query.month,
            ) || null
          );
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
  test(`a ${status} salary period carries only employee revenue to next month`, async () => {
    const period = {
      id: "existing",
      code: "2027-01",
      year: 2027,
      month: 1,
      status,
      version: 6,
    };
    const { deps, plan, deposit, room } = fixture(period);
    await deps.p3RecognizeDeposit(plan, deposit, room);
    const next = plan.effects.find(
      (e) => e.type === "PayrollPeriod" && e.kind === "insert",
    ).record;
    assert.equal(next.code, "2027-02");
    assert.equal(next.status, "OPEN");
    assert.equal(
      plan.effects.find(
        (e) => e.type === "EmployeeRevenue" && e.kind === "insert",
      ).record.periodId,
      next.id,
    );
    assert.equal(
      plan.effects.find(
        (e) => e.type === "CompanyRevenue" && e.kind === "insert",
      ).record.periodId,
      period.id,
    );
    const transaction = plan.effects.find(
      (e) => e.type === "BrokerageTransaction" && e.kind === "insert",
    ).record;
    assert.equal(transaction.recognitionMonth, "2027-01");
    assert.equal(transaction.payrollMonth, "2027-02");
    assert.equal(transaction.carriedFromMonth, "2027-01");
    assert.equal(transaction.recognizedAt, plan.now);
    assert(
      !plan.effects.some(
        (e) =>
          e.type === "PayrollPeriod" &&
          e.kind === "change" &&
          e.id === period.id,
      ),
    );
    assert.equal(period.status, status);
    assert.equal(period.version, 6);
  });

for (const status of ["OPEN", "CALCULATED"])
  test(`carry reuses the next ${status} period`, async () => {
    const old = {
      id: "old",
      code: "2027-01",
      year: 2027,
      month: 1,
      status: "CLOSED",
      version: 6,
    };
    const next = {
      id: "next",
      code: "2027-02",
      year: 2027,
      month: 2,
      status,
      version: 2,
    };
    const { deps, plan, deposit, room } = fixture(old, undefined, next);
    await deps.p3RecognizeDeposit(plan, deposit, room);
    assert(
      !plan.effects.some(
        (e) => e.type === "PayrollPeriod" && e.kind === "insert",
      ),
    );
    assert.equal(plan.compensation.revenue.periodId, next.id);
    assert.equal(old.version, 6);
  });

for (const status of ["CLOSED", "PAID"])
  test(`skips the next ${status} period and creates the following open month`, async () => {
    const old = {
      id: "old",
      code: "2027-01",
      year: 2027,
      month: 1,
      status: "CLOSED",
      version: 6,
    };
    const next = {
      id: "next",
      code: "2027-02",
      year: 2027,
      month: 2,
      status,
      version: 7,
    };
    const { deps, plan, deposit, room } = fixture(old, undefined, next);
    await deps.p3RecognizeDeposit(plan, deposit, room);
    const created = plan.effects.filter(
      (e) => e.kind === "insert" && e.type === "PayrollPeriod",
    );
    assert.equal(created.length, 1);
    assert.equal(created[0].record.code, "2027-03");
    assert.equal(created[0].record.status, "OPEN");
    assert.equal(plan.compensation.revenue.periodId, created[0].record.id);
    assert.equal(
      plan.effects.find(
        (e) => e.kind === "insert" && e.type === "CompanyRevenue",
      ).record.periodId,
      old.id,
    );
    assert(
      !plan.effects.some(
        (e) =>
          e.kind === "change" &&
          e.type === "PayrollPeriod" &&
          [old.id, next.id].includes(e.id),
      ),
    );
    assert.equal(old.version, 6);
    assert.equal(next.version, 7);
  });

test("skips several locked months and reuses the first CALCULATED period", async () => {
  const locked = ["CLOSED", "PAID", "CLOSED"].map((status, index) => ({
    id: `locked-${index}`,
    code: `2027-0${index + 1}`,
    year: 2027,
    month: index + 1,
    status,
    version: 7,
  }));
  const target = {
    id: "target",
    code: "2027-04",
    year: 2027,
    month: 4,
    status: "CALCULATED",
    version: 2,
  };
  const before = structuredClone(locked);
  const { deps, plan, deposit, room } = fixture(
    locked[0],
    undefined,
    locked[1],
    [locked[2], target],
  );
  await deps.p3RecognizeDeposit(plan, deposit, room);
  assert.equal(plan.compensation.revenue.periodId, target.id);
  assert(
    !plan.effects.some(
      (e) => e.kind === "insert" && e.type === "PayrollPeriod",
    ),
  );
  const transaction = plan.effects.find(
    (e) => e.kind === "insert" && e.type === "BrokerageTransaction",
  ).record;
  assert.equal(transaction.recognitionMonth, "2027-01");
  assert.equal(transaction.payrollMonth, "2027-04");
  assert.equal(transaction.carriedFromMonth, "2027-01");
  assert.deepEqual(locked, before);
});

test("uses the first missing month even when later months already exist", async () => {
  const old = {
    id: "old",
    code: "2027-01",
    year: 2027,
    month: 1,
    status: "CLOSED",
  };
  const later = [
    { id: "march", code: "2027-03", year: 2027, month: 3, status: "CLOSED" },
    { id: "april", code: "2027-04", year: 2027, month: 4, status: "OPEN" },
  ];
  const { deps, plan, deposit, room } = fixture(old, undefined, null, later);
  await deps.p3RecognizeDeposit(plan, deposit, room);
  assert.equal(
    plan.effects.find((e) => e.kind === "insert" && e.type === "PayrollPeriod")
      .record.code,
    "2027-02",
  );
});

test("carries across a year of locked periods without changing the actual revenue month", async () => {
  const locked = Array.from({ length: 13 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 11 + index, 1));
    return {
      id: `locked-${index}`,
      code: date.toISOString().slice(0, 7),
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      status: index % 2 ? "PAID" : "CLOSED",
      version: 4,
    };
  });
  const { deps, plan, deposit, room } = fixture(
    locked[0],
    new Date("2026-12-31T15:30:00Z"),
    locked[1],
    locked.slice(2),
  );
  await deps.p3RecognizeDeposit(plan, deposit, room);
  const created = plan.effects.filter(
    (e) => e.kind === "insert" && e.type === "PayrollPeriod",
  );
  assert.equal(created.length, 1);
  assert.equal(created[0].record.code, "2028-01");
  const transaction = plan.effects.find(
    (e) => e.kind === "insert" && e.type === "BrokerageTransaction",
  ).record;
  assert.equal(transaction.recognitionMonth, "2026-12");
  assert.equal(transaction.payrollMonth, "2028-01");
  assert.equal(transaction.carriedFromMonth, "2026-12");
  assert.equal(
    plan.effects.find((e) => e.kind === "insert" && e.type === "CompanyRevenue")
      .record.periodId,
    locked[0].id,
  );
  assert(locked.every((period) => period.version === 4));
});

test("December carry crosses the year without changing the original collection date", async () => {
  const now = new Date("2026-12-31T15:30:00Z");
  const old = {
    id: "old",
    code: "2026-12",
    year: 2026,
    month: 12,
    status: "CLOSED",
    version: 6,
  };
  const { deps, plan, deposit, room } = fixture(old, now);
  await deps.p3RecognizeDeposit(plan, deposit, room);
  const row = plan.effects.find(
    (e) => e.type === "BrokerageTransaction" && e.kind === "insert",
  ).record;
  assert.equal(row.recognitionMonth, "2026-12");
  assert.equal(row.payrollMonth, "2027-01");
  assert.equal(row.recognizedAt, now);
});

test("payroll selection uses the assigned month with fallback for historical transactions", async () => {
  const { deps } = fixture();
  const queries = [];
  deps.p5Collections.BrokerageTransaction.find = (query) => {
    queries.push(query);
    return { toArray: async () => [] };
  };
  await deps.p5Transactions("2027-02", true);
  assert.deepEqual(queries[0].$or[0], { payrollMonth: "2027-02" });
  assert.equal(queries[0].$or[1].payrollMonth, null);
  assert(queries[0].$or[1].recognizedAt.$gte instanceof Date);
  await deps.p5Transactions("2027-01");
  assert.equal(queries[1].$or, undefined);
  assert(queries[1].recognizedAt.$lt instanceof Date);
});

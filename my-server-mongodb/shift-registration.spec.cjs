const test = require("node:test");
const assert = require("node:assert/strict");
const { ObjectId } = require("mongodb");
const { createShiftService } = require("./services/shift-service");
const { registerShiftRoutes } = require("./routes/shift-routes");

function setup(rows = {}, at = new Date("2026-11-17T10:00:00+07:00")) {
  function matches(row, filter) {
    return Object.entries(filter).every(([key, value]) => {
      if (value && typeof value === "object" && !(value instanceof Date)) {
        if ("$in" in value) return value.$in.includes(row[key]);
        if ("$gt" in value) return row[key] > value.$gt;
      }
      return row[key] === value;
    });
  }
  const collections = {};
  const collection = (name) =>
    (collections[name] ||= {
      findOne: async (filter) =>
        (rows[name] || []).find((row) => matches(row, filter)) || null,
      find(filter) {
        const result = (rows[name] || []).filter((row) => matches(row, filter));
        return {
          sort(order) {
            result.sort(
              (a, b) =>
                a.weekStart.localeCompare(b.weekStart) * order.weekStart,
            );
            return this;
          },
          toArray: async () => result,
        };
      },
    });
  const dependencies = {
    database: { collection },
    ObjectId,
    requireRole: () => () => {},
    auditCollection: collection("AuditLog"),
  };
  createShiftService(dependencies);
  const routes = new Map(),
    plans = [];
  registerShiftRoutes({
    ...dependencies,
    app: Object.fromEntries(
      ["get", "post", "put", "delete"].map((method) => [
        method,
        (url, ...handlers) => routes.set(method + " " + url, handlers.at(-1)),
      ]),
    ),
    p4Route: (handler) => handler,
    p4Execute: async (req, action, prepare) => {
      const plan = { at, effects: [] };
      const result = await prepare(plan);
      plans.push(plan);
      return result;
    },
    p4AssignWaitingViewings: async () => {},
  });
  async function call(method, url, request = {}) {
    let body;
    const res = {
      set() {
        return this;
      },
      status() {
        return this;
      },
      send(value) {
        body = value;
      },
    };
    await routes.get(method + " " + url)(request, res);
    return body;
  }
  return { dependencies, call, plans };
}

test("admin creates and opens a weekly period early without a Thursday restriction", async () => {
  const rows = {
    WorkLocation: [{ id: "office", allowedRadiusM: 100 }],
    RegistrationPeriod: [],
  };
  const { call, plans } = setup(rows);
  const period = await call("post", "/data/admin/registration-periods", {
    body: { name: "Tuần mới", weekStart: "2026-12-07" },
  });
  assert.equal(period.weekEnd, "2026-12-13");
  assert.equal(+period.closesAt, +new Date("2026-12-07T00:00:00+07:00"));
  assert.equal(
    plans[0].effects.filter((effect) => effect.type === "Shift").length,
    14,
  );
  rows.RegistrationPeriod.push({
    ...period,
    opensAt: new Date("2026-12-03T08:00:00+07:00"),
  });
  const opened = await call(
    "post",
    "/data/admin/registration-periods/:id/open",
    { params: { id: period.id } },
  );
  assert.equal(opened.status, "OPEN");
  assert.equal(+opened.opensAt, +new Date("2026-11-17T10:00:00+07:00"));
});

test("admin rejects past weeks and weeks that have already started", async () => {
  const { call } = setup();
  for (const [weekStart, code] of [
    ["2026-11-09", "PAST_WEEK"],
    ["2026-11-16", "PERIOD_OPEN_WINDOW"],
  ]) {
    await assert.rejects(
      call("post", "/data/admin/registration-periods", {
        body: { name: "Tuần cũ", weekStart },
      }),
      (error) => error.code === code,
    );
    const rows = {
      RegistrationPeriod: [{ id: "period", status: "DRAFT", weekStart }],
    };
    await assert.rejects(
      setup(rows).call("post", "/data/admin/registration-periods/:id/open", {
        params: { id: "period" },
      }),
      (error) => error.code === code,
    );
  }
});

test("legacy open periods accept registrations after Sunday 20:00 until Monday 00:00 Vietnam time", () => {
  const { dependencies } = setup();
  const period = {
    status: "OPEN",
    weekStart: "2026-11-23",
    opensAt: "2026-11-19T08:00:00+07:00",
    closesAt: "2026-11-22T20:00:00+07:00",
  };
  dependencies.p4Open(period, new Date("2026-11-16T10:00:00+07:00"));
  dependencies.p4Open(period, new Date("2026-11-22T23:59:59.999+07:00"));
  assert.throws(
    () => dependencies.p4Open(period, new Date("2026-11-22T17:00:00Z")),
    (error) => error.code === "REGISTRATION_CLOSED",
  );
  assert.throws(
    () =>
      dependencies.p4Open(
        { ...period, status: "CLOSED" },
        new Date("2026-11-20T12:00:00+07:00"),
      ),
    (error) => error.code === "REGISTRATION_CLOSED",
  );
});

test("employee can choose all open future weeks, excluding current, past and closed periods", async () => {
  const weeks = ["2026-12-07", "2026-11-23", "2026-11-16", "2026-11-09"];
  const rows = {
    RegistrationPeriod: [
      ...weeks.map((weekStart) => ({
        id: weekStart,
        status: "OPEN",
        weekStart,
        opensAt: new Date("2099-01-01"),
        closesAt: new Date("2099-01-01"),
      })),
      { id: "closed", status: "CLOSED", weekStart: "2026-11-30" },
    ],
  };
  const { dependencies } = setup(rows);
  const open = await dependencies.p4OpenPeriods(
    new Date("2026-11-17T10:00:00+07:00"),
  );
  assert.deepEqual(
    open.map((period) => period.id),
    ["2026-11-23", "2026-12-07"],
  );
  assert.equal(+open[0].closesAt, +new Date("2026-11-23T00:00:00+07:00"));
  const atMonday = await dependencies.p4OpenPeriods(
    new Date("2026-11-22T17:00:00Z"),
  );
  assert.deepEqual(
    atMonday.map((period) => period.id),
    ["2026-12-07"],
  );
});

test("Sunday maintenance preserves an open period past its legacy deadline", async (context) => {
  context.mock.timers.enable({
    apis: ["Date"],
    now: new Date("2026-11-22T22:00:00+07:00"),
  });
  const rows = {
    RegistrationPeriod: [
      {
        id: "period",
        status: "OPEN",
        weekStart: "2026-11-23",
        closesAt: new Date("2026-11-22T20:00:00+07:00"),
      },
    ],
  };
  const { dependencies } = setup(rows);
  await dependencies.p4Maintenance();
  assert.equal(rows.RegistrationPeriod[0].status, "OPEN");
});

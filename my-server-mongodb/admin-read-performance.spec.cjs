const test = require("node:test");
const assert = require("node:assert/strict");
const { registerShiftRoutes } = require("./routes/shift-routes");
const { createShiftService } = require("./services/shift-service");

test("admin shift snapshot starts independent reads together after maintenance", async () => {
  const types = [
    "Shift",
    "ShiftAssignment",
    "Attendance",
    "WorkLocation",
    "Employee",
    "PeriodRegistration",
    "Policy",
    "PolicyLevel",
  ];
  const started = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  let maintained = false;
  const routes = new Map();
  const app = Object.fromEntries(
    ["get", "post", "put", "delete"].map((method) => [
      method,
      (route, ...handlers) => {
        if (method === "get") routes.set(route, handlers.at(-1));
      },
    ]),
  );
  const fixture = Object.fromEntries(
    types.map((type) => [type, [{ id: type + "-test", _id: "internal" }]]),
  );
  const deps = {
    app,
    p4Route: (handler) => handler,
    p4Maintenance: async () => {
      maintained = true;
    },
    p4Clean: ({ _id, ...row }) => row,
    p4Collections: Object.fromEntries(
      [...types, "Task"].map((type) => [
        type,
        {
          find: () => ({
            toArray: async () => {
              assert.equal(maintained, true);
              if (type !== "Task") {
                started.push(type);
                await gate;
              }
              return type === "Task" ? [{ id: "task-test" }] : fixture[type];
            },
          }),
        },
      ]),
    ),
    p4TaskData: async () => new Map(),
    p4TaskRows: async () => ({ current: [], links: [], rows: [] }),
    p4TaskView: async (task) => ({ ...task, currentAssignees: [] }),
  };
  registerShiftRoutes(deps);
  let result;
  const request = routes.get("/data/admin/shift-state")(
    {},
    {
      send: (value) => {
        result = value;
      },
    },
  );
  try {
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual([...started].sort(), [...types].sort());
  } finally {
    release();
    await request;
  }
  assert.deepEqual(Object.keys(result), [...types, "Task"]);
  assert.deepEqual(result.ShiftAssignment, [
    { source: null, id: "ShiftAssignment-test" },
  ]);
  assert.deepEqual(result.Task, [{ id: "task-test", currentAssignees: [] }]);
});

test("maintenance checks all existing viewing tasks in one batch without rewriting them", async () => {
  const queries = [];
  const viewings = Array.from({ length: 25 }, (_, index) => ({
    id: "viewing-" + index,
    taskId: "task-" + index,
  }));
  const tasks = viewings.map((viewing) => ({
    id: viewing.taskId,
    kind: "VIEWING",
    status: "TODO",
  }));
  const collection = (type) => ({
    find(filter) {
      queries.push({ type, filter });
      return {
        sort() {
          return this;
        },
        toArray: async () =>
          type === "Viewing" ? viewings : type === "Task" ? tasks : [],
      };
    },
    findOne() {
      throw new Error("Unexpected per-viewing task query");
    },
    insertOne() {
      throw new Error("Unexpected mutation");
    },
    updateOne() {
      throw new Error("Unexpected mutation");
    },
  });
  const dependencies = {
    database: { collection },
    requireRole: () => () => {},
    auditCollection: collection("AuditLog"),
  };
  createShiftService(dependencies);
  await dependencies.p4Maintenance();
  const taskQueries = queries.filter((query) => query.type === "Task");
  assert.equal(taskQueries.length, 1);
  assert.deepEqual(taskQueries[0].filter, {
    id: { $in: tasks.map((task) => task.id) },
  });
  assert.ok(tasks.every((task) => task.status === "TODO"));
});

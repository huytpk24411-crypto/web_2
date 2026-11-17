const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { MongoClient } = require("mongodb");
const { MongoSessionStore } = require("./middleware/mongo-session-store");
const client = new MongoClient("mongodb://127.0.0.1:27017");
const database = client.db(
  "ihouzz_session_test_" + randomUUID().replaceAll("-", ""),
);
const store = new MongoSessionStore(database);
const call = (target, method, ...args) =>
  new Promise((resolve, reject) =>
    target[method](...args, (error, result) =>
      error ? reject(error) : resolve(result),
    ),
  );

before(async () => {
  await client.connect();
  await store.initialize();
});
after(async () => {
  await database.dropDatabase();
  await client.close();
});

test("sessions remain readable by a new store and can be invalidated across portals", async () => {
  const value = {
    user: { id: "account-1", role: "EMPLOYEE" },
    cookie: { expires: new Date(Date.now() + 3600000) },
  };
  await call(store, "set", "employee-session", value);
  const restarted = new MongoSessionStore(database);
  assert.deepEqual(
    (await call(restarted, "get", "employee-session")).user,
    value.user,
  );
  assert.equal(
    (await call(restarted, "all"))["employee-session"].user.id,
    value.user.id,
  );
  await call(restarted, "destroy", "employee-session");
  assert.equal(await call(store, "get", "employee-session"), null);
});

test("expiry is enforced before MongoDB TTL cleanup and touch extends the deadline", async () => {
  await call(store, "set", "expired", {
    cookie: { expires: new Date(Date.now() - 1000) },
  });
  assert.equal(await call(store, "get", "expired"), null);
  assert.equal((await call(store, "all")).expired, undefined);
  await call(store, "touch", "expired", {
    cookie: { expires: new Date(Date.now() + 3600000) },
  });
  assert(await call(store, "get", "expired"));
});

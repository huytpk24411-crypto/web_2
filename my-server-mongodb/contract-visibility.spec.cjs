const test = require("node:test");
const assert = require("node:assert/strict");
const { ObjectId } = require("mongodb");
const { createCommonService } = require("./services/common-service");
const { registerPublicCatalogRoutes } = require("./routes/catalog-routes");

function fixture(account) {
  const queries = [];
  const dependencies = {
    ObjectId,
    accountCollection: { findOne: async () => account },
    p3Collections: {
      Contract: {
        find: (query) => {
          queries.push(query);
          return {
            toArray: async () => [
              { roomId: "pending" },
              { roomId: "pending" },
              {},
            ],
          };
        },
      },
    },
  };
  createCommonService(dependencies);
  return { dependencies, queries };
}

for (const role of [undefined, "CUSTOMER"])
  test(`public catalog excludes signed contracts and contract locks for ${role || "guests"}`, async () => {
    const { dependencies, queries } = fixture(
      role ? { role, status: "ACTIVE" } : null,
    );
    const filter = await dependencies.roomReadFilter({
      session: role ? { user: { id: new ObjectId().toString() } } : {},
    });
    assert.deepEqual(queries, [{ status: "SIGNED" }]);
    assert.deepEqual(filter.id, { $nin: ["pending"] });
    assert.deepEqual(filter["lock.kind"], { $ne: "CONTRACT" });
    assert.deepEqual(filter.status, { $in: ["AVAILABLE", "HELD"] });
    assert.equal(filter.publicationStatus, "PUBLISHED");
    assert.deepEqual(filter.businessStatus, {
      $nin: ["RENTED", "MAINTENANCE"],
    });
  });

for (const role of ["EMPLOYEE", "ADMIN"])
  test(`${role} retains access to the room while the contract is pending`, async () => {
    const { dependencies, queries } = fixture({ role, status: "ACTIVE" });
    const filter = await dependencies.roomReadFilter({
      session: { user: { id: new ObjectId().toString() } },
    });
    assert.deepEqual(filter, {});
    assert.deepEqual(queries, []);
  });

test("list, search, slug and direct detail all use the same visibility filter without cache", async () => {
  const routes = new Map();
  const filter = {
    id: { $nin: ["pending"] },
    "lock.kind": { $ne: "CONTRACT" },
  };
  const queries = [];
  let barrier = false;
  const dependencies = {
    app: Object.fromEntries(
      ["get", "post", "put", "delete"].map((method) => [
        method,
        (route, ...handlers) => {
          if (method === "get") routes.set(route, handlers.at(-1));
        },
      ]),
    ),
    cors: () => () => {},
    requireRole: () => () => {},
    p6Route: (f) => f,
    p3ReadBarrier: async () => {
      barrier = true;
    },
    roomReadFilter: async () => filter,
    roomCollection: {
      find: (query) => {
        assert.equal(barrier, true);
        queries.push(query);
        return { toArray: async () => [] };
      },
      findOne: async (query) => {
        assert.equal(barrier, true);
        queries.push(query);
        return null;
      },
    },
  };
  registerPublicCatalogRoutes(dependencies);
  for (const route of [
    "/data/rooms",
    "/data/rooms/search",
    "/data/rooms/slug/:slug",
    "/data/rooms/:id",
  ]) {
    barrier = false;
    const response = {
      headers: {},
      statusCode: 200,
      set(key, value) {
        this.headers[key] = value;
        return this;
      },
      status(value) {
        this.statusCode = value;
        return this;
      },
      send(value) {
        this.body = value;
        return this;
      },
    };
    await routes.get(route)(
      { query: { q: "test" }, params: { id: "pending", slug: "pending" } },
      response,
    );
    assert.equal(response.headers["Cache-Control"], "private, no-store");
    const visibility =
      route === "/data/rooms/:id" ? queries.at(-1).$and[1] : queries.at(-1);
    if (route === "/data/rooms/:id")
      assert.deepEqual(queries.at(-1).$and[0], { id: "pending" });
    assert.deepEqual(visibility.id, { $nin: ["pending"] });
    assert.deepEqual(visibility["lock.kind"], filter["lock.kind"]);
    if (route.includes("/:")) {
      assert.equal(response.statusCode, 404);
      assert.equal(response.body.code, "ROOM_UNAVAILABLE");
    } else assert.deepEqual(response.body, []);
  }
});

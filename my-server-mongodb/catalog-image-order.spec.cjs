const { describe, it, before, beforeEach, after } = require("node:test");
const assert = require("node:assert/strict");
const { MongoClient, ObjectId } = require("mongodb");
const { createCatalogService } = require("./services/catalog-service");

describe(
  "room image order with the deployed unique index",
  { concurrency: false },
  () => {
    const client = new MongoClient("mongodb://127.0.0.1:27017");
    const db = client.db(`iHouzzUniData_image_order_test_${process.pid}`);
    const images = db.collection("RoomImage"),
      audit = db.collection("AuditLog");
    let deps;
    const url = (id) => `/assets/rooms/${id}.jpg`;
    const error = (status, code) =>
      Object.assign(new Error(code), { status, code });
    before(async () => {
      await client.connect();
      await images.createIndex({ id: 1 }, { unique: true });
      await images.createIndex({ roomId: 1, order: 1 }, { unique: true });
      await images.createIndex({ roomId: 1, url: 1 }, { unique: true });
      await audit.createIndex({ id: 1 }, { unique: true });
    });
    beforeEach(async () => {
      await Promise.all([
        images.deleteMany({}),
        audit.deleteMany({}),
        db.collection("Room").deleteMany({}),
      ]);
      await images.insertMany(
        ["a", "b", "c"].map((id, index) => ({
          id,
          roomId: "room",
          url: url(id),
          order: index + 1,
          isCover: index === 0,
          caption: "",
          mimeType: "image/jpeg",
        })),
      );
      await db
        .collection("Room")
        .insertOne({
          id: "room",
          images: [url("a"), url("b"), url("c")],
          publicationStatus: "PUBLISHED",
          version: 1,
        });
      deps = {
        database: db,
        ObjectId,
        auditCollection: audit,
        requireRole: () => () => {},
        p3Error: error,
        p3Assert: (value, code, status = 409) => {
          if (!value) throw error(status, code);
        },
      };
      createCatalogService(deps);
    });
    after(async () => {
      assert.match(db.databaseName, /^iHouzzUniData_image_order_test_\d+$/);
      await db.dropDatabase();
      await client.close();
    });
    async function operation(ids) {
      const plan = { effects: [], at: new Date() };
      const result = await deps.p6ChangeImages(
        { params: { id: "room" } },
        plan,
        () => ids.map(url),
      );
      const op = {
        id: new ObjectId().toString(),
        entityType: "P6Operation",
        state: "PENDING",
        cursor: 0,
        at: plan.at,
        actorId: "admin",
        plan,
        result,
      };
      await audit.insertOne(op);
      return op;
    }
    async function verify(op, ids) {
      const rows = await images
        .find({ roomId: "room" })
        .sort({ order: 1 })
        .toArray();
      assert.deepEqual(
        rows.map((row) => row.url),
        ids.map(url),
      );
      assert.deepEqual(
        rows.map((row) => row.order),
        ids.map((_, i) => i + 1),
      );
      assert.deepEqual(
        rows.map((row) => row.isCover),
        ids.map((_, i) => i === 0),
      );
      for (const id of ids.filter((id) => ["a", "b", "c"].includes(id)))
        assert.equal(rows.find((row) => row.url === url(id)).id, id);
      assert.deepEqual(
        (await db.collection("Room").findOne({ id: "room" })).images,
        ids.map(url),
      );
      const saved = await audit.findOne({ id: op.id });
      assert.equal(saved.state, "DONE");
      assert.equal(saved.plan, undefined);
      const events = await audit.find({ entityType: "RoomImage" }).toArray();
      assert(
        events.every(
          (event) =>
            (!event.before || event.before.order > 0) &&
            (!event.after || event.after.order > 0),
        ),
      );
      const beforeReplay = await images.find({}).sort({ id: 1 }).toArray();
      await deps.p6Recover();
      assert.deepEqual(
        await images.find({}).sort({ id: 1 }).toArray(),
        beforeReplay,
      );
    }
    it("swaps the cover image without colliding or changing image IDs", async () => {
      const op = await operation(["c", "a", "b"]);
      await deps.p6Run(op);
      await verify(op, ["c", "a", "b"]);
    });
    it("reorders retained images while inserting and removing images", async () => {
      const op = await operation(["d", "c", "a"]);
      await deps.p6Run(op);
      await verify(op, ["d", "c", "a"]);
    });
    it("recovers the legacy operation after the room was saved and image reorder hit E11000", async () => {
      const op = await operation(["c", "b", "a"]);
      const effect = op.plan.effects[0];
      await db
        .collection("Room")
        .updateOne(
          { id: "room" },
          { $set: { ...effect.after, _p6Token: `${op.id}:0` } },
        );
      await audit.updateOne({ id: op.id }, { $set: { cursor: 1 } });
      await assert.rejects(
        images.updateOne({ id: "c" }, { $set: { order: 1 } }),
        { code: 11000 },
      );
      await deps.p6Recover();
      await verify(op, ["c", "b", "a"]);
    });
    for (const crash of ["plan", "stage", "final"])
      it(`resumes after an interruption at the ${crash} write before its cursor is recorded`, async () => {
        const op = await operation(["c", "a", "b"]);
        const collection =
          crash === "plan" ? audit : deps.p6Collections.RoomImage;
        const original = collection.updateOne.bind(collection);
        let interrupted = false;
        collection.updateOne = async (filter, update, options) => {
          const result = await original(filter, update, options);
          if (
            !interrupted &&
            (crash === "plan"
              ? update.$set?.["plan.effects"]
              : crash === "stage"
                ? update.$set?.order < 0
                : update.$set?.order > 0)
          ) {
            interrupted = true;
            throw new Error("simulated interruption");
          }
          return result;
        };
        // p6Collections and the test may have separate collection handles.
        if (crash === "plan")
          deps.auditCollection.updateOne = collection.updateOne;
        await assert.rejects(deps.p6Run(op), /simulated interruption/);
        collection.updateOne = original;
        if (crash === "plan") deps.auditCollection.updateOne = original;
        assert(interrupted);
        await deps.p6Recover();
        await verify(op, ["c", "a", "b"]);
      });
  },
);

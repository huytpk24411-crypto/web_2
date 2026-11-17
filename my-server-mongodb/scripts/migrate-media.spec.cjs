const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { assetInventory, verifiedCopy, ensureBuckets } = require("./migrate-media.cjs");

test("image copy verifies actual bytes, resumes safely and never overwrites a different object", async () => {
  const objects = new Map();
  let uploads = 0;
  const storage = { privateBucket: "private-images", client: { storage: { from: () => ({
    download: async (key) => objects.has(key) ? { data: new Blob([objects.get(key)]) } : { error: { statusCode: "404" } },
    upload: async (key, bytes, options) => {
      assert.equal(options.upsert, false); uploads++; objects.set(key, bytes); return { data: {} };
    },
  }) } } };
  const target = { bucket: "private-images", objectPath: "uploads/cccd/example.png" };
  const bytes = Buffer.from("illustration");
  const result = await verifiedCopy(storage, target, bytes, "image/png");
  assert.equal(result.sha256.length, 64);
  await verifiedCopy(storage, target, bytes, "image/png");
  assert.equal(uploads, 1);
  await assert.rejects(verifiedCopy(storage, target, Buffer.from("changed"), "image/png"), /checksum/);
  assert.equal(uploads, 1);
  assert.deepEqual(objects.get(target.objectPath), bytes);
});

test("migration rejects an existing public bucket for private documents", async () => {
  const storage = { publicBucket: "public-images", privateBucket: "private-images", client: { storage: {
    listBuckets: async () => ({ data: [{ name: "public-images", public: true }, { name: "private-images", public: true }] }),
    createBucket: async () => assert.fail("must not change an existing bucket"),
  } } };
  await assert.rejects(ensureBuckets(storage), /incorrect privacy/);
});

test("image verification waits for a just-uploaded object without overwriting it", async () => {
  let reads = 0, uploads = 0;
  const bytes = Buffer.from("just-uploaded");
  const storage = { privateBucket: "private-images", client: { storage: { from: () => ({
    download: async (key, options) => {
      assert.ok(options.cacheNonce);
      reads++;
      return reads < 3 ? { error: { statusCode: "404" } } : { data: new Blob([bytes]) };
    },
    upload: async () => { uploads++; return { data: {} }; },
  }) } } };
  const target = { bucket: "private-images", objectPath: "uploads/cccd/example.png" };
  const copied = await verifiedCopy(storage, target, bytes, "image/png");
  assert.equal(copied.sha256.length, 64);
  assert.equal(uploads, 1);
  assert.equal(reads, 3);
});

test("three frontend image folders deduplicate only when their contents match", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ihouzz-images-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const portal of ["customer", "employee", "admin"]) {
    const directory = path.join(root, `my-app-${portal}/public/assets`);
    fs.mkdirSync(directory, { recursive: true }); fs.writeFileSync(path.join(directory, "same.png"), "same-image");
  }
  assert.equal(assetInventory(root).length, 1);
  fs.writeFileSync(path.join(root, "my-app-admin/public/assets/same.png"), "different-image");
  assert.throws(() => assetInventory(root), /Conflicting frontend image paths/);
});

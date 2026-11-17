const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { identityFileExists } = require("./identity-file");

test("identity images accept committed GridFS uploads and local development files", async (t) => {
  const publicDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "ihouzz-identity-"));
  t.after(() => fs.rm(publicDirectory, { recursive: true, force: true }));
  const queries = [];
  const database = {
    collection(name) {
      assert.equal(name, "Upload.files");
      return {
        async findOne(filter) {
          queries.push(filter);
          return filter.filename === "cccd/cloud-front.jpg" ? { _id: "uploaded" } : null;
        },
      };
    },
  };
  const options = { database, publicDirectory };
  assert.equal(await identityFileExists("/uploads/cccd/cloud-front.jpg", options), true);
  assert.deepEqual(queries[0], {
    filename: "cccd/cloud-front.jpg",
    length: { $gt: 0 },
    "metadata.contentType": { $in: ["image/jpeg", "image/png", "image/webp"] },
  });
  assert.equal(await identityFileExists("/uploads/cccd/not-uploaded.png", options), false);
  await fs.mkdir(path.join(publicDirectory, "uploads/cccd"), { recursive: true });
  await fs.writeFile(path.join(publicDirectory, "uploads/cccd/local.png"), "local image");
  const beforeLocal = queries.length;
  assert.equal(await identityFileExists("/uploads/cccd/local.png", options), true);
  assert.equal(queries.length, beforeLocal);
  for (const invalid of [null, "", "/uploads/rooms/cloud-front.jpg", "/uploads/cccd/../cloud-front.jpg", "https://example.com/image.png", "/uploads/cccd/image.svg"])
    assert.equal(await identityFileExists(invalid, options), false);
  assert.equal(queries.length, beforeLocal);
});

test("identity image storage outages propagate instead of claiming a valid image", async () => {
  const options = {
    publicDirectory: path.join(os.tmpdir(), "ihouzz-no-local-identity-files"),
    database: { collection: () => ({ findOne: async () => { throw new Error("storage unavailable"); } }) },
  };
  await assert.rejects(identityFileExists("/uploads/cccd/cloud.jpg", options), /storage unavailable/);
});

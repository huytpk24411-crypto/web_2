// Copy media without deleting GridFS chunks or local source files.
// node my-server-mongodb/scripts/migrate-media.cjs --storage-env <private.env> --database-env <private.env> [--apply]
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { parseEnv } = require("node:util");
const { MongoClient, GridFSBucket, ObjectId } = require("mongodb");
const { createMediaStorage } = require("../media-storage");
const root = path.resolve(__dirname, "../..");
const types = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".gif": "image/gif", ".avif": "image/avif", ".ico": "image/x-icon" };
const digest = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function walk(directory, prefix = "") {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    const relative = prefix + entry.name;
    if (entry.isDirectory()) return walk(absolute, relative + "/");
    const contentType = types[path.extname(entry.name).toLowerCase()];
    return entry.isFile() && contentType ? [{ absolute, relative, contentType }] : [];
  });
}

function assetInventory(workspaceRoot) {
  const files = new Map();
  for (const portal of ["customer", "employee", "admin"]) {
    for (const file of walk(path.join(workspaceRoot, `my-app-${portal}/public/assets`))) {
      const sha256 = digest(fs.readFileSync(file.absolute));
      const existing = files.get(file.relative);
      if (existing && existing.sha256 !== sha256) throw new Error("Conflicting frontend image paths; migration stopped");
      if (!existing) files.set(file.relative, { ...file, sha256 });
    }
  }
  return [...files.values()];
}

async function verifiedCopy(storage, target, bytes, contentType) {
  const bucket = storage.client.storage.from(target.bucket);
  let existing = await bucket.download(target.objectPath);
  if (existing.error) {
    if (!["404", "400"].includes(String(existing.error.statusCode)) && existing.error.message !== "Object not found") {
      throw new Error("Cannot inspect destination media object");
    }
    const uploaded = await bucket.upload(target.objectPath, bytes, { contentType, cacheControl: target.bucket === storage.privateBucket ? "0" : "86400", upsert: false });
    if (uploaded.error) throw new Error("Media copy failed");
    existing = await bucket.download(target.objectPath);
  }
  if (existing.error || digest(Buffer.from(await existing.data.arrayBuffer())) !== digest(bytes)) {
    throw new Error("Destination image checksum differs from source; no source data was changed");
  }
  return { ...target, sha256: digest(bytes), verifiedAt: new Date() };
}

async function ensureBuckets(storage) {
  const { data, error } = await storage.client.storage.listBuckets();
  if (error) throw new Error("Cannot list Supabase buckets; check the backend secret key");
  for (const [name, isPublic] of [[storage.publicBucket, true], [storage.privateBucket, false]]) {
    const existing = data.find((bucket) => bucket.name === name);
    if (existing) {
      if (existing.public !== isPublic) throw new Error("Existing media bucket has incorrect privacy; migration stopped");
    } else {
      const created = await storage.client.storage.createBucket(name, { public: isPublic, fileSizeLimit: 5 * 1024 * 1024, allowedMimeTypes: [...new Set(Object.values(types))] });
      if (created.error) throw new Error("Cannot create Supabase media bucket");
    }
  }
}

async function migrate({ database, storage, apply, workspaceRoot = root }) {
  const assets = assetInventory(workspaceRoot);
  const local = walk(path.join(workspaceRoot, "my-server/public/uploads")).filter((file) => /^(rooms|cccd|attendance|schools|employees)\//.test(file.relative));
  const collection = database.collection("Upload.files");
  const records = await collection.find({}).toArray();
  const names = new Set();
  for (const record of records) {
    if (names.has(record.filename)) throw new Error("Duplicate media filenames in MongoDB; migration stopped");
    names.add(record.filename);
    if (!/^(rooms|cccd|attendance|schools|employees)\/[A-Za-z0-9_.-]+$/.test(record.filename)) throw new Error("Unsupported uploaded media path; migration stopped");
  }
  const report = { apply, assetCount: assets.length, gridFsCount: records.length, localUploadCount: local.length, verifiedAssets: 0, verifiedUploads: 0 };
  if (!apply) return report;
  await ensureBuckets(storage);
  for (const file of assets) {
    await verifiedCopy(storage, { bucket: storage.publicBucket, objectPath: `assets/${file.relative}`, provider: "supabase" }, fs.readFileSync(file.absolute), file.contentType);
    report.verifiedAssets++;
  }
  const gridfs = new GridFSBucket(database, { bucketName: "Upload" });
  for (const record of records) {
    const target = storage.location(record.filename);
    const migrated = record.metadata?.storage;
    if (migrated?.provider === "supabase") {
      if (migrated.bucket !== target.bucket || migrated.objectPath !== target.objectPath) throw new Error("Stored media location differs from expected private/public bucket");
      const { data, error } = await storage.client.storage.from(target.bucket).download(target.objectPath);
      if (error || digest(Buffer.from(await data.arrayBuffer())) !== migrated.sha256) throw new Error("Previously migrated media verification failed");
    } else {
      if (record.length > 5 * 1024 * 1024) throw new Error("An uploaded image exceeds the supported migration size");
      const chunks = [];
      for await (const chunk of gridfs.openDownloadStream(record._id)) chunks.push(chunk);
      const bytes = Buffer.concat(chunks);
      if (bytes.length !== record.length) throw new Error("Source image length mismatch");
      const metadata = await verifiedCopy(storage, target, bytes, record.metadata?.contentType || types[path.extname(record.filename).toLowerCase()]);
      await collection.updateOne({ _id: record._id }, { $set: { "metadata.storage": metadata } });
    }
    report.verifiedUploads++;
  }
  for (const file of local) {
    if (names.has(file.relative)) continue;
    const bytes = fs.readFileSync(file.absolute);
    const metadata = await verifiedCopy(storage, storage.location(file.relative), bytes, file.contentType);
    await collection.insertOne({ _id: new ObjectId(), filename: file.relative, length: bytes.length, uploadDate: new Date(), metadata: { contentType: file.contentType, storage: metadata } });
    names.add(file.relative);
    report.verifiedUploads++;
  }
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  function envFile(flag) {
    const index = args.indexOf(flag);
    if (index < 0 || !args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`Specify ${flag} with the private configuration file path`);
    return parseEnv(fs.readFileSync(path.resolve(args[index + 1]), "utf8"));
  }
  const env = { ...envFile("--database-env"), ...envFile("--storage-env") };
  if (!env.MONGODB_URI || !env.MONGODB_DB) throw new Error("The database environment file must identify the target MongoDB database");
  const storage = createMediaStorage(env);
  if (!storage) throw new Error("Supabase configuration is incomplete");
  const client = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  try {
    await client.connect();
    const report = await migrate({ database: client.db(env.MONGODB_DB), storage, apply: args.includes("--apply") });
    const directory = path.join(root, ".local-artifacts/deployment");
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "media-migration.json"), JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report));
  } finally {
    await client.close();
  }
}

module.exports = { assetInventory, verifiedCopy, ensureBuckets, migrate };
if (require.main === module) main().catch((error) => { console.error(error.name + ": media migration failed — " + (/credential|configuration|Specify|environment file|checksum|privacy|Conflicting/.test(error.message) ? error.message : "Check storage and database connectivity; credentials were not logged")); process.exitCode = 1; });

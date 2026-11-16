const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { MongoClient, BSON } = require("mongodb");
const { inspectRecords } = require("./check-data.cjs");
const serverDirectory = path.resolve(__dirname, "..");

function loadEnvironment() {
  try {
    process.loadEnvFile(path.join(serverDirectory, ".env"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}
function validateRoomTours(rooms) {
  for (let number = 46; number <= 50; number++) {
    const room = rooms.find((row) => row.id === `phong-${number}`);
    if (!room) continue; // Historical deletion of a room is legitimate.
    const tour = room.tour,
      ids = new Set(tour?.scenes?.map((scene) => scene.id));
    if (
      tour?.roomId !== room.id ||
      tour.startScene !== "living" ||
      tour.pitchLimit !== 55 ||
      ids.size !== 4 ||
      !["living", "kitchen", "bathroom", "bedroom"].every((id) => ids.has(id))
    )
      throw new Error(`${room.id}: invalid room tour`);
    for (const scene of tour.scenes) {
      if (
        scene.image !== `/assets/tours/PHONG_${number}/${scene.id}-v2.webp` ||
        !scene.hotspots?.length ||
        scene.hotspots.some(
          (spot) =>
            !ids.has(spot.target) ||
            spot.target === scene.id ||
            !Number.isFinite(spot.yaw) ||
            Math.abs(spot.yaw) > 180 ||
            !Number.isFinite(spot.pitch) ||
            Math.abs(spot.pitch) > tour.pitchLimit,
        )
      )
        throw new Error(`${room.id}: invalid room tour media`);
    }
  }
}
function readSources() {
  const directory = path.join(serverDirectory, "data");
  const manifest = JSON.parse(
    fs.readFileSync(path.join(directory, "manifest.json"), "utf8"),
  );
  if (
    manifest.version !== 2 ||
    !Array.isArray(manifest.collections) ||
    !manifest.collections.length
  )
    throw new Error("Invalid data manifest");
  const seen = new Set(),
    records = {};
  const sources = manifest.collections.map((entry) => {
    if (
      !/^[A-Z][A-Za-z]+$/.test(entry.name) ||
      seen.has(entry.name) ||
      entry.file !== `${entry.name}.json`
    )
      throw new Error("Invalid collection source");
    seen.add(entry.name);
    const raw = fs.readFileSync(path.join(directory, entry.file));
    if (crypto.createHash("sha256").update(raw).digest("hex") !== entry.sha256)
      throw new Error(`${entry.file}: checksum mismatch`);
    const rows = BSON.EJSON.parse(raw.toString("utf8"));
    if (!Array.isArray(rows) || rows.length !== entry.count)
      throw new Error(`${entry.file}: invalid row count`);
    if (
      entry.name === "Account" &&
      rows.some((row) => row.salt || row.passwordHash)
    )
      throw new Error(
        "Distributed data must not contain source password hashes",
      );
    if (
      ["PasswordReset", "PasswordResetLimit"].includes(entry.name) &&
      rows.length
    )
      throw new Error("Reset tokens must not be distributed");
    records[entry.name] = rows;
    return { ...entry, records: rows };
  });
  const report = inspectRecords(records);
  if (report.issues.length)
    throw new Error(
      "Data references failed validation: " + JSON.stringify(report.issues),
    );
  validateRoomTours(records.Room || []);
  return { manifest, sources, report };
}
function localDemoPassword() {
  if (process.env.DEMO_PASSWORD) {
    if (
      process.env.DEMO_PASSWORD.length < 8 ||
      process.env.DEMO_PASSWORD.length > 128
    )
      throw new Error("DEMO_PASSWORD must contain 8–128 characters");
    return process.env.DEMO_PASSWORD;
  }
  const password = crypto.randomBytes(16).toString("base64url");
  const file = path.join(serverDirectory, ".env");
  let content = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const expression = /^DEMO_PASSWORD\s*=.*$/m;
  content = expression.test(content)
    ? content.replace(expression, `DEMO_PASSWORD=${password}`)
    : content.trimEnd() +
      `\n\n# Generated locally for the sanitized demo accounts\nDEMO_PASSWORD=${password}\n`;
  fs.writeFileSync(file, content);
  process.env.DEMO_PASSWORD = password;
  return password;
}
async function restore(options = {}) {
  loadEnvironment();
  const { manifest, sources, report } = readSources(); // Validate all files before connecting/writing.
  const databaseName =
    options.databaseName ||
    process.env.MONGODB_DB ||
    process.env.MONGODB_DATABASE ||
    "iHouzzUniData";
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(databaseName))
    throw new Error("Invalid database name");
  const client = new MongoClient(
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017",
  );
  try {
    await client.connect();
    const db = client.db(databaseName);
    const existing = [];
    for (const source of sources)
      if (await db.collection(source.name).estimatedDocumentCount())
        existing.push(source.name);
    if (existing.length && !options.replace)
      return {
        skipped: true,
        databaseName,
        message:
          "Existing data preserved. Use --replace only after reviewing the backup.",
      };
    if (existing.length) {
      const backup = path.resolve(
        serverDirectory,
        "../.local-backups",
        `restore-${databaseName}-${Date.now()}`,
      );
      fs.mkdirSync(backup, { recursive: true });
      for (const name of existing)
        fs.writeFileSync(
          path.join(backup, `${name}.json`),
          BSON.EJSON.stringify(
            await db.collection(name).find({}).toArray(),
            null,
            2,
            { relaxed: false },
          ),
        );
      console.log("Created private pre-restore backup: " + backup);
    }
    const password = localDemoPassword();
    for (const source of sources) {
      const collection = db.collection(source.name);
      if (options.replace) {
        await collection.deleteMany({});
        await collection.dropIndexes().catch((error) => {
          if (error.code !== 26) throw error;
        });
      }
      if (!(await db.listCollections({ name: source.name }).hasNext()))
        await db.createCollection(source.name);
      for (const index of source.indexes || []) {
        const { key, ...settings } = index;
        await collection.createIndex(key, settings);
      }
      const rows = source.records.map((row) => {
        if (source.name !== "Account") return row;
        const salt = crypto.randomBytes(16).toString("hex");
        return {
          ...row,
          salt,
          passwordHash: crypto.scryptSync(password, salt, 64).toString("hex"),
        };
      });
      if (rows.length) await collection.insertMany(rows, { ordered: true });
      if ((await collection.countDocuments({})) !== rows.length)
        throw new Error(source.name + ": count verification failed");
    }
    return {
      skipped: false,
      databaseName,
      collections: sources.length,
      documents: report.documents,
      demoAccounts: manifest.demoAccounts,
      message:
        "Restored sanitized current data. Demo password is stored only in my-server-mongodb/.env (DEMO_PASSWORD).",
    };
  } finally {
    await client.close();
  }
}
async function main() {
  const args = process.argv.slice(2),
    at = args.indexOf("--database");
  if (at >= 0 && !args[at + 1]) throw new Error("--database requires a name");
  console.log(
    JSON.stringify(
      await restore({
        databaseName: at >= 0 ? args[at + 1] : undefined,
        replace: args.includes("--replace"),
      }),
      null,
      2,
    ),
  );
}
module.exports = {
  restore,
  seed: restore,
  readSources,
  validateRoomTours,
  main,
};
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });

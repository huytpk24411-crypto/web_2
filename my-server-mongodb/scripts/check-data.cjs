const { relations, polymorphic } = require("../models/relations");
function values(record, expression) {
  const parts = expression.replace(/\[\]/g, "").split(".");
  function read(value, at) {
    if (Array.isArray(value)) return value.flatMap((item) => read(item, at));
    if (at === parts.length) return [value];
    return read(value?.[parts[at]], at + 1);
  }
  return read(record, 0);
}
const present = (value) =>
  value !== undefined && value !== null && value !== "";
function inspectRecords(records) {
  const issues = [],
    checked = [],
    sets = new Map();
  for (const [name, rows] of Object.entries(records)) {
    for (const key of ["_id", "id"]) {
      const seen = new Set();
      let duplicates = 0;
      for (const row of rows) {
        const value = row[key];
        if (!present(value)) continue;
        const text = String(value);
        if (seen.has(text)) duplicates++;
        seen.add(text);
      }
      sets.set(`${name}.${key}`, seen);
      if (duplicates)
        issues.push({
          kind: "DUPLICATE_KEY",
          collection: name,
          field: key,
          count: duplicates,
        });
    }
  }
  for (const relation of relations) {
    const targets = sets.get(`${relation.to}.${relation.target}`) || new Set();
    const summary = {
      from: relation.from,
      field: relation.field,
      to: relation.to,
      target: relation.target,
      checked: 0,
      missing: 0,
      absentRequired: 0,
      historical: 0,
      reserved: 0,
    };
    for (const row of records[relation.from] || []) {
      const found = values(row, relation.field);
      if (!found.some(present) && !relation.optional) summary.absentRequired++;
      for (const value of found.filter(present)) {
        summary.checked++;
        if (targets.has(String(value))) continue;
        if (
          relation.reservedPrefix &&
          String(value).startsWith(relation.reservedPrefix)
        ) {
          summary.reserved++;
          continue;
        }
        if (relation.historical) {
          summary.historical++;
          continue;
        }
        summary.missing++;
      }
    }
    if (summary.missing || summary.absentRequired)
      issues.push({ kind: "FOREIGN_KEY", ...summary });
    checked.push(summary);
  }
  for (const relation of polymorphic) {
    if (relation.dynamicCollection) continue; // Audit/notification entity ids are historical references, not enforced FKs.
    for (const row of records[relation.from] || []) {
      const value = values(row, relation.field)[0],
        discriminator = values(row, relation.discriminator)[0];
      if (!present(value)) continue;
      const target = relation.targets[discriminator];
      if (!target || !sets.get(`${target}.id`)?.has(String(value)))
        issues.push({
          kind: "POLYMORPHIC_FOREIGN_KEY",
          from: relation.from,
          field: relation.field,
          discriminator,
          to: target || null,
        });
    }
  }
  return {
    collections: Object.keys(records).length,
    documents: Object.values(records).reduce((n, rows) => n + rows.length, 0),
    relations: checked,
    issues,
  };
}
async function main() {
  try {
    process.loadEnvFile(require("node:path").resolve(__dirname, "../.env"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const { MongoClient } = require("mongodb");
  const client = new MongoClient(
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017",
  );
  const db = client.db(
    process.env.MONGODB_DB || process.env.MONGODB_DATABASE || "iHouzzUniData",
  );
  try {
    await client.connect();
    const records = {};
    for (const { name } of await db.listCollections().toArray())
      if (!name.startsWith("system."))
        records[name] = await db.collection(name).find({}).toArray();
    const report = inspectRecords(records);
    console.log(
      JSON.stringify({ database: db.databaseName, ...report }, null, 2),
    );
    if (report.issues.length) process.exitCode = 1;
  } finally {
    await client.close();
  }
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { inspectRecords, values };

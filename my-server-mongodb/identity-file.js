const fs = require("node:fs/promises");
const path = require("node:path");

async function identityFileExists(url, { database, publicDirectory }) {
  if (
    typeof url !== "string" ||
    !/^\/uploads\/cccd\/[a-zA-Z0-9_-]+\.(jpe?g|png|webp)$/i.test(url)
  )
    return false;
  try {
    if ((await fs.stat(path.join(publicDirectory, url))).isFile()) return true;
  } catch (error) {
    if (error.code !== "ENOENT" && error.code !== "ENOTDIR") throw error;
  }
  // Production uploads are committed to GridFS instead of the instance disk.
  const file = await database.collection("Upload.files").findOne(
    {
      filename: url.slice("/uploads/".length),
      length: { $gt: 0 },
      "metadata.contentType": { $in: ["image/jpeg", "image/png", "image/webp"] },
    },
    { projection: { _id: 1 } },
  );
  return !!file;
}

module.exports = { identityFileExists };

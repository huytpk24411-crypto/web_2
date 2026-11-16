// Restore the reviewed sanitized snapshot; existing databases are preserved by default.
const loader = require("./scripts/restore-data.cjs");
module.exports = loader;
if (require.main === module)
  loader.main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });

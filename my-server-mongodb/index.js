// Entry point used by npm start, Angular dev proxies, and existing tests.
const application = require("./app");
module.exports = application;
if (require.main === module)
  application.start().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });

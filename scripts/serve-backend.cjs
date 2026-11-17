require("./serve-deploy.cjs").start({ frontends: false }).catch((error) => {
  console.error(error.name + ": backend startup failed");
  process.exitCode = 1;
});

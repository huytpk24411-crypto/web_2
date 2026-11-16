const { MongoClient, ObjectId } = require("mongodb");

// Native MongoDB driver, as in LearnAngular. No connection is opened during require().
function createDatabase() {
  const client = new MongoClient(
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017",
  );
  const database = client.db(
    process.env.MONGODB_DB || process.env.MONGODB_DATABASE || "iHouzzUniData",
  );
  const handles = {
    roomCollection: "Room",
    propertyCollection: "Property",
    schoolCollection: "School",
    propertySchoolCollection: "PropertySchool",
    accountCollection: "Account",
    viewingCollection: "Viewing",
    customerCollection: "Customer",
    accountRoleCollection: "AccountRole",
    employeeCollection: "Employee",
    favoriteCollection: "Favorite",
    contactCollection: "ContactRequest",
    viewingDetailCollection: "ViewingDetail",
    notificationCollection: "Notification",
    auditCollection: "AuditLog",
  };
  return {
    MongoClient,
    ObjectId,
    client,
    database,
    ...Object.fromEntries(
      Object.entries(handles).map(([name, collection]) => [
        name,
        database.collection(collection),
      ]),
    ),
  };
}
module.exports = { createDatabase };

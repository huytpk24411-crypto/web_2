const session = require("express-session");

class MongoSessionStore extends session.Store {
  constructor(database) {
    super();
    this.collection = database.collection("Session");
  }

  async initialize() {
    await this.collection.createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 },
    );
  }

  get(id, callback) {
    this.collection
      .findOne({ _id: id, expiresAt: { $gt: new Date() } })
      .then((record) => (record ? JSON.parse(record.value) : null))
      .then((value) => callback(null, value), callback);
  }

  set(id, value, callback = () => {}) {
    const expiresAt = new Date(value.cookie?.expires || Date.now() + 3600000);
    this.collection
      .updateOne(
        { _id: id },
        { $set: { value: JSON.stringify(value), expiresAt } },
        { upsert: true },
      )
      .then(() => callback(null), callback);
  }

  touch(id, value, callback = () => {}) {
    const expiresAt = new Date(value.cookie?.expires || Date.now() + 3600000);
    this.collection
      .updateOne({ _id: id }, { $set: { expiresAt } })
      .then(() => callback(null), callback);
  }

  destroy(id, callback = () => {}) {
    this.collection.deleteOne({ _id: id }).then(() => callback(null), callback);
  }

  all(callback) {
    this.collection
      .find({ expiresAt: { $gt: new Date() } })
      .toArray()
      .then(
        (rows) =>
          callback(
            null,
            Object.fromEntries(
              rows.map((row) => [row._id, JSON.parse(row.value)]),
            ),
          ),
        callback,
      );
  }
}

module.exports = { MongoSessionStore };

function registerNotificationRoutes(dependencies) {
  dependencies.app.get(
    "/notifications",
    dependencies.cors(),
    dependencies.requireRole(),
    async (req, res) => {
      try {
        await dependencies.p3ReadBarrier();
        const records = await dependencies.notificationCollection
          .find({ accountId: req.p2Account.id })
          .sort({ createdAt: -1, _id: -1 })
          .toArray();
        res.send(
          await Promise.all(
            records.map(async (record) => {
              const value = dependencies.publicRecord(record);
              if (
                ![
                  "Room",
                  "Hold",
                  "Deposit",
                  "Contract",
                  "BrokerageTransaction",
                  "Viewing",
                ].includes(record.entityType)
              )
                return value;
              const ref = await dependencies.database
                .collection(record.entityType)
                .findOne({ id: record.entityId });
              const deleted =
                !ref && record.entityType === "Room"
                  ? await dependencies.auditCollection.findOne({
                      entityType: "Room",
                      entityId: record.entityId,
                      action: "DELETE",
                    })
                  : null;
              const roomSnapshot =
                ref?.roomSnapshot ||
                deleted?.roomSnapshot ||
                deleted?.before?.roomSnapshot ||
                (record.entityType === "Room" && (ref || deleted?.before)
                  ? await dependencies.snapshotRoom(ref || deleted.before)
                  : null);
              const snapshots = roomSnapshot
                ? [roomSnapshot]
                : (ref?.rooms || [])
                    .map((detail) => detail.roomSnapshot)
                    .filter(Boolean);
              return snapshots.length
                ? { ...value, roomSnapshots: snapshots }
                : value;
            }),
          ),
        );
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    },
  );

  // Keep the literal path before /:id/read.
  dependencies.app.put(
    "/notifications/read-all",
    dependencies.cors(),
    dependencies.requireRole(),
    dependencies.p2Write(async (req, res) => {
      const before = await dependencies.notificationCollection
        .find({ accountId: req.p2Account.id, read: false })
        .toArray();
      const now = new Date();
      await dependencies.notificationCollection.updateMany(
        { _id: { $in: before.map((item) => item._id) } },
        { $set: { read: true, readAt: now } },
      );
      for (const item of before)
        await dependencies.audit(
          req,
          "Notification",
          item.id,
          "READ",
          { read: false },
          { read: true, readAt: now },
        );
      res.send({ updated: before.length });
    }),
  );

  dependencies.app.put(
    "/notifications/:id/read",
    dependencies.cors(),
    dependencies.requireRole(),
    dependencies.p2Write(async (req, res) => {
      const before = await dependencies.notificationCollection.findOne(
        dependencies.recordFilter(req.params.id),
      );
      if (!before)
        return res.status(404).send({ message: "Notification not found" });
      if (before.accountId !== req.p2Account.id)
        return res
          .status(403)
          .send({ message: "Notification belongs to another account" });
      if (before.read) return res.send(dependencies.publicRecord(before));
      const after = { ...before, read: true, readAt: new Date() };
      await dependencies.notificationCollection.replaceOne(
        { _id: before._id },
        after,
      );
      await dependencies.audit(
        req,
        "Notification",
        before.id,
        "READ",
        { read: false },
        { read: true, readAt: after.readAt },
      );
      res.send(dependencies.publicRecord(after));
    }),
  );
}

module.exports = { registerNotificationRoutes };

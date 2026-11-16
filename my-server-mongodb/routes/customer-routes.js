function registerCustomerRoutes(dependencies) {
  dependencies.app.get(
    "/favorites",
    dependencies.cors(),
    dependencies.requireRole("CUSTOMER"),
    async (req, res) => {
      try {
        const result = await dependencies.favoriteCollection
          .find({ customerId: req.p2Customer.id })
          .sort({ createdAt: -1 })
          .toArray();
        res.send(result.map(dependencies.publicRecord));
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    },
  );

  dependencies.app.post(
    "/favorites",
    dependencies.cors(),
    dependencies.requireRole("CUSTOMER"),
    dependencies.p2Write(async (req, res) => {
      const { roomId } = req.body || {};
      if (typeof roomId !== "string" || !roomId)
        return res.status(400).send({ message: "roomId required" });
      const room = await dependencies.roomCollection.findOne({
        id: roomId,
        publicationStatus: "PUBLISHED",
      });
      if (!room) return res.status(404).send({ message: "Room not found" });
      const key = { customerId: req.p2Customer.id, roomId };
      let favorite = await dependencies.favoriteCollection.findOne(key);
      if (!favorite) {
        favorite = dependencies.newRecord("yt", {
          ...key,
          createdAt: new Date(),
        });
        await dependencies.favoriteCollection.insertOne(favorite);
        await dependencies.audit(
          req,
          "Favorite",
          favorite.id,
          "CREATE",
          null,
          dependencies.publicRecord(favorite),
        );
      }
      res.send(dependencies.publicRecord(favorite));
    }),
  );

  dependencies.app.delete(
    "/favorites/:roomId",
    dependencies.cors(),
    dependencies.requireRole("CUSTOMER"),
    dependencies.p2Write(async (req, res) => {
      const favorite = await dependencies.favoriteCollection.findOneAndDelete({
        customerId: req.p2Customer.id,
        roomId: req.params.roomId,
      });
      if (favorite)
        await dependencies.audit(
          req,
          "Favorite",
          favorite.id,
          "DELETE",
          dependencies.publicRecord(favorite),
          null,
        );
      res.send({ roomId: req.params.roomId, removed: !!favorite });
    }),
  );

  dependencies.app.post(
    "/contact-requests",
    dependencies.cors(),
    dependencies.p2Write(async (req, res) => {
      const { name, email, message } = req.body || {};
      const phone = dependencies.normalizePhone(req.body?.phone);
      if (
        typeof name !== "string" ||
        !name.trim() ||
        name.length > 100 ||
        !dependencies.validPhone(phone) ||
        typeof email !== "string" ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
        typeof message !== "string" ||
        message.trim().length < 10 ||
        message.length > 2000
      ) {
        return res
          .status(400)
          .send({ message: "Invalid consultation details" });
      }
      const normalizedMessage = message
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
      const now = new Date();
      const recent = await dependencies.contactCollection
        .find({ phone, createdAt: { $gt: new Date(now.getTime() - 60000) } })
        .toArray();
      if (
        recent.some(
          (item) =>
            item.message.trim().replace(/\s+/g, " ").toLowerCase() ===
            normalizedMessage,
        )
      ) {
        return res
          .status(409)
          .send({
            message: "Yêu cầu tư vấn này đã được gửi trong phút vừa qua.",
          });
      }
      const contact = dependencies.newRecord("tv", {
        name: name.trim(),
        phone,
        email: email.trim(),
        message: message.trim(),
        status: "PENDING",
        respondedBy: null,
        createdAt: now,
        dedupeHash: dependencies.crypto
          .createHash("sha256")
          .update(
            `${phone}:${normalizedMessage}:${dependencies.crypto.randomUUID()}`,
          )
          .digest("hex"),
      });
      if (
        req.session.user &&
        dependencies.ObjectId.isValid(req.session.user.id)
      ) {
        req.p2Account = await dependencies.accountCollection.findOne({
          _id: new dependencies.ObjectId(req.session.user.id),
          status: "ACTIVE",
        });
      }
      await dependencies.contactCollection.insertOne(contact);
      await dependencies.audit(
        req,
        "ContactRequest",
        contact.id,
        "CREATE",
        null,
        dependencies.publicRecord(contact),
      );
      await dependencies.notifyAdmins(
        req,
        "CONTACT_REQUEST",
        "ContactRequest",
        contact.id,
        "Có yêu cầu tư vấn mới",
        contact.id,
      );
      res.status(201).send(dependencies.publicRecord(contact));
    }),
  );

  dependencies.app.get(
    "/contact-requests",
    dependencies.cors(),
    dependencies.requireRole("ADMIN"),
    async (req, res) => {
      try {
        res.send(
          (
            await dependencies.contactCollection
              .find({})
              .sort({ createdAt: -1 })
              .toArray()
          ).map(dependencies.publicRecord),
        );
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    },
  );

  dependencies.app.put(
    "/contact-requests/:id",
    dependencies.cors(),
    dependencies.requireRole("ADMIN"),
    dependencies.p2Write(async (req, res) => {
      const { status, employeeId } = req.body || {};
      if (
        !["PENDING", "RESPONDED"].includes(status) ||
        !(
          employeeId === null ||
          (typeof employeeId === "string" && employeeId.trim())
        )
      ) {
        return res
          .status(400)
          .send({ message: "Invalid status or employeeId" });
      }
      const before = await dependencies.contactCollection.findOne(
        dependencies.recordFilter(req.params.id),
      );
      if (!before)
        return res.status(404).send({ message: "Contact request not found" });
      if (
        employeeId &&
        !(await dependencies.employeeCollection.findOne({
          id: employeeId,
          status: "ACTIVE",
        }))
      ) {
        return res.status(404).send({ message: "Employee not found" });
      }
      if (status === "RESPONDED" && !employeeId)
        return res
          .status(400)
          .send({ message: "employeeId required for RESPONDED" });
      const after = {
        ...before,
        status,
        respondedBy: employeeId,
        updatedAt: new Date(),
      };
      await dependencies.contactCollection.replaceOne(
        { _id: before._id },
        after,
      );
      await dependencies.audit(
        req,
        "ContactRequest",
        before.id,
        "UPDATE",
        dependencies.publicRecord(before),
        dependencies.publicRecord(after),
      );
      res.send(dependencies.publicRecord(after));
    }),
  );
}

module.exports = { registerCustomerRoutes };

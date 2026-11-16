function registerPublicCatalogRoutes(dependencies) {
  dependencies.app.get("/", dependencies.cors(), async (req, res) => {
    try {
      res.send("This Web server is processed for MongoDB (iHOUZZ Uni)");
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  dependencies.app.get("/data/rooms", dependencies.cors(), async (req, res) => {
    try {
      await dependencies.p3ReadBarrier();
      const result = await dependencies.roomCollection
        .find(await dependencies.roomReadFilter(req), {
          projection: { _id: 0 },
        })
        .toArray();
      res.send(result);
    } catch (error) {
      res.status(500).send({ message: error.message });
    }
  });

  dependencies.app.get(
    "/data/rooms/search",
    dependencies.cors(),
    async (req, res) => {
      try {
        await dependencies.p3ReadBarrier();
        if (req.query.q !== undefined && typeof req.query.q !== "string") {
          return res.status(400).send({ message: "q must be a string" });
        }
        // Treat search text as a literal regular expression
        const query = (req.query.q || "")
          .trim()
          .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const result = await dependencies.roomCollection
          .find(
            {
              ...(await dependencies.roomReadFilter(req)),
              $or: [
                { name: { $regex: query, $options: "i" } },
                { description: { $regex: query, $options: "i" } },
              ],
            },
            { projection: { _id: 0 } },
          )
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    },
  );

  dependencies.app.get(
    "/data/rooms/slug/:slug",
    dependencies.cors(),
    async (req, res) => {
      try {
        await dependencies.p3ReadBarrier();
        const result = await dependencies.roomCollection.findOne(
          {
            slug: req.params.slug,
            ...(await dependencies.roomReadFilter(req)),
          },
          { projection: { _id: 0 } },
        );
        if (!result)
          return res
            .status(404)
            .send({
              code: "ROOM_UNAVAILABLE",
              message: "Phòng hiện không còn trống hoặc tin đã ngừng đăng.",
            });
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    },
  );

  dependencies.app.get(
    "/data/rooms/:id",
    dependencies.cors(),
    async (req, res) => {
      try {
        await dependencies.p3ReadBarrier();
        const result = await dependencies.roomCollection.findOne(
          { id: req.params.id, ...(await dependencies.roomReadFilter(req)) },
          { projection: { _id: 0 } },
        );
        if (!result)
          return res
            .status(404)
            .send({
              code: "ROOM_UNAVAILABLE",
              message: "Phòng hiện không còn trống hoặc tin đã ngừng đăng.",
            });
        res.send({
          ...result,
          hasHistory: await dependencies.p6RoomHasHistory(result),
          hasActiveFlow: await dependencies.roomHasActiveFlow(result.id),
        });
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    },
  );

  dependencies.app.post(
    "/data/rooms",
    dependencies.cors(),
    dependencies.requireRole("ADMIN"),
    dependencies.p6Route(async (req, res) => {
      res
        .status(201)
        .send(
          await dependencies.p6Execute(req, (plan) =>
            dependencies.p6SaveRoom(req, plan, null),
          ),
        );
    }),
  );

  dependencies.app.put(
    "/data/rooms",
    dependencies.cors(),
    dependencies.requireRole("ADMIN"),
    dependencies.p6Route(async (req, res) => {
      res.send(
        await dependencies.p6Execute(req, async (plan) =>
          dependencies.p6SaveRoom(
            req,
            plan,
            await dependencies.p6Get("Room", req.body?.id),
          ),
        ),
      );
    }),
  );

  dependencies.app.delete(
    "/data/rooms/:id",
    dependencies.cors(),
    dependencies.requireRole("ADMIN"),
    dependencies.p6Route(async (req, res) => {
      await dependencies.p3Expire();
      res.send(
        await dependencies.p6Execute(req, async (plan) =>
          dependencies.p6DeleteRoom(
            plan,
            await dependencies.p6Get("Room", req.params.id),
          ),
        ),
      );
    }),
  );

  dependencies.app.get(
    "/data/properties",
    dependencies.cors(),
    async (req, res) => {
      try {
        const result = await dependencies.propertyCollection
          .find({}, { projection: { _id: 0 } })
          .toArray();
        res.send(result.map(dependencies.p6Safe));
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    },
  );

  dependencies.app.get(
    "/data/schools",
    dependencies.cors(),
    async (req, res) => {
      try {
        const result = await dependencies.schoolCollection
          .find({}, { projection: { _id: 0 } })
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    },
  );

  dependencies.app.get(
    "/data/property-schools",
    dependencies.cors(),
    async (req, res) => {
      try {
        const result = await dependencies.propertySchoolCollection
          .find({}, { projection: { _id: 0 } })
          .toArray();
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    },
  );
}

function registerAdminCatalogRoutes(dependencies) {
  for (const [route, type] of [
    ["owners", "Owner"],
    ["properties", "Property"],
    ["schools", "School"],
    ["brokerage-agreements", "BrokerageAgreement"],
    ["work-locations", "WorkLocation"],
  ]) {
    const base = `/data/admin/${route}`;
    dependencies.app.get(
      base,
      dependencies.p6Admin,
      dependencies.p6Route(async (req, res) =>
        res.send(
          (
            await dependencies.p6Collections[type]
              .find({})
              .sort({ id: 1 })
              .toArray()
          ).map(dependencies.p6Safe),
        ),
      ),
    );
    dependencies.app.get(
      base + "/:id",
      dependencies.p6Admin,
      dependencies.p6Route(async (req, res) =>
        res.send(
          dependencies.p6Safe(await dependencies.p6Get(type, req.params.id)),
        ),
      ),
    );
    dependencies.app.post(
      base,
      dependencies.p6Admin,
      dependencies.p6Route(async (req, res) => {
        res
          .status(201)
          .send(
            await dependencies.p6Execute(req, (plan) =>
              dependencies.p6SaveCatalog(plan, type, req.body, null),
            ),
          );
      }),
    );
    dependencies.app.put(
      base + "/:id",
      dependencies.p6Admin,
      dependencies.p6Route(async (req, res) => {
        res.send(
          await dependencies.p6Execute(req, (plan) =>
            dependencies.p6SaveCatalog(plan, type, req.body, req.params.id),
          ),
        );
      }),
    );
    dependencies.app.post(
      base + "/:id/deactivate",
      dependencies.p6Admin,
      dependencies.p6Route(async (req, res) => {
        res.send(
          await dependencies.p6Execute(req, async (plan) => {
            const before = await dependencies.p6Get(type, req.params.id);
            const fields =
              type === "BrokerageAgreement"
                ? {
                    status: "ENDED",
                    effectiveTo:
                      req.body?.effectiveTo ||
                      new Date().toISOString().slice(0, 10),
                  }
                : { active: false };
            return dependencies.p6SaveCatalog(
              plan,
              type,
              { ...dependencies.p6Clean(before), ...fields },
              before.id,
            );
          }),
        );
      }),
    );
    dependencies.app.delete(
      base + "/:id",
      dependencies.p6Admin,
      dependencies.p6Route(async (req, res) => {
        res.send(
          await dependencies.p6Execute(req, async (plan) => {
            const before = await dependencies.p6Get(type, req.params.id);
            await dependencies.p6Unreferenced(type, before.id);
            dependencies.p6Effect(plan, type, before, null);
            return { id: before.id, deleted: true };
          }),
        );
      }),
    );
  }

  dependencies.app.get(
    "/data/admin/employees",
    dependencies.p6Admin,
    dependencies.p6Route(async (req, res) =>
      res.send(
        (
          await dependencies.employeeCollection
            .find({})
            .sort({ employeeCode: 1 })
            .toArray()
        ).map(dependencies.p6Safe),
      ),
    ),
  );

  dependencies.app.get(
    "/data/admin/employees/:id",
    dependencies.p6Admin,
    dependencies.p6Route(async (req, res) =>
      res.send(
        dependencies.p6Safe(
          await dependencies.p6Get("Employee", req.params.id),
        ),
      ),
    ),
  );

  dependencies.app.post(
    "/data/admin/employees",
    dependencies.p6Admin,
    dependencies.p6Route(async (req, res) => {
      dependencies.p3Assert(
        !req.get("Idempotency-Key") || req.body?.temporaryPassword,
        "TEMPORARY_PASSWORD_REQUIRED_FOR_RETRY",
        400,
      );
      const password = dependencies.p6Password(req.body);
      const result = await dependencies.p6Execute(req, async (plan) => {
        const fields = await dependencies.p6Validate(
          "Employee",
          req.body,
          null,
        );
        await dependencies.p6Foreign("Role", "EMPLOYEE");
        dependencies.p3Assert(
          !(await dependencies.accountCollection.findOne({
            phone: fields.phone,
          })),
          "PHONE_EXISTS",
        );
        dependencies.p3Assert(
          !(await dependencies.employeeCollection.findOne({
            email: fields.email,
          })) &&
            !(await dependencies.accountCollection.findOne({
              email: fields.email,
            })),
          "EMAIL_EXISTS",
        );
        const counter = await dependencies.p6Collections.Counter.findOne({
          id: "employee-code-p6",
        });
        const codes = await dependencies.employeeCollection
          .find({}, { projection: { employeeCode: 1 } })
          .toArray();
        const seq =
          Math.max(
            counter?.seq || 0,
            ...codes.map((row) =>
              Number(/^NV(\d+)$/.exec(row.employeeCode)?.[1] || 0),
            ),
          ) + 1;
        dependencies.p6Effect(plan, "Counter", counter, {
          id: "employee-code-p6",
          seq,
        });
        const account = dependencies.p6Effect(plan, "Account", null, {
          id: `tk-${new dependencies.ObjectId()}`,
          phone: fields.phone,
          name: fields.fullName,
          email: fields.email,
          role: "EMPLOYEE",
          status: fields.status === "INACTIVE" ? "DISABLED" : "ACTIVE",
          ...dependencies.p6Credentials(password),
          createdAt: plan.at,
        });
        dependencies.p6Effect(plan, "AccountRole", null, {
          accountId: account.id,
          roleId: "EMPLOYEE",
          assignedAt: plan.at,
        });
        const employee = dependencies.p6Effect(plan, "Employee", null, {
          ...fields,
          accountId: account.id,
          employeeCode: `NV${String(seq).padStart(3, "0")}`,
          createdAt: plan.at,
          updatedAt: plan.at,
        });
        return { employee: dependencies.p6Safe(employee), phone: fields.phone };
      });
      res.status(201).send({ ...result, temporaryPassword: password });
    }),
  );

  dependencies.app.put(
    "/data/admin/employees/:id",
    dependencies.p6Admin,
    dependencies.p6Route(async (req, res) => {
      res.send(
        await dependencies.p6Execute(req, async (plan) => {
          const before = await dependencies.p6Get("Employee", req.params.id),
            fields = await dependencies.p6Validate(
              "Employee",
              req.body,
              before,
            );
          dependencies.p3Assert(
            !(await dependencies.accountCollection.findOne({
              phone: fields.phone,
              id: { $ne: before.accountId },
            })),
            "PHONE_EXISTS",
          );
          dependencies.p3Assert(
            !(await dependencies.employeeCollection.findOne({
              email: fields.email,
              id: { $ne: before.id },
            })),
            "EMAIL_EXISTS",
          );
          dependencies.p3Assert(
            !(await dependencies.accountCollection.findOne({
              email: fields.email,
              id: { $ne: before.accountId },
            })),
            "EMAIL_EXISTS",
          );
          const account = await dependencies.p6Foreign(
            "Account",
            before.accountId,
          );
          dependencies.p6Effect(plan, "Account", account, {
            phone: fields.phone,
            name: fields.fullName,
            email: fields.email,
            status: fields.status === "INACTIVE" ? "DISABLED" : "ACTIVE",
            updatedAt: plan.at,
          });
          return dependencies.p6Safe(
            dependencies.p6Effect(plan, "Employee", before, {
              ...fields,
              updatedAt: plan.at,
            }),
          );
        }),
      );
    }),
  );

  dependencies.app.post(
    "/data/admin/employees/:id/deactivate",
    dependencies.p6Admin,
    dependencies.p6Route(async (req, res) => {
      res.send(
        await dependencies.p6Execute(req, async (plan) => {
          const before = await dependencies.p6Get("Employee", req.params.id),
            account = await dependencies.p6Foreign("Account", before.accountId);
          const result = dependencies.p6Effect(
            plan,
            "Employee",
            before,
            { status: "INACTIVE", updatedAt: plan.at },
            "DEACTIVATE",
          );
          dependencies.p6Effect(plan, "Account", account, {
            status: "DISABLED",
            updatedAt: plan.at,
          });
          return dependencies.p6Safe(result);
        }),
      );
    }),
  );

  dependencies.app.post(
    "/data/admin/employees/:id/reset-password",
    dependencies.p6Admin,
    dependencies.p6Route(async (req, res) => {
      dependencies.p3Assert(
        !req.get("Idempotency-Key") || req.body?.temporaryPassword,
        "TEMPORARY_PASSWORD_REQUIRED_FOR_RETRY",
        400,
      );
      const password = dependencies.p6Password(req.body);
      const result = await dependencies.p6Execute(req, async (plan) => {
        const employee = await dependencies.p6Get("Employee", req.params.id),
          account = await dependencies.p6Foreign("Account", employee.accountId);
        dependencies.p6Effect(
          plan,
          "Account",
          account,
          { ...dependencies.p6Credentials(password), updatedAt: plan.at },
          "RESET_PASSWORD",
        );
        return { id: employee.id, phone: account.phone };
      });
      res.send({ ...result, temporaryPassword: password });
    }),
  );

  dependencies.app.delete(
    "/data/admin/employees/:id",
    dependencies.p6Admin,
    dependencies.p6Route(async (req, res) => {
      res.send(
        await dependencies.p6Execute(req, async (plan) => {
          const before = await dependencies.p6Get("Employee", req.params.id);
          await dependencies.p6Unreferenced("Employee", before.id);
          // Keep Account and AccountRole so past actorId references remain valid.
          const account = await dependencies.p6Foreign(
            "Account",
            before.accountId,
          );
          dependencies.p6Effect(plan, "Employee", before, null);
          dependencies.p6Effect(plan, "Account", account, {
            status: "DISABLED",
            updatedAt: plan.at,
          });
          return { id: before.id, deleted: true };
        }),
      );
    }),
  );

  dependencies.app.get(
    "/data/rooms/:id/images",
    dependencies.p6Admin,
    dependencies.p6Route(async (req, res) => {
      await dependencies.p6Get("Room", req.params.id);
      res.send(
        (
          await dependencies.p6Collections.RoomImage.find({
            roomId: req.params.id,
          })
            .sort({ order: 1 })
            .toArray()
        ).map(dependencies.p6Safe),
      );
    }),
  );

  dependencies.app.put(
    "/data/rooms/:id/images",
    dependencies.p6Admin,
    dependencies.p6Route(async (req, res) => {
      res.send(
        await dependencies.p6Execute(req, (plan) =>
          dependencies.p6ChangeImages(req, plan, () => req.body?.images),
        ),
      );
    }),
  );

  dependencies.app.post(
    "/data/rooms/:id/images",
    dependencies.p6Admin,
    dependencies.p6Route(async (req, res) => {
      res.status(201).send(
        await dependencies.p6Execute(req, (plan) =>
          dependencies.p6ChangeImages(req, plan, (room) => {
            const added = req.body?.images || [req.body?.url];
            dependencies.p3Assert(
              Array.isArray(added) && added.length > 0,
              "INVALID_ROOM_IMAGES",
              400,
            );
            return [...(room.images || []), ...added];
          }),
        ),
      );
    }),
  );

  dependencies.app.put(
    "/data/rooms/:id/images/order",
    dependencies.p6Admin,
    dependencies.p6Route(async (req, res) => {
      res.send(
        await dependencies.p6Execute(req, (plan) =>
          dependencies.p6ChangeImages(req, plan, async (room) => {
            const images = await dependencies.p6Collections.RoomImage.find({
                roomId: room.id,
              }).toArray(),
              ids = req.body?.imageIds;
            dependencies.p3Assert(
              Array.isArray(ids) &&
                ids.length === images.length &&
                new Set(ids).size === ids.length &&
                ids.every(
                  (id) =>
                    typeof id === "string" &&
                    images.some((image) => image.id === id),
                ),
              "INVALID_IMAGE_ORDER",
              400,
            );
            return ids.map((id) => images.find((image) => image.id === id).url);
          }),
        ),
      );
    }),
  );

  dependencies.app.put(
    "/data/rooms/:id/images/:imageId/cover",
    dependencies.p6Admin,
    dependencies.p6Route(async (req, res) => {
      res.send(
        await dependencies.p6Execute(req, (plan) =>
          dependencies.p6ChangeImages(req, plan, async (room) => {
            const image = await dependencies.p6Get(
              "RoomImage",
              req.params.imageId,
            );
            dependencies.p3Assert(
              image.roomId === room.id && room.images.includes(image.url),
              "IMAGE_NOT_IN_ROOM",
              404,
            );
            return [
              image.url,
              ...room.images.filter((url) => url !== image.url),
            ];
          }),
        ),
      );
    }),
  );

  dependencies.app.delete(
    "/data/rooms/:id/images/:imageId",
    dependencies.p6Admin,
    dependencies.p6Route(async (req, res) => {
      res.send(
        await dependencies.p6Execute(req, (plan) =>
          dependencies.p6ChangeImages(req, plan, async (room) => {
            const image = await dependencies.p6Get(
              "RoomImage",
              req.params.imageId,
            );
            dependencies.p3Assert(
              image.roomId === room.id,
              "IMAGE_NOT_IN_ROOM",
              404,
            );
            return room.images.filter((url) => url !== image.url);
          }),
        ),
      );
    }),
  );

  dependencies.app.get(
    "/data/rooms/:id/price-history",
    dependencies.p6Admin,
    dependencies.p6Route(async (req, res) => {
      await dependencies.p6Get("Room", req.params.id);
      res.send(
        (
          await dependencies.p6Collections.RoomPriceHistory.find({
            roomId: req.params.id,
          })
            .sort({ effectiveFrom: -1 })
            .toArray()
        ).map(dependencies.p6Safe),
      );
    }),
  );

  dependencies.app.get(
    "/data/admin/customers",
    dependencies.p6Admin,
    dependencies.p6Route(async (req, res) => {
      // The list never includes identity documents. Detail has a separate ownership check.
      res.send(
        (
          await dependencies.customerCollection
            .find({}, { projection: { identity: 0 } })
            .sort({ fullName: 1 })
            .toArray()
        ).map(dependencies.p6Safe),
      );
    }),
  );

  dependencies.app.get(
    "/data/admin/customers/:id",
    dependencies.requireRole("ADMIN", "EMPLOYEE"),
    dependencies.p6Route(async (req, res) => {
      const customer = await dependencies.p6Get("Customer", req.params.id);
      dependencies.p3Assert(
        await dependencies.p3IdentityAccess(req, customer),
        "CUSTOMER_NOT_ASSIGNED",
        403,
      );
      const result = dependencies.p6Safe(customer);
      res.send(result);
    }),
  );

  dependencies.app.get(
    "/audit-logs",
    dependencies.p6Admin,
    dependencies.p6Route(async (req, res) => {
      const { entityType, actorId, from, to } = req.query;
      const page = Number(req.query.page || 1),
        limit = Number(req.query.limit || 20);
      dependencies.p3Assert(
        Number.isSafeInteger(page) &&
          page > 0 &&
          Number.isSafeInteger(limit) &&
          limit > 0 &&
          limit <= 100,
        "INVALID_PAGINATION",
        400,
      );
      const filter = {
        entityType: {
          $nin: ["P3Operation", "P4Operation", "P5Operation", "P6Operation"],
        },
      };
      if (entityType)
        filter.entityType = dependencies.p6Text(
          entityType,
          "ENTITY_TYPE",
          1,
          80,
        );
      dependencies.p3Assert(
        !["P3Operation", "P4Operation", "P5Operation", "P6Operation"].includes(
          entityType,
        ),
        "INVALID_ENTITY_TYPE",
        400,
      );
      if (actorId)
        filter.actorId = dependencies.p6Text(actorId, "ACTOR_ID", 1, 100);
      if (from || to) {
        filter.at = {};
        if (from)
          filter.at.$gte = new Date(
            `${dependencies.p6Day(from, "FROM_DATE")}T00:00:00+07:00`,
          );
        if (to)
          filter.at.$lt = new Date(
            new Date(
              `${dependencies.p6Day(to, "TO_DATE")}T00:00:00+07:00`,
            ).getTime() + 86400000,
          );
        dependencies.p3Assert(
          !from || !to || from <= to,
          "INVALID_DATE_RANGE",
          400,
        );
      }
      const total = await dependencies.auditCollection.countDocuments(filter);
      const items = await dependencies.auditCollection
        .find(filter, {
          projection: {
            id: 1,
            entityType: 1,
            entityId: 1,
            action: 1,
            actorId: 1,
            at: 1,
            before: 1,
            after: 1,
            reason: 1,
          },
        })
        .sort({ at: -1, id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray();
      res.send({
        items: items.map(dependencies.p6Safe),
        total,
        page,
        limit,
        pages: Math.max(1, Math.ceil(total / limit)),
      });
    }),
  );
}

module.exports = { registerPublicCatalogRoutes, registerAdminCatalogRoutes };

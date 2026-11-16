function registerLoginRoutes(dependencies) {
  dependencies.app.post(
    "/user-login",
    dependencies.cors(),
    async (req, res) => {
      try {
        const { phone, password, rememberMe } = req.body || {};
        if (typeof phone !== "string" || typeof password !== "string") {
          return res.status(401).send({ message: "Wrong phone or password" });
        }
        const normalizedPhone = dependencies.normalizePhone(phone);
        const account = await dependencies.accountCollection.findOne(
          dependencies.validPhone(normalizedPhone)
            ? { phone: normalizedPhone }
            : { username: phone.trim().toLowerCase() },
        );
        if (!account || account.status !== "ACTIVE")
          return res.status(401).send({ message: "Wrong phone or password" });
        const passwordHash = dependencies.crypto.scryptSync(
          password,
          account.salt,
          64,
        );
        const storedHash = Buffer.from(account.passwordHash, "hex");
        if (
          storedHash.length !== passwordHash.length ||
          !dependencies.crypto.timingSafeEqual(passwordHash, storedHash)
        ) {
          return res.status(401).send({ message: "Wrong phone or password" });
        }
        // Each app only signs in its own role (staff accounts are issued by the company).
        const portal = dependencies.portalOf(req);
        if (portal && dependencies.portalRoles[portal] !== account.role) {
          return res
            .status(403)
            .send({
              code: "WRONG_PORTAL",
              message: "This account cannot sign in to this portal",
            });
        }
        // Renew the session and keep the selected rooms
        const viewingCart = req.session.viewingCart || [];
        await new Promise((resolve, reject) =>
          req.session.regenerate((error) =>
            error ? reject(error) : resolve(),
          ),
        );
        req.session.user = {
          id: account._id.toString(),
          phone: account.phone,
          role: account.role,
          name: account.name,
          ...(typeof account.username === "string"
            ? { username: account.username }
            : {}),
        };
        req.session.viewingCart = viewingCart;
        await new Promise((resolve, reject) =>
          req.session.save((error) => (error ? reject(error) : resolve())),
        );
        if (rememberMe === true) {
          res.cookie(dependencies.rememberCookieName(portal), account.phone, {
            maxAge: 30 * 24 * 60 * 60 * 1000,
            httpOnly: false,
            secure: false,
            sameSite: "lax",
          });
        } else {
          res.clearCookie(dependencies.rememberCookieName(portal), {
            sameSite: "lax",
            secure: false,
          });
        }
        res.send({ message: "Login successful!", user: req.session.user });
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    },
  );

  dependencies.app.get(
    "/auth/profile",
    dependencies.cors(),
    async (req, res) => {
      if (!req.session.user)
        return res.status(401).send({ message: "Login required" });
      res.send(req.session.user);
    },
  );

  dependencies.app.post(
    "/auth/logout",
    dependencies.cors(),
    async (req, res) => {
      try {
        await new Promise((resolve, reject) =>
          req.session.destroy((error) => (error ? reject(error) : resolve())),
        );
        res.clearCookie(
          dependencies.sessionCookieName(dependencies.portalOf(req)),
          { httpOnly: true, sameSite: "lax", secure: false },
        );
        res.send({ message: "Logout successful!" });
      } catch (error) {
        res.status(500).send({ message: error.message });
      }
    },
  );
}

function registerRegistrationRoutes(dependencies) {
  dependencies.app.post(
    "/user-register",
    dependencies.cors(),
    dependencies.p2Write(async (req, res) =>
      dependencies.p3Serial(async () => {
        await dependencies.p3Recover();
        // Only customers register themselves; staff accounts are issued by the company.
        if (
          dependencies.portalOf(req) &&
          dependencies.portalOf(req) !== "customer"
        ) {
          return res
            .status(403)
            .send({
              code: "WRONG_PORTAL",
              message: "Registration is only available to customers",
            });
        }
        const { password, name, email } = req.body || {};
        const rawUsername =
          typeof req.body?.username === "string"
            ? req.body.username.trim()
            : "";
        const username = rawUsername.toLowerCase();
        const phone = dependencies.normalizePhone(req.body?.phone);
        // Username is optional (registration form no longer asks for it); validated only when sent.
        if (
          (rawUsername && !/^[A-Za-z][A-Za-z0-9_-]{2,29}$/.test(rawUsername)) ||
          !dependencies.validPhone(phone) ||
          typeof password !== "string" ||
          password.length < 8 ||
          password.length > 128 ||
          typeof name !== "string" ||
          name.trim().length < 2 ||
          name.trim().length > 100 ||
          (email !== undefined &&
            (typeof email !== "string" ||
              !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))
        ) {
          return res
            .status(400)
            .send({
              message: "Invalid username, phone, password, name or email",
            });
        }
        if (
          username &&
          (await dependencies.accountCollection.findOne({ username }))
        ) {
          return res
            .status(409)
            .send({
              code: "USERNAME_TAKEN",
              message: "Username already registered",
            });
        }
        if (await dependencies.accountCollection.findOne({ phone })) {
          return res
            .status(409)
            .send({ code: "PHONE_TAKEN", message: "Phone already registered" });
        }
        const now = new Date();
        const salt = dependencies.crypto.randomBytes(16).toString("hex");
        const passwordHash = await new Promise((resolve, reject) => {
          dependencies.crypto.scrypt(password, salt, 64, (error, key) =>
            error ? reject(error) : resolve(key.toString("hex")),
          );
        });
        const account = dependencies.newRecord("tk-kh", {
          ...(username ? { username } : {}),
          phone,
          name: name.trim(),
          fullName: name.trim(),
          role: "CUSTOMER",
          status: "ACTIVE",
          roles: [{ role: "CUSTOMER", assignedAt: now }],
          salt,
          passwordHash,
          ...(email ? { email: email.trim() } : {}),
          createdAt: now,
          updatedAt: now,
        });
        const role = dependencies.newRecord("vaitro", {
          accountId: account.id,
          roleId: "CUSTOMER",
          assignedAt: now,
        });
        const existingCustomer = await dependencies.customerCollection.findOne({
          phone,
        });
        const customer =
          existingCustomer ||
          dependencies.newRecord("kh", {
            accountId: account.id,
            fullName: account.name,
            phone,
            createdAt: now,
          });
        if (existingCustomer?.accountId)
          return res
            .status(409)
            .send({ code: "PHONE_TAKEN", message: "Phone already registered" });
        try {
          await dependencies.accountCollection.insertOne(account);
          await dependencies.accountRoleCollection.insertOne(role);
          if (existingCustomer) {
            const linked = await dependencies.customerCollection.updateOne(
              { id: customer.id, accountId: null },
              { $set: { accountId: account.id, updatedAt: now } },
            );
            if (linked.modifiedCount !== 1)
              throw Object.assign(new Error("Customer account changed"), {
                code: 11000,
                keyPattern: { phone: 1 },
              });
          } else await dependencies.customerCollection.insertOne(customer);
        } catch (error) {
          // Compensate only records created by this request on standalone MongoDB.
          if (existingCustomer)
            await dependencies.customerCollection.updateOne(
              { id: customer.id, accountId: account.id },
              { $unset: { accountId: "" } },
            );
          else
            await dependencies.customerCollection.deleteOne({
              _id: customer._id,
            });
          await dependencies.accountRoleCollection.deleteOne({ _id: role._id });
          await dependencies.accountCollection.deleteOne({ _id: account._id });
          if (
            error.code === 11000 &&
            (error.keyPattern?.username ||
              error.keyValue?.username !== undefined)
          ) {
            return res
              .status(409)
              .send({
                code: "USERNAME_TAKEN",
                message: "Username already registered",
              });
          }
          if (
            error.code === 11000 &&
            (error.keyPattern?.phone || error.keyValue?.phone !== undefined)
          ) {
            return res
              .status(409)
              .send({
                code: "PHONE_TAKEN",
                message: "Phone already registered",
              });
          }
          throw error;
        }
        req.p2Account = account;
        await dependencies.audit(req, "Account", account.id, "CREATE", null, {
          username,
          phone,
          name: account.name,
          role: "CUSTOMER",
        });
        await dependencies.audit(req, "AccountRole", role.id, "CREATE", null, {
          accountId: account.id,
          roleId: "CUSTOMER",
        });
        await dependencies.audit(
          req,
          "Customer",
          customer.id,
          existingCustomer ? "LINK_ACCOUNT" : "CREATE",
          existingCustomer ? dependencies.publicRecord(existingCustomer) : null,
          dependencies.publicRecord({ ...customer, accountId: account.id }),
        );
        const cart = req.session.viewingCart || [];
        await new Promise((resolve, reject) =>
          req.session.regenerate((error) =>
            error ? reject(error) : resolve(),
          ),
        );
        req.session.user = {
          id: account._id.toString(),
          username,
          phone,
          name: account.name,
          role: "CUSTOMER",
        };
        req.session.viewingCart = cart;
        await new Promise((resolve, reject) =>
          req.session.save((error) => (error ? reject(error) : resolve())),
        );
        res.status(201).send({ user: req.session.user });
      }),
    ),
  );
}

module.exports = { registerLoginRoutes, registerRegistrationRoutes };

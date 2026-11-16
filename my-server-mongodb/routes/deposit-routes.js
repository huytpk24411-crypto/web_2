function registerDepositRoutes(dependencies) {
  dependencies.app.post(
    "/data/admin/deposits/:id/review",
    dependencies.requireRole("ADMIN"),
    dependencies.p3Gone("FLOW_CHANGED"),
  );

  dependencies.app.post(
    "/data/admin/deposits/:id/approve-contract",
    dependencies.requireRole("ADMIN"),
    dependencies.p3Write("approveContract"),
  );

  dependencies.app.post(
    "/data/admin/deposits/:id/abandon",
    dependencies.requireRole("ADMIN"),
    dependencies.p3Write("adminAbandonDeposit"),
  );

  dependencies.app.get(
    "/data/admin/contract-reviews",
    dependencies.requireRole("ADMIN"),
    dependencies.p3Route(async (req, res) => {
      const state = req.query.state || "pending";
      dependencies.p3Assert(
        ["pending", "done"].includes(state),
        "INVALID_STATE",
        400,
      );
      const deposits = await dependencies.p3Collections.Deposit.find({
        status: { $in: ["PAID", "CONTRACTED", "COMPLETED", "ABANDONED"] },
      })
        .sort({ createdAt: -1 })
        .toArray();
      const items = [];
      for (const deposit of deposits) {
        const item = await dependencies.p3ContractReview(deposit);
        if (
          item.outcome !== "CANCELLED" &&
          (item.outcome === "PENDING") === (state === "pending")
        )
          items.push(item);
      }
      res.send({ items, total: items.length });
    }),
  );

  dependencies.app.get(
    "/data/me/employee",
    dependencies.p3Employee,
    dependencies.p3Route(async (req, res) => {
      const e = req.p2Employee;
      res.send({
        id: e.id,
        accountId: e.accountId,
        employeeCode: e.employeeCode,
        fullName: e.fullName || req.p2Account.name,
        phone: e.phone || req.p2Account.phone,
        email: e.email || "",
        position: e.position || "",
        avatar: e.avatar || e.avatarUrl || "",
        status: e.status,
      });
    }),
  );

  dependencies.app.get(
    "/data/me/deposit-drafts",
    dependencies.p3Employee,
    dependencies.p3Route(async (req, res) => {
      const items = await dependencies.p3Collections.DepositDraft.find({
        employeeId: req.p2Employee.id,
      })
        .sort({ updatedAt: -1 })
        .toArray();
      res.send({ items: items.map(dependencies.p3Clean) });
    }),
  );

  dependencies.app.post(
    "/data/me/deposit-drafts",
    dependencies.p3Employee,
    dependencies.p3Write("createDepositDraft"),
  );

  dependencies.app.put(
    "/data/me/deposit-drafts/:id",
    dependencies.p3Employee,
    dependencies.p3Write("updateDepositDraft"),
  );

  dependencies.app.delete(
    "/data/me/deposit-drafts/:id",
    dependencies.p3Employee,
    dependencies.p3Write("deleteDepositDraft"),
  );

  dependencies.app.post(
    "/data/customers/deposit-profile",
    dependencies.p3Employee,
    dependencies.p3Write("saveDepositCustomer"),
  );

  dependencies.app.post(
    "/data/customers/identity-context",
    dependencies.p3Employee,
    dependencies.p3Route(async (req, res) => {
      const body = req.body || {},
        phone = dependencies.normalizePhone(body.customerPhone);
      dependencies.p3Assert(
        dependencies.validPhone(phone) && typeof body.roomId === "string",
        "INVALID_CONTACT",
        400,
      );
      const customer = await dependencies.customerCollection.findOne({ phone });
      if (customer?.accountId)
        dependencies.p3Assert(
          await dependencies.accountCollection.findOne({
            id: customer.accountId,
            role: "CUSTOMER",
            status: "ACTIVE",
          }),
          "CUSTOMER_ACCOUNT_REQUIRED",
          400,
        );
      const hold = await dependencies.p3DepositCustomerRoom(
          req,
          customer,
          body.roomId,
        ),
        employeeId = req.p2Employee.id;
      if (!customer) {
        delete req.session.depositIdentityContext;
        await new Promise((resolve, reject) =>
          req.session.save((error) => (error ? reject(error) : resolve())),
        );
        return res.json(null);
      }
      if (hold) {
        dependencies.p3Assert(
          !hold.employeeId || hold.employeeId === employeeId,
          "NOT_YOUR_RECORD",
          403,
        );
        if (!hold.employeeId) {
          const claimed = await dependencies.p3Collections.Hold.updateOne(
            { id: hold.id, employeeId: null },
            { $set: { employeeId } },
          );
          dependencies.p3Assert(
            claimed.modifiedCount === 1,
            "NOT_YOUR_RECORD",
            403,
          );
          await dependencies.audit(
            req,
            "Hold",
            hold.id,
            "ASSIGN_EMPLOYEE",
            dependencies.p3Clean(hold),
            { ...dependencies.p3Clean(hold), employeeId },
          );
        }
      }
      req.session.depositIdentityContext = {
        customerId: customer.id,
        roomId: body.roomId,
        employeeId,
        expiresAt: Date.now() + 30 * 60000,
      };
      await new Promise((resolve, reject) =>
        req.session.save((error) => (error ? reject(error) : resolve())),
      );
      res.send(dependencies.p3Clean(customer));
    }),
  );

  dependencies.app.put(
    "/data/customers/:id/identity",
    dependencies.p3Staff,
    dependencies.p3Write("updateIdentity"),
  );

  dependencies.app.get(
    "/data/me/holds",
    dependencies.p3Customer,
    dependencies.p3Route(async (req, res) => {
      const records = await dependencies.p3Collections.Hold.find({
        customerId: req.p2Customer.id,
      })
        .sort({ createdAt: -1 })
        .toArray();
      res.send({
        items: await Promise.all(
          records.map((record) => dependencies.p3RoomDisplay(record, "Hold")),
        ),
        total: records.length,
      });
    }),
  );

  dependencies.app.post(
    "/data/me/holds",
    dependencies.p3Customer,
    dependencies.p3Write("createHold"),
  );

  dependencies.app.get(
    "/data/me/holds/:id",
    dependencies.p3Customer,
    dependencies.p3Route(async (req, res) => {
      const hold = await dependencies.p3Find("Hold", req.params.id);
      dependencies.p3Own(req, hold);
      res.send(await dependencies.p3RoomDisplay(hold, "Hold"));
    }),
  );

  dependencies.app.post(
    "/data/me/holds/:id/payos-link",
    dependencies.p3Customer,
    dependencies.p3Write("payosLink"),
  );

  dependencies.app.get(
    "/data/me/holds/:id/payment-status",
    dependencies.p3Customer,
    dependencies.p3Route(async (req, res) => {
      let hold = await dependencies.p3Find("Hold", req.params.id);
      dependencies.p3Own(req, hold);
      let payment = await dependencies.p3Collections.Payment.findOne({
        holdId: hold.id,
        provider: "PAYOS",
      });
      if (!payment && hold.paymentId)
        payment = await dependencies.p3Collections.Payment.findOne({
          id: hold.paymentId,
          holdId: hold.id,
        });
      if (
        payment?.provider === "PAYOS" &&
        payment.status === "PENDING" &&
        dependencies.payosConfigured()
      ) {
        const data = await dependencies.payosGetRequest(payment.orderCode);
        if (data.status === "PAID" || data.amountPaid >= payment.amount) {
          dependencies.p3Assert(
            data.amount === payment.amount,
            "AMOUNT_MISMATCH",
            400,
          );
          const transaction = data.transactions?.find((row) => row.reference);
          payment = await dependencies.payosSettle(payment, {
            amount: payment.amount,
            reference: data.reference || transaction?.reference,
          });
          hold = await dependencies.p3Find("Hold", hold.id);
        }
      }
      res.send({
        holdStatus: hold.status,
        paymentStatus: payment?.status || null,
        expiresAt: hold.expiresAt,
      });
    }),
  );

  dependencies.app.post(
    "/data/me/holds/:id/complete-payment",
    dependencies.p3Customer,
    dependencies.p3Gone("PAYMENT_GATEWAY_REQUIRED"),
  );

  dependencies.app.post(
    "/data/me/holds/:id/payments",
    dependencies.p3Customer,
    dependencies.p3Gone("PAYMENT_GATEWAY_REQUIRED"),
  );

  dependencies.app.post(
    "/data/me/holds/:id/cancel",
    dependencies.p3Customer,
    dependencies.p3Write("cancelHold"),
  );

  dependencies.app.get(
    "/data/holds/creditable",
    dependencies.p3Staff,
    dependencies.p3Route(async (req, res) => {
      // payOS holds are paid without an employee; any employee may pick them up (claimed at identity-context).
      const query = {
        ...(req.p2Employee
          ? { employeeId: { $in: [req.p2Employee.id, null] } }
          : {}),
        status: "ACTIVE",
        isActive: true,
        creditedToDepositId: null,
        expiresAt: { $gt: new Date() },
        ...(req.query.roomId ? { roomId: req.query.roomId } : {}),
      };
      const holds = await dependencies.p3Collections.Hold.find(query).toArray(),
        result = [];
      for (const hold of holds)
        if (
          await dependencies.p3Collections.Payment.findOne({
            id: hold.paymentId,
            status: "CONFIRMED",
          })
        )
          result.push(dependencies.p3Clean(hold));
      res.send(result);
    }),
  );

  for (const [path, action, role] of [
    ["/data/deposits", "createDeposit", dependencies.p3Employee],
    ["/data/deposits/:id/payments", "depositPayment", dependencies.p3Employee],
    ["/data/deposits/:id/cancel", "cancelDeposit", dependencies.p3Staff],
    ["/data/deposits/:id/abandonment", "abandonDeposit", dependencies.p3Staff],
    ["/data/contracts", "createContract", dependencies.p3Employee],
    ["/data/contracts/:id/sign", "signContract", dependencies.p3Employee],
    [
      "/data/contracts/:id/complete",
      "completeContract",
      dependencies.p3Employee,
    ],
  ])
    dependencies.app.post(
      path,
      role,
      [
        "depositPayment",
        "cancelDeposit",
        "abandonDeposit",
        "completeContract",
      ].includes(action)
        ? dependencies.p3Gone("FLOW_CHANGED")
        : dependencies.p3Write(action),
    );

  for (const action of ["confirm", "reject"])
    dependencies.app.post(
      `/data/payments/:id/${action}`,
      dependencies.p3Employee,
      dependencies.p3Route(async (req, res) => {
        const payment = await dependencies.p3Find("Payment", req.params.id);
        dependencies.p3Own(
          req,
          await dependencies.p3Find(
            payment.purpose === "HOLD" ? "Hold" : "Deposit",
            payment.holdId || payment.depositId,
          ),
        );
        dependencies.p3Gone(
          payment.purpose === "HOLD"
            ? "PAYMENT_GATEWAY_REQUIRED"
            : "FLOW_CHANGED",
        )(req, res);
      }),
    );

  // Company info printed on deposit sheets (single source: p3DepositCompany).
  dependencies.app.get("/data/company", dependencies.p3Staff, (req, res) =>
    res.send(dependencies.p3DepositCompany),
  );

  dependencies.app.get(
    "/data/deposits/:id/sheet",
    dependencies.p3Staff,
    dependencies.p3Route(async (req, res) => {
      const deposit = await dependencies.p3Find("Deposit", req.params.id);
      dependencies.p3Own(req, deposit);
      const contract = await dependencies.p3Collections.Contract.findOne({
        depositId: deposit.id,
      });
      const transaction =
        await dependencies.p3Collections.BrokerageTransaction.findOne({
          $or: [
            { depositId: deposit.id },
            ...(contract ? [{ contractId: contract.id }] : []),
          ],
        });
      const room = await dependencies.roomCollection.findOne({
        id: deposit.roomId,
      });
      const roomInfo = room
        ? await dependencies.p3SheetRoom(room, true)
        : await dependencies.p3SheetRoom(
            deposit.sheetRoomSnapshot ||
              deposit.roomSnapshot ||
              transaction?.roomSnapshot ||
              contract?.roomSnapshot ||
              {},
          );
      const customer = await dependencies.customerCollection.findOne({
        id: deposit.customerId,
      });
      const account = customer?.accountId
        ? await dependencies.accountCollection.findOne({
            id: customer.accountId,
          })
        : null;
      const employee = await dependencies.employeeCollection.findOne({
        id: deposit.employeeId,
      });
      const employeeAccount = employee?.accountId
        ? await dependencies.accountCollection.findOne({
            id: employee.accountId,
          })
        : null;
      const hold = deposit.holdId
        ? await dependencies.p3Collections.Hold.findOne({ id: deposit.holdId })
        : null;
      const identity = customer?.identity || {},
        identityNumber = identity.number || "";
      const maskedNumber = identityNumber
        ? `${"*".repeat(Math.max(0, identityNumber.length - 4))}${identityNumber.slice(-4)}`
        : "";
      const lease = deposit.proposedLease;
      res.send({
        company: dependencies.p3DepositCompany,
        deposit: {
          id: deposit.id,
          number: deposit.number,
          status: deposit.status,
          statusLabel:
            dependencies.p3StatusLabels.Deposit[deposit.status] ||
            deposit.status,
          createdAt: deposit.createdAt,
          totalRequired: deposit.totalRequired,
          holdCredit: deposit.holdCredit ?? 0,
          amountDue: deposit.amountDue,
          collected: {
            method: deposit.collected?.method ?? null,
            amount: deposit.collected?.amount ?? null,
            note: deposit.collected?.note || "",
            at: deposit.collected?.at ?? null,
          },
          proposedLease: {
            months: lease?.months ?? null,
            startDate: lease?.startDate ?? null,
            endDate: lease
              ? dependencies.p3LeaseEndDate(lease.startDate, lease.months)
              : null,
            monthlyRent: lease?.monthlyRent ?? null,
          },
        },
        hold: hold ? { number: hold.number } : null,
        customer: {
          fullName:
            customer?.fullName ||
            customer?.name ||
            account?.fullName ||
            account?.name ||
            deposit.customerName ||
            "",
          phone: customer?.phone || account?.phone || deposit.phone || "",
          identity: {
            number:
              req.p2Account.role === "ADMIN" ? maskedNumber : identityNumber,
            issuedDate: identity.issuedDate || "",
            issuedPlace: identity.issuedPlace || "",
          },
          permanentAddress: customer?.permanentAddress || "",
        },
        employee: {
          fullName:
            employee?.fullName ||
            employeeAccount?.fullName ||
            employeeAccount?.name ||
            "",
          employeeCode: employee?.employeeCode || "",
        },
        room: roomInfo,
        contract: contract
          ? {
              id: contract.id,
              number: contract.number,
              status: contract.status,
            }
          : null,
      });
    }),
  );

  for (const [path, type] of [
    ["deposits", "Deposit"],
    ["contracts", "Contract"],
    ["payments", "Payment"],
  ]) {
    dependencies.app.get(
      `/data/${path}`,
      dependencies.p3Staff,
      dependencies.p3Route(async (req, res) => {
        const query = {};
        if (req.p2Employee && type === "Contract") {
          const deposits = await dependencies.p3Collections.Deposit.find({
            employeeId: req.p2Employee.id,
          }).toArray();
          query.depositId = { $in: deposits.map((d) => d.id) };
        } else if (req.p2Employee && type === "Deposit")
          query.employeeId = req.p2Employee.id;
        else if (req.p2Employee && type === "Payment") {
          const deposits = await dependencies.p3Collections.Deposit.find({
            employeeId: req.p2Employee.id,
          }).toArray();
          const holds = await dependencies.p3Collections.Hold.find({
            employeeId: req.p2Employee.id,
          }).toArray();
          query.$or = [
            { purpose: "HOLD", holdId: { $in: holds.map((h) => h.id) } },
            { depositId: { $in: deposits.map((d) => d.id) } },
          ];
        }
        if (req.query.status) query.status = req.query.status;
        if (req.query.roomId && type !== "Payment")
          query.roomId = req.query.roomId;
        const records = await dependencies.p3Collections[type]
          .find(query)
          .toArray();
        res.send({
          items: await Promise.all(
            records.map((record) =>
              dependencies.p3EmployeeDisplay(type, record),
            ),
          ),
          total: records.length,
        });
      }),
    );
    dependencies.app.get(
      `/data/${path}/:id`,
      dependencies.requireRole("CUSTOMER", "EMPLOYEE", "ADMIN"),
      dependencies.p3Route(async (req, res) => {
        const record = await dependencies.p3Find(type, req.params.id);
        if (type === "Contract")
          dependencies.p3Own(
            req,
            await dependencies.p3Find("Deposit", record.depositId),
          );
        else if (type === "Payment")
          dependencies.p3Own(
            req,
            await dependencies.p3Find(
              record.purpose === "HOLD" ? "Hold" : "Deposit",
              record.holdId || record.depositId,
            ),
          );
        else dependencies.p3Own(req, record);
        res.send(await dependencies.p3EmployeeDisplay(type, record));
      }),
    );
  }

  dependencies.app.get(
    "/data/payments/:id/receipt",
    dependencies.requireRole("CUSTOMER", "EMPLOYEE", "ADMIN"),
    dependencies.p3Route(async (req, res) => {
      const payment = await dependencies.p3Find("Payment", req.params.id);
      const ref = await dependencies.p3Find(
        payment.purpose === "HOLD" ? "Hold" : "Deposit",
        payment.holdId || payment.depositId,
      );
      dependencies.p3Own(req, ref);
      dependencies.p3Assert(
        payment.status === "CONFIRMED" && payment.receipt,
        "RECEIPT_NOT_FOUND",
        404,
      );
      res.send(payment.receipt);
    }),
  );

  dependencies.app.get(
    "/data/brokerage-transactions",
    dependencies.p3Staff,
    dependencies.p3Route(async (req, res) => {
      const query = {};
      if (req.p2Employee) {
        const revenues = await dependencies.p3Collections.EmployeeRevenue.find({
          employeeId: req.p2Employee.id,
        }).toArray();
        query.employeeRevenueId = { $in: revenues.map((r) => r.id) };
      }
      if (req.query.month) query.recognitionMonth = req.query.month;
      if (req.query.status) query.status = req.query.status;
      res.send(
        (
          await dependencies.p3Collections.BrokerageTransaction.find(
            query,
          ).toArray()
        ).map(dependencies.p3Clean),
      );
    }),
  );
}

module.exports = { registerDepositRoutes };

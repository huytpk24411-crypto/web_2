// CommonJS services retain the existing rules and MongoDB native-driver operations.
function createDepositService(dependencies) {
  // P3 helpers are exported for pure-function and MongoDB integration specs.
  function p3Error(status, code) {
    const messages = {
      ROOM_LOCKED: "Phòng vừa được khách khác giữ chỗ",
      HOLD_EXPIRED: "Đã hết thời gian thanh toán giữ chỗ",
      PAYMENT_GATEWAY_NOT_CONFIGURED: "Chưa cấu hình cổng thanh toán.",
      PAYMENT_GATEWAY_REQUIRED: "Vui lòng thanh toán qua cổng ngân hàng.",
      INVALID_SIGNATURE: "Chữ ký thanh toán không hợp lệ.",
      FLOW_CHANGED: "Quy trình cọc đã thay đổi.",
      CONTRACT_NOT_SIGNED: "Hợp đồng chưa ký.",
      ALREADY_DECIDED: "Hợp đồng này đã được xác nhận.",
      PAYROLL_CLOSED: "Kỳ lương tháng này đã đóng, không ghi được doanh thu.",
      PAYMENT_GATEWAY_ERROR:
        "Không kết nối được cổng thanh toán. Vui lòng thử lại.",
      INVALID_DRAFT: "Nháp không hợp lệ.",
      DRAFT_LIMIT: "Bạn đã có 20 nháp. Hãy xóa bớt nháp cũ.",
      NOT_FOUND: "Không tìm thấy nháp. Vui lòng tải lại.",
    };
    return Object.assign(new Error(messages[code] || code), { status, code });
  }

  function p3Assert(condition, code, status = 409) {
    if (!condition) throw p3Error(status, code);
  }

  function p3Money(total, credit = 0) {
    p3Assert(
      Number.isSafeInteger(total) &&
        total > 0 &&
        Number.isSafeInteger(credit) &&
        credit >= 0 &&
        credit <= total,
      "INVALID_AMOUNT",
      400,
    );
    return {
      totalRequired: total,
      holdCredit: credit,
      amountDue: total - credit,
    };
  }

  function p3Month(at) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
    }).formatToParts(new Date(at));
    return `${parts.find((p) => p.type === "year").value}-${parts.find((p) => p.type === "month").value}`;
  }

  function p3Date(value) {
    return (
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value
    );
  }

  function p3LeaseEndDate(startDate, months) {
    if (
      !p3Date(startDate) ||
      !Number.isInteger(months) ||
      months < 1 ||
      months > 120
    )
      return null;
    const date = new Date(`${startDate}T00:00:00.000Z`),
      day = date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth() + months);
    const lastDay = new Date(date);
    lastDay.setUTCMonth(lastDay.getUTCMonth() + 1);
    lastDay.setUTCDate(0);
    date.setUTCDate(Math.min(day, lastDay.getUTCDate()));
    return date.toISOString().slice(0, 10);
  }

  function p3Fee(rent, agreement) {
    p3Assert(
      agreement?.feeMethod === "PERCENT_OF_MONTHLY_RENT" &&
        agreement.feeValue === 5000,
      "AGREEMENT_NOT_CONFIGURED",
    );
    p3Assert(Number.isSafeInteger(rent) && rent > 0, "INVALID_RENT", 400);
    return Number((BigInt(rent) * BigInt(agreement.feeValue) + 5000n) / 10000n);
  }

  function p3Transition(type, from, to) {
    const edges = {
      Hold: [
        "PAYMENT_PENDING:ACTIVE",
        "PAYMENT_PENDING:CANCELLED",
        "PAYMENT_PENDING:EXPIRED",
        "ACTIVE:CANCELLED",
        "ACTIVE:EXPIRED",
        "ACTIVE:FORFEITED",
        "ACTIVE:CONVERTED",
        "CONVERTED:ACTIVE",
        "CONVERTED:EXPIRED",
        "CONVERTED:FORFEITED",
      ],
      Payment: [
        "PENDING:CONFIRMED",
        "PENDING:LATE_PAID",
        "PENDING:REJECTED",
        "PENDING:FAILED",
      ],
      Deposit: [
        "PAYMENT_PENDING:PAID",
        "PAYMENT_PENDING:CANCELLED",
        "PAID:CONTRACTED",
        "PAID:COMPLETED",
        "CONTRACTED:COMPLETED",
        "PAID:ABANDONED",
        "CONTRACTED:ABANDONED",
      ],
      Contract: [
        "DRAFT:SIGNED",
        "SIGNED:COMPLETED",
        "DRAFT:CANCELLED",
        "DRAFT:VOID",
        "SIGNED:VOID",
      ],
    };
    return edges[type]?.includes(`${from}:${to}`) || false;
  }

  function p3AvailableFilter(roomId, now) {
    return {
      id: roomId,
      publicationStatus: "PUBLISHED",
      status: "AVAILABLE",
      businessStatus: "AVAILABLE",
      $or: [{ lock: null }, { "lock.expiresAt": { $type: "date", $lte: now } }],
    };
  }

  function p3Clean(record) {
    if (!record) return record;
    const { _id, p3LastStep, ...value } = record;
    return value;
  }

  function p3DraftData(data) {
    p3Assert(
      data && typeof data === "object" && !Array.isArray(data),
      "INVALID_DRAFT",
      400,
    );
    p3Assert(
      Buffer.byteLength(JSON.stringify(data), "utf8") <= 20 * 1024,
      "INVALID_DRAFT",
      400,
    );
    const keys = [
      "bookingId",
      "customerName",
      "phone",
      "propertyId",
      "floor",
      "roomId",
      "total",
      "duration",
      "startDate",
      "collectedMethod",
      "note",
      "idNumber",
      "issuedOn",
      "issuedBy",
      "permanentAddress",
      "frontImageUrl",
      "backImageUrl",
    ];
    const entries = Object.entries(data).filter(([key]) => keys.includes(key));
    // total/duration: a finite number or empty (draft may be incomplete); other keys: strings ≤ 500.
    p3Assert(
      entries.every(([key, value]) =>
        ["total", "duration"].includes(key)
          ? value === null ||
            value === "" ||
            (typeof value === "number" && Number.isFinite(value) && value >= 0)
          : typeof value === "string" && value.length <= 500,
      ),
      "INVALID_DRAFT",
      400,
    );
    p3Assert(
      entries.every(
        ([key, value]) =>
          !["frontImageUrl", "backImageUrl"].includes(key) ||
          value === "" ||
          /^\/uploads\/cccd\/[\w-]+\.(?:jpe?g|png|webp)$/i.test(value),
      ),
      "INVALID_DRAFT",
      400,
    );
    return Object.fromEntries(entries);
  }

  async function p3DraftLabel(data) {
    const room =
      typeof data.roomId === "string"
        ? await dependencies.roomCollection.findOne({ id: data.roomId })
        : null;
    return {
      customerName: data.customerName || "",
      phone: data.phone || "",
      roomCode: room?.code || "",
      roomName: room?.name || "",
    };
  }

  function p3DraftEvent(plan, before, after) {
    p3Insert(plan, "AuditLog", {
      id: `p3-draft-${plan.opId}-${plan.effects.length}`,
      entityType: "DepositDraft",
      entityId: (after || before).id,
      action: !after ? "DELETE" : before ? "UPDATE" : "CREATE",
      actorId: plan.actorId,
      at: plan.now,
      before: p3Clean(before),
      after: p3Clean(after),
    });
  }

  function p3Stable(value) {
    if (Array.isArray(value)) return value.map(p3Stable);
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((k) => [k, p3Stable(value[k])]),
      );
    return value;
  }

  function payosConfig() {
    return {
      clientId: process.env.PAYOS_CLIENT_ID,
      apiKey: process.env.PAYOS_API_KEY,
      checksumKey: process.env.PAYOS_CHECKSUM_KEY,
      // Only test runs override this (local payOS stub); production always uses the official host.
      apiBase: (
        process.env.PAYOS_API_BASE || "https://api-merchant.payos.vn"
      ).replace(/\/+$/, ""),
      customerAppUrl: (
        process.env.CUSTOMER_APP_URL || "http://localhost:4200"
      ).replace(/\/+$/, ""),
    };
  }

  function payosConfigured(config = payosConfig()) {
    return !!(config.clientId && config.apiKey && config.checksumKey);
  }

  function payosSign(data, key) {
    const value = (input) =>
      input == null || input === "null" || input === "undefined"
        ? ""
        : Array.isArray(input)
          ? JSON.stringify(input.map(p3Stable))
          : String(input);
    const text = Object.keys(data)
      .sort()
      .map((name) => `${name}=${value(data[name])}`)
      .join("&");
    return dependencies.crypto
      .createHmac("sha256", key)
      .update(text)
      .digest("hex");
  }

  function payosVerify(body, key) {
    if (
      !key ||
      !body?.data ||
      typeof body.data !== "object" ||
      Array.isArray(body.data) ||
      typeof body.signature !== "string" ||
      !/^[a-fA-F0-9]{64}$/.test(body.signature)
    )
      return false;
    const expected = Buffer.from(payosSign(body.data, key), "hex"),
      actual = Buffer.from(body.signature, "hex");
    return (
      actual.length === expected.length &&
      dependencies.crypto.timingSafeEqual(actual, expected)
    );
  }

  async function payosRequest(method, resource, body, config, request) {
    p3Assert(payosConfigured(config), "PAYMENT_GATEWAY_NOT_CONFIGURED", 503);
    try {
      const response = await request(
        `${config.apiBase || "https://api-merchant.payos.vn"}/v2/payment-requests${resource}`,
        {
          method,
          headers: {
            "x-client-id": config.clientId,
            "x-api-key": config.apiKey,
            "Content-Type": "application/json",
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(5000),
        },
      );
      const result = await response.json();
      p3Assert(
        response.ok && result.code === "00" && result.data,
        "PAYMENT_GATEWAY_ERROR",
        502,
      );
      return result.data;
    } catch {
      throw p3Error(502, "PAYMENT_GATEWAY_ERROR");
    }
  }

  async function payosCreateLink(
    data,
    config = payosConfig(),
    request = fetch,
  ) {
    const { amount, cancelUrl, description, orderCode, returnUrl } = data;
    const signature = payosSign(
      { amount, cancelUrl, description, orderCode, returnUrl },
      config.checksumKey || "",
    );
    return payosRequest("POST", "", { ...data, signature }, config, request);
  }

  async function payosGetRequest(
    orderCode,
    config = payosConfig(),
    request = fetch,
  ) {
    p3Assert(
      Number.isSafeInteger(orderCode) && orderCode > 0,
      "INVALID_ORDER_CODE",
      400,
    );
    return payosRequest("GET", `/${orderCode}`, null, config, request);
  }

  async function p3Commit(plan, action) {
    const op = {
      id: plan.opId,
      entityType: "P3Operation",
      entityId: plan.id,
      action,
      actorId: plan.actorId || null,
      at: plan.now,
      state: "PENDING",
      cursor: 0,
      plan,
    };
    await dependencies.auditCollection.insertOne(op);
    return p3Run(op);
  }

  async function p3Period(plan, at, allowClosed = false) {
    const code = p3Month(at),
      { start, end, ...fields } = dependencies.p5MonthBounds(code);
    let period = await dependencies.p3Collections.PayrollPeriod.findOne({
      year: fields.year,
      month: fields.month,
    });
    if (!period) {
      period = {
        id: `kl-${dependencies.crypto.randomUUID()}`,
        ...fields,
        name: `Lương tháng ${fields.month}/${fields.year}`,
        status: "OPEN",
        displayStatus: "DANG_MO",
        version: 0,
        closedAt: null,
        closedBy: null,
        policyVersionIds: [],
        totals: {},
      };
      await p3Create(plan, "PayrollPeriod", period);
    }
    p3Assert(
      allowClosed || !["CLOSED", "PAID"].includes(period.status),
      "PAYROLL_CLOSED",
    );
    return period;
  }

  async function p3CompanyRevenue(plan, period) {
    let revenue = await dependencies.p3Collections.CompanyRevenue.findOne({
      periodId: period.id,
    });
    if (!revenue) {
      revenue = {
        id: `dtct-${dependencies.crypto.randomUUID()}`,
        periodId: period.id,
        revenue: 0,
        transactionCount: 0,
      };
      await p3Create(plan, "CompanyRevenue", revenue);
    }
    return revenue;
  }

  async function p3Forfeit(plan, hold) {
    const period = await p3Period(plan, hold.expiresAt, true),
      company = await p3CompanyRevenue(plan, period);
    await p3Change(
      plan,
      "Hold",
      hold,
      {
        status: "FORFEITED",
        isActive: false,
        forfeitedAt: hold.expiresAt,
        companyRevenueId: company.id,
        recognitionMonth: p3Month(hold.expiresAt),
      },
      { status: hold.status },
    );
    plan.effects.push({ kind: "companyRevenue", companyRevenueId: company.id });
    await p3Event(
      plan,
      "CompanyRevenue",
      company.id,
      "HOLD_FORFEITED",
      company,
      { ...company, revenue: company.revenue + hold.amount, holdId: hold.id },
    );
    const customer = await dependencies.customerCollection.findOne({
      id: hold.customerId,
    });
    if (customer)
      p3Insert(plan, "Notification", {
        id: `forfeit-${plan.opId}`,
        accountId: customer.accountId,
        type: "HOLD_FORFEITED",
        entityType: "Hold",
        entityId: hold.id,
        title: "Khách bỏ giữ chỗ",
        body: `Giữ chỗ ${hold.number || hold.id} đã hết 48 giờ. Tiền giữ chỗ thuộc công ty theo chính sách.`,
        read: false,
        readAt: null,
        createdAt: plan.now,
        dedupeKey: `forfeit:${hold.id}`,
      });
  }

  // Called only from verified payOS webhook/lookup, while holding the P3 queue.
  async function completeHoldPayment(plan, hold, payment, data) {
    plan.type = "Payment";
    plan.id = payment.id;
    if (["CONFIRMED", "LATE_PAID"].includes(payment.status)) return;
    p3Assert(
      payment.status === "PENDING" &&
        payment.provider === "PAYOS" &&
        payment.purpose === "HOLD",
      "INVALID_TRANSITION",
    );
    p3Assert(
      data.amount === payment.amount && payment.amount === hold.amount,
      "AMOUNT_MISMATCH",
      400,
    );
    const now = plan.now,
      room = await dependencies.roomCollection.findOne({ id: hold.roomId });
    const valid =
      hold.status === "PAYMENT_PENDING" &&
      new Date(hold.expiresAt) > now &&
      room?.lock?.kind === "HOLD" &&
      room.lock.refId === hold.id &&
      new Date(room.lock.expiresAt) > now;
    const fields = {
      status: valid ? "CONFIRMED" : "LATE_PAID",
      method: "BANK_TRANSFER",
      provider: "PAYOS",
      paidAt: now,
      confirmedAt: valid ? now : null,
      confirmedBy: "SYSTEM",
      confirmedByEmployeeId: null,
      ...(data.reference ? { bankTransactionRef: String(data.reference) } : {}),
    };
    if (!valid) {
      // User rule (16/11/2026): a transfer that arrives after the hold expired is NOT refunded —
      // it becomes company revenue for the month it was received (no employee revenue, hold stays inactive).
      const period = await p3Period(plan, now, true),
        company = await p3CompanyRevenue(plan, period);
      await p3Change(
        plan,
        "Payment",
        payment,
        {
          ...fields,
          companyRevenueId: company.id,
          recognitionMonth: p3Month(now),
        },
        { status: "PENDING" },
      );
      plan.effects.push({
        kind: "companyRevenue",
        companyRevenueId: company.id,
      });
      await p3Event(
        plan,
        "CompanyRevenue",
        company.id,
        "HOLD_LATE_PAID",
        company,
        {
          ...company,
          revenue: company.revenue + payment.amount,
          holdId: hold.id,
          paymentId: payment.id,
        },
      );
      const customer = await dependencies.customerCollection.findOne({
        id: hold.customerId,
      });
      if (customer)
        p3Insert(plan, "Notification", {
          id: `late-${payment.id}-customer`,
          accountId: customer.accountId,
          type: "HOLD_LATE_PAID",
          entityType: "Hold",
          entityId: hold.id,
          title: "Giữ chỗ không còn hiệu lực",
          body: `Thanh toán giữ chỗ ${hold.number || hold.id} đến sau khi hết hạn nên giữ chỗ không còn hiệu lực; khoản tiền không được hoàn lại.`,
          read: false,
          readAt: null,
          createdAt: now,
          dedupeKey: `late:${payment.id}:customer`,
        });
      for (const admin of await dependencies.accountCollection
        .find({ role: "ADMIN" })
        .toArray())
        p3Insert(plan, "Notification", {
          id: `late-${payment.id}-${admin.id}`,
          accountId: admin.id,
          type: "HOLD_LATE_PAID",
          entityType: "Payment",
          entityId: payment.id,
          title: "Tiền giữ chỗ chuyển trễ",
          body: `Khách đã chuyển tiền giữ chỗ ${hold.number || hold.id} sau khi hết hạn; khoản ${payment.amount.toLocaleString("vi-VN")} đ được ghi vào doanh thu công ty.`,
          read: false,
          readAt: null,
          createdAt: now,
          dedupeKey: `late:${payment.id}:${admin.id}`,
        });
      return;
    }
    const expiresAt = new Date(now.getTime() + 48 * 3600000);
    const property = room.propertyId
      ? await dependencies.propertyCollection.findOne({ id: room.propertyId })
      : null;
    const receipt = {
      id: `bl-${payment.id}`,
      paymentId: payment.id,
      number: await p3Number("BL", now),
      issuedAt: now,
      snapshot: {
        title: "Biên lai giữ chỗ",
        holdId: hold.id,
        holdNumber: hold.number || hold.id,
        payerName: hold.contact.name,
        payerPhone: hold.contact.phone,
        roomCode: room.code,
        roomName: room.name,
        roomAddress: room.address || property?.address || "",
        amount: hold.amount,
        method: "BANK_TRANSFER",
        paidAt: now,
        expiresAt,
      },
    };
    plan.paymentDeadline = hold.expiresAt;
    await p3Room(
      plan,
      room,
      { kind: "HOLD", refId: hold.id, acquiredAt: now, expiresAt },
      {
        "lock.kind": "HOLD",
        "lock.refId": hold.id,
        "lock.expiresAt": { $gt: now },
      },
    );
    await p3Change(
      plan,
      "Payment",
      payment,
      { ...fields, receipt },
      { status: "PENDING" },
    );
    await p3Create(plan, "Receipt", {
      ...receipt,
      customerId: hold.customerId,
      roomId: room.id,
    });
    await p3Change(
      plan,
      "Hold",
      hold,
      {
        status: "ACTIVE",
        isActive: true,
        paymentId: payment.id,
        paidAt: now,
        lockStartsAt: now,
        expiresAt,
      },
      { status: "PAYMENT_PENDING" },
    );
  }

  async function payosSettle(payment, data) {
    const prepare = async () => {
      payment = await p3Find("Payment", payment.id);
      const plan = Object.assign(p3Plan("Payment", payment.id), {
        opId: `p3-payos-${dependencies.crypto.randomUUID()}`,
        now: new Date(),
        actorId: null,
      });
      await completeHoldPayment(
        plan,
        await p3Find("Hold", payment.holdId),
        payment,
        data,
      );
      return plan;
    };
    let plan = await prepare();
    if (!plan.effects.length) return payment;
    try {
      return await p3Commit(plan, "completeHoldPayment");
    } catch (error) {
      // Only a failed first lock CAS can be reclassified as a late transfer.
      const op = await dependencies.auditCollection.findOne({ id: plan.opId });
      if (
        !plan.paymentDeadline ||
        op?.state !== "FAILED" ||
        !["HOLD_EXPIRED", "ROOM_LOCKED"].includes(error.code)
      )
        throw error;
      plan = await prepare();
      return p3Commit(plan, "lateHoldPayment");
    }
  }

  async function payosWebhook(req, res) {
    if (!payosVerify(req.body, payosConfig().checksumKey)) {
      console.warn("payOS webhook: INVALID_SIGNATURE");
      return res
        .status(400)
        .send({
          code: "INVALID_SIGNATURE",
          message: p3Error(400, "INVALID_SIGNATURE").message,
        });
    }
    try {
      // Unknown sample orders need no recovery or session and are acknowledged immediately.
      const data = req.body.data;
      const payment = await dependencies.p3Collections.Payment.findOne({
        provider: "PAYOS",
        orderCode: data.orderCode,
      });
      if (!payment || data.code !== "00" || data.amount !== payment.amount)
        return res.send({ ok: true });
      await dependencies.p6Barrier();
      await dependencies.p5Barrier();
      await p3Serial(async () => {
        await p3Recover();
        await p3Expire();
        await payosSettle(payment, data);
      });
      res.send({ ok: true });
    } catch {
      res
        .status(503)
        .send({
          code: "RECOVERY_PENDING",
          message: "Vui lòng gửi lại thông báo thanh toán.",
        });
    }
  }

  async function payosEnsureLink(id) {
    let payment = await p3Find("Payment", id);
    const hold = await p3Find("Hold", payment.holdId),
      config = payosConfig();
    p3Assert(payosConfigured(config), "PAYMENT_GATEWAY_NOT_CONFIGURED", 503);
    p3Assert(
      hold.status === "PAYMENT_PENDING" &&
        payment.status === "PENDING" &&
        new Date(hold.expiresAt) > new Date(),
      "HOLD_EXPIRED",
    );
    if (!payment.checkoutUrl) {
      const receiptUrl = `${config.customerAppUrl}/bookings/${hold.id}/receipt?payos=`;
      let link;
      try {
        link = await payosCreateLink(
          {
            orderCode: payment.orderCode,
            amount: payment.amount,
            description: payment.description,
            returnUrl: `${receiptUrl}return`,
            cancelUrl: `${receiptUrl}cancel`,
            expiredAt: Math.floor(new Date(hold.expiresAt).getTime() / 1000),
          },
          config,
        );
      } catch (error) {
        // A timeout can happen after payOS accepted the transfer. Look up that same order.
        try {
          link = await payosGetRequest(payment.orderCode, config);
        } catch {
          throw error;
        }
      }
      p3Assert(!["CANCELLED", "EXPIRED"].includes(link.status), "HOLD_EXPIRED");
      if (link.status === "PAID" || link.amountPaid >= payment.amount) {
        p3Assert(link.amount === payment.amount, "AMOUNT_MISMATCH", 400);
        await payosSettle(payment, { amount: payment.amount });
        throw p3Error(409, "PAYMENT_ALREADY_DECIDED");
      }
      // Never invent gateway URLs or QR payloads when an upstream response is incomplete.
      p3Assert(
        typeof link.checkoutUrl === "string" &&
          link.checkoutUrl.length > 0 &&
          typeof link.qrCode === "string" &&
          link.paymentLinkId,
        "PAYMENT_GATEWAY_ERROR",
        502,
      );
      const plan = Object.assign(p3Plan("Payment", id), {
        opId: `p3-payos-link-${dependencies.crypto.randomUUID()}`,
        now: new Date(),
        actorId: null,
      });
      await p3Change(
        plan,
        "Payment",
        payment,
        {
          paymentLinkId: link.paymentLinkId,
          checkoutUrl: link.checkoutUrl,
          qrCode: link.qrCode,
        },
        { status: "PENDING" },
      );
      payment = await p3Commit(plan, "payosLinkCreated");
    }
    return {
      checkoutUrl: payment.checkoutUrl,
      qrCode: payment.qrCode,
      orderCode: payment.orderCode,
      amount: payment.amount,
      description: payment.description,
      expiresAt: payment.expiresAt,
    };
  }

  async function p3RecognizeDeposit(plan, deposit, room) {
    const now = plan.now,
      localDate = new Date(now.getTime() + 7 * 3600000)
        .toISOString()
        .slice(0, 10);
    const agreements = await dependencies.p3Collections.BrokerageAgreement.find(
      {
        roomId: room.id,
        status: "ACTIVE",
        effectiveFrom: { $lte: localDate },
        $or: [{ effectiveTo: null }, { effectiveTo: { $gte: localDate } }],
      },
    ).toArray();
    p3Assert(agreements.length === 1, "AGREEMENT_NOT_CONFIGURED");
    const agreement = agreements[0],
      period = await p3Period(plan, now),
      company = await p3CompanyRevenue(plan, period);
    let employee = await dependencies.p3Collections.EmployeeRevenue.findOne({
      employeeId: deposit.employeeId,
      periodId: period.id,
    });
    if (!employee) {
      employee = {
        id: `dtnv-${dependencies.crypto.randomUUID()}`,
        employeeId: deposit.employeeId,
        periodId: period.id,
        revenue: 0,
        transactionCount: 0,
      };
      await p3Create(plan, "EmployeeRevenue", employee);
    }
    const companyShare = Number((BigInt(deposit.totalRequired) + 1n) / 2n),
      ownerShare = deposit.totalRequired - companyShare;
    // A reserved reference preserves the existing unique contractId index until a draft is created.
    const transaction = {
      id: `gd-${dependencies.crypto.randomUUID()}`,
      depositId: deposit.id,
      contractId: `deposit:${deposit.id}`,
      roomId: room.id,
      roomSnapshot: await dependencies.snapshotRoom(room),
      agreementId: agreement.id,
      agreementSnapshot: p3Clean(agreement),
      employeeRevenueId: employee.id,
      companyRevenueId: company.id,
      finalFee: companyShare,
      companyShare,
      ownerShare,
      holdCredit: deposit.holdCredit,
      total: deposit.totalRequired,
      recognizedAt: now,
      recognitionMonth: p3Month(now),
      status: "RECOGNIZED",
      outcome: "PENDING",
      employeeId: deposit.employeeId,
      customerId: deposit.customerId,
    };
    plan.compensation.revenue = {
      transactionId: transaction.id,
      employeeRevenueId: employee.id,
      companyRevenueId: company.id,
      periodId: period.id,
    };
    await p3Change(
      plan,
      "PayrollPeriod",
      period,
      { p3Pending: true },
      {
        status: { $nin: ["CLOSED", "PAID"] },
        version:
          period.version === undefined ? { $exists: false } : period.version,
      },
    );
    await p3Change(plan, "Deposit", deposit, {
      companyShare,
      ownerShare,
      brokerageTransactionId: transaction.id,
      roomSnapshot: transaction.roomSnapshot,
      agreementSnapshot: transaction.agreementSnapshot,
    });
    await p3Create(plan, "BrokerageTransaction", transaction);
    plan.effects.push({
      kind: "revenue",
      periodId: period.id,
      employeeRevenueId: employee.id,
      companyRevenueId: company.id,
    });
    await p3Event(plan, "EmployeeRevenue", employee.id, "RECONCILE", employee, {
      ...employee,
      revenue: employee.revenue + companyShare,
      employeeId: deposit.employeeId,
    });
    await p3Event(plan, "CompanyRevenue", company.id, "RECONCILE", company, {
      ...company,
      revenue: company.revenue + companyShare,
    });
  }

  async function p3Number(prefix, now) {
    const month = p3Month(now).replace("-", "");
    const counter = await dependencies.p3Collections.Counter.findOneAndUpdate(
      { _id: `${prefix}-${month}` },
      { $inc: { value: 1 } },
      { upsert: true, returnDocument: "after" },
    );
    return `${prefix}-${month}-${String(counter.value).padStart(4, "0")}`;
  }

  async function p3Find(type, id) {
    const value = await dependencies.p3Collections[type].findOne({ id });
    p3Assert(value, `${type.toUpperCase()}_NOT_FOUND`, 404);
    return value;
  }

  function p3Own(req, record) {
    if (req.p2Account.role === "ADMIN") return;
    if (req.p2Account.role === "CUSTOMER")
      p3Assert(
        record.customerId === req.p2Customer?.id,
        "NOT_YOUR_RECORD",
        403,
      );
    else
      p3Assert(
        record.employeeId === req.p2Employee?.id,
        "NOT_YOUR_RECORD",
        403,
      );
  }

  // One API process, matching P2. Persist plans BEFORE mutations; replay after crashes.
  let p3Queue = Promise.resolve();

  function p3Serial(work) {
    const result = p3Queue.then(work);
    p3Queue = result.catch(() => {});
    return result;
  }

  function p3Plan(type, id) {
    return { type, id, effects: [] };
  }

  function p3Insert(plan, type, record) {
    plan.effects.push({ kind: "insert", type, record });
  }

  async function p3Change(
    plan,
    type,
    before,
    fields,
    filter = {},
    remove = [],
  ) {
    if (
      before.status &&
      fields.status &&
      before.status !== fields.status &&
      ["Hold", "Payment", "Deposit", "Contract"].includes(type)
    ) {
      p3Assert(
        p3Transition(type, before.status, fields.status),
        "INVALID_TRANSITION",
      );
    }
    plan.effects.push({
      kind: "change",
      type,
      id: before.id,
      filter: { id: before.id, ...filter },
      fields: { ...fields, updatedAt: plan.now },
      remove,
    });
    const after = { ...before, ...fields };
    remove.forEach((key) => delete after[key]);
    await p3Event(
      plan,
      type,
      before.id,
      fields.status || "UPDATE",
      before,
      after,
    );
  }

  async function p3Event(plan, type, id, action, before, after) {
    const n = plan.effects.length;
    p3Insert(plan, "AuditLog", {
      id: `p3-event-${plan.opId}-${n}`,
      entityType: type,
      entityId: id,
      action,
      actorId: plan.actorId || null,
      at: plan.now,
      before: p3Clean(before),
      after: p3Clean(after),
    });
    const accountIds = new Set();
    const customerId = after?.customerId || before?.customerId;
    if (customerId) {
      const customer = await dependencies.customerCollection.findOne({
        id: customerId,
      });
      if (customer?.accountId) accountIds.add(customer.accountId);
    }
    const employeeId =
      after?.employeeId || before?.employeeId || plan.employeeId;
    if (employeeId) {
      const employee = await dependencies.employeeCollection.findOne({
        id: employeeId,
      });
      if (employee) accountIds.add(employee.accountId);
    }
    const staff = await dependencies.accountCollection
      .find({
        role: {
          $in: customerId && !employeeId ? ["ADMIN", "EMPLOYEE"] : ["ADMIN"],
        },
        status: "ACTIVE",
      })
      .toArray();
    staff.forEach((a) => accountIds.add(a.id));
    for (const accountId of accountIds)
      p3Insert(plan, "Notification", {
        id: `p3-notice-${plan.opId}-${n}-${accountId}`,
        accountId,
        type: `P3_${action}`,
        entityType: type,
        entityId: id,
        title: `${type}: ${action}`,
        body: `${type} ${id}: ${action}`,
        read: false,
        readAt: null,
        createdAt: plan.now,
        dedupeKey: `p3:${plan.opId}:${n}:${accountId}`,
      });
  }

  async function p3Create(plan, type, record) {
    p3Insert(plan, type, record);
    await p3Event(plan, type, record.id, "CREATE", null, record);
  }

  async function p3Room(plan, room, lock, filter) {
    const status =
      lock?.kind === "CONTRACT" ? "RENTED" : lock ? "HELD" : "AVAILABLE";
    await p3Change(
      plan,
      "Room",
      room,
      { lock, businessStatus: status, status, hasHistory: true },
      filter,
    );
  }

  async function p3Run(op) {
    if (op.state === "COMPENSATING") return p3Compensate(op);
    const plan = op.plan;
    try {
      for (let i = op.cursor || 0; i < plan.effects.length; i++) {
        const effect = plan.effects[i],
          collection = dependencies.p3Collections[effect.type],
          token = `${op.id}:${i}`;
        if (effect.kind === "insert") {
          await collection.updateOne(
            { id: effect.record.id },
            { $setOnInsert: effect.record },
            { upsert: true },
          );
        } else if (effect.kind === "change") {
          const replay = await collection.findOne({
            id: effect.id,
            p3LastStep: token,
          });
          if (!replay) {
            const filter = { ...effect.filter, p3LastStep: { $ne: token } };
            if (
              effect.type === "Room" &&
              effect.fields.lock?.kind === "DEPOSIT" &&
              filter["lock.expiresAt"]
            ) {
              filter["lock.expiresAt"] = { $gt: new Date() };
            }
            if (
              effect.type === "Room" &&
              effect.fields.lock?.kind === "HOLD" &&
              effect.filter.businessStatus === "AVAILABLE"
            ) {
              p3Assert(
                new Date(effect.fields.lock.expiresAt) > new Date(),
                "HOLD_EXPIRED",
              );
            }
            if (effect.type === "Room" && plan.paymentDeadline) {
              p3Assert(
                new Date(plan.paymentDeadline) > new Date(),
                "HOLD_EXPIRED",
              );
              filter["lock.expiresAt"] = { $gt: new Date() };
            }
            // A single conditional findOneAndUpdate acquires/transfers/releases Room.lock.
            const changed = await collection.findOneAndUpdate(
              filter,
              {
                $set: { ...effect.fields, p3LastStep: token },
                $inc: { version: 1 },
                ...(effect.remove?.length
                  ? {
                      $unset: Object.fromEntries(
                        effect.remove.map((key) => [key, ""]),
                      ),
                    }
                  : {}),
              },
              { returnDocument: "after" },
            );
            p3Assert(
              changed,
              effect.type === "Room" ? "ROOM_LOCKED" : "STATE_CONFLICT",
            );
          }
        } else if (effect.kind === "delete") {
          // Deleting an already absent row is safe when replaying a journal step.
          await collection.deleteOne(effect.filter || { id: effect.id });
        } else if (effect.kind === "revenue") {
          await p3Reconcile(
            effect.periodId,
            effect.employeeRevenueId,
            effect.companyRevenueId,
          );
        } else if (effect.kind === "companyRevenue") {
          await p3ReconcileCompany(effect.companyRevenueId);
        }
        await dependencies.auditCollection.updateOne(
          { id: op.id },
          { $set: { cursor: i + 1 } },
        );
        op.cursor = i + 1;
      }
      const result =
        plan.result ||
        p3Labeled(plan.type, p3Clean(await p3Find(plan.type, plan.id)));
      await dependencies.auditCollection.updateOne(
        { id: op.id },
        { $set: { state: "DONE", result, finishedAt: new Date() } },
      );
      return result;
    } catch (error) {
      if (
        plan.compensation &&
        op.cursor &&
        (error.status || error.code === 11000)
      ) {
        await dependencies.auditCollection.updateOne(
          { id: op.id },
          {
            $set: {
              state: "COMPENSATING",
              failure: { status: 409, code: "DEPOSIT_CREATION_COMPENSATED" },
            },
          },
        );
        await p3Compensate({ ...op, state: "COMPENSATING" });
        throw p3Error(409, "DEPOSIT_CREATION_COMPENSATED");
      }
      if (error.status && !op.cursor)
        await dependencies.auditCollection.updateOne(
          { id: op.id },
          {
            $set: {
              state: "FAILED",
              failure: { status: error.status, code: error.code },
            },
          },
        );
      // After the first required write, keep the plan pending and roll forward.
      // Never release money locks merely because an HTTP response failed.
      throw error;
    }
  }

  async function p3Recover() {
    const pending = await dependencies.auditCollection
      .find({
        entityType: "P3Operation",
        state: { $in: ["PENDING", "COMPENSATING"] },
      })
      .sort({ at: 1 })
      .toArray();
    for (const op of pending) await p3Run(op);
  }

  async function p3Compensate(op) {
    const { roomId, depositId, hold } = op.plan.compensation;
    const revenue = op.plan.compensation.revenue;
    if (revenue) {
      await dependencies.p3Collections.BrokerageTransaction.deleteOne({
        id: revenue.transactionId,
        depositId,
      });
      const rows =
        await dependencies.p3Collections.BrokerageTransaction.aggregate([
          {
            $match: {
              employeeRevenueId: revenue.employeeRevenueId,
              status: "RECOGNIZED",
            },
          },
          {
            $group: {
              _id: null,
              revenue: { $sum: "$finalFee" },
              transactionCount: { $sum: 1 },
            },
          },
        ]).toArray();
      await dependencies.p3Collections.EmployeeRevenue.updateOne(
        { id: revenue.employeeRevenueId },
        {
          $set: {
            revenue: rows[0]?.revenue || 0,
            transactionCount: rows[0]?.transactionCount || 0,
          },
        },
      );
      await p3ReconcileCompany(revenue.companyRevenueId);
      await dependencies.p3Collections.PayrollPeriod.updateOne(
        { id: revenue.periodId },
        { $set: { p3Pending: false } },
      );
    }
    const now = new Date(),
      restore = hold && new Date(hold.expiresAt) > now;
    const lock = restore
      ? {
          kind: "HOLD",
          refId: hold.id,
          acquiredAt: hold.paidAt,
          expiresAt: hold.expiresAt,
        }
      : null;
    // These filters cannot release a newer reservation. Repeating compensation is safe.
    await dependencies.roomCollection.updateOne(
      { id: roomId, "lock.kind": "DEPOSIT", "lock.refId": depositId },
      {
        $set: {
          lock,
          businessStatus: restore ? "HELD" : "AVAILABLE",
          status: restore ? "HELD" : "AVAILABLE",
        },
        $inc: { version: 1 },
      },
    );
    if (hold && !restore)
      await dependencies.roomCollection.updateOne(
        {
          id: roomId,
          "lock.kind": "HOLD",
          "lock.refId": hold.id,
          "lock.expiresAt": { $lte: now },
        },
        {
          $set: {
            lock: null,
            businessStatus: "AVAILABLE",
            status: "AVAILABLE",
          },
          $inc: { version: 1 },
        },
      );
    if (hold) {
      // Expired paid holds remain ACTIVE until the normal expiry journal records forfeiture.
      await dependencies.p3Collections.Hold.updateOne(
        { id: hold.id, creditedToDepositId: depositId, status: "CONVERTED" },
        {
          $set: { status: "ACTIVE", isActive: true, creditedToDepositId: null },
          $inc: { version: 1 },
        },
      );
    }
    await dependencies.p3Collections.Deposit.updateOne(
      { id: depositId },
      {
        $set: {
          status: "CANCELLED",
          sourceHoldId: hold?.id || null,
          cancellation: {
            reason: "DEPOSIT_CREATION_COMPENSATED",
            at: op.plan.now,
          },
        },
        $unset: { holdId: "" },
      },
    );
    const event = {
      id: `p3-compensated-${op.id}`,
      entityType: "Deposit",
      entityId: depositId,
      actorId: op.actorId,
      action: "COMPENSATE",
      at: now,
      before: { roomId, holdId: hold?.id },
      after: { status: "CANCELLED", restoredHold: !!restore },
    };
    await dependencies.auditCollection.updateOne(
      { id: event.id },
      { $setOnInsert: event },
      { upsert: true },
    );
    if (op.plan.compensation.draft) {
      const draft = op.plan.compensation.draft;
      await dependencies.p3Collections.DepositDraft.updateOne(
        { id: draft.id, employeeId: draft.employeeId },
        { $setOnInsert: draft },
        { upsert: true },
      );
    }
    const customer = hold
      ? await dependencies.customerCollection.findOne({ id: hold.customerId })
      : null;
    const targets = await dependencies.accountCollection
      .find({
        $or: [
          { role: "ADMIN" },
          { id: op.actorId },
          ...(customer ? [{ id: customer.accountId }] : []),
        ],
      })
      .toArray();
    for (const target of targets) {
      const notice = {
        id: `${event.id}-${target.id}`,
        dedupeKey: `${event.id}:${target.id}`,
        accountId: target.id,
        type: "P3_COMPENSATE",
        entityType: "Deposit",
        entityId: depositId,
        title: "Đã phục hồi sau lỗi lập cọc",
        body: "Hồ sơ cọc không hoàn tất; khóa đã được phục hồi theo hạn giữ chỗ gốc.",
        createdAt: now,
        read: false,
        readAt: null,
      };
      await dependencies.notificationCollection.updateOne(
        { dedupeKey: notice.dedupeKey },
        { $setOnInsert: notice },
        { upsert: true },
      );
    }
    await dependencies.auditCollection.updateOne(
      { id: op.id },
      {
        $set: {
          state: "FAILED",
          failure: { status: 409, code: "DEPOSIT_CREATION_COMPENSATED" },
        },
      },
    );
    return null;
  }

  async function p3ReadBarrier() {
    return p3Serial(async () => {
      await p3Recover();
      await p3Expire();
    });
  }

  async function p3Reconcile(periodId, employeeRevenueId, companyRevenueId) {
    const period = await p3Find("PayrollPeriod", periodId);
    p3Assert(!["CLOSED", "PAID"].includes(period.status), "PAYROLL_CLOSED");
    const locked =
      await dependencies.p3Collections.PayrollPeriod.findOneAndUpdate(
        {
          id: periodId,
          status: { $nin: ["CLOSED", "PAID"] },
          version:
            period.version === undefined ? { $exists: false } : period.version,
        },
        { $inc: { version: 1 }, $set: { p3Pending: true } },
        { returnDocument: "after" },
      );
    p3Assert(locked, "PAYROLL_CHANGED");
    for (const [type, field, id] of [
      ["EmployeeRevenue", "employeeRevenueId", employeeRevenueId],
      ["CompanyRevenue", "companyRevenueId", companyRevenueId],
    ]) {
      const rows =
        await dependencies.p3Collections.BrokerageTransaction.aggregate([
          { $match: { [field]: id, status: "RECOGNIZED" } },
          {
            $group: {
              _id: null,
              revenue: { $sum: "$finalFee" },
              transactionCount: { $sum: 1 },
            },
          },
        ]).toArray();
      if (type === "CompanyRevenue") await p3ReconcileCompany(id);
      else
        await dependencies.p3Collections[type].updateOne(
          { id },
          {
            $set: {
              revenue: rows[0]?.revenue || 0,
              transactionCount: rows[0]?.transactionCount || 0,
            },
            $inc: { version: 1 },
          },
        );
    }
    await dependencies.p3Collections.PayrollPeriod.updateOne(
      { id: periodId, version: locked.version },
      { $set: { p3Pending: false } },
    );
  }

  async function p3ReconcileCompany(id) {
    const transactions =
      await dependencies.p3Collections.BrokerageTransaction.aggregate([
        { $match: { companyRevenueId: id, status: "RECOGNIZED" } },
        {
          $group: {
            _id: null,
            revenue: { $sum: "$finalFee" },
            count: { $sum: 1 },
          },
        },
      ]).toArray();
    const holds = await dependencies.p3Collections.Hold.aggregate([
      { $match: { companyRevenueId: id, status: "FORFEITED" } },
      {
        $group: { _id: null, revenue: { $sum: "$amount" }, count: { $sum: 1 } },
      },
    ]).toArray();
    // Late hold transfers (paid after the hold expired) are kept by the company too (user rule 16/11/2026).
    const late = await dependencies.p3Collections.Payment.aggregate([
      { $match: { companyRevenueId: id, status: "LATE_PAID" } },
      {
        $group: { _id: null, revenue: { $sum: "$amount" }, count: { $sum: 1 } },
      },
    ]).toArray();
    // forfeitedHoldRevenue = all hold money kept by the company (forfeited holds + late transfers); P5 reads this field.
    const kept = (holds[0]?.revenue || 0) + (late[0]?.revenue || 0);
    await dependencies.p3Collections.CompanyRevenue.updateOne(
      { id },
      {
        $set: {
          revenue: (transactions[0]?.revenue || 0) + kept,
          transactionCount: transactions[0]?.count || 0,
          forfeitedHoldRevenue: kept,
          forfeitedHoldCount: (holds[0]?.count || 0) + (late[0]?.count || 0),
          latePaidRevenue: late[0]?.revenue || 0,
          latePaidCount: late[0]?.count || 0,
        },
        $inc: { version: 1 },
      },
    );
  }

  async function p3Expire() {
    const now = new Date();
    const expired = await dependencies.p3Collections.Hold.find({
      status: { $in: ["PAYMENT_PENDING", "ACTIVE"] },
      expiresAt: { $lte: now },
    }).toArray();
    for (const hold of expired) {
      const opId = `p3-expire-${hold.id}-${hold.version || 0}`;
      const plan = Object.assign(p3Plan("Hold", hold.id), {
        opId,
        now,
        actorId: null,
      });
      const room = await dependencies.roomCollection.findOne({
        id: hold.roomId,
      });
      if (hold.status === "ACTIVE") await p3Forfeit(plan, hold);
      else
        await p3Change(
          plan,
          "Hold",
          hold,
          { status: "EXPIRED", isActive: false },
          { status: hold.status },
        );
      if (room?.lock?.kind === "HOLD" && room.lock.refId === hold.id) {
        await p3Room(plan, room, null, {
          "lock.kind": "HOLD",
          "lock.refId": hold.id,
        });
        if (hold.status === "ACTIVE")
          await p3Change(plan, "Room", room, {
            publicationStatus: "PUBLISHED",
          });
      }
      const op = {
        id: opId,
        entityType: "P3Operation",
        state: "PENDING",
        at: now,
        cursor: 0,
        plan,
      };
      await dependencies.auditCollection.updateOne(
        { id: opId },
        { $setOnInsert: op },
        { upsert: true },
      );
      await p3Run(op);
    }
  }

  function p3Route(handler) {
    return async (req, res) => {
      try {
        await p3Serial(async () => {
          await p3Recover();
          await p3Expire();
          await handler(req, res);
        });
      } catch (error) {
        res
          .status(error.status || 503)
          .send({
            code: error.code || "RECOVERY_PENDING",
            message: error.message,
          });
      }
    };
  }

  function p3Write(action) {
    return async (req, res) => {
      try {
        let result = await p3Serial(async () => {
          await p3Recover();
          await p3Expire();
          const key = req.get("Idempotency-Key");
          p3Assert(
            typeof key === "string" && key.length >= 8 && key.length <= 160,
            "IDEMPOTENCY_KEY_REQUIRED",
            400,
          );
          const fingerprint = dependencies.crypto
            .createHash("sha256")
            .update(
              JSON.stringify(
                p3Stable({
                  action,
                  path: req.path,
                  actor: req.p2Account.id,
                  body: req.body || {},
                }),
              ),
            )
            .digest("hex");
          let op = await dependencies.auditCollection.findOne({ p3Key: key });
          if (op) {
            p3Assert(op.fingerprint === fingerprint, "IDEMPOTENCY_CONFLICT");
            if (op.state === "FAILED")
              throw p3Error(op.failure.status, op.failure.code);
            return op.state === "DONE" ? op.result : p3Run(op);
          }
          const now = new Date(),
            opId = `p3-op-${dependencies.crypto.randomUUID()}`;
          const context = {
            opId,
            now,
            actorId: req.p2Account.id,
            employeeId: req.p2Employee?.id,
          };
          const plan = Object.assign(
            await p3Prepare(action, req, context),
            context,
          );
          op = {
            id: opId,
            entityType: "P3Operation",
            entityId: plan.id,
            action,
            actorId: context.actorId,
            at: now,
            p3Key: key,
            fingerprint,
            state: "PENDING",
            cursor: 0,
            plan,
          };
          await dependencies.auditCollection.insertOne(op);
          const value = await p3Run(op);
          // A recovered cancellation can cross the original hold deadline.
          // Expire it before this request releases the P3 queue.
          await p3Expire();
          return value;
        });
        if (action === "payosLink")
          result = await p3Serial(async () => {
            await p3Recover();
            await p3Expire();
            return payosEnsureLink(result.id);
          });
        if (action === "saveDepositCustomer") {
          req.session.depositIdentityContext = {
            customerId: result.id,
            roomId: req.body.roomId,
            employeeId: req.p2Employee.id,
            expiresAt: Date.now() + 30 * 60000,
          };
          await new Promise((resolve, reject) =>
            req.session.save((error) => (error ? reject(error) : resolve())),
          );
        }
        res
          .status(
            [
              "createHold",
              "createDeposit",
              "createContract",
              "createDepositDraft",
            ].includes(action)
              ? 201
              : 200,
          )
          .send(result);
      } catch (error) {
        res.status(error.status || (error.code === 11000 ? 409 : 503)).send({
          code:
            error.code === 11000
              ? "DUPLICATE_RECORD"
              : error.code || "RECOVERY_PENDING",
          message: error.message,
          retryWithSameKey: !error.status && error.code !== 11000,
        });
      }
    };
  }

  async function p3Prepare(action, req, context) {
    const b = req.body || {},
      now = context.now,
      id = req.params.id;
    const plan = Object.assign(p3Plan("", ""), context);
    const result = (type, ref) => {
      plan.type = type;
      plan.id = ref;
    };
    const make = (prefix, fields) => ({
      id: `${prefix}-${dependencies.crypto.randomUUID()}`,
      ...fields,
    });
    const lockedBy = (kind, refId) => ({
      "lock.kind": kind,
      "lock.refId": refId,
    });
    p3Assert(action !== "completeHoldPayment", "PAYMENT_GATEWAY_REQUIRED", 410);
    p3Assert(
      ![
        "depositPayment",
        "cancelDeposit",
        "abandonDeposit",
        "completeContract",
        "reviewDeposit",
      ].includes(action),
      "FLOW_CHANGED",
      410,
    );
    if (
      [
        "createDepositDraft",
        "updateDepositDraft",
        "deleteDepositDraft",
      ].includes(action)
    ) {
      const employeeId = req.p2Employee.id;
      const before =
        action === "createDepositDraft"
          ? null
          : await dependencies.p3Collections.DepositDraft.findOne({
              id,
              employeeId,
            });
      if (action !== "createDepositDraft") p3Assert(before, "NOT_FOUND", 404);
      if (action === "deleteDepositDraft") {
        result("DepositDraft", id);
        plan.result = { ok: true };
        p3DraftEvent(plan, before, null);
        plan.effects.push({
          kind: "delete",
          type: "DepositDraft",
          id,
          filter: { id, employeeId },
        });
      } else {
        const data = p3DraftData(b.data),
          label = await p3DraftLabel(data);
        if (!before)
          p3Assert(
            (await dependencies.p3Collections.DepositDraft.countDocuments({
              employeeId,
            })) < 20,
            "DRAFT_LIMIT",
          );
        const draft = before
          ? { ...p3Clean(before), data, label, updatedAt: now }
          : make("nhap", {
              employeeId,
              data,
              label,
              createdAt: now,
              updatedAt: now,
            });
        result("DepositDraft", draft.id);
        if (before)
          plan.effects.push({
            kind: "change",
            type: "DepositDraft",
            id,
            filter: { id, employeeId },
            fields: { data, label, updatedAt: now },
          });
        else p3Insert(plan, "DepositDraft", draft);
        p3DraftEvent(plan, before, draft);
      }
    } else if (action === "saveDepositCustomer") {
      const phone = dependencies.normalizePhone(b.customerPhone);
      p3Assert(
        dependencies.validPhone(phone) &&
          typeof b.customerName === "string" &&
          b.customerName.trim().length >= 2 &&
          b.customerName.trim().length <= 100,
        "INVALID_CONTACT",
        400,
      );
      const customer = await dependencies.customerCollection.findOne({ phone });
      if (customer?.accountId)
        p3Assert(
          await dependencies.accountCollection.findOne({
            id: customer.accountId,
            role: "CUSTOMER",
            status: "ACTIVE",
          }),
          "CUSTOMER_ACCOUNT_REQUIRED",
          400,
        );
      const hold = await p3DepositCustomerRoom(req, customer, b.roomId);
      const fields = {
        ...(await p3IdentityFields(b, customer?.id)),
        fullName: b.customerName.trim(),
        phone,
      };
      if (hold && !hold.employeeId)
        await p3Change(
          plan,
          "Hold",
          hold,
          { employeeId: req.p2Employee.id },
          { employeeId: null },
        );
      if (customer) {
        result("Customer", customer.id);
        await p3Change(plan, "Customer", customer, fields);
      } else {
        const account = await dependencies.accountCollection.findOne({
          phone,
          role: "CUSTOMER",
        });
        if (account)
          p3Assert(
            account.status === "ACTIVE",
            "CUSTOMER_ACCOUNT_REQUIRED",
            400,
          );
        const created = make("kh", {
          ...fields,
          ...(account ? { accountId: account.id } : {}),
          createdByEmployeeId: req.p2Employee.id,
          createdAt: now,
        });
        result("Customer", created.id);
        await p3Create(plan, "Customer", created);
      }
    } else if (action === "updateIdentity") {
      const customer = await p3Find("Customer", id);
      p3Assert(
        await p3IdentityAccess(req, customer),
        "CUSTOMER_NOT_ASSIGNED",
        403,
      );
      const candidate = await p3IdentityFields(b, customer.id);
      result("Customer", customer.id);
      await p3Change(plan, "Customer", customer, candidate);
    } else if (action === "cancelHold") {
      const hold = await p3Find("Hold", id);
      p3Own(req, hold);
      p3Assert(hold.status === "PAYMENT_PENDING", "INVALID_TRANSITION");
      result("Hold", id);
      await p3Change(
        plan,
        "Hold",
        hold,
        { status: "CANCELLED", isActive: false },
        { status: "PAYMENT_PENDING" },
      );
      const room = await p3Find("Room", hold.roomId);
      if (room.lock?.kind === "HOLD" && room.lock.refId === id)
        await p3Room(plan, room, null, lockedBy("HOLD", id));
    } else if (action === "createHold") {
      p3Assert(
        typeof b.contactName === "string" &&
          b.contactName.trim().length >= 2 &&
          dependencies.validPhone(dependencies.normalizePhone(b.contactPhone)),
        "INVALID_CONTACT",
        400,
      );
      p3Assert(!b.moveIn || p3Date(b.moveIn), "INVALID_MOVE_IN", 400);
      p3Assert(
        !b.note || (typeof b.note === "string" && b.note.length <= 1000),
        "INVALID_NOTE",
        400,
      );
      const room = await p3Find("Room", b.roomId);
      p3Assert(
        await dependencies.roomCollection.findOne(
          p3AvailableFilter(room.id, now),
        ),
        "ROOM_LOCKED",
      );
      const policies = await dependencies.p3Collections.Policy.find({
        type: "GIU_CHO",
        status: "ACTIVE",
        effectiveFrom: { $lte: now },
        $or: [{ effectiveTo: null }, { effectiveTo: { $gt: now } }],
      }).toArray();
      p3Assert(policies.length === 1, "POLICY_NOT_CONFIGURED");
      const levels = await dependencies.p3Collections.PolicyLevel.find({
        policyId: policies[0].id,
      }).toArray();
      const level = levels.length ? levels[0] : policies[0].levels?.[0];
      p3Assert(
        (levels.length || policies[0].levels?.length) === 1 &&
          Number.isSafeInteger(level?.amount) &&
          level.amount > 0,
        "POLICY_NOT_CONFIGURED",
      );
      if (b.viewingId)
        p3Assert(
          await dependencies.viewingCollection.findOne({
            id: b.viewingId,
            customerProfileId: req.p2Customer.id,
            "rooms.roomId": room.id,
          }),
          "INVALID_VIEWING",
          400,
        );
      const expiresAt = new Date(now.getTime() + 15 * 60000);
      const hold = make("gc", {
        number: await p3Number("GC", now),
        roomSnapshot: await dependencies.snapshotRoom(room),
        customerId: req.p2Customer.id,
        roomId: room.id,
        contact: {
          name: b.contactName.trim(),
          phone: dependencies.normalizePhone(b.contactPhone),
        },
        amount: level.amount,
        policyVersionId: policies[0].id,
        policyLevelId: level.id,
        status: "PAYMENT_PENDING",
        isActive: false,
        paidAt: null,
        lockStartsAt: now,
        expiresAt,
        paymentExpiresAt: expiresAt,
        createdAt: now,
        ...(b.viewingId ? { viewingId: b.viewingId } : {}),
        ...(b.moveIn ? { moveIn: b.moveIn } : {}),
        note: b.note || "",
      });
      result("Hold", hold.id);
      await p3Room(
        plan,
        room,
        { kind: "HOLD", refId: hold.id, acquiredAt: now, expiresAt },
        p3AvailableFilter(room.id, now),
      );
      await p3Create(plan, "Hold", hold);
    } else if (action === "payosLink") {
      const hold = await p3Find("Hold", id);
      p3Own(req, hold);
      p3Assert(
        hold.status === "PAYMENT_PENDING" && new Date(hold.expiresAt) > now,
        "HOLD_EXPIRED",
      );
      p3Assert(payosConfigured(), "PAYMENT_GATEWAY_NOT_CONFIGURED", 503);
      const room = await p3Find("Room", hold.roomId);
      p3Assert(
        room.lock?.kind === "HOLD" &&
          room.lock.refId === id &&
          new Date(room.lock.expiresAt) > now,
        "ROOM_LOCKED",
      );
      const existing = await dependencies.p3Collections.Payment.findOne({
        holdId: id,
        provider: "PAYOS",
      });
      if (existing) {
        result("Payment", existing.id);
        return plan;
      }
      const counter = await dependencies.p3Collections.Counter.findOneAndUpdate(
        { _id: "PAYOS" },
        [{ $set: { value: { $add: [{ $ifNull: ["$value", 100000] }, 1] } } }],
        { upsert: true, returnDocument: "after" },
      );
      const orderCode = counter.value,
        description = `GC${orderCode}`;
      p3Assert(
        Number.isSafeInteger(orderCode) &&
          orderCode > 0 &&
          description.length <= 9,
        "INVALID_ORDER_CODE",
        503,
      );
      const payment = make("ttien", {
        purpose: "HOLD",
        provider: "PAYOS",
        holdId: id,
        roomId: hold.roomId,
        customerId: hold.customerId,
        orderCode,
        description,
        amount: hold.amount,
        method: "BANK_TRANSFER",
        status: "PENDING",
        expiresAt: hold.expiresAt,
        createdAt: now,
        idempotencyKey: req.get("Idempotency-Key"),
      });
      result("Payment", payment.id);
      await p3Create(plan, "Payment", payment);
    } else if (action === "createDeposit") {
      p3Assert(
        ["CASH", "BANK_TRANSFER"].includes(b.collectedMethod),
        "INVALID_METHOD",
        400,
      );
      p3Assert(
        b.note === undefined ||
          (typeof b.note === "string" && b.note.length <= 500),
        "INVALID_NOTE",
        400,
      );
      p3Assert(
        b.draftId === undefined ||
          (typeof b.draftId === "string" &&
            b.draftId.length > 0 &&
            b.draftId.length <= 500),
        "INVALID_DRAFT",
        400,
      );
      const draft = b.draftId
        ? await dependencies.p3Collections.DepositDraft.findOne({
            id: b.draftId,
            employeeId: req.p2Employee.id,
          })
        : null;
      const room = await p3Find("Room", b.roomId);
      const customer = b.customerId
        ? await dependencies.customerCollection.findOne({ id: b.customerId })
        : await dependencies.customerCollection.findOne({
            phone: dependencies.normalizePhone(b.customerPhone),
          });
      p3Assert(customer, "CUSTOMER_PROFILE_REQUIRED", 400);
      const account = customer.accountId
        ? await dependencies.accountCollection.findOne({
            id: customer.accountId,
            role: "CUSTOMER",
            status: "ACTIVE",
          })
        : null;
      p3Assert(
        !customer.accountId || account,
        "CUSTOMER_ACCOUNT_REQUIRED",
        400,
      );
      if (b.customerPhone)
        p3Assert(
          dependencies.normalizePhone(b.customerPhone) ===
            (customer.phone || account?.phone),
          "HOLD_CUSTOMER_MISMATCH",
          400,
        );
      p3Assert(p3CompleteIdentity(customer), "CUSTOMER_IDENTITY_REQUIRED", 400);
      p3Assert(
        await p3IdentityAccess(req, customer),
        "CUSTOMER_NOT_ASSIGNED",
        403,
      );
      const hold = b.holdId ? await p3Find("Hold", b.holdId) : null;
      if (hold) {
        p3Own(req, hold);
        p3Assert(
          hold.status === "ACTIVE" &&
            hold.isActive &&
            !hold.creditedToDepositId &&
            hold.customerId === customer.id &&
            hold.roomId === room.id &&
            new Date(hold.expiresAt) > now,
          "HOLD_NOT_CREDITABLE",
        );
        p3Assert(
          await dependencies.p3Collections.Payment.findOne({
            id: hold.paymentId,
            status: "CONFIRMED",
          }),
          "HOLD_PAYMENT_NOT_CONFIRMED",
        );
        p3Assert(
          room.lock?.kind === "HOLD" && room.lock.refId === hold.id,
          "ROOM_LOCKED",
        );
      }
      const lease = b.proposedLease;
      p3Assert(
        !lease ||
          (Number.isInteger(lease.months) &&
            lease.months > 0 &&
            lease.months <= 120 &&
            p3Date(lease.startDate)),
        "INVALID_LEASE",
        400,
      );
      const deposit = make("coc", {
        number: await p3Number("PC", now),
        customerId: customer.id,
        customerName: customer.fullName || customer.name || account?.name || "",
        phone: customer.phone || account?.phone || "",
        employeeId: req.p2Employee.id,
        roomId: room.id,
        ownerId: room.ownerId || null,
        sheetRoomSnapshot: await p3SheetRoom(room, true),
        ...p3Money(b.totalRequired, hold?.amount || 0),
        status: "PAID",
        paymentIds: [],
        createdAt: now,
        ...(hold ? { holdId: hold.id } : {}),
        ...(lease
          ? {
              proposedLease: {
                ...lease,
                monthlyRent: room.monthlyRent || room.price,
              },
            }
          : {}),
      });
      deposit.collected = {
        method: b.collectedMethod,
        amount: deposit.amountDue,
        note: b.note?.trim() || "",
        at: now,
        by: req.p2Account.id,
      };
      result("Deposit", deposit.id);
      plan.compensation = {
        roomId: room.id,
        depositId: deposit.id,
        hold: hold ? p3Clean(hold) : null,
        customerId: customer.id,
      };
      await p3Room(
        plan,
        room,
        {
          kind: "DEPOSIT",
          refId: deposit.id,
          acquiredAt: now,
          expiresAt: null,
        },
        hold
          ? { ...lockedBy("HOLD", hold.id), "lock.expiresAt": { $gt: now } }
          : p3AvailableFilter(room.id, now),
      );
      if (hold)
        await p3Change(
          plan,
          "Hold",
          hold,
          {
            status: "CONVERTED",
            isActive: false,
            creditedToDepositId: deposit.id,
            convertedAt: now,
          },
          { status: "ACTIVE", creditedToDepositId: null },
        );
      await p3Create(plan, "Deposit", deposit);
      await p3RecognizeDeposit(plan, deposit, room);
      if (draft) {
        plan.compensation.draft = p3Clean(draft);
        p3DraftEvent(plan, draft, null);
        plan.effects.push({
          kind: "delete",
          type: "DepositDraft",
          id: draft.id,
          filter: { id: draft.id, employeeId: req.p2Employee.id },
        });
      }
    } else if (
      action === "approveContract" ||
      action === "adminAbandonDeposit"
    ) {
      const deposit = await p3Find("Deposit", id);
      const contract = await dependencies.p3Collections.Contract.findOne({
        depositId: id,
      });
      let transaction =
        await dependencies.p3Collections.BrokerageTransaction.findOne({
          $or: [
            { depositId: id },
            ...(contract ? [{ contractId: contract.id }] : []),
          ],
        });
      p3Assert(
        !["COMPLETED", "ABANDONED"].includes(deposit.status) &&
          !["COMPLETED", "VOID", "CANCELLED"].includes(contract?.status) &&
          (!transaction?.outcome || transaction.outcome === "PENDING") &&
          !deposit.decidedAt,
        "ALREADY_DECIDED",
      );
      p3Assert(
        ["PAID", "CONTRACTED"].includes(deposit.status),
        "INVALID_TRANSITION",
      );
      p3Assert(
        b.note === undefined ||
          (typeof b.note === "string" && b.note.length <= 500),
        "INVALID_NOTE",
        400,
      );
      const approved = action === "approveContract",
        outcome = approved ? "SUCCESS" : "ABANDONED";
      if (approved)
        p3Assert(contract?.status === "SIGNED", "CONTRACT_NOT_SIGNED");
      else
        p3Assert(
          !contract || ["DRAFT", "SIGNED"].includes(contract.status),
          "INVALID_TRANSITION",
        );
      const room = await p3Find("Room", deposit.roomId);
      p3Assert(
        room.lock?.kind ===
          (contract?.status === "SIGNED" ? "CONTRACT" : "DEPOSIT") &&
          room.lock.refId ===
            (contract?.status === "SIGNED" ? contract.id : id),
        "ROOM_LOCKED",
      );
      result("Deposit", id);
      plan.employeeId = deposit.employeeId;
      const decision = {
        outcome,
        decidedAt: now,
        decidedBy: req.p2Account.id,
        note: b.note?.trim() || "",
      };
      const roomSnapshot = await dependencies.snapshotRoom(room);
      const agreements =
        await dependencies.p3Collections.BrokerageAgreement.find({
          roomId: room.id,
        }).toArray();
      const agreement =
        agreements.find((row) => row.id === transaction?.agreementId) ||
        agreements.find((row) => row.status === "ACTIVE") ||
        agreements[0];
      const agreementSnapshot =
        transaction?.agreementSnapshot || deposit.agreementSnapshot || agreement
          ? {
              ...p3Clean(agreement),
              ...deposit.agreementSnapshot,
              ...transaction?.agreementSnapshot,
            }
          : null;
      if (!transaction) {
        // Legacy deposits may predate recognition on collection. Preserve their history without adding revenue.
        const companyShare = Math.round(deposit.totalRequired / 2);
        transaction = {
          id: `gd-${dependencies.crypto.randomUUID()}`,
          depositId: id,
          contractId: contract?.id || `deposit:${id}`,
          roomId: room.id,
          roomSnapshot,
          agreementSnapshot,
          agreementId: agreementSnapshot?.id || null,
          companyShare,
          ownerShare: deposit.totalRequired - companyShare,
          finalFee: companyShare,
          status: "LEGACY",
          outcome: "PENDING",
          employeeId: deposit.employeeId,
          customerId: deposit.customerId,
        };
        await p3Create(plan, "BrokerageTransaction", transaction);
      }
      if (approved) {
        await dependencies.deleteRoomWithSnapshot(plan, room, contract.id);
        for (const agreement of agreements) {
          plan.effects.push({
            kind: "delete",
            type: "BrokerageAgreement",
            id: agreement.id,
          });
          await p3Event(
            plan,
            "BrokerageAgreement",
            agreement.id,
            "DELETE",
            agreement,
            null,
          );
        }
        await p3Change(
          plan,
          "Contract",
          contract,
          {
            status: "COMPLETED",
            completedAt: now,
            approvedAt: now,
            approvedBy: req.p2Account.id,
            ...decision,
            roomSnapshot,
          },
          { status: "SIGNED" },
        );
      } else {
        if (contract)
          await p3Change(
            plan,
            "Contract",
            contract,
            {
              status: "VOID",
              ...decision,
              voidedAt: now,
              voidedBy: req.p2Account.id,
            },
            { status: contract.status },
          );
        await p3Room(
          plan,
          room,
          null,
          lockedBy(room.lock.kind, room.lock.refId),
        );
        await p3Change(plan, "Room", room, { publicationStatus: "PUBLISHED" });
      }
      await p3Change(
        plan,
        "Deposit",
        deposit,
        { status: approved ? "COMPLETED" : "ABANDONED", ...decision },
        { status: deposit.status },
      );
      await p3Change(plan, "BrokerageTransaction", transaction, {
        ...decision,
        roomSnapshot,
        agreementSnapshot,
        ...(contract ? { contractId: contract.id } : {}),
      });
      const employee = await dependencies.employeeCollection.findOne({
        id: deposit.employeeId,
      });
      if (employee)
        p3Insert(plan, "Notification", {
          id: `decision-${plan.opId}`,
          accountId: employee.accountId,
          type: "CONTRACT_REVIEWED",
          entityType: "Deposit",
          entityId: id,
          title: approved ? "Hợp đồng đã được duyệt" : "Khách bỏ cọc",
          body: `${deposit.number || id}: ${approved ? "Thành công" : "Khách bỏ cọc"}.${decision.note ? ` ${decision.note}` : ""}`,
          read: false,
          readAt: null,
          createdAt: now,
          dedupeKey: `decision:${id}`,
        });
    } else if (action === "createContract") {
      const deposit = await p3Find("Deposit", b.depositId);
      p3Own(req, deposit);
      p3Assert(deposit.status === "PAID", "DEPOSIT_NOT_PAID");
      const room = await p3Find("Room", deposit.roomId);
      p3Assert(
        room.lock?.kind === "DEPOSIT" && room.lock.refId === deposit.id,
        "ROOM_LOCKED",
      );
      p3Assert(
        !(await dependencies.p3Collections.Contract.findOne({
          depositId: deposit.id,
        })),
        "CONTRACT_EXISTS",
      );
      p3Assert(
        p3Date(b.startDate) && p3Date(b.endDate) && b.endDate > b.startDate,
        "INVALID_LEASE_DATES",
        400,
      );
      p3Assert(b.employeeId === undefined, "EMPLOYEE_FROM_DEPOSIT", 400);
      p3Money(b.monthlyRent);
      for (const price of [b.electricityPrice, b.waterPrice])
        p3Assert(
          price === undefined || (Number.isSafeInteger(price) && price >= 0),
          "INVALID_AMOUNT",
          400,
        );
      p3Assert(
        !b.otherFees ||
          (Array.isArray(b.otherFees) &&
            b.otherFees.every(
              (f) =>
                typeof f.name === "string" &&
                Number.isSafeInteger(f.amount) &&
                f.amount >= 0,
            )),
        "INVALID_FEES",
        400,
      );
      const contract = make("hd", {
        number: await p3Number("HD", now),
        depositId: deposit.id,
        roomId: deposit.roomId,
        customerId: deposit.customerId,
        ownerId: deposit.ownerId,
        createdOn: now,
        status: "DRAFT",
        startDate: b.startDate,
        endDate: b.endDate,
        monthlyRent: b.monthlyRent,
        depositAmount: deposit.totalRequired,
        electricityPrice: b.electricityPrice || 0,
        waterPrice: b.waterPrice || 0,
        otherFees: b.otherFees || [],
      });
      result("Contract", contract.id);
      await p3Create(plan, "Contract", contract);
      await p3Change(
        plan,
        "Deposit",
        deposit,
        { contractId: contract.id },
        { status: "PAID" },
      );
      const transaction =
        await dependencies.p3Collections.BrokerageTransaction.findOne({
          depositId: deposit.id,
        });
      if (transaction)
        await p3Change(plan, "BrokerageTransaction", transaction, {
          contractId: contract.id,
        });
    } else if (action === "signContract") {
      const contract = await p3Find("Contract", id),
        deposit = await p3Find("Deposit", contract.depositId);
      p3Own(req, deposit);
      result("Contract", id);
      p3Assert(
        contract.status === "DRAFT" && deposit.status === "PAID",
        "INVALID_TRANSITION",
      );
      const room = await p3Find("Room", contract.roomId);
      p3Assert(
        room.lock?.kind === "DEPOSIT" && room.lock.refId === deposit.id,
        "ROOM_LOCKED",
      );
      await p3Room(
        plan,
        room,
        { kind: "CONTRACT", refId: id, acquiredAt: now, expiresAt: null },
        lockedBy("DEPOSIT", deposit.id),
      );
      await p3Change(
        plan,
        "Contract",
        contract,
        { status: "SIGNED", signedAt: now, signedBy: req.p2Account.id },
        { status: "DRAFT" },
      );
      await p3Change(
        plan,
        "Deposit",
        deposit,
        { status: "CONTRACTED" },
        { status: "PAID" },
      );
    } else throw p3Error(400, "UNKNOWN_OPERATION");
    return plan;
  }

  const p3Customer = dependencies.requireRole("CUSTOMER");

  const p3Employee = dependencies.requireRole("EMPLOYEE");

  const p3Staff = dependencies.requireRole("EMPLOYEE", "ADMIN");

  const p3Gone = (code) => (req, res) =>
    res.status(410).send({ code, message: p3Error(410, code).message });

  // REAL-02: exact customer lookup starts a bounded deposit workflow on the server session.
  function p3IdentityFile(url) {
    return (
      typeof url === "string" &&
      /^\/uploads\/cccd\/[a-zA-Z0-9_-]+\.(jpe?g|png|webp)$/i.test(url) &&
      require("fs").existsSync(
        dependencies.path.join(
          dependencies.serverDirectory,
          "..",
          "my-server",
          "public",
          url,
        ),
      )
    );
  }

  function p3CompleteIdentity(customer) {
    const i = customer.identity;
    return (
      typeof i?.number === "string" &&
      /^\d{12}$/.test(i.number) &&
      p3Date(i?.issuedDate) &&
      i.issuedDate <=
        new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10) &&
      typeof i.issuedPlace === "string" &&
      i.issuedPlace.trim().length >= 2 &&
      typeof customer.permanentAddress === "string" &&
      customer.permanentAddress.trim().length >= 5 &&
      p3IdentityFile(i.frontImage) &&
      p3IdentityFile(i.backImage)
    );
  }

  async function p3IdentityFields(body, customerId) {
    const candidate = {
      identity: {
        number: body.idNumber,
        issuedDate: body.issuedOn,
        issuedPlace: body.issuedBy,
        frontImage: body.frontImageUrl,
        backImage: body.backImageUrl,
      },
      permanentAddress: body.permanentAddress,
    };
    p3Assert(
      p3CompleteIdentity(candidate) &&
        body.issuedBy.length <= 200 &&
        body.permanentAddress.length <= 500,
      "INVALID_IDENTITY",
      400,
    );
    p3Assert(
      !(await dependencies.customerCollection.findOne({
        ...(customerId ? { id: { $ne: customerId } } : {}),
        "identity.number": body.idNumber,
      })),
      "DUPLICATE_IDENTITY",
    );
    candidate.identity.issuedPlace = body.issuedBy.trim();
    candidate.permanentAddress = body.permanentAddress.trim();
    return candidate;
  }

  async function p3DepositCustomerRoom(req, customer, roomId) {
    p3Assert(
      typeof roomId === "string" && roomId.length > 0,
      "INVALID_ROOM",
      400,
    );
    const room = await p3Find("Room", roomId),
      employeeId = req.p2Employee.id;
    const hold =
      customer && room.lock?.kind === "HOLD"
        ? await dependencies.p3Collections.Hold.findOne({
            id: room.lock.refId,
            customerId: customer.id,
            roomId: room.id,
            status: "ACTIVE",
            isActive: true,
            expiresAt: { $gt: new Date() },
          })
        : null;
    p3Assert(
      (await dependencies.roomCollection.findOne(
        p3AvailableFilter(room.id, new Date()),
      )) || hold,
      "ROOM_LOCKED",
    );
    if (hold)
      p3Assert(
        !hold.employeeId || hold.employeeId === employeeId,
        "NOT_YOUR_RECORD",
        403,
      );
    return hold;
  }

  async function p3IdentityAccess(req, customer) {
    if (req.p2Account.role === "ADMIN") return true;
    const employeeId = req.p2Employee.id;
    if (
      (await dependencies.p3Collections.Deposit.findOne({
        customerId: customer.id,
        employeeId,
      })) ||
      (await dependencies.viewingCollection.findOne({
        customerProfileId: customer.id,
        employeeId,
      })) ||
      (await dependencies.viewingCollection.findOne({
        customerId: customer.id,
        employeeId,
      })) ||
      (await dependencies.p3Collections.Hold.findOne({
        customerId: customer.id,
        employeeId,
      }))
    )
      return true;
    const context = req.session.depositIdentityContext;
    if (
      !context ||
      context.employeeId !== employeeId ||
      context.customerId !== customer.id ||
      context.expiresAt < Date.now()
    )
      return false;
    const room = await dependencies.roomCollection.findOne({
      id: context.roomId,
    });
    return (
      !!room &&
      (!!(await dependencies.roomCollection.findOne(
        p3AvailableFilter(room.id, new Date()),
      )) ||
        !!(await dependencies.p3Collections.Hold.findOne({
          id: room.lock?.refId,
          roomId: room.id,
          customerId: customer.id,
          employeeId,
          status: "ACTIVE",
          isActive: true,
          expiresAt: { $gt: new Date() },
        })))
    );
  }

  const p3StatusLabels = {
    Hold: {
      PAYMENT_PENDING: "Chờ thanh toán",
      ACTIVE: "Đang giữ chỗ",
      CONVERTED: "Đã chuyển thành cọc",
      FORFEITED: "Khách bỏ giữ chỗ",
      EXPIRED: "Hết hạn",
      CANCELLED: "Đã hủy",
    },
    Deposit: {
      PAID: "Đã thu cọc",
      CONTRACTED: "Đã ký hợp đồng",
      COMPLETED: "Thành công",
      ABANDONED: "Khách bỏ cọc",
    },
    Contract: {
      DRAFT: "Nháp",
      SIGNED: "Đã ký – chờ admin xác nhận",
      COMPLETED: "Thành công",
      VOID: "Không hiệu lực – khách bỏ cọc",
    },
  };

  const p3DepositCompany = Object.freeze({
    name: "Công ty CP Bất Động Sản Houzz Uni",
    taxCode: "3703361326",
    address:
      "669 Do Muoi, Quarter 3, Linh Xuan Ward, Ho Chi Minh City, Vietnam.",
    hotline: "19001080",
  });

  async function p3SheetRoom(room, current = false) {
    const info = current ? await dependencies.snapshotRoom(room) : room;
    const entries = Array.isArray(room.fees)
      ? room.fees.map((fee) => [fee.name, fee.amount])
      : Object.entries(room.fees || {});
    const feeKey = (name) =>
      String(name)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/đ/g, "d")
        .trim();
    const electricityKeys = ["dien", "electricity", "electricityprice"],
      waterKeys = ["nuoc", "water", "waterprice"];
    const serviceKeys = ["dich vu", "management", "service", "servicefee"];
    const fees = new Map();
    for (const [name, amount] of entries) {
      if (
        typeof name !== "string" ||
        !Number.isFinite(amount) ||
        amount < 0 ||
        electricityKeys.includes(feeKey(name)) ||
        waterKeys.includes(feeKey(name))
      )
        continue;
      fees.set(serviceKeys.includes(feeKey(name)) ? "Dịch vụ" : name, amount);
    }
    if (
      !fees.has("Dịch vụ") &&
      Number.isFinite(room.serviceFee) &&
      room.serviceFee >= 0
    )
      fees.set("Dịch vụ", room.serviceFee);
    return {
      code: info.code || "",
      name: info.name || "",
      propertyName: info.propertyName || "",
      floor: room.floor ?? info.floor ?? "",
      address: info.address || "",
      type: info.type || info.roomType || "",
      monthlyRent: info.monthlyRent ?? info.price ?? null,
      electricityPrice:
        room.electricityPrice ??
        entries.find(([name]) => electricityKeys.includes(feeKey(name)))?.[1] ??
        null,
      waterPrice:
        room.waterPrice ??
        entries.find(([name]) => waterKeys.includes(feeKey(name)))?.[1] ??
        null,
      fees: Array.from(fees, ([name, amount]) => ({ name, amount })),
    };
  }

  function p3Labeled(type, record) {
    return record && p3StatusLabels[type]?.[record.status]
      ? { ...record, statusLabel: p3StatusLabels[type][record.status] }
      : record;
  }

  async function p3ContractReview(deposit) {
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
    const info = room
      ? await dependencies.snapshotRoom(room)
      : deposit.roomSnapshot ||
        transaction?.roomSnapshot ||
        contract?.roomSnapshot ||
        null;
    const customer = await dependencies.customerCollection.findOne({
      id: deposit.customerId,
    });
    const account = customer?.accountId
      ? await dependencies.accountCollection.findOne({ id: customer.accountId })
      : null;
    const employee = await dependencies.employeeCollection.findOne({
      id: deposit.employeeId,
    });
    const owner = await dependencies.database
      .collection("Owner")
      .findOne({ id: deposit.ownerId || info?.ownerId || null });
    const total =
      deposit.totalRequired ||
      contract?.depositAmount ||
      transaction?.total ||
      0;
    const companyShare =
      transaction?.companyShare ??
      deposit.companyShare ??
      Math.round(total / 2);
    const depositAt =
      deposit.createdAt ||
      deposit.collected?.at ||
      transaction?.recognizedAt ||
      contract?.createdOn ||
      null;
    const daysSinceDeposit = depositAt
      ? Math.max(
          0,
          Math.floor((Date.now() - new Date(depositAt).getTime()) / 86400000),
        )
      : 0;
    // Flows closed before DEP (contract CANCELLED) are not waiting for an admin decision and are not DEP outcomes.
    const outcome =
      deposit.status === "ABANDONED"
        ? "ABANDONED"
        : deposit.status === "COMPLETED" || contract?.status === "COMPLETED"
          ? "SUCCESS"
          : contract?.status === "CANCELLED"
            ? "CANCELLED"
            : transaction?.outcome || deposit.outcome || "PENDING";
    const identity = customer?.identity?.number || "";
    return {
      deposit: p3Labeled("Deposit", p3Clean(deposit)),
      contract: p3Labeled("Contract", p3Clean(contract)),
      room: p3Clean(info),
      customer: {
        name:
          customer?.fullName ||
          customer?.name ||
          account?.name ||
          deposit.customerName ||
          "",
        phone: customer?.phone || account?.phone || deposit.phone || "",
        identityMasked: identity
          ? `${"*".repeat(Math.max(0, identity.length - 4))}${identity.slice(-4)}`
          : "",
      },
      employee: {
        id: deposit.employeeId,
        fullName: employee?.fullName || "",
        employeeCode: employee?.employeeCode || "",
      },
      owner: {
        name: owner?.fullName || owner?.name || "",
        phone: owner?.phone || "",
      },
      amounts: {
        total,
        holdCredit: deposit.holdCredit || 0,
        companyShare,
        ownerShare:
          transaction?.ownerShare ?? deposit.ownerShare ?? total - companyShare,
      },
      depositAt,
      daysSinceDeposit,
      overdue: daysSinceDeposit >= 7,
      outcome,
      decidedAt:
        deposit.decidedAt ||
        transaction?.decidedAt ||
        contract?.approvedAt ||
        contract?.completedAt ||
        deposit.abandonment?.recordedAt ||
        null,
      decidedBy:
        deposit.decidedBy ||
        transaction?.decidedBy ||
        contract?.approvedBy ||
        deposit.abandonment?.recordedBy ||
        null,
      note: deposit.note || deposit.collected?.note || "",
      ...(outcome !== "PENDING"
        ? {
            note:
              deposit.note ||
              transaction?.note ||
              deposit.abandonment?.reason ||
              "",
          }
        : {}),
    };
  }

  // Display fields are joined only after the existing ownership filter/check succeeds.
  async function p3EmployeeDisplay(type, record) {
    const value = p3Labeled(type, await p3RoomDisplay(record));
    if (!["Deposit", "Contract"].includes(type)) return value;
    const customer = await dependencies.customerCollection.findOne(
      { id: record.customerId },
      { projection: { fullName: 1, name: 1, phone: 1, accountId: 1 } },
    );
    const account = customer?.accountId
      ? await dependencies.accountCollection.findOne(
          { id: customer.accountId },
          { projection: { fullName: 1, name: 1, phone: 1 } },
        )
      : null;
    return {
      ...value,
      customerName:
        customer?.fullName ||
        customer?.name ||
        account?.fullName ||
        account?.name ||
        value.customerName ||
        "",
      phone: customer?.phone || account?.phone || value.phone || "",
    };
  }

  async function p3RoomDisplay(record, type = "") {
    const value = p3Labeled(type, p3Clean(record));
    if (value.roomSnapshot || !value.roomId) return value;
    const room = await dependencies.roomCollection.findOne({
      id: value.roomId,
    });
    return room
      ? { ...value, roomSnapshot: await dependencies.snapshotRoom(room) }
      : value;
  }

  Object.defineProperties(dependencies, {
    p3Error: { enumerable: true, get: () => p3Error },
    p3Assert: { enumerable: true, get: () => p3Assert },
    p3Money: { enumerable: true, get: () => p3Money },
    p3Month: { enumerable: true, get: () => p3Month },
    p3Date: { enumerable: true, get: () => p3Date },
    p3LeaseEndDate: { enumerable: true, get: () => p3LeaseEndDate },
    p3Fee: { enumerable: true, get: () => p3Fee },
    p3Transition: { enumerable: true, get: () => p3Transition },
    p3AvailableFilter: { enumerable: true, get: () => p3AvailableFilter },
    p3Clean: { enumerable: true, get: () => p3Clean },
    p3DraftData: { enumerable: true, get: () => p3DraftData },
    p3DraftLabel: { enumerable: true, get: () => p3DraftLabel },
    p3DraftEvent: { enumerable: true, get: () => p3DraftEvent },
    p3Stable: { enumerable: true, get: () => p3Stable },
    payosConfig: { enumerable: true, get: () => payosConfig },
    payosConfigured: { enumerable: true, get: () => payosConfigured },
    payosSign: { enumerable: true, get: () => payosSign },
    payosVerify: { enumerable: true, get: () => payosVerify },
    payosRequest: { enumerable: true, get: () => payosRequest },
    payosCreateLink: { enumerable: true, get: () => payosCreateLink },
    payosGetRequest: { enumerable: true, get: () => payosGetRequest },
    p3Commit: { enumerable: true, get: () => p3Commit },
    p3Period: { enumerable: true, get: () => p3Period },
    p3CompanyRevenue: { enumerable: true, get: () => p3CompanyRevenue },
    p3Forfeit: { enumerable: true, get: () => p3Forfeit },
    completeHoldPayment: { enumerable: true, get: () => completeHoldPayment },
    payosSettle: { enumerable: true, get: () => payosSettle },
    payosWebhook: { enumerable: true, get: () => payosWebhook },
    payosEnsureLink: { enumerable: true, get: () => payosEnsureLink },
    p3RecognizeDeposit: { enumerable: true, get: () => p3RecognizeDeposit },
    p3Number: { enumerable: true, get: () => p3Number },
    p3Find: { enumerable: true, get: () => p3Find },
    p3Own: { enumerable: true, get: () => p3Own },
    p3Queue: { enumerable: true, get: () => p3Queue },
    p3Serial: { enumerable: true, get: () => p3Serial },
    p3Plan: { enumerable: true, get: () => p3Plan },
    p3Insert: { enumerable: true, get: () => p3Insert },
    p3Change: { enumerable: true, get: () => p3Change },
    p3Event: { enumerable: true, get: () => p3Event },
    p3Create: { enumerable: true, get: () => p3Create },
    p3Room: { enumerable: true, get: () => p3Room },
    p3Run: { enumerable: true, get: () => p3Run },
    p3Recover: { enumerable: true, get: () => p3Recover },
    p3Compensate: { enumerable: true, get: () => p3Compensate },
    p3ReadBarrier: { enumerable: true, get: () => p3ReadBarrier },
    p3Reconcile: { enumerable: true, get: () => p3Reconcile },
    p3ReconcileCompany: { enumerable: true, get: () => p3ReconcileCompany },
    p3Expire: { enumerable: true, get: () => p3Expire },
    p3Route: { enumerable: true, get: () => p3Route },
    p3Write: { enumerable: true, get: () => p3Write },
    p3Prepare: { enumerable: true, get: () => p3Prepare },
    p3Customer: { enumerable: true, get: () => p3Customer },
    p3Employee: { enumerable: true, get: () => p3Employee },
    p3Staff: { enumerable: true, get: () => p3Staff },
    p3Gone: { enumerable: true, get: () => p3Gone },
    p3IdentityFile: { enumerable: true, get: () => p3IdentityFile },
    p3CompleteIdentity: { enumerable: true, get: () => p3CompleteIdentity },
    p3IdentityFields: { enumerable: true, get: () => p3IdentityFields },
    p3DepositCustomerRoom: {
      enumerable: true,
      get: () => p3DepositCustomerRoom,
    },
    p3IdentityAccess: { enumerable: true, get: () => p3IdentityAccess },
    p3StatusLabels: { enumerable: true, get: () => p3StatusLabels },
    p3DepositCompany: { enumerable: true, get: () => p3DepositCompany },
    p3SheetRoom: { enumerable: true, get: () => p3SheetRoom },
    p3Labeled: { enumerable: true, get: () => p3Labeled },
    p3ContractReview: { enumerable: true, get: () => p3ContractReview },
    p3EmployeeDisplay: { enumerable: true, get: () => p3EmployeeDisplay },
    p3RoomDisplay: { enumerable: true, get: () => p3RoomDisplay },
  });
}
module.exports = { createDepositService };

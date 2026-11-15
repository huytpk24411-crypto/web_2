try { process.loadEnvFile(require('path').join(__dirname, '.env')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

const express = require('express');
const app = express();
const port = 3002;

const morgan = require('morgan');
app.use(morgan("combined"));

const path = require('path');
app.use(express.static(path.join(__dirname, 'public')));

const corsMiddleware = require('cors');
// Use the same CORS options on every route
function cors() {
    return corsMiddleware({ origin: ['http://localhost:4200', 'http://localhost:4201', 'http://localhost:4202'], credentials: true });
}
app.use(cors());
// payOS does not send portal headers or cookies. Keep this before session/auth barriers.
app.post('/payos/webhook', express.json({ limit: '100kb' }), payosWebhook);
const cookieParser = require('cookie-parser');
app.use(cookieParser());
const session = require('express-session');
// Three front-end apps share this API: customer (4200), employee (4201), admin (4202).
// Each app's proxy sends X-iHouzz-Portal, and each portal keeps its own session cookie,
// so signing in to one app does not sign the browser out of another.
const portalRoles = { customer: 'CUSTOMER', employee: 'EMPLOYEE', admin: 'ADMIN' };
function portalOf(req) {
    const portal = String(req.get('x-ihouzz-portal') || '').toLowerCase();
    return portalRoles[portal] ? portal : null;
}
const sessionCookieName = portal => !portal || portal === 'customer' ? 'connect.sid' : `connect.sid.${portal}`;
const rememberCookieName = portal => !portal || portal === 'customer' ? 'remember_user' : `remember_user_${portal}`;
const sessionStore = new session.MemoryStore();
const portalSessions = {};
for (const portal of [null, 'employee', 'admin']) {
    portalSessions[portal || 'customer'] = session({
        name: sessionCookieName(portal),
        store: sessionStore,
        secret: process.env.SESSION_SECRET || 'ihouzz-learnangular-local-session-secret',
        resave: false,
        saveUninitialized: false,
        cookie: { maxAge: 60 * 60 * 1000, httpOnly: true, sameSite: 'lax', secure: false }
    });
}
app.use((req, res, next) => portalSessions[portalOf(req) || 'customer'](req, res, next));
const crypto = require('crypto');
const bodyParser = require('body-parser');
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

const { MongoClient, ObjectId } = require('mongodb');
const client = new MongoClient("mongodb://127.0.0.1:27017");
const database = client.db(process.env.MONGODB_DB || 'iHouzzUniData');
const roomCollection = database.collection('Room');
const propertyCollection = database.collection('Property');
const schoolCollection = database.collection('School');
const propertySchoolCollection = database.collection('PropertySchool');
const accountCollection = database.collection('Account');
const viewingCollection = database.collection('Viewing');
const customerCollection = database.collection('Customer');
const accountRoleCollection = database.collection('AccountRole');
const employeeCollection = database.collection('Employee');
const favoriteCollection = database.collection('Favorite');
const contactCollection = database.collection('ContactRequest');
const viewingDetailCollection = database.collection('ViewingDetail');
const notificationCollection = database.collection('Notification');
const auditCollection = database.collection('AuditLog');
const p3Collections = Object.fromEntries([
    'Hold', 'Payment', 'Receipt', 'Deposit', 'Contract', 'BrokerageAgreement',
    'BrokerageTransaction', 'EmployeeRevenue', 'CompanyRevenue', 'PayrollPeriod',
    'Policy', 'PolicyLevel', 'Counter', 'Room', 'Customer', 'Employee', 'Account', 'AuditLog', 'Notification',
    'Favorite', 'RoomImage', 'RoomPriceHistory', 'ViewingDetail', 'Viewing'
].map(name => [name, database.collection(name)]));

// P3 helpers are exported for pure-function and MongoDB integration specs.
function p3Error(status, code) {
    const messages = { ROOM_LOCKED: 'Phòng vừa được khách khác giữ chỗ', HOLD_EXPIRED: 'Đã hết thời gian thanh toán giữ chỗ',
        PAYMENT_GATEWAY_NOT_CONFIGURED: 'Chưa cấu hình cổng thanh toán.',
        PAYMENT_GATEWAY_REQUIRED: 'Vui lòng thanh toán qua cổng ngân hàng.',
        INVALID_SIGNATURE: 'Chữ ký thanh toán không hợp lệ.', FLOW_CHANGED: 'Quy trình cọc đã thay đổi.',
        CONTRACT_NOT_SIGNED: 'Hợp đồng chưa ký.', ALREADY_DECIDED: 'Hợp đồng này đã được xác nhận.',
        PAYROLL_CLOSED: 'Kỳ lương tháng này đã đóng, không ghi được doanh thu.',
        PAYMENT_GATEWAY_ERROR: 'Không kết nối được cổng thanh toán. Vui lòng thử lại.' };
    return Object.assign(new Error(messages[code] || code), { status, code });
}
function p3Assert(condition, code, status = 409) { if (!condition) throw p3Error(status, code); }
function p3Money(total, credit = 0) {
    p3Assert(Number.isSafeInteger(total) && total > 0 && Number.isSafeInteger(credit) && credit >= 0 && credit <= total, 'INVALID_AMOUNT', 400);
    return { totalRequired: total, holdCredit: credit, amountDue: total - credit };
}
function p3Month(at) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' }).formatToParts(new Date(at));
    return `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}`;
}
function p3Date(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function p3Fee(rent, agreement) {
    p3Assert(agreement?.feeMethod === 'PERCENT_OF_MONTHLY_RENT' && agreement.feeValue === 5000, 'AGREEMENT_NOT_CONFIGURED');
    p3Assert(Number.isSafeInteger(rent) && rent > 0, 'INVALID_RENT', 400);
    return Number((BigInt(rent) * BigInt(agreement.feeValue) + 5000n) / 10000n);
}
function p3Transition(type, from, to) {
    const edges = {
        Hold: ['PAYMENT_PENDING:ACTIVE', 'PAYMENT_PENDING:CANCELLED', 'PAYMENT_PENDING:EXPIRED', 'ACTIVE:CANCELLED', 'ACTIVE:EXPIRED', 'ACTIVE:FORFEITED', 'ACTIVE:CONVERTED', 'CONVERTED:ACTIVE', 'CONVERTED:EXPIRED', 'CONVERTED:FORFEITED'],
        Payment: ['PENDING:CONFIRMED', 'PENDING:LATE_PAID', 'PENDING:REJECTED', 'PENDING:FAILED'],
        Deposit: ['PAYMENT_PENDING:PAID', 'PAYMENT_PENDING:CANCELLED', 'PAID:CONTRACTED', 'PAID:COMPLETED', 'CONTRACTED:COMPLETED', 'PAID:ABANDONED', 'CONTRACTED:ABANDONED'],
        Contract: ['DRAFT:SIGNED', 'SIGNED:COMPLETED', 'DRAFT:CANCELLED', 'DRAFT:VOID', 'SIGNED:VOID']
    };
    return edges[type]?.includes(`${from}:${to}`) || false;
}
function p3AvailableFilter(roomId, now) {
    return { id: roomId, publicationStatus: 'PUBLISHED', status: 'AVAILABLE', businessStatus: 'AVAILABLE',
        $or: [{ lock: null }, { 'lock.expiresAt': { $type: 'date', $lte: now } }] };
}
function p3Clean(record) {
    if (!record) return record;
    const { _id, p3LastStep, ...value } = record;
    return value;
}
function p3Stable(value) {
    if (Array.isArray(value)) return value.map(p3Stable);
    if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, p3Stable(value[k])]));
    return value;
}
function payosConfig() {
    return { clientId: process.env.PAYOS_CLIENT_ID, apiKey: process.env.PAYOS_API_KEY,
        checksumKey: process.env.PAYOS_CHECKSUM_KEY,
        // Only test runs override this (local payOS stub); production always uses the official host.
        apiBase: (process.env.PAYOS_API_BASE || 'https://api-merchant.payos.vn').replace(/\/+$/, ''),
        customerAppUrl: (process.env.CUSTOMER_APP_URL || 'http://localhost:4200').replace(/\/+$/, '') };
}
function payosConfigured(config = payosConfig()) { return !!(config.clientId && config.apiKey && config.checksumKey); }
function payosSign(data, key) {
    const value = input => input == null || input === 'null' || input === 'undefined' ? ''
        : Array.isArray(input) ? JSON.stringify(input.map(p3Stable)) : String(input);
    const text = Object.keys(data).sort().map(name => `${name}=${value(data[name])}`).join('&');
    return crypto.createHmac('sha256', key).update(text).digest('hex');
}
function payosVerify(body, key) {
    if (!key || !body?.data || typeof body.data !== 'object' || Array.isArray(body.data)
        || typeof body.signature !== 'string' || !/^[a-fA-F0-9]{64}$/.test(body.signature)) return false;
    const expected = Buffer.from(payosSign(body.data, key), 'hex'), actual = Buffer.from(body.signature, 'hex');
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
async function payosRequest(method, resource, body, config, request) {
    p3Assert(payosConfigured(config), 'PAYMENT_GATEWAY_NOT_CONFIGURED', 503);
    try {
        const response = await request(`${config.apiBase || 'https://api-merchant.payos.vn'}/v2/payment-requests${resource}`, {
            method, headers: { 'x-client-id': config.clientId, 'x-api-key': config.apiKey, 'Content-Type': 'application/json' },
            ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(5000) });
        const result = await response.json();
        p3Assert(response.ok && result.code === '00' && result.data, 'PAYMENT_GATEWAY_ERROR', 502);
        return result.data;
    } catch { throw p3Error(502, 'PAYMENT_GATEWAY_ERROR'); }
}
async function payosCreateLink(data, config = payosConfig(), request = fetch) {
    const { amount, cancelUrl, description, orderCode, returnUrl } = data;
    const signature = payosSign({ amount, cancelUrl, description, orderCode, returnUrl }, config.checksumKey || '');
    return payosRequest('POST', '', { ...data, signature }, config, request);
}
async function payosGetRequest(orderCode, config = payosConfig(), request = fetch) {
    p3Assert(Number.isSafeInteger(orderCode) && orderCode > 0, 'INVALID_ORDER_CODE', 400);
    return payosRequest('GET', `/${orderCode}`, null, config, request);
}
async function p3Commit(plan, action) {
    const op = { id: plan.opId, entityType: 'P3Operation', entityId: plan.id, action,
        actorId: plan.actorId || null, at: plan.now, state: 'PENDING', cursor: 0, plan };
    await auditCollection.insertOne(op);
    return p3Run(op);
}
async function p3Period(plan, at, allowClosed = false) {
    const code = p3Month(at), { start, end, ...fields } = p5MonthBounds(code);
    let period = await p3Collections.PayrollPeriod.findOne({ year: fields.year, month: fields.month });
    if (!period) {
        period = { id: `kl-${crypto.randomUUID()}`, ...fields, name: `Lương tháng ${fields.month}/${fields.year}`,
            status: 'OPEN', displayStatus: 'DANG_MO', version: 0, closedAt: null, closedBy: null, policyVersionIds: [], totals: {} };
        await p3Create(plan, 'PayrollPeriod', period);
    }
    p3Assert(allowClosed || !['CLOSED', 'PAID'].includes(period.status), 'PAYROLL_CLOSED');
    return period;
}
async function p3CompanyRevenue(plan, period) {
    let revenue = await p3Collections.CompanyRevenue.findOne({ periodId: period.id });
    if (!revenue) {
        revenue = { id: `dtct-${crypto.randomUUID()}`, periodId: period.id, revenue: 0, transactionCount: 0 };
        await p3Create(plan, 'CompanyRevenue', revenue);
    }
    return revenue;
}
async function p3Forfeit(plan, hold) {
    const period = await p3Period(plan, hold.expiresAt, true), company = await p3CompanyRevenue(plan, period);
    await p3Change(plan, 'Hold', hold, { status: 'FORFEITED', isActive: false, forfeitedAt: hold.expiresAt,
        companyRevenueId: company.id, recognitionMonth: p3Month(hold.expiresAt) }, { status: hold.status });
    plan.effects.push({ kind: 'companyRevenue', companyRevenueId: company.id });
    await p3Event(plan, 'CompanyRevenue', company.id, 'HOLD_FORFEITED', company,
        { ...company, revenue: company.revenue + hold.amount, holdId: hold.id });
    const customer = await customerCollection.findOne({ id: hold.customerId });
    if (customer) p3Insert(plan, 'Notification', { id: `forfeit-${plan.opId}`, accountId: customer.accountId,
        type: 'HOLD_FORFEITED', entityType: 'Hold', entityId: hold.id, title: 'Khách bỏ giữ chỗ',
        body: `Giữ chỗ ${hold.number || hold.id} đã hết 48 giờ. Tiền giữ chỗ thuộc công ty theo chính sách.`,
        read: false, readAt: null, createdAt: plan.now, dedupeKey: `forfeit:${hold.id}` });
}
// Called only from verified payOS webhook/lookup, while holding the P3 queue.
async function completeHoldPayment(plan, hold, payment, data) {
    plan.type = 'Payment'; plan.id = payment.id;
    if (['CONFIRMED', 'LATE_PAID'].includes(payment.status)) return;
    p3Assert(payment.status === 'PENDING' && payment.provider === 'PAYOS' && payment.purpose === 'HOLD', 'INVALID_TRANSITION');
    p3Assert(data.amount === payment.amount && payment.amount === hold.amount, 'AMOUNT_MISMATCH', 400);
    const now = plan.now, room = await roomCollection.findOne({ id: hold.roomId });
    const valid = hold.status === 'PAYMENT_PENDING' && new Date(hold.expiresAt) > now
        && room?.lock?.kind === 'HOLD' && room.lock.refId === hold.id && new Date(room.lock.expiresAt) > now;
    const fields = { status: valid ? 'CONFIRMED' : 'LATE_PAID', method: 'BANK_TRANSFER', provider: 'PAYOS',
        paidAt: now, confirmedAt: valid ? now : null, confirmedBy: 'SYSTEM', confirmedByEmployeeId: null,
        ...(data.reference ? { bankTransactionRef: String(data.reference) } : {}) };
    if (!valid) {
        // User rule (16/11/2026): a transfer that arrives after the hold expired is NOT refunded —
        // it becomes company revenue for the month it was received (no employee revenue, hold stays inactive).
        const period = await p3Period(plan, now, true), company = await p3CompanyRevenue(plan, period);
        await p3Change(plan, 'Payment', payment, { ...fields, companyRevenueId: company.id, recognitionMonth: p3Month(now) },
            { status: 'PENDING' });
        plan.effects.push({ kind: 'companyRevenue', companyRevenueId: company.id });
        await p3Event(plan, 'CompanyRevenue', company.id, 'HOLD_LATE_PAID', company,
            { ...company, revenue: company.revenue + payment.amount, holdId: hold.id, paymentId: payment.id });
        const customer = await customerCollection.findOne({ id: hold.customerId });
        if (customer) p3Insert(plan, 'Notification', { id: `late-${payment.id}-customer`, accountId: customer.accountId,
            type: 'HOLD_LATE_PAID', entityType: 'Hold', entityId: hold.id, title: 'Giữ chỗ không còn hiệu lực',
            body: `Thanh toán giữ chỗ ${hold.number || hold.id} đến sau khi hết hạn nên giữ chỗ không còn hiệu lực; khoản tiền không được hoàn lại.`,
            read: false, readAt: null, createdAt: now, dedupeKey: `late:${payment.id}:customer` });
        for (const admin of await accountCollection.find({ role: 'ADMIN' }).toArray()) p3Insert(plan, 'Notification', {
            id: `late-${payment.id}-${admin.id}`, accountId: admin.id, type: 'HOLD_LATE_PAID', entityType: 'Payment', entityId: payment.id,
            title: 'Tiền giữ chỗ chuyển trễ',
            body: `Khách đã chuyển tiền giữ chỗ ${hold.number || hold.id} sau khi hết hạn; khoản ${payment.amount.toLocaleString('vi-VN')} đ được ghi vào doanh thu công ty.`,
            read: false, readAt: null, createdAt: now, dedupeKey: `late:${payment.id}:${admin.id}` });
        return;
    }
    const expiresAt = new Date(now.getTime() + 48 * 3600000);
    const property = room.propertyId ? await propertyCollection.findOne({ id: room.propertyId }) : null;
    const receipt = { id: `bl-${payment.id}`, paymentId: payment.id, number: await p3Number('BL', now), issuedAt: now,
        snapshot: { title: 'Biên lai giữ chỗ', holdId: hold.id, holdNumber: hold.number || hold.id,
            payerName: hold.contact.name, payerPhone: hold.contact.phone, roomCode: room.code, roomName: room.name,
            roomAddress: room.address || property?.address || '', amount: hold.amount, method: 'BANK_TRANSFER', paidAt: now, expiresAt } };
    plan.paymentDeadline = hold.expiresAt;
    await p3Room(plan, room, { kind: 'HOLD', refId: hold.id, acquiredAt: now, expiresAt },
        { 'lock.kind': 'HOLD', 'lock.refId': hold.id, 'lock.expiresAt': { $gt: now } });
    await p3Change(plan, 'Payment', payment, { ...fields, receipt }, { status: 'PENDING' });
    await p3Create(plan, 'Receipt', { ...receipt, customerId: hold.customerId, roomId: room.id });
    await p3Change(plan, 'Hold', hold, { status: 'ACTIVE', isActive: true, paymentId: payment.id,
        paidAt: now, lockStartsAt: now, expiresAt }, { status: 'PAYMENT_PENDING' });
}
async function payosSettle(payment, data) {
    const prepare = async () => {
        payment = await p3Find('Payment', payment.id);
        const plan = Object.assign(p3Plan('Payment', payment.id), { opId: `p3-payos-${crypto.randomUUID()}`, now: new Date(), actorId: null });
        await completeHoldPayment(plan, await p3Find('Hold', payment.holdId), payment, data);
        return plan;
    };
    let plan = await prepare();
    if (!plan.effects.length) return payment;
    try { return await p3Commit(plan, 'completeHoldPayment'); }
    catch (error) {
        // Only a failed first lock CAS can be reclassified as a late transfer.
        const op = await auditCollection.findOne({ id: plan.opId });
        if (!plan.paymentDeadline || op?.state !== 'FAILED' || !['HOLD_EXPIRED', 'ROOM_LOCKED'].includes(error.code)) throw error;
        plan = await prepare();
        return p3Commit(plan, 'lateHoldPayment');
    }
}
async function payosWebhook(req, res) {
    if (!payosVerify(req.body, payosConfig().checksumKey)) {
        console.warn('payOS webhook: INVALID_SIGNATURE');
        return res.status(400).send({ code: 'INVALID_SIGNATURE', message: p3Error(400, 'INVALID_SIGNATURE').message });
    }
    try {
        // Unknown sample orders need no recovery or session and are acknowledged immediately.
        const data = req.body.data;
        const payment = await p3Collections.Payment.findOne({ provider: 'PAYOS', orderCode: data.orderCode });
        if (!payment || data.code !== '00' || data.amount !== payment.amount) return res.send({ ok: true });
        await p6Barrier(); await p5Barrier();
        await p3Serial(async () => { await p3Recover(); await p3Expire(); await payosSettle(payment, data); });
        res.send({ ok: true });
    } catch { res.status(503).send({ code: 'RECOVERY_PENDING', message: 'Vui lòng gửi lại thông báo thanh toán.' }); }
}
async function payosEnsureLink(id) {
    let payment = await p3Find('Payment', id);
    const hold = await p3Find('Hold', payment.holdId), config = payosConfig();
    p3Assert(payosConfigured(config), 'PAYMENT_GATEWAY_NOT_CONFIGURED', 503);
    p3Assert(hold.status === 'PAYMENT_PENDING' && payment.status === 'PENDING'
        && new Date(hold.expiresAt) > new Date(), 'HOLD_EXPIRED');
    if (!payment.checkoutUrl) {
        const receiptUrl = `${config.customerAppUrl}/bookings/${hold.id}/receipt?payos=`;
        let link;
        try {
            link = await payosCreateLink({ orderCode: payment.orderCode, amount: payment.amount, description: payment.description,
                returnUrl: `${receiptUrl}return`, cancelUrl: `${receiptUrl}cancel`, expiredAt: Math.floor(new Date(hold.expiresAt).getTime() / 1000) }, config);
        } catch (error) {
            // A timeout can happen after payOS accepted the transfer. Look up that same order.
            try { link = await payosGetRequest(payment.orderCode, config); } catch { throw error; }
        }
        p3Assert(!['CANCELLED', 'EXPIRED'].includes(link.status), 'HOLD_EXPIRED');
        if (link.status === 'PAID' || link.amountPaid >= payment.amount) {
            p3Assert(link.amount === payment.amount, 'AMOUNT_MISMATCH', 400);
            await payosSettle(payment, { amount: payment.amount });
            throw p3Error(409, 'PAYMENT_ALREADY_DECIDED');
        }
        // Never invent gateway URLs or QR payloads when an upstream response is incomplete.
        p3Assert(typeof link.checkoutUrl === 'string' && link.checkoutUrl.length > 0
            && typeof link.qrCode === 'string' && link.paymentLinkId, 'PAYMENT_GATEWAY_ERROR', 502);
        const plan = Object.assign(p3Plan('Payment', id), { opId: `p3-payos-link-${crypto.randomUUID()}`, now: new Date(), actorId: null });
        await p3Change(plan, 'Payment', payment, { paymentLinkId: link.paymentLinkId,
            checkoutUrl: link.checkoutUrl, qrCode: link.qrCode }, { status: 'PENDING' });
        payment = await p3Commit(plan, 'payosLinkCreated');
    }
    return { checkoutUrl: payment.checkoutUrl, qrCode: payment.qrCode, orderCode: payment.orderCode,
        amount: payment.amount, description: payment.description, expiresAt: payment.expiresAt };
}
async function p3RecognizeDeposit(plan, deposit, room) {
    const now = plan.now, localDate = new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
    const agreements = await p3Collections.BrokerageAgreement.find({ roomId: room.id, status: 'ACTIVE', effectiveFrom: { $lte: localDate },
        $or: [{ effectiveTo: null }, { effectiveTo: { $gte: localDate } }] }).toArray();
    p3Assert(agreements.length === 1, 'AGREEMENT_NOT_CONFIGURED');
    const agreement = agreements[0], period = await p3Period(plan, now), company = await p3CompanyRevenue(plan, period);
    let employee = await p3Collections.EmployeeRevenue.findOne({ employeeId: deposit.employeeId, periodId: period.id });
    if (!employee) {
        employee = { id: `dtnv-${crypto.randomUUID()}`, employeeId: deposit.employeeId, periodId: period.id, revenue: 0, transactionCount: 0 };
        await p3Create(plan, 'EmployeeRevenue', employee);
    }
    const companyShare = Number((BigInt(deposit.totalRequired) + 1n) / 2n), ownerShare = deposit.totalRequired - companyShare;
    // A reserved reference preserves the existing unique contractId index until a draft is created.
    const transaction = { id: `gd-${crypto.randomUUID()}`, depositId: deposit.id, contractId: `deposit:${deposit.id}`,
        roomId: room.id, roomSnapshot: await snapshotRoom(room), agreementId: agreement.id, agreementSnapshot: p3Clean(agreement),
        employeeRevenueId: employee.id, companyRevenueId: company.id, finalFee: companyShare, companyShare, ownerShare,
        holdCredit: deposit.holdCredit, total: deposit.totalRequired, recognizedAt: now, recognitionMonth: p3Month(now),
        status: 'RECOGNIZED', outcome: 'PENDING', employeeId: deposit.employeeId, customerId: deposit.customerId };
    plan.compensation.revenue = { transactionId: transaction.id, employeeRevenueId: employee.id,
        companyRevenueId: company.id, periodId: period.id };
    await p3Change(plan, 'PayrollPeriod', period, { p3Pending: true }, { status: { $nin: ['CLOSED', 'PAID'] },
        version: period.version === undefined ? { $exists: false } : period.version });
    await p3Change(plan, 'Deposit', deposit, { companyShare, ownerShare, brokerageTransactionId: transaction.id,
        roomSnapshot: transaction.roomSnapshot, agreementSnapshot: transaction.agreementSnapshot });
    await p3Create(plan, 'BrokerageTransaction', transaction);
    plan.effects.push({ kind: 'revenue', periodId: period.id, employeeRevenueId: employee.id, companyRevenueId: company.id });
    await p3Event(plan, 'EmployeeRevenue', employee.id, 'RECONCILE', employee, { ...employee, revenue: employee.revenue + companyShare, employeeId: deposit.employeeId });
    await p3Event(plan, 'CompanyRevenue', company.id, 'RECONCILE', company, { ...company, revenue: company.revenue + companyShare });
}
async function p3Number(prefix, now) {
    const month = p3Month(now).replace('-', '');
    const counter = await p3Collections.Counter.findOneAndUpdate({ _id: `${prefix}-${month}` }, { $inc: { value: 1 } }, { upsert: true, returnDocument: 'after' });
    return `${prefix}-${month}-${String(counter.value).padStart(4, '0')}`;
}
async function p3Find(type, id) {
    const value = await p3Collections[type].findOne({ id });
    p3Assert(value, `${type.toUpperCase()}_NOT_FOUND`, 404);
    return value;
}
function p3Own(req, record) {
    if (req.p2Account.role === 'ADMIN') return;
    if (req.p2Account.role === 'CUSTOMER') p3Assert(record.customerId === req.p2Customer?.id, 'NOT_YOUR_RECORD', 403);
    else p3Assert(record.employeeId === req.p2Employee?.id, 'NOT_YOUR_RECORD', 403);
}
// One API process, matching P2. Persist plans BEFORE mutations; replay after crashes.
let p3Queue = Promise.resolve();
function p3Serial(work) {
    const result = p3Queue.then(work);
    p3Queue = result.catch(() => {});
    return result;
}
function p3Plan(type, id) { return { type, id, effects: [] }; }
function p3Insert(plan, type, record) { plan.effects.push({ kind: 'insert', type, record }); }
async function p3Change(plan, type, before, fields, filter = {}, remove = []) {
    if (before.status && fields.status && before.status !== fields.status && ['Hold', 'Payment', 'Deposit', 'Contract'].includes(type)) {
        p3Assert(p3Transition(type, before.status, fields.status), 'INVALID_TRANSITION');
    }
    plan.effects.push({ kind: 'change', type, id: before.id, filter: { id: before.id, ...filter }, fields: { ...fields, updatedAt: plan.now }, remove });
    const after = { ...before, ...fields };
    remove.forEach(key => delete after[key]);
    await p3Event(plan, type, before.id, fields.status || 'UPDATE', before, after);
}
async function p3Event(plan, type, id, action, before, after) {
    const n = plan.effects.length;
    p3Insert(plan, 'AuditLog', { id: `p3-event-${plan.opId}-${n}`, entityType: type, entityId: id,
        action, actorId: plan.actorId || null, at: plan.now, before: p3Clean(before), after: p3Clean(after) });
    const accountIds = new Set();
    const customerId = after?.customerId || before?.customerId;
    if (customerId) {
        const customer = await customerCollection.findOne({ id: customerId });
        if (customer) accountIds.add(customer.accountId);
    }
    const employeeId = after?.employeeId || before?.employeeId || plan.employeeId;
    if (employeeId) {
        const employee = await employeeCollection.findOne({ id: employeeId });
        if (employee) accountIds.add(employee.accountId);
    }
    const staff = await accountCollection.find({ role: { $in: customerId && !employeeId ? ['ADMIN', 'EMPLOYEE'] : ['ADMIN'] }, status: 'ACTIVE' }).toArray();
    staff.forEach(a => accountIds.add(a.id));
    for (const accountId of accountIds) p3Insert(plan, 'Notification', {
        id: `p3-notice-${plan.opId}-${n}-${accountId}`, accountId, type: `P3_${action}`, entityType: type, entityId: id,
        title: `${type}: ${action}`, body: `${type} ${id}: ${action}`, read: false, readAt: null, createdAt: plan.now,
        dedupeKey: `p3:${plan.opId}:${n}:${accountId}`
    });
}
async function p3Create(plan, type, record) {
    p3Insert(plan, type, record);
    await p3Event(plan, type, record.id, 'CREATE', null, record);
}
async function p3Room(plan, room, lock, filter) {
    const status = lock?.kind === 'CONTRACT' ? 'RENTED' : lock ? 'HELD' : 'AVAILABLE';
    await p3Change(plan, 'Room', room, { lock, businessStatus: status, status, hasHistory: true }, filter);
}
async function p3Run(op) {
    if (op.state === 'COMPENSATING') return p3Compensate(op);
    const plan = op.plan;
    try {
        for (let i = op.cursor || 0; i < plan.effects.length; i++) {
            const effect = plan.effects[i], collection = p3Collections[effect.type], token = `${op.id}:${i}`;
            if (effect.kind === 'insert') {
                await collection.updateOne({ id: effect.record.id }, { $setOnInsert: effect.record }, { upsert: true });
            } else if (effect.kind === 'change') {
                const replay = await collection.findOne({ id: effect.id, p3LastStep: token });
                if (!replay) {
                    const filter = { ...effect.filter, p3LastStep: { $ne: token } };
                    if (effect.type === 'Room' && effect.fields.lock?.kind === 'DEPOSIT' && filter['lock.expiresAt']) {
                        filter['lock.expiresAt'] = { $gt: new Date() };
                    }
                    if (effect.type === 'Room' && effect.fields.lock?.kind === 'HOLD' && effect.filter.businessStatus === 'AVAILABLE') {
                        p3Assert(new Date(effect.fields.lock.expiresAt) > new Date(), 'HOLD_EXPIRED');
                    }
                    if (effect.type === 'Room' && plan.paymentDeadline) {
                        p3Assert(new Date(plan.paymentDeadline) > new Date(), 'HOLD_EXPIRED');
                        filter['lock.expiresAt'] = { $gt: new Date() };
                    }
                    // A single conditional findOneAndUpdate acquires/transfers/releases Room.lock.
                    const changed = await collection.findOneAndUpdate(filter,
                        { $set: { ...effect.fields, p3LastStep: token }, $inc: { version: 1 },
                            ...(effect.remove?.length ? { $unset: Object.fromEntries(effect.remove.map(key => [key, ''])) } : {}) }, { returnDocument: 'after' });
                    p3Assert(changed, effect.type === 'Room' ? 'ROOM_LOCKED' : 'STATE_CONFLICT');
                }
            } else if (effect.kind === 'delete') {
                // Deleting an already absent row is safe when replaying a journal step.
                await collection.deleteOne({ id: effect.id });
            } else if (effect.kind === 'revenue') {
                await p3Reconcile(effect.periodId, effect.employeeRevenueId, effect.companyRevenueId);
            } else if (effect.kind === 'companyRevenue') {
                await p3ReconcileCompany(effect.companyRevenueId);
            }
            await auditCollection.updateOne({ id: op.id }, { $set: { cursor: i + 1 } });
            op.cursor = i + 1;
        }
        const result = p3Labeled(plan.type, p3Clean(await p3Find(plan.type, plan.id)));
        await auditCollection.updateOne({ id: op.id }, { $set: { state: 'DONE', result, finishedAt: new Date() } });
        return result;
    } catch (error) {
        if (plan.compensation && op.cursor && (error.status || error.code === 11000)) {
            await auditCollection.updateOne({ id: op.id }, { $set: { state: 'COMPENSATING', failure: { status: 409, code: 'DEPOSIT_CREATION_COMPENSATED' } } });
            await p3Compensate({ ...op, state: 'COMPENSATING' });
            throw p3Error(409, 'DEPOSIT_CREATION_COMPENSATED');
        }
        if (error.status && !op.cursor) await auditCollection.updateOne({ id: op.id }, { $set: { state: 'FAILED', failure: { status: error.status, code: error.code } } });
        // After the first required write, keep the plan pending and roll forward.
        // Never release money locks merely because an HTTP response failed.
        throw error;
    }
}
async function p3Recover() {
    const pending = await auditCollection.find({ entityType: 'P3Operation', state: { $in: ['PENDING', 'COMPENSATING'] } }).sort({ at: 1 }).toArray();
    for (const op of pending) await p3Run(op);
}
async function p3Compensate(op) {
    const { roomId, depositId, hold } = op.plan.compensation;
    const revenue = op.plan.compensation.revenue;
    if (revenue) {
        await p3Collections.BrokerageTransaction.deleteOne({ id: revenue.transactionId, depositId });
        const rows = await p3Collections.BrokerageTransaction.aggregate([
            { $match: { employeeRevenueId: revenue.employeeRevenueId, status: 'RECOGNIZED' } },
            { $group: { _id: null, revenue: { $sum: '$finalFee' }, transactionCount: { $sum: 1 } } }
        ]).toArray();
        await p3Collections.EmployeeRevenue.updateOne({ id: revenue.employeeRevenueId },
            { $set: { revenue: rows[0]?.revenue || 0, transactionCount: rows[0]?.transactionCount || 0 } });
        await p3ReconcileCompany(revenue.companyRevenueId);
        await p3Collections.PayrollPeriod.updateOne({ id: revenue.periodId }, { $set: { p3Pending: false } });
    }
    const now = new Date(), restore = hold && new Date(hold.expiresAt) > now;
    const lock = restore ? { kind: 'HOLD', refId: hold.id, acquiredAt: hold.paidAt, expiresAt: hold.expiresAt } : null;
    // These filters cannot release a newer reservation. Repeating compensation is safe.
    await roomCollection.updateOne({ id: roomId, 'lock.kind': 'DEPOSIT', 'lock.refId': depositId },
        { $set: { lock, businessStatus: restore ? 'HELD' : 'AVAILABLE', status: restore ? 'HELD' : 'AVAILABLE' }, $inc: { version: 1 } });
    if (hold && !restore) await roomCollection.updateOne({ id: roomId, 'lock.kind': 'HOLD', 'lock.refId': hold.id,
        'lock.expiresAt': { $lte: now } }, { $set: { lock: null, businessStatus: 'AVAILABLE', status: 'AVAILABLE' }, $inc: { version: 1 } });
    if (hold) {
        // Expired paid holds remain ACTIVE until the normal expiry journal records forfeiture.
        await p3Collections.Hold.updateOne({ id: hold.id, creditedToDepositId: depositId, status: 'CONVERTED' },
            { $set: { status: 'ACTIVE', isActive: true, creditedToDepositId: null }, $inc: { version: 1 } });
    }
    await p3Collections.Deposit.updateOne({ id: depositId }, { $set: { status: 'CANCELLED', sourceHoldId: hold?.id || null,
        cancellation: { reason: 'DEPOSIT_CREATION_COMPENSATED', at: op.plan.now } }, $unset: { holdId: '' } });
    const event = { id: `p3-compensated-${op.id}`, entityType: 'Deposit', entityId: depositId,
        actorId: op.actorId, action: 'COMPENSATE', at: now, before: { roomId, holdId: hold?.id },
        after: { status: 'CANCELLED', restoredHold: !!restore } };
    await auditCollection.updateOne({ id: event.id }, { $setOnInsert: event }, { upsert: true });
    const customer = hold ? await customerCollection.findOne({ id: hold.customerId }) : null;
    const targets = await accountCollection.find({ $or: [{ role: 'ADMIN' }, { id: op.actorId }, ...(customer ? [{ id: customer.accountId }] : [])] }).toArray();
    for (const target of targets) {
        const notice = { id: `${event.id}-${target.id}`, dedupeKey: `${event.id}:${target.id}`, accountId: target.id,
            type: 'P3_COMPENSATE', entityType: 'Deposit', entityId: depositId, title: 'Đã phục hồi sau lỗi lập cọc',
            body: 'Hồ sơ cọc không hoàn tất; khóa đã được phục hồi theo hạn giữ chỗ gốc.', createdAt: now, read: false, readAt: null };
        await notificationCollection.updateOne({ dedupeKey: notice.dedupeKey }, { $setOnInsert: notice }, { upsert: true });
    }
    await auditCollection.updateOne({ id: op.id }, { $set: { state: 'FAILED', failure: { status: 409, code: 'DEPOSIT_CREATION_COMPENSATED' } } });
    return null;
}
async function p3ReadBarrier() {
    return p3Serial(async () => { await p3Recover(); await p3Expire(); });
}
async function p3Reconcile(periodId, employeeRevenueId, companyRevenueId) {
    const period = await p3Find('PayrollPeriod', periodId);
    p3Assert(!['CLOSED', 'PAID'].includes(period.status), 'PAYROLL_CLOSED');
    const locked = await p3Collections.PayrollPeriod.findOneAndUpdate({ id: periodId, status: { $nin: ['CLOSED', 'PAID'] },
        version: period.version === undefined ? { $exists: false } : period.version },
        { $inc: { version: 1 }, $set: { p3Pending: true } }, { returnDocument: 'after' });
    p3Assert(locked, 'PAYROLL_CHANGED');
    for (const [type, field, id] of [['EmployeeRevenue', 'employeeRevenueId', employeeRevenueId], ['CompanyRevenue', 'companyRevenueId', companyRevenueId]]) {
        const rows = await p3Collections.BrokerageTransaction.aggregate([
            { $match: { [field]: id, status: 'RECOGNIZED' } },
            { $group: { _id: null, revenue: { $sum: '$finalFee' }, transactionCount: { $sum: 1 } } }
        ]).toArray();
        if (type === 'CompanyRevenue') await p3ReconcileCompany(id);
        else await p3Collections[type].updateOne({ id }, { $set: { revenue: rows[0]?.revenue || 0, transactionCount: rows[0]?.transactionCount || 0 }, $inc: { version: 1 } });
    }
    await p3Collections.PayrollPeriod.updateOne({ id: periodId, version: locked.version }, { $set: { p3Pending: false } });
}
async function p3ReconcileCompany(id) {
    const transactions = await p3Collections.BrokerageTransaction.aggregate([
        { $match: { companyRevenueId: id, status: 'RECOGNIZED' } },
        { $group: { _id: null, revenue: { $sum: '$finalFee' }, count: { $sum: 1 } } }
    ]).toArray();
    const holds = await p3Collections.Hold.aggregate([
        { $match: { companyRevenueId: id, status: 'FORFEITED' } },
        { $group: { _id: null, revenue: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]).toArray();
    // Late hold transfers (paid after the hold expired) are kept by the company too (user rule 16/11/2026).
    const late = await p3Collections.Payment.aggregate([
        { $match: { companyRevenueId: id, status: 'LATE_PAID' } },
        { $group: { _id: null, revenue: { $sum: '$amount' }, count: { $sum: 1 } } }
    ]).toArray();
    // forfeitedHoldRevenue = all hold money kept by the company (forfeited holds + late transfers); P5 reads this field.
    const kept = (holds[0]?.revenue || 0) + (late[0]?.revenue || 0);
    await p3Collections.CompanyRevenue.updateOne({ id }, { $set: {
        revenue: (transactions[0]?.revenue || 0) + kept, transactionCount: transactions[0]?.count || 0,
        forfeitedHoldRevenue: kept, forfeitedHoldCount: (holds[0]?.count || 0) + (late[0]?.count || 0),
        latePaidRevenue: late[0]?.revenue || 0, latePaidCount: late[0]?.count || 0 }, $inc: { version: 1 } });
}
async function p3Expire() {
    const now = new Date();
    const expired = await p3Collections.Hold.find({ status: { $in: ['PAYMENT_PENDING', 'ACTIVE'] }, expiresAt: { $lte: now } }).toArray();
    for (const hold of expired) {
        const opId = `p3-expire-${hold.id}-${hold.version || 0}`;
        const plan = Object.assign(p3Plan('Hold', hold.id), { opId, now, actorId: null });
        const room = await roomCollection.findOne({ id: hold.roomId });
        if (hold.status === 'ACTIVE') await p3Forfeit(plan, hold);
        else await p3Change(plan, 'Hold', hold, { status: 'EXPIRED', isActive: false }, { status: hold.status });
        if (room?.lock?.kind === 'HOLD' && room.lock.refId === hold.id) {
            await p3Room(plan, room, null, { 'lock.kind': 'HOLD', 'lock.refId': hold.id });
            if (hold.status === 'ACTIVE') await p3Change(plan, 'Room', room, { publicationStatus: 'PUBLISHED' });
        }
        const op = { id: opId, entityType: 'P3Operation', state: 'PENDING', at: now, cursor: 0, plan };
        await auditCollection.updateOne({ id: opId }, { $setOnInsert: op }, { upsert: true });
        await p3Run(op);
    }
}
function p3Route(handler) {
    return async (req, res) => {
        try { await p3Serial(async () => { await p3Recover(); await p3Expire(); await handler(req, res); }); }
        catch (error) { res.status(error.status || 503).send({ code: error.code || 'RECOVERY_PENDING', message: error.message }); }
    };
}
function p3Write(action) {
    return async (req, res) => {
        try {
            let result = await p3Serial(async () => {
                await p3Recover(); await p3Expire();
                const key = req.get('Idempotency-Key');
                p3Assert(typeof key === 'string' && key.length >= 8 && key.length <= 160, 'IDEMPOTENCY_KEY_REQUIRED', 400);
                const fingerprint = crypto.createHash('sha256').update(JSON.stringify(p3Stable({ action, path: req.path, actor: req.p2Account.id, body: req.body || {} }))).digest('hex');
                let op = await auditCollection.findOne({ p3Key: key });
                if (op) {
                    p3Assert(op.fingerprint === fingerprint, 'IDEMPOTENCY_CONFLICT');
                    if (op.state === 'FAILED') throw p3Error(op.failure.status, op.failure.code);
                    return op.state === 'DONE' ? op.result : p3Run(op);
                }
                const now = new Date(), opId = `p3-op-${crypto.randomUUID()}`;
                const context = { opId, now, actorId: req.p2Account.id, employeeId: req.p2Employee?.id };
                const plan = Object.assign(await p3Prepare(action, req, context), context);
                op = { id: opId, entityType: 'P3Operation', entityId: plan.id, action, actorId: context.actorId,
                    at: now, p3Key: key, fingerprint, state: 'PENDING', cursor: 0, plan };
                await auditCollection.insertOne(op);
                const value = await p3Run(op);
                // A recovered cancellation can cross the original hold deadline.
                // Expire it before this request releases the P3 queue.
                await p3Expire();
                return value;
            });
            if (action === 'payosLink') result = await p3Serial(async () => {
                await p3Recover(); await p3Expire();
                return payosEnsureLink(result.id);
            });
            res.status(['createHold', 'createDeposit', 'createContract'].includes(action) ? 201 : 200).send(result);
        } catch (error) {
            res.status(error.status || (error.code === 11000 ? 409 : 503)).send({
                code: error.code === 11000 ? 'DUPLICATE_RECORD' : error.code || 'RECOVERY_PENDING', message: error.message,
                retryWithSameKey: !error.status && error.code !== 11000
            });
        }
    };
}

// Create a slug from a Vietnamese name
function createSlug(name) {
    return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[đĐ]/g, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

// Connect database before starting server
if (require.main === module) client.connect().then(async () => {
    await roomCollection.createIndex({ id: 1 }, { unique: true });
    await roomCollection.createIndex({ code: 1 }, { unique: true });
    await roomCollection.createIndex({ slug: 1 }, { unique: true, sparse: true });
    await accountCollection.createIndex({ phone: 1 }, { unique: true });
    await accountCollection.createIndex({ username: 1 }, { unique: true, partialFilterExpression: { username: { $type: 'string' } } });
    await accountRoleCollection.createIndex({ accountId: 1, roleId: 1 }, { unique: true });
    await customerCollection.createIndex({ accountId: 1 }, { unique: true });
    await customerCollection.createIndex({ 'identity.number': 1 }, { unique: true, partialFilterExpression: { 'identity.number': { $type: 'string' } } });
    await favoriteCollection.createIndex({ customerId: 1, roomId: 1 }, { unique: true });
    await viewingDetailCollection.createIndex({ viewingId: 1, roomId: 1 }, { unique: true });
    await viewingDetailCollection.createIndex({ viewingId: 1, order: 1 }, { unique: true });
    await viewingCollection.createIndex({ customerId: 1, startAt: -1 });
    await contactCollection.createIndex({ phone: 1, createdAt: -1 });
    await contactCollection.createIndex({ dedupeHash: 1 }, { unique: true });
    await notificationCollection.createIndex({ dedupeKey: 1 }, { unique: true });
    await notificationCollection.createIndex({ accountId: 1, createdAt: -1 });
    await initializeP3();
    await initializeP4();
    await initializeP5();
    await initializeP6();
    app.listen(port, () => {
        console.log(`My Server listening on port ${port}`);
    });
}).catch(async (error) => {
    console.error(error.message);
    process.exitCode = 1;
    await client.close();
});

// Catalog recovery must precede P2 writes and authentication as well as /data reads.
app.use(async (req, res, next) => {
    try { await p6Barrier(); next(); }
    catch (error) { res.status(503).send({ code: 'CATALOG_RECOVERY_REQUIRED', message: error.message }); }
});
// P5 recovery barrier also protects existing P3/P4 routes after an interrupted payroll write.
app.use('/data', async (req, res, next) => {
    try { await p5Barrier(); next(); }
    catch (error) { res.status(503).send({ code: 'PAYROLL_RECOVERY_REQUIRED', message: error.message }); }
});

app.get('/', cors(), async (req, res) => {
    try {
        res.send('This Web server is processed for MongoDB (iHOUZZ Uni)');
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

async function roomReadFilter(req) {
    const sessionId = req.session?.user?.id;
    const account = sessionId && ObjectId.isValid(sessionId)
        ? await accountCollection.findOne({ _id: new ObjectId(sessionId), status: 'ACTIVE' }) : null;
    return ['ADMIN', 'EMPLOYEE'].includes(account?.role)
        ? {} : { status: 'AVAILABLE', publicationStatus: 'PUBLISHED' };
}
app.get('/data/rooms', cors(), async (req, res) => {
    try {
        await p3ReadBarrier();
        const result = await roomCollection.find(await roomReadFilter(req), { projection: { _id: 0 } }).toArray();
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

app.get('/data/rooms/search', cors(), async (req, res) => {
    try {
        await p3ReadBarrier();
        if (req.query.q !== undefined && typeof req.query.q !== 'string') {
            return res.status(400).send({ message: 'q must be a string' });
        }
        // Treat search text as a literal regular expression
        const query = (req.query.q || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const result = await roomCollection.find({
            ...await roomReadFilter(req),
            $or: [{ name: { $regex: query, $options: 'i' } },
                { description: { $regex: query, $options: 'i' } }]
        }, { projection: { _id: 0 } }).toArray();
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

app.get('/data/rooms/slug/:slug', cors(), async (req, res) => {
    try {
        await p3ReadBarrier();
        const result = await roomCollection.findOne(
            { slug: req.params.slug, ...await roomReadFilter(req) }, { projection: { _id: 0 } }
        );
        if (!result) return res.status(404).send({ code: 'ROOM_UNAVAILABLE', message: 'Phòng hiện không còn trống hoặc tin đã ngừng đăng.' });
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

app.get('/data/rooms/:id', cors(), async (req, res) => {
    try {
        await p3ReadBarrier();
        const result = await roomCollection.findOne(
            { id: req.params.id, ...await roomReadFilter(req) }, { projection: { _id: 0 } }
        );
        if (!result) return res.status(404).send({ code: 'ROOM_UNAVAILABLE', message: 'Phòng hiện không còn trống hoặc tin đã ngừng đăng.' });
        res.send({ ...result, hasHistory: await p6RoomHasHistory(result), hasActiveFlow: await roomHasActiveFlow(result.id) });
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

app.post('/data/rooms', cors(), requireRole('ADMIN'), p6Route(async (req, res) => {
    res.status(201).send(await p6Execute(req, plan => p6SaveRoom(req, plan, null)));
}));
app.put('/data/rooms', cors(), requireRole('ADMIN'), p6Route(async (req, res) => {
    res.send(await p6Execute(req, async plan => p6SaveRoom(req, plan, await p6Get('Room', req.body?.id))));
}));
app.delete('/data/rooms/:id', cors(), requireRole('ADMIN'), p6Route(async (req, res) => {
    await p3Expire();
    res.send(await p6Execute(req, async plan => p6DeleteRoom(plan, await p6Get('Room', req.params.id))));
}));

app.get('/data/properties', cors(), async (req, res) => {
    try {
        const result = await propertyCollection.find({}, { projection: { _id: 0 } }).toArray();
        res.send(result.map(p6Safe));
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

app.get('/data/schools', cors(), async (req, res) => {
    try {
        const result = await schoolCollection.find({}, { projection: { _id: 0 } }).toArray();
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

app.get('/data/property-schools', cors(), async (req, res) => {
    try {
        const result = await propertySchoolCollection.find({}, { projection: { _id: 0 } }).toArray();
        res.send(result);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

app.post('/user-login', cors(), async (req, res) => {
    try {
        const { phone, password, rememberMe } = req.body || {};
        if (typeof phone !== 'string' || typeof password !== 'string') {
            return res.status(401).send({ message: 'Wrong phone or password' });
        }
        const normalizedPhone = normalizePhone(phone);
        const account = await accountCollection.findOne(validPhone(normalizedPhone)
            ? { phone: normalizedPhone } : { username: phone.trim().toLowerCase() });
        if (!account || account.status !== 'ACTIVE') return res.status(401).send({ message: 'Wrong phone or password' });
        const passwordHash = crypto.scryptSync(password, account.salt, 64);
        const storedHash = Buffer.from(account.passwordHash, 'hex');
        if (storedHash.length !== passwordHash.length || !crypto.timingSafeEqual(passwordHash, storedHash)) {
            return res.status(401).send({ message: 'Wrong phone or password' });
        }
        // Each app only signs in its own role (staff accounts are issued by the company).
        const portal = portalOf(req);
        if (portal && portalRoles[portal] !== account.role) {
            return res.status(403).send({ code: 'WRONG_PORTAL', message: 'This account cannot sign in to this portal' });
        }
        // Renew the session and keep the selected rooms
        const viewingCart = req.session.viewingCart || [];
        await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
        req.session.user = {
            id: account._id.toString(), phone: account.phone, role: account.role, name: account.name,
            ...(typeof account.username === 'string' ? { username: account.username } : {})
        };
        req.session.viewingCart = viewingCart;
        await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
        if (rememberMe === true) {
            res.cookie(rememberCookieName(portal), account.phone, {
                maxAge: 30 * 24 * 60 * 60 * 1000,
                httpOnly: false, secure: false, sameSite: 'lax'
            });
        } else {
            res.clearCookie(rememberCookieName(portal), { sameSite: 'lax', secure: false });
        }
        res.send({ message: 'Login successful!', user: req.session.user });
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

app.get('/auth/profile', cors(), async (req, res) => {
    if (!req.session.user) return res.status(401).send({ message: 'Login required' });
    res.send(req.session.user);
});

app.post('/auth/logout', cors(), async (req, res) => {
    try {
        await new Promise((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
        res.clearCookie(sessionCookieName(portalOf(req)), { httpOnly: true, sameSite: 'lax', secure: false });
        res.send({ message: 'Logout successful!' });
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

app.post('/viewing-cart/add', cors(), async (req, res) => {
    try {
        const { roomId } = req.body || {};
        if (typeof roomId !== 'string' || !roomId.trim()) {
            return res.status(400).send({ message: 'roomId is required' });
        }
        const room = await roomCollection.findOne({ id: roomId });
        if (!room) return res.status(404).send({ message: 'Room not found' });
        const cart = req.session.viewingCart || [];
        if (!cart.includes(roomId)) cart.push(roomId);
        req.session.viewingCart = cart;
        await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
        res.send(cart);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

app.get('/viewing-cart', cors(), async (req, res) => {
    res.send(req.session.viewingCart || []);
});

app.delete('/viewing-cart/:roomId', cors(), async (req, res) => {
    try {
        req.session.viewingCart = (req.session.viewingCart || []).filter(id => id !== req.params.roomId);
        await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
        res.send(req.session.viewingCart);
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

// P2 uses the DATA-01 business IDs for FKs, except Viewing.customerId (Account ObjectId).
function normalizePhone(value) {
    return typeof value === 'string' ? value.trim().replace(/^\+84/, '0') : '';
}
function validPhone(value) {
    return /^0\d{9}$/.test(value);
}
function newRecord(prefix, fields) {
    const _id = new ObjectId();
    return { _id, id: `${prefix}-${_id}`, ...fields };
}
function publicRecord(record) {
    const { _id, ...result } = record;
    return { ...result, id: record.id || _id.toString() };
}
function recordFilter(id) {
    return ObjectId.isValid(id) ? { $or: [{ id }, { _id: new ObjectId(id) }] } : { id };
}
function requireRole(...roles) {
    return async (req, res, next) => {
        try {
            if (!req.session.user || !ObjectId.isValid(req.session.user.id)) {
                return res.status(401).send({ message: 'Login required' });
            }
            const account = await accountCollection.findOne({ _id: new ObjectId(req.session.user.id) });
            if (!account || account.status !== 'ACTIVE') {
                return res.status(401).send({ message: 'Active account required' });
            }
            // Resolve current role from the database, never from request body or a stale session role.
            if (roles.length && !roles.includes(account.role)) {
                return res.status(403).send({ message: 'Role not allowed' });
            }
            req.p2Account = account;
            if (account.role === 'CUSTOMER' && roles.includes('CUSTOMER')) {
                req.p2Customer = await customerCollection.findOne({ accountId: account.id });
                if (!req.p2Customer) return res.status(404).send({ message: 'Customer not found' });
            }
            if (account.role === 'EMPLOYEE' && roles.includes('EMPLOYEE')) {
                req.p2Employee = await employeeCollection.findOne({ accountId: account.id, status: 'ACTIVE' });
                if (!req.p2Employee) return res.status(403).send({ message: 'Active employee required' });
            }
            next();
        } catch (error) {
            res.status(500).send({ message: error.message });
        }
    };
}
// One local Express process / standalone MongoDB: serialize P2 writes, including deduplication
// and the Viewing/ViewingDetail mirror. This is not a distributed transaction.
let p2WriteQueue = Promise.resolve();
function p2Write(handler) {
    return async (req, res) => {
        // P6 takes P4 before P2. Viewing writes use the same order, so a P2→P4
        // bridge never holds P2 while waiting for a P6 operation to release P4.
        if (!req.p4Locked && /^\/(viewings\/|viewing-details\/|viewing-cart\/checkout\/?$)/.test(req.route?.path || req.path)) {
            return p4Serial(async () => {
                req.p4Locked = true;
                try { await p2Write(handler)(req, res); }
                finally { delete req.p4Locked; }
            });
        }
        const previous = p2WriteQueue;
        let release;
        p2WriteQueue = new Promise(resolve => { release = resolve; });
        await previous;
        try {
            if (req.p4Locked) await p4Recover();
            await handler(req, res);
        } catch (error) {
            if (req.p4Locked) {
                res.status(error.status || (error.code === 11000 ? 409 : 500)).send({
                    code: error.code || 'P4_ERROR',
                    ...(error.roomId ? { roomId: error.roomId } : {}),
                    message: error.status ? p4Message(error.code) : error.code === 11000 ? 'Bản ghi đã tồn tại.' : 'Không thực hiện được thao tác. Vui lòng tải lại và thử lại.'
                });
            } else {
                res.status(error.code === 11000 ? 409 : 500).send({
                    message: error.code === 11000 ? 'Record already exists' : error.message
                });
            }
        } finally {
            release();
        }
    };
}
async function audit(req, entityType, entityId, action, before, after) {
    await auditCollection.insertOne(newRecord('nk', {
        entityType, entityId, action, actorId: req.p2Account?.id || null,
        at: new Date(), before, after
    }));
}
async function notify(req, accountId, type, entityType, entityId, title, body, eventId) {
    const dedupeKey = `${accountId}:${eventId}`;
    const record = newRecord('tb', {
        accountId, type, entityType, entityId, title, body, read: false, readAt: null,
        createdAt: new Date(), dedupeKey
    });
    const result = await notificationCollection.updateOne({ dedupeKey }, { $setOnInsert: record }, { upsert: true });
    if (result.upsertedCount) await audit(req, 'Notification', record.id, 'CREATE', null, publicRecord(record));
}
async function notifyAdmins(req, type, entityType, entityId, title, eventId) {
    const admins = await accountCollection.find({ role: 'ADMIN', status: 'ACTIVE' }).toArray();
    for (const admin of admins) {
        await notify(req, admin.id, type, entityType, entityId, title, title, eventId);
    }
}
async function notifyViewing(req, viewing, type, title, eventId) {
    const customer = await customerCollection.findOne({ id: viewing.customerProfileId });
    if (customer) await notify(req, customer.accountId, type, 'Viewing', viewing.id, title, title, eventId);
    if (viewing.employeeId) {
        const employee = await employeeCollection.findOne({ id: viewing.employeeId });
        if (employee) await notify(req, employee.accountId, type, 'Viewing', viewing.id, title, title, eventId);
    }
}
async function changeViewing(req, before, fields, action) {
    const after = { ...before, ...fields, updatedAt: new Date(), version: (before.version || 0) + 1 };
    await viewingCollection.replaceOne({ _id: before._id }, after);
    await audit(req, 'Viewing', before.id, action, publicRecord(before), publicRecord(after));
    return after;
}
async function viewingRecords(records) {
    return Promise.all(records.map(record => p4ViewingOut(record)));
}

app.post('/user-register', cors(), p2Write(async (req, res) => {
    // Only customers register themselves; staff accounts are issued by the company.
    if (portalOf(req) && portalOf(req) !== 'customer') {
        return res.status(403).send({ code: 'WRONG_PORTAL', message: 'Registration is only available to customers' });
    }
    const { password, name, email } = req.body || {};
    const rawUsername = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const username = rawUsername.toLowerCase();
    const phone = normalizePhone(req.body?.phone);
    // Username is optional (registration form no longer asks for it); validated only when sent.
    if ((rawUsername && !/^[A-Za-z][A-Za-z0-9_-]{2,29}$/.test(rawUsername))
        || !validPhone(phone) || typeof password !== 'string' || password.length < 8 || password.length > 128
        || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100
        || (email !== undefined && (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))) {
        return res.status(400).send({ message: 'Invalid username, phone, password, name or email' });
    }
    if (username && await accountCollection.findOne({ username })) {
        return res.status(409).send({ code: 'USERNAME_TAKEN', message: 'Username already registered' });
    }
    if (await accountCollection.findOne({ phone })) {
        return res.status(409).send({ code: 'PHONE_TAKEN', message: 'Phone already registered' });
    }
    const now = new Date();
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = await new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(key.toString('hex')));
    });
    const account = newRecord('tk-kh', {
        ...(username ? { username } : {}), phone, name: name.trim(), fullName: name.trim(), role: 'CUSTOMER', status: 'ACTIVE',
        roles: [{ role: 'CUSTOMER', assignedAt: now }], salt, passwordHash,
        ...(email ? { email: email.trim() } : {}), createdAt: now, updatedAt: now
    });
    const role = newRecord('vaitro', { accountId: account.id, roleId: 'CUSTOMER', assignedAt: now });
    const customer = newRecord('kh', { accountId: account.id, fullName: account.name, phone, createdAt: now });
    try {
        await accountCollection.insertOne(account);
        await accountRoleCollection.insertOne(role);
        await customerCollection.insertOne(customer);
    } catch (error) {
        // Compensate only records created by this request on standalone MongoDB.
        await customerCollection.deleteOne({ _id: customer._id });
        await accountRoleCollection.deleteOne({ _id: role._id });
        await accountCollection.deleteOne({ _id: account._id });
        if (error.code === 11000 && (error.keyPattern?.username || error.keyValue?.username !== undefined)) {
            return res.status(409).send({ code: 'USERNAME_TAKEN', message: 'Username already registered' });
        }
        if (error.code === 11000 && (error.keyPattern?.phone || error.keyValue?.phone !== undefined)) {
            return res.status(409).send({ code: 'PHONE_TAKEN', message: 'Phone already registered' });
        }
        throw error;
    }
    req.p2Account = account;
    await audit(req, 'Account', account.id, 'CREATE', null, { username, phone, name: account.name, role: 'CUSTOMER' });
    await audit(req, 'AccountRole', role.id, 'CREATE', null, { accountId: account.id, roleId: 'CUSTOMER' });
    await audit(req, 'Customer', customer.id, 'CREATE', null, publicRecord(customer));
    const cart = req.session.viewingCart || [];
    await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
    req.session.user = { id: account._id.toString(), username, phone, name: account.name, role: 'CUSTOMER' };
    req.session.viewingCart = cart;
    await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
    res.status(201).send({ user: req.session.user });
}));

app.get('/favorites', cors(), requireRole('CUSTOMER'), async (req, res) => {
    try {
        const result = await favoriteCollection.find({ customerId: req.p2Customer.id }).sort({ createdAt: -1 }).toArray();
        res.send(result.map(publicRecord));
    } catch (error) { res.status(500).send({ message: error.message }); }
});
app.post('/favorites', cors(), requireRole('CUSTOMER'), p2Write(async (req, res) => {
    const { roomId } = req.body || {};
    if (typeof roomId !== 'string' || !roomId) return res.status(400).send({ message: 'roomId required' });
    const room = await roomCollection.findOne({ id: roomId, publicationStatus: 'PUBLISHED' });
    if (!room) return res.status(404).send({ message: 'Room not found' });
    const key = { customerId: req.p2Customer.id, roomId };
    let favorite = await favoriteCollection.findOne(key);
    if (!favorite) {
        favorite = newRecord('yt', { ...key, createdAt: new Date() });
        await favoriteCollection.insertOne(favorite);
        await audit(req, 'Favorite', favorite.id, 'CREATE', null, publicRecord(favorite));
    }
    res.send(publicRecord(favorite));
}));
app.delete('/favorites/:roomId', cors(), requireRole('CUSTOMER'), p2Write(async (req, res) => {
    const favorite = await favoriteCollection.findOneAndDelete({ customerId: req.p2Customer.id, roomId: req.params.roomId });
    if (favorite) await audit(req, 'Favorite', favorite.id, 'DELETE', publicRecord(favorite), null);
    res.send({ roomId: req.params.roomId, removed: !!favorite });
}));

app.post('/contact-requests', cors(), p2Write(async (req, res) => {
    const { name, email, message } = req.body || {};
    const phone = normalizePhone(req.body?.phone);
    if (typeof name !== 'string' || !name.trim() || name.length > 100 || !validPhone(phone)
        || typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
        || typeof message !== 'string' || message.trim().length < 10 || message.length > 2000) {
        return res.status(400).send({ message: 'Invalid consultation details' });
    }
    const normalizedMessage = message.trim().replace(/\s+/g, ' ').toLowerCase();
    const now = new Date();
    const recent = await contactCollection.find({ phone, createdAt: { $gt: new Date(now.getTime() - 60000) } }).toArray();
    if (recent.some(item => item.message.trim().replace(/\s+/g, ' ').toLowerCase() === normalizedMessage)) {
        return res.status(409).send({ message: 'Yêu cầu tư vấn này đã được gửi trong phút vừa qua.' });
    }
    const contact = newRecord('tv', {
        name: name.trim(), phone, email: email.trim(), message: message.trim(), status: 'PENDING',
        respondedBy: null, createdAt: now,
        dedupeHash: crypto.createHash('sha256').update(`${phone}:${normalizedMessage}:${crypto.randomUUID()}`).digest('hex')
    });
    if (req.session.user && ObjectId.isValid(req.session.user.id)) {
        req.p2Account = await accountCollection.findOne({ _id: new ObjectId(req.session.user.id), status: 'ACTIVE' });
    }
    await contactCollection.insertOne(contact);
    await audit(req, 'ContactRequest', contact.id, 'CREATE', null, publicRecord(contact));
    await notifyAdmins(req, 'CONTACT_REQUEST', 'ContactRequest', contact.id, 'Có yêu cầu tư vấn mới', contact.id);
    res.status(201).send(publicRecord(contact));
}));
app.get('/contact-requests', cors(), requireRole('ADMIN'), async (req, res) => {
    try {
        res.send((await contactCollection.find({}).sort({ createdAt: -1 }).toArray()).map(publicRecord));
    } catch (error) { res.status(500).send({ message: error.message }); }
});
app.put('/contact-requests/:id', cors(), requireRole('ADMIN'), p2Write(async (req, res) => {
    const { status, employeeId } = req.body || {};
    if (!['PENDING', 'RESPONDED'].includes(status)
        || !(employeeId === null || (typeof employeeId === 'string' && employeeId.trim()))) {
        return res.status(400).send({ message: 'Invalid status or employeeId' });
    }
    const before = await contactCollection.findOne(recordFilter(req.params.id));
    if (!before) return res.status(404).send({ message: 'Contact request not found' });
    if (employeeId && !await employeeCollection.findOne({ id: employeeId, status: 'ACTIVE' })) {
        return res.status(404).send({ message: 'Employee not found' });
    }
    if (status === 'RESPONDED' && !employeeId) return res.status(400).send({ message: 'employeeId required for RESPONDED' });
    const after = { ...before, status, respondedBy: employeeId, updatedAt: new Date() };
    await contactCollection.replaceOne({ _id: before._id }, after);
    await audit(req, 'ContactRequest', before.id, 'UPDATE', publicRecord(before), publicRecord(after));
    res.send(publicRecord(after));
}));

app.get('/viewings/availability', cors(), requireRole('CUSTOMER'), p4Route(async (req, res) => {
    const { date, excludeViewingId } = req.query;
    p4Require(p3Date(date), 'INVALID_VIEWING_DATE', 400);
    let excluded;
    if (excludeViewingId !== undefined) {
        p4Require(typeof excludeViewingId === 'string' && excludeViewingId, 'VIEWING_NOT_FOUND', 404);
        excluded = await p4OwnedViewing(req, excludeViewingId);
    }
    // Load once, evaluate 16 slots in memory (same rules as p4ViewingConflict / p4EmployeeFreeAt).
    const now = new Date(), slots = [];
    const [shifts, assignments, employees, viewings, periods] = await Promise.all(['Shift', 'ShiftAssignment', 'Employee', 'Viewing', 'RegistrationPeriod']
        .map(type => p4Records(type)));
    const finalizedPeriods = new Set(periods.filter(p => p.status === 'FINALIZED').map(p => p.id));
    const activeEmployees = new Set(employees.filter(e => e.status === 'ACTIVE').map(e => e.id));
    const live = viewings.filter(v => v.id !== excluded?.id && ['CHO_XAC_NHAN', 'DA_XAC_NHAN'].includes(v.status));
    for (const time of p4ViewingTimes()) {
        const viewing = p4ViewingSchedule(date, time), at = +viewing.startAt;
        const sameTime = live.filter(v => +new Date(v.startAt) === at);
        const shift = shifts.filter(s => new Date(s.startsAt) <= viewing.startAt && new Date(s.endsAt) >= viewing.endAt)
            .sort((a, b) => a.id.localeCompare(b.id))[0];
        // Week not finalized yet → bookable, guide shown after the period is finalized.
        const pendingGuide = !shift || !finalizedPeriods.has(shift.periodId);
        let reason = null;
        if (viewing.startAt <= now) reason = 'PAST';
        else if (sameTime.some(v => String(v.customerId) === String(req.p2Account._id))) reason = 'MINE';
        else if (!pendingGuide && !assignments.some(a => a.shiftId === shift.id && ['REGISTERED', 'IN_PROGRESS'].includes(a.status)
            && activeEmployees.has(a.employeeId) && !sameTime.some(v => v.employeeId === a.employeeId))) reason = 'NO_STAFF';
        slots.push({ time, available: !reason, reason, pendingGuide: !reason && pendingGuide });
    }
    res.send({ date, slots });
}));
app.get('/viewings/mine', cors(), requireRole('CUSTOMER'), async (req, res) => {
    try {
        await p3ReadBarrier();
        const result = await viewingCollection.find({ customerId: req.p2Account._id, customerProfileId: req.p2Customer.id })
            .sort({ startAt: -1 }).toArray();
        res.send(await viewingRecords(result));
    } catch (error) { res.status(500).send({ code: 'P4_ERROR', message: p4Message('P4_ERROR') }); }
});
app.put('/viewings/:id', cors(), requireRole('CUSTOMER'), p2Write(async (req, res) => {
    const viewing = await p4OwnedViewing(req, req.params.id);
    res.send(await p4RunFromP2(req, `editViewing:${viewing.id}`, async plan => {
        p4Require(p4ActiveViewing(viewing, plan.at), 'VIEWING_LOCKED');
        const body = req.body || {}, note = body.note === undefined ? viewing.note || '' : body.note;
        p4Require(typeof note === 'string' && note.length <= 1000, 'INVALID_VIEWING_DETAILS', 400);
        const schedule = p4ViewingSchedule(body.date === undefined ? viewing.date : body.date,
            body.startTime === undefined ? viewing.startTime : body.startTime);
        p4Require(schedule.startAt > plan.at, 'VIEWING_PAST', 400);
        let after = { ...viewing, ...schedule, note, status: 'DA_XAC_NHAN' };
        p4Require(!await p4ViewingConflict(plan, after), 'VIEWING_TIME_CONFLICT');
        const timeChanged = +schedule.startAt !== +new Date(viewing.startAt);
        const shift = await p4ViewingShift(after, plan);
        // Week not finalized yet → still confirmed, guide pending until the period is finalized.
        const finalized = await p4ViewingFinalized(plan, shift);
        let target = null;
        if (timeChanged && finalized) {
            target = await p4EmployeeFreeAt(plan, viewing.employeeId, after, shift)
                || await p4PickViewingEmployee(plan, after, shift);
            p4Require(target, 'SLOT_NO_STAFF');
        }
        let task = await p4EnsureViewingTask(plan, viewing, false);
        after = p4Set(plan, 'Viewing', viewing, { ...schedule, note, status: 'DA_XAC_NHAN',
            taskId: task.id, employeeId: viewing.employeeId || null, updatedAt: plan.at, version: (viewing.version || 0) + 1 });
        task = p4Set(plan, 'Task', task, { scheduledAt: after.startAt, scheduledEndAt: after.endAt,
            description: await p4ViewingDescription(after, plan), currentShiftId: shift?.id || null });
        if (timeChanged) {
            const { links, rows, current } = await p4TaskRows(task.id, plan);
            const detach = () => {
                for (const row of rows.filter(r => !r.removed && !r.transferredTo)) p4Set(plan, 'TaskAssignment', row,
                    { removed: true, removedAt: plan.at, removedBy: plan.actorId, removeReason: 'RESCHEDULE', waitingAdmin: false });
                for (const link of links.filter(l => !l.removed)) p4Set(plan, 'TaskShift', link,
                    { removed: true, removedAt: plan.at, removedBy: plan.actorId, removeReason: 'RESCHEDULE' });
            };
            if (!target) {
                detach();
                if (task.status !== 'WAITING_ADMIN') task = p4Set(plan, 'Task', task, { status: 'WAITING_ADMIN' });
            } else if (viewing.employeeId !== target.employeeId || !current.some(r => r.assignmentId === target.id)
                || !links.some(l => !l.removed && l.shiftId === shift.id && current.some(r => (r.taskShiftId || r.shiftLinkId) === l.id))) {
                detach();
                const link = p4New(plan, 'TaskShift', { taskId: task.id, shiftId: shift.id, linkedAt: plan.at,
                    reason: 'RESCHEDULE', fromShiftId: viewing.taskId ? links.at(-1)?.shiftId || null : null, by: plan.actorId });
                p4New(plan, 'TaskAssignment', { taskId: task.id, taskShiftId: link.id, shiftLinkId: link.id,
                    assignmentId: target.id, employeeId: target.employeeId, personalStatus: 'TODO', doneAt: null });
                task = p4Set(plan, 'Task', task, { status: 'TODO' });
            }
            const eventId = `viewing-reschedule:${viewing.id}:${(viewing.version || 0) + 1}`;
            after = await p4ViewingAssigned(plan, task, after, target?.employeeId || null, eventId, false);
            if (target && viewing.employeeId === target.employeeId) {
                const employee = (await p4Records('Employee', plan)).find(e => e.id === target.employeeId);
                await p4Notify(plan, employee?.accountId, 'VIEWING_RESCHEDULED', 'Viewing', viewing.id,
                    'Lịch xem đã đổi giờ', `Lịch xem đã đổi giờ từ ${p4ViewingTime(viewing)} sang ${p4ViewingTime(after)}.`, eventId);
            }
        }
        return p4ViewingOut(after, plan);
    }));
}));
app.delete('/viewings/:id', cors(), requireRole('CUSTOMER'), p2Write(async (req, res) => {
    const viewing = await p4OwnedViewing(req, req.params.id);
    res.send(await p4RunFromP2(req, `deleteViewing:${viewing.id}`, async plan => {
        p4Require(p4ActiveViewing(viewing, plan.at), 'VIEWING_LOCKED');
        const eventId = `viewing-delete:${viewing.id}`, title = `Khách hàng đã xóa lịch xem ${p4ViewingTime(viewing)}`;
        const employee = viewing.employeeId && (await p4Records('Employee', plan)).find(e => e.id === viewing.employeeId);
        for (const accountId of new Set([employee?.accountId,
            ...(await p4Records('Account', plan)).filter(a => a.role === 'ADMIN' && a.status === 'ACTIVE').map(a => a.id)].filter(Boolean))) {
            await p4Notify(plan, accountId, 'VIEWING_DELETED', 'Viewing', viewing.id, title, title, eventId);
        }
        for (const task of (await p4Records('Task', plan)).filter(t => t.kind === 'VIEWING'
            && (t.viewingId === viewing.id || t.id === viewing.taskId))) {
            const { rows, links } = await p4TaskRows(task.id, plan);
            for (const row of rows) p4Remove(plan, 'TaskAssignment', row);
            for (const link of links) p4Remove(plan, 'TaskShift', link);
            p4Remove(plan, 'Task', task);
        }
        for (const detail of (await p4Records('ViewingDetail', plan)).filter(d => d.viewingId === viewing.id)) p4Remove(plan, 'ViewingDetail', detail);
        p4Remove(plan, 'Viewing', viewing);
        return { deleted: true, id: viewing.id };
    }));
}));
app.put('/viewings/:id/cancel', cors(), requireRole('CUSTOMER'), p2Write(async (req, res) => {
    const viewing = await viewingCollection.findOne(recordFilter(req.params.id));
    if (!viewing) return res.status(404).send({ message: 'Không tìm thấy lịch xem phòng.' });
    if (!viewing.customerId.equals(req.p2Account._id) || viewing.customerProfileId !== req.p2Customer.id) {
        return res.status(403).send({ message: 'Lịch xem thuộc khách hàng khác.' });
    }
    if (!['CHO_XAC_NHAN', 'DA_XAC_NHAN'].includes(viewing.status)) {
        return res.status(409).send({ message: 'Không thể hủy lịch xem ở trạng thái hiện tại.' });
    }
    const after = await p4RunFromP2(req, `cancelViewing:${viewing.id}`, async plan => {
        const task = await p4EnsureViewingTask(plan, viewing, false);
        p4Set(plan, 'Task', task, { status: 'CANCELLED', cancelledAt: plan.at, cancelledBy: plan.actorId, cancelReason: 'VIEWING_CANCELLED' });
        const eventId = `${viewing.id}:${(viewing.version || 0) + 1}:cancel`, time = p4ViewingTime(viewing);
        const customer = await customerCollection.findOne({ id: viewing.customerProfileId });
        const employee = viewing.employeeId && await employeeCollection.findOne({ id: viewing.employeeId });
        for (const accountId of [customer?.accountId, employee?.accountId]) await p4Notify(plan, accountId,
            'VIEWING_CANCELLED', 'Viewing', viewing.id, 'Lịch xem phòng đã bị hủy', `Lịch xem ${time} đã bị hủy.`, eventId);
        for (const admin of await accountCollection.find({ role: 'ADMIN', status: 'ACTIVE' }).toArray()) await p4Notify(plan,
            admin.id, 'VIEWING_CANCELLED', 'Viewing', viewing.id, 'Khách hàng đã hủy lịch xem phòng', `Khách hàng đã hủy lịch xem ${time}.`, eventId);
        return p4Set(plan, 'Viewing', viewing, { status: 'DA_HUY', updatedAt: plan.at, version: (viewing.version || 0) + 1 });
    });
    res.send(publicRecord(after));
}));
app.get('/viewings', cors(), requireRole('ADMIN'), async (req, res) => {
    try {
        await p3ReadBarrier();
        res.send(await viewingRecords(await viewingCollection.find({}).sort({ startAt: -1 }).toArray()));
    } catch (error) { res.status(500).send({ message: error.message }); }
});
app.put('/viewings/:id/assign', cors(), requireRole('ADMIN'), p2Write(async (req, res) => {
    const { employeeId } = req.body || {};
    p4Require(typeof employeeId === 'string' && employeeId, 'INVALID_ASSIGNEE', 400);
    const viewing = await viewingCollection.findOne(recordFilter(req.params.id));
    p4Require(viewing, 'VIEWING_NOT_FOUND', 404);
    p4Require(['CHO_XAC_NHAN', 'DA_XAC_NHAN'].includes(viewing.status), 'VIEWING_LOCKED');
    res.send(await p4RunFromP2(req, `assignViewing:${viewing.id}`, async plan => {
        const shift = await p4ViewingShift(viewing, plan);
        const assignment = shift && (await p4Records('ShiftAssignment', plan)).find(a => a.shiftId === shift.id
            && a.employeeId === employeeId && ['REGISTERED', 'IN_PROGRESS'].includes(a.status));
        p4Require(assignment && (await p4Records('Employee', plan)).some(e => e.id === employeeId && e.status === 'ACTIVE'), 'INVALID_ASSIGNEE');
        p4Require(await p4EmployeeFreeAt(plan, employeeId, viewing, shift), 'EMPLOYEE_BUSY');
        const task = await p4EnsureViewingTask(plan, viewing, false);
        await p4EditTask(plan, task, { assigneeAssignmentIds: [assignment.id] });
        return p4Clean((await p4Records('Viewing', plan)).find(v => v.id === viewing.id));
    }));
}));
app.put('/viewings/:id/status', cors(), requireRole('EMPLOYEE'), p2Write(async (req, res) => {
    const viewing = await viewingCollection.findOne(recordFilter(req.params.id));
    if (!viewing) return res.status(404).send({ message: 'Không tìm thấy lịch xem phòng.' });
    if (viewing.employeeId !== req.p2Employee.id) return res.status(403).send({ message: 'Bạn không phụ trách lịch xem này.' });
    const { status } = req.body || {};
    if (!['DA_XAC_NHAN', 'DA_XEM'].includes(status)) return res.status(400).send({ message: 'Trạng thái lịch xem không hợp lệ.' });
    if ((viewing.status !== 'CHO_XAC_NHAN' || status !== 'DA_XAC_NHAN')
        && (viewing.status !== 'DA_XAC_NHAN' || status !== 'DA_XEM')) {
        return res.status(409).send({ message: 'Không thể chuyển lịch xem sang trạng thái này.' });
    }
    res.send(await p4RunFromP2(req, `viewingStatus:${viewing.id}`, async plan => {
        if (status === 'DA_XEM') {
            const { task, part } = await p4RequireViewingCheckIn(viewing, req.p2Employee.id, plan);
            p4Set(plan, 'TaskAssignment', part, { personalStatus: 'DONE', doneAt: plan.at });
            p4Set(plan, 'Task', task, { status: 'DONE' });
        } else {
            const customer = await customerCollection.findOne({ id: viewing.customerProfileId });
            await p4Notify(plan, customer?.accountId, 'VIEWING_CONFIRMED', 'Viewing', viewing.id,
                'Lịch xem phòng đã được xác nhận', `Lịch xem phòng ${p4ViewingTime(viewing)} đã được xác nhận.`, `viewing-confirm:${viewing.id}`);
        }
        return p4Set(plan, 'Viewing', viewing, { status, updatedAt: plan.at, version: (viewing.version || 0) + 1 });
    }));
}));
app.put('/viewing-details/:id', cors(), requireRole('EMPLOYEE'), p2Write(async (req, res) => {
    const detail = await viewingDetailCollection.findOne(recordFilter(req.params.id));
    if (!detail) return res.status(404).send({ message: 'Không tìm thấy phòng trong lịch xem.' });
    const viewing = await viewingCollection.findOne({ id: detail.viewingId });
    if (!viewing) return res.status(404).send({ message: 'Không tìm thấy lịch xem phòng.' });
    if (viewing.employeeId !== req.p2Employee.id) return res.status(403).send({ message: 'Bạn không phụ trách lịch xem này.' });
    if (viewing.status !== 'DA_XAC_NHAN') return res.status(409).send({ message: 'Cần xác nhận lịch xem trước khi ghi kết quả.' });
    const { viewStatus, note } = req.body || {};
    if (!['CHUA_XEM', 'DA_XEM'].includes(viewStatus) || typeof note !== 'string' || note.length > 1000) {
        return res.status(400).send({ message: 'Kết quả xem hoặc ghi chú không hợp lệ.' });
    }
    res.send(await p4RunFromP2(req, `viewingDetail:${detail.id}`, async plan => {
        await p4RequireViewingCheckIn(viewing, req.p2Employee.id, plan);
        const after = p4Set(plan, 'ViewingDetail', detail, { viewStatus, note: note.trim(), updatedAt: plan.at });
        const rooms = viewing.rooms.map(room => room.roomId === detail.roomId ? { ...room, viewStatus, note: after.note } : room);
        p4Set(plan, 'Viewing', viewing, { rooms, updatedAt: plan.at, version: (viewing.version || 0) + 1 });
        return after;
    }));
}));

app.get('/notifications', cors(), requireRole(), async (req, res) => {
    try {
        await p3ReadBarrier();
        const records = await notificationCollection.find({ accountId: req.p2Account.id })
            .sort({ createdAt: -1, _id: -1 }).toArray();
        res.send(await Promise.all(records.map(async record => {
            const value = publicRecord(record);
            if (!['Room', 'Hold', 'Deposit', 'Contract', 'BrokerageTransaction', 'Viewing'].includes(record.entityType)) return value;
            const ref = await database.collection(record.entityType).findOne({ id: record.entityId });
            const deleted = !ref && record.entityType === 'Room'
                ? await auditCollection.findOne({ entityType: 'Room', entityId: record.entityId, action: 'DELETE' }) : null;
            const roomSnapshot = ref?.roomSnapshot || deleted?.roomSnapshot || deleted?.before?.roomSnapshot || (record.entityType === 'Room' && (ref || deleted?.before)
                ? await snapshotRoom(ref || deleted.before) : null);
            const snapshots = roomSnapshot ? [roomSnapshot] : (ref?.rooms || []).map(detail => detail.roomSnapshot).filter(Boolean);
            return snapshots.length ? { ...value, roomSnapshots: snapshots } : value;
        })));
    } catch (error) { res.status(500).send({ message: error.message }); }
});
// Keep the literal path before /:id/read.
app.put('/notifications/read-all', cors(), requireRole(), p2Write(async (req, res) => {
    const before = await notificationCollection.find({ accountId: req.p2Account.id, read: false }).toArray();
    const now = new Date();
    await notificationCollection.updateMany({ _id: { $in: before.map(item => item._id) } }, { $set: { read: true, readAt: now } });
    for (const item of before) await audit(req, 'Notification', item.id, 'READ', { read: false }, { read: true, readAt: now });
    res.send({ updated: before.length });
}));
app.put('/notifications/:id/read', cors(), requireRole(), p2Write(async (req, res) => {
    const before = await notificationCollection.findOne(recordFilter(req.params.id));
    if (!before) return res.status(404).send({ message: 'Notification not found' });
    if (before.accountId !== req.p2Account.id) return res.status(403).send({ message: 'Notification belongs to another account' });
    if (before.read) return res.send(publicRecord(before));
    const after = { ...before, read: true, readAt: new Date() };
    await notificationCollection.replaceOne({ _id: before._id }, after);
    await audit(req, 'Notification', before.id, 'READ', { read: false }, { read: true, readAt: after.readAt });
    res.send(publicRecord(after));
}));

app.post('/viewing-cart/checkout', cors(), requireRole('CUSTOMER'), p2Write(async (req, res) => {
    const cart = req.session.viewingCart || [];
    const { viewerName, viewerPhone, peopleCount, note = '', items } = req.body || {};
    p4Require(Array.isArray(items) && items.length >= 1 && items.length <= 20
        && items.every(item => item && typeof item.roomId === 'string' && cart.includes(item.roomId))
        && new Set(items.map(item => item.roomId)).size === items.length, 'INVALID_VIEWING_ITEMS', 400);
    p4Require(typeof viewerName === 'string' && viewerName.trim() && validPhone(normalizePhone(viewerPhone))
        && Number.isInteger(peopleCount) && peopleCount >= 1 && typeof note === 'string' && note.length <= 1000,
    'INVALID_VIEWING_DETAILS', 400);
    const result = await p4RunFromP2(req, 'checkoutViewings', async plan => {
        const bookingId = `dl-${new ObjectId()}`, created = [];
        const rooms = await p4Records('Room', plan);
        // Preparation only stages effects. Nothing is written unless every item passes.
        for (const item of items) {
            try {
                const schedule = p4ViewingSchedule(item.date, item.startTime);
                p4Require(schedule.startAt > plan.at, 'VIEWING_PAST', 400);
                const candidate = { customerId: req.p2Account._id, ...schedule };
                p4Require(!await p4ViewingConflict(plan, candidate), 'VIEWING_TIME_CONFLICT');
                const room = rooms.find(r => r.id === item.roomId);
                p4Require(room?.publicationStatus === 'PUBLISHED' && room.status === 'AVAILABLE', 'VIEWING_ROOM_UNAVAILABLE');
                // Finalized week: a free guide is required now. Otherwise the guide is assigned at finalize.
                const candidateShift = await p4ViewingShift(candidate, plan);
                const finalized = await p4ViewingFinalized(plan, candidateShift);
                p4Require(!finalized || await p4PickViewingEmployee(plan, candidate, candidateShift), 'SLOT_NO_STAFF');
                const viewing = p4New(plan, 'Viewing', {
                    bookingId, customerId: req.p2Account._id, customerProfileId: req.p2Customer.id, employeeId: null, taskId: null,
                    status: 'DA_XAC_NHAN', rooms: [{ roomId: room.id, order: 1, viewStatus: 'CHUA_XEM', note: '' }],
                    ...schedule, viewerName: viewerName.trim(), viewerPhone: normalizePhone(viewerPhone),
                    visitorName: viewerName.trim(), visitorPhone: normalizePhone(viewerPhone), visitorCount: peopleCount,
                    peopleCount, note, createdAt: plan.at, version: 1
                }, `lx-${new ObjectId()}`);
                p4New(plan, 'ViewingDetail', { viewingId: viewing.id, ...viewing.rooms[0] }, `ctx-${new ObjectId()}`);
                await p4EnsureViewingTask(plan, viewing);
                const saved = (await p4Records('Viewing', plan)).find(v => v.id === viewing.id);
                p4Require(!finalized || saved.employeeId, 'SLOT_NO_STAFF');
                created.push(await p4ViewingOut(saved, plan));
            } catch (error) {
                if (error.status) error.roomId = item.roomId;
                throw error;
            }
        }
        return { bookingId, viewings: created };
    });
    const booked = new Set(result.viewings.flatMap(viewing => viewing.rooms.map(room => room.roomId)));
    req.session.viewingCart = cart.filter(roomId => !booked.has(roomId));
    await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
    res.status(201).send(result);
}));

async function p3Prepare(action, req, context) {
    const b = req.body || {}, now = context.now, id = req.params.id;
    const plan = Object.assign(p3Plan('', ''), context);
    const result = (type, ref) => { plan.type = type; plan.id = ref; };
    const make = (prefix, fields) => ({ id: `${prefix}-${crypto.randomUUID()}`, ...fields });
    const lockedBy = (kind, refId) => ({ 'lock.kind': kind, 'lock.refId': refId });
    p3Assert(action !== 'completeHoldPayment', 'PAYMENT_GATEWAY_REQUIRED', 410);
    p3Assert(!['depositPayment', 'cancelDeposit', 'abandonDeposit', 'completeContract', 'reviewDeposit'].includes(action), 'FLOW_CHANGED', 410);
    if (action === 'updateIdentity') {
        const customer = await p3Find('Customer', id);
        p3Assert(await p3IdentityAccess(req, customer), 'CUSTOMER_NOT_ASSIGNED', 403);
        const candidate = { identity: { number: b.idNumber, issuedDate: b.issuedOn, issuedPlace: b.issuedBy,
            frontImage: b.frontImageUrl, backImage: b.backImageUrl }, permanentAddress: b.permanentAddress };
        p3Assert(p3CompleteIdentity(candidate) && b.issuedBy.length <= 200 && b.permanentAddress.length <= 500, 'INVALID_IDENTITY', 400);
        p3Assert(!await customerCollection.findOne({ id: { $ne: customer.id }, 'identity.number': b.idNumber }), 'DUPLICATE_IDENTITY');
        candidate.identity.issuedPlace = b.issuedBy.trim(); candidate.permanentAddress = b.permanentAddress.trim();
        result('Customer', customer.id);
        await p3Change(plan, 'Customer', customer, candidate);
    } else if (action === 'cancelHold') {
        const hold = await p3Find('Hold', id); p3Own(req, hold);
        p3Assert(hold.status === 'PAYMENT_PENDING', 'INVALID_TRANSITION');
        result('Hold', id);
        await p3Change(plan, 'Hold', hold, { status: 'CANCELLED', isActive: false }, { status: 'PAYMENT_PENDING' });
        const room = await p3Find('Room', hold.roomId);
        if (room.lock?.kind === 'HOLD' && room.lock.refId === id) await p3Room(plan, room, null, lockedBy('HOLD', id));
    } else if (action === 'createHold') {
        p3Assert(typeof b.contactName === 'string' && b.contactName.trim().length >= 2 && validPhone(normalizePhone(b.contactPhone)), 'INVALID_CONTACT', 400);
        p3Assert(!b.moveIn || p3Date(b.moveIn), 'INVALID_MOVE_IN', 400);
        p3Assert(!b.note || (typeof b.note === 'string' && b.note.length <= 1000), 'INVALID_NOTE', 400);
        const room = await p3Find('Room', b.roomId);
        p3Assert(await roomCollection.findOne(p3AvailableFilter(room.id, now)), 'ROOM_LOCKED');
        const policies = await p3Collections.Policy.find({ type: 'GIU_CHO', status: 'ACTIVE', effectiveFrom: { $lte: now },
            $or: [{ effectiveTo: null }, { effectiveTo: { $gt: now } }] }).toArray();
        p3Assert(policies.length === 1, 'POLICY_NOT_CONFIGURED');
        const levels = await p3Collections.PolicyLevel.find({ policyId: policies[0].id }).toArray();
        const level = levels.length ? levels[0] : policies[0].levels?.[0];
        p3Assert((levels.length || policies[0].levels?.length) === 1 && Number.isSafeInteger(level?.amount) && level.amount > 0, 'POLICY_NOT_CONFIGURED');
        if (b.viewingId) p3Assert(await viewingCollection.findOne({ id: b.viewingId, customerProfileId: req.p2Customer.id, 'rooms.roomId': room.id }), 'INVALID_VIEWING', 400);
        const expiresAt = new Date(now.getTime() + 15 * 60000);
        const hold = make('gc', { number: await p3Number('GC', now), roomSnapshot: await snapshotRoom(room), customerId: req.p2Customer.id, roomId: room.id,
            contact: { name: b.contactName.trim(), phone: normalizePhone(b.contactPhone) }, amount: level.amount,
            policyVersionId: policies[0].id, policyLevelId: level.id, status: 'PAYMENT_PENDING', isActive: false,
            paidAt: null, lockStartsAt: now, expiresAt, paymentExpiresAt: expiresAt, createdAt: now,
            ...(b.viewingId ? { viewingId: b.viewingId } : {}), ...(b.moveIn ? { moveIn: b.moveIn } : {}), note: b.note || '' });
        result('Hold', hold.id);
        await p3Room(plan, room, { kind: 'HOLD', refId: hold.id, acquiredAt: now, expiresAt }, p3AvailableFilter(room.id, now));
        await p3Create(plan, 'Hold', hold);
    } else if (action === 'payosLink') {
        const hold = await p3Find('Hold', id); p3Own(req, hold);
        p3Assert(hold.status === 'PAYMENT_PENDING' && new Date(hold.expiresAt) > now, 'HOLD_EXPIRED');
        p3Assert(payosConfigured(), 'PAYMENT_GATEWAY_NOT_CONFIGURED', 503);
        const room = await p3Find('Room', hold.roomId);
        p3Assert(room.lock?.kind === 'HOLD' && room.lock.refId === id && new Date(room.lock.expiresAt) > now, 'ROOM_LOCKED');
        const existing = await p3Collections.Payment.findOne({ holdId: id, provider: 'PAYOS' });
        if (existing) { result('Payment', existing.id); return plan; }
        const counter = await p3Collections.Counter.findOneAndUpdate({ _id: 'PAYOS' },
            [{ $set: { value: { $add: [{ $ifNull: ['$value', 100000] }, 1] } } }], { upsert: true, returnDocument: 'after' });
        const orderCode = counter.value, description = `GC${orderCode}`;
        p3Assert(Number.isSafeInteger(orderCode) && orderCode > 0 && description.length <= 9, 'INVALID_ORDER_CODE', 503);
        const payment = make('ttien', { purpose: 'HOLD', provider: 'PAYOS', holdId: id, roomId: hold.roomId,
            customerId: hold.customerId, orderCode, description, amount: hold.amount, method: 'BANK_TRANSFER',
            status: 'PENDING', expiresAt: hold.expiresAt, createdAt: now, idempotencyKey: req.get('Idempotency-Key') });
        result('Payment', payment.id);
        await p3Create(plan, 'Payment', payment);
    } else if (action === 'createDeposit') {
        p3Assert(['CASH', 'BANK_TRANSFER'].includes(b.collectedMethod), 'INVALID_METHOD', 400);
        p3Assert(b.note === undefined || (typeof b.note === 'string' && b.note.length <= 500), 'INVALID_NOTE', 400);
        const room = await p3Find('Room', b.roomId);
        const customer = b.customerId ? await customerCollection.findOne({ id: b.customerId }) : await customerCollection.findOne({ phone: normalizePhone(b.customerPhone) });
        p3Assert(customer, 'CUSTOMER_ACCOUNT_REQUIRED', 400);
        const account = await accountCollection.findOne({ id: customer.accountId, role: 'CUSTOMER', status: 'ACTIVE' });
        p3Assert(account, 'CUSTOMER_ACCOUNT_REQUIRED', 400);
        if (b.customerPhone) p3Assert(normalizePhone(b.customerPhone) === account.phone, 'HOLD_CUSTOMER_MISMATCH', 400);
        p3Assert(p3CompleteIdentity(customer), 'CUSTOMER_IDENTITY_REQUIRED', 400);
        p3Assert(await p3IdentityAccess(req, customer), 'CUSTOMER_NOT_ASSIGNED', 403);
        const hold = b.holdId ? await p3Find('Hold', b.holdId) : null;
        if (hold) {
            p3Own(req, hold);
            p3Assert(hold.status === 'ACTIVE' && hold.isActive && !hold.creditedToDepositId && hold.customerId === customer.id &&
                hold.roomId === room.id && new Date(hold.expiresAt) > now, 'HOLD_NOT_CREDITABLE');
            p3Assert(await p3Collections.Payment.findOne({ id: hold.paymentId, status: 'CONFIRMED' }), 'HOLD_PAYMENT_NOT_CONFIRMED');
            p3Assert(room.lock?.kind === 'HOLD' && room.lock.refId === hold.id, 'ROOM_LOCKED');
        }
        const lease = b.proposedLease;
        p3Assert(!lease || (Number.isInteger(lease.months) && lease.months > 0 && lease.months <= 120 && p3Date(lease.startDate)), 'INVALID_LEASE', 400);
        const deposit = make('coc', { number: await p3Number('PC', now), customerId: customer.id,
            customerName: account.name, phone: account.phone, employeeId: req.p2Employee.id, roomId: room.id, ownerId: room.ownerId || null,
            ...p3Money(b.totalRequired, hold?.amount || 0), status: 'PAID', paymentIds: [], createdAt: now,
            ...(hold ? { holdId: hold.id } : {}), ...(lease ? { proposedLease: { ...lease, monthlyRent: room.monthlyRent || room.price } } : {}) });
        deposit.collected = { method: b.collectedMethod, amount: deposit.amountDue, note: b.note?.trim() || '', at: now, by: req.p2Account.id };
        result('Deposit', deposit.id);
        plan.compensation = { roomId: room.id, depositId: deposit.id, hold: hold ? p3Clean(hold) : null, customerId: customer.id };
        await p3Room(plan, room, { kind: 'DEPOSIT', refId: deposit.id, acquiredAt: now, expiresAt: null },
            hold ? { ...lockedBy('HOLD', hold.id), 'lock.expiresAt': { $gt: now } } : p3AvailableFilter(room.id, now));
        if (hold) await p3Change(plan, 'Hold', hold, { status: 'CONVERTED', isActive: false, creditedToDepositId: deposit.id, convertedAt: now },
            { status: 'ACTIVE', creditedToDepositId: null });
        await p3Create(plan, 'Deposit', deposit);
        await p3RecognizeDeposit(plan, deposit, room);
    } else if (action === 'approveContract' || action === 'adminAbandonDeposit') {
        const deposit = await p3Find('Deposit', id);
        const contract = await p3Collections.Contract.findOne({ depositId: id });
        let transaction = await p3Collections.BrokerageTransaction.findOne({ $or: [
            { depositId: id }, ...(contract ? [{ contractId: contract.id }] : []) ] });
        p3Assert(!['COMPLETED', 'ABANDONED'].includes(deposit.status)
            && !['COMPLETED', 'VOID', 'CANCELLED'].includes(contract?.status)
            && (!transaction?.outcome || transaction.outcome === 'PENDING') && !deposit.decidedAt, 'ALREADY_DECIDED');
        p3Assert(['PAID', 'CONTRACTED'].includes(deposit.status), 'INVALID_TRANSITION');
        p3Assert(b.note === undefined || (typeof b.note === 'string' && b.note.length <= 500), 'INVALID_NOTE', 400);
        const approved = action === 'approveContract', outcome = approved ? 'SUCCESS' : 'ABANDONED';
        if (approved) p3Assert(contract?.status === 'SIGNED', 'CONTRACT_NOT_SIGNED');
        else p3Assert(!contract || ['DRAFT', 'SIGNED'].includes(contract.status), 'INVALID_TRANSITION');
        const room = await p3Find('Room', deposit.roomId);
        p3Assert(room.lock?.kind === (contract?.status === 'SIGNED' ? 'CONTRACT' : 'DEPOSIT')
            && room.lock.refId === (contract?.status === 'SIGNED' ? contract.id : id), 'ROOM_LOCKED');
        result('Deposit', id); plan.employeeId = deposit.employeeId;
        const decision = { outcome, decidedAt: now, decidedBy: req.p2Account.id, note: b.note?.trim() || '' };
        const roomSnapshot = await snapshotRoom(room);
        const agreements = await p3Collections.BrokerageAgreement.find({ roomId: room.id }).toArray();
        const agreement = agreements.find(row => row.id === transaction?.agreementId) || agreements.find(row => row.status === 'ACTIVE') || agreements[0];
        const agreementSnapshot = transaction?.agreementSnapshot || deposit.agreementSnapshot || agreement
            ? { ...p3Clean(agreement), ...deposit.agreementSnapshot, ...transaction?.agreementSnapshot } : null;
        if (!transaction) {
            // Legacy deposits may predate recognition on collection. Preserve their history without adding revenue.
            const companyShare = Math.round(deposit.totalRequired / 2);
            transaction = { id: `gd-${crypto.randomUUID()}`, depositId: id, contractId: contract?.id || `deposit:${id}`,
                roomId: room.id, roomSnapshot, agreementSnapshot, agreementId: agreementSnapshot?.id || null,
                companyShare, ownerShare: deposit.totalRequired - companyShare, finalFee: companyShare,
                status: 'LEGACY', outcome: 'PENDING', employeeId: deposit.employeeId, customerId: deposit.customerId };
            await p3Create(plan, 'BrokerageTransaction', transaction);
        }
        if (approved) {
            await deleteRoomWithSnapshot(plan, room, contract.id);
            for (const agreement of agreements) {
                plan.effects.push({ kind: 'delete', type: 'BrokerageAgreement', id: agreement.id });
                await p3Event(plan, 'BrokerageAgreement', agreement.id, 'DELETE', agreement, null);
            }
            await p3Change(plan, 'Contract', contract, { status: 'COMPLETED', completedAt: now,
                approvedAt: now, approvedBy: req.p2Account.id, ...decision, roomSnapshot }, { status: 'SIGNED' });
        } else {
            if (contract) await p3Change(plan, 'Contract', contract, { status: 'VOID', ...decision,
                voidedAt: now, voidedBy: req.p2Account.id }, { status: contract.status });
            await p3Room(plan, room, null, lockedBy(room.lock.kind, room.lock.refId));
            await p3Change(plan, 'Room', room, { publicationStatus: 'PUBLISHED' });
        }
        await p3Change(plan, 'Deposit', deposit, { status: approved ? 'COMPLETED' : 'ABANDONED', ...decision }, { status: deposit.status });
        await p3Change(plan, 'BrokerageTransaction', transaction, { ...decision, roomSnapshot, agreementSnapshot,
            ...(contract ? { contractId: contract.id } : {}) });
        const employee = await employeeCollection.findOne({ id: deposit.employeeId });
        if (employee) p3Insert(plan, 'Notification', { id: `decision-${plan.opId}`, accountId: employee.accountId,
            type: 'CONTRACT_REVIEWED', entityType: 'Deposit', entityId: id,
            title: approved ? 'Hợp đồng đã được duyệt' : 'Khách bỏ cọc',
            body: `${deposit.number || id}: ${approved ? 'Thành công' : 'Khách bỏ cọc'}.${decision.note ? ` ${decision.note}` : ''}`,
            read: false, readAt: null, createdAt: now, dedupeKey: `decision:${id}` });
    } else if (action === 'createContract') {
        const deposit = await p3Find('Deposit', b.depositId); p3Own(req, deposit);
        p3Assert(deposit.status === 'PAID', 'DEPOSIT_NOT_PAID');
        const room = await p3Find('Room', deposit.roomId);
        p3Assert(room.lock?.kind === 'DEPOSIT' && room.lock.refId === deposit.id, 'ROOM_LOCKED');
        p3Assert(!await p3Collections.Contract.findOne({ depositId: deposit.id }), 'CONTRACT_EXISTS');
        p3Assert(p3Date(b.startDate) && p3Date(b.endDate) && b.endDate > b.startDate, 'INVALID_LEASE_DATES', 400);
        p3Assert(b.employeeId === undefined, 'EMPLOYEE_FROM_DEPOSIT', 400);
        p3Money(b.monthlyRent);
        for (const price of [b.electricityPrice, b.waterPrice]) p3Assert(price === undefined || (Number.isSafeInteger(price) && price >= 0), 'INVALID_AMOUNT', 400);
        p3Assert(!b.otherFees || (Array.isArray(b.otherFees) && b.otherFees.every(f => typeof f.name === 'string' && Number.isSafeInteger(f.amount) && f.amount >= 0)), 'INVALID_FEES', 400);
        const contract = make('hd', { number: await p3Number('HD', now), depositId: deposit.id, roomId: deposit.roomId,
            customerId: deposit.customerId, ownerId: deposit.ownerId, createdOn: now, status: 'DRAFT', startDate: b.startDate, endDate: b.endDate,
            monthlyRent: b.monthlyRent, depositAmount: deposit.totalRequired, electricityPrice: b.electricityPrice || 0, waterPrice: b.waterPrice || 0, otherFees: b.otherFees || [] });
        result('Contract', contract.id); await p3Create(plan, 'Contract', contract);
        await p3Change(plan, 'Deposit', deposit, { contractId: contract.id }, { status: 'PAID' });
        const transaction = await p3Collections.BrokerageTransaction.findOne({ depositId: deposit.id });
        if (transaction) await p3Change(plan, 'BrokerageTransaction', transaction, { contractId: contract.id });
    } else if (action === 'signContract') {
        const contract = await p3Find('Contract', id), deposit = await p3Find('Deposit', contract.depositId);
        p3Own(req, deposit); result('Contract', id);
        p3Assert(contract.status === 'DRAFT' && deposit.status === 'PAID', 'INVALID_TRANSITION');
        const room = await p3Find('Room', contract.roomId);
        p3Assert(room.lock?.kind === 'DEPOSIT' && room.lock.refId === deposit.id, 'ROOM_LOCKED');
        await p3Room(plan, room, { kind: 'CONTRACT', refId: id, acquiredAt: now, expiresAt: null }, lockedBy('DEPOSIT', deposit.id));
        await p3Change(plan, 'Contract', contract, { status: 'SIGNED', signedAt: now, signedBy: req.p2Account.id }, { status: 'DRAFT' });
        await p3Change(plan, 'Deposit', deposit, { status: 'CONTRACTED' }, { status: 'PAID' });
    } else throw p3Error(400, 'UNKNOWN_OPERATION');
    return plan;
}

async function initializeP3() {
    const indexes = {
        Hold: [[{ roomId: 1 }, { unique: true, partialFilterExpression: { isActive: true } }]],
        Payment: [[{ idempotencyKey: 1 }, { unique: true }], [{ orderCode: 1 }, { unique: true, partialFilterExpression: { provider: 'PAYOS' } }],
            [{ holdId: 1, provider: 1 }, { unique: true, partialFilterExpression: { provider: 'PAYOS' } }], [{ bankTransactionRef: 1 }, { unique: true, sparse: true }],
            [{ 'receipt.number': 1 }, { unique: true, sparse: true }]],
        Receipt: [[{ number: 1 }, { unique: true }], [{ paymentId: 1 }, { unique: true }]],
        Deposit: [[{ number: 1 }, { unique: true }], [{ holdId: 1 }, { unique: true, sparse: true }]],
        Contract: [[{ number: 1 }, { unique: true }], [{ depositId: 1 }, { unique: true }]],
        BrokerageTransaction: [[{ contractId: 1 }, { unique: true }]],
        EmployeeRevenue: [[{ employeeId: 1, periodId: 1 }, { unique: true }]],
        CompanyRevenue: [[{ periodId: 1 }, { unique: true }]],
        AuditLog: [[{ p3Key: 1 }, { unique: true, sparse: true }]]
    };
    for (const [name, collection] of Object.entries(p3Collections)) {
        if (name !== 'Counter') await collection.createIndex({ id: 1 }, { unique: true });
        for (const [keys, options] of indexes[name] || []) await collection.createIndex(keys, options);
    }
    await p3ReadBarrier();
    setInterval(() => p3ReadBarrier().catch(error => console.error('P3 recovery:', error.message)), 60000).unref();
}
const p3Customer = requireRole('CUSTOMER');
const p3Employee = requireRole('EMPLOYEE');
const p3Staff = requireRole('EMPLOYEE', 'ADMIN');
const p3Gone = code => (req, res) => res.status(410).send({ code, message: p3Error(410, code).message });
app.post('/data/admin/deposits/:id/review', requireRole('ADMIN'), p3Gone('FLOW_CHANGED'));
app.post('/data/admin/deposits/:id/approve-contract', requireRole('ADMIN'), p3Write('approveContract'));
app.post('/data/admin/deposits/:id/abandon', requireRole('ADMIN'), p3Write('adminAbandonDeposit'));
app.get('/data/admin/contract-reviews', requireRole('ADMIN'), p3Route(async (req, res) => {
    const state = req.query.state || 'pending';
    p3Assert(['pending', 'done'].includes(state), 'INVALID_STATE', 400);
    const deposits = await p3Collections.Deposit.find({ status: { $in: ['PAID', 'CONTRACTED', 'COMPLETED', 'ABANDONED'] } }).sort({ createdAt: -1 }).toArray();
    const items = [];
    for (const deposit of deposits) {
        const item = await p3ContractReview(deposit);
        if (item.outcome !== 'CANCELLED' && (item.outcome === 'PENDING') === (state === 'pending')) items.push(item);
    }
    res.send({ items, total: items.length });
}));
// REAL-02: exact customer lookup starts a bounded deposit workflow on the server session.
function p3IdentityFile(url) {
    return typeof url === 'string' && /^\/uploads\/cccd\/[a-zA-Z0-9_-]+\.(jpe?g|png|webp)$/i.test(url)
        && require('fs').existsSync(path.join(__dirname, '..', 'my-server', 'public', url));
}
function p3CompleteIdentity(customer) {
    const i = customer.identity;
    return typeof i?.number === 'string' && /^\d{12}$/.test(i.number) && p3Date(i?.issuedDate) && i.issuedDate <= new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)
        && typeof i.issuedPlace === 'string' && i.issuedPlace.trim().length >= 2
        && typeof customer.permanentAddress === 'string' && customer.permanentAddress.trim().length >= 5
        && p3IdentityFile(i.frontImage) && p3IdentityFile(i.backImage);
}
async function p3IdentityAccess(req, customer) {
    if (req.p2Account.role === 'ADMIN') return true;
    const employeeId = req.p2Employee.id;
    if (await p3Collections.Deposit.findOne({ customerId: customer.id, employeeId })
        || await viewingCollection.findOne({ customerProfileId: customer.id, employeeId })
        || await viewingCollection.findOne({ customerId: customer.id, employeeId })
        || await p3Collections.Hold.findOne({ customerId: customer.id, employeeId })) return true;
    const context = req.session.depositIdentityContext;
    if (!context || context.employeeId !== employeeId || context.customerId !== customer.id || context.expiresAt < Date.now()) return false;
    const room = await roomCollection.findOne({ id: context.roomId });
    return !!room && (!!await roomCollection.findOne(p3AvailableFilter(room.id, new Date()))
        || !!await p3Collections.Hold.findOne({ id: room.lock?.refId, roomId: room.id, customerId: customer.id, employeeId,
            status: 'ACTIVE', isActive: true, expiresAt: { $gt: new Date() } }));
}
app.get('/data/me/employee', p3Employee, p3Route(async (req, res) => {
    const e = req.p2Employee;
    res.send({ id: e.id, accountId: e.accountId, employeeCode: e.employeeCode,
        fullName: e.fullName || req.p2Account.name, phone: e.phone || req.p2Account.phone,
        email: e.email || '', position: e.position || '', avatar: e.avatar || e.avatarUrl || '', status: e.status });
}));
app.post('/data/customers/identity-context', p3Employee, p3Route(async (req, res) => {
    const body = req.body || {}, phone = normalizePhone(body.customerPhone);
    p3Assert(validPhone(phone) && typeof body.roomId === 'string', 'INVALID_CONTACT', 400);
    const customer = await customerCollection.findOne({ phone });
    p3Assert(customer && await accountCollection.findOne({ id: customer.accountId, role: 'CUSTOMER', status: 'ACTIVE' }), 'CUSTOMER_ACCOUNT_REQUIRED', 400);
    const room = await p3Find('Room', body.roomId), employeeId = req.p2Employee.id;
    const hold = room.lock?.kind === 'HOLD' ? await p3Collections.Hold.findOne({ id: room.lock.refId, customerId: customer.id,
        roomId: room.id, status: 'ACTIVE', isActive: true, expiresAt: { $gt: new Date() } }) : null;
    p3Assert(await roomCollection.findOne(p3AvailableFilter(room.id, new Date())) || hold, 'ROOM_LOCKED');
    if (hold) {
        p3Assert(!hold.employeeId || hold.employeeId === employeeId, 'NOT_YOUR_RECORD', 403);
        if (!hold.employeeId) {
            const claimed = await p3Collections.Hold.updateOne({ id: hold.id, employeeId: null }, { $set: { employeeId } });
            p3Assert(claimed.modifiedCount === 1, 'NOT_YOUR_RECORD', 403);
            await audit(req, 'Hold', hold.id, 'ASSIGN_EMPLOYEE', p3Clean(hold), { ...p3Clean(hold), employeeId });
        }
    }
    req.session.depositIdentityContext = { customerId: customer.id, roomId: room.id, employeeId, expiresAt: Date.now() + 30 * 60000 };
    await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
    res.send(p3Clean(customer));
}));
app.put('/data/customers/:id/identity', p3Staff, p3Write('updateIdentity'));
app.get('/data/me/holds', p3Customer, p3Route(async (req, res) => {
    const records = await p3Collections.Hold.find({ customerId: req.p2Customer.id }).sort({ createdAt: -1 }).toArray();
    res.send({ items: await Promise.all(records.map(record => p3RoomDisplay(record, 'Hold'))), total: records.length });
}));
app.post('/data/me/holds', p3Customer, p3Write('createHold'));
app.get('/data/me/holds/:id', p3Customer, p3Route(async (req, res) => {
    const hold = await p3Find('Hold', req.params.id); p3Own(req, hold); res.send(await p3RoomDisplay(hold, 'Hold'));
}));
app.post('/data/me/holds/:id/payos-link', p3Customer, p3Write('payosLink'));
app.get('/data/me/holds/:id/payment-status', p3Customer, p3Route(async (req, res) => {
    let hold = await p3Find('Hold', req.params.id); p3Own(req, hold);
    let payment = await p3Collections.Payment.findOne({ holdId: hold.id, provider: 'PAYOS' });
    if (!payment && hold.paymentId) payment = await p3Collections.Payment.findOne({ id: hold.paymentId, holdId: hold.id });
    if (payment?.provider === 'PAYOS' && payment.status === 'PENDING' && payosConfigured()) {
        const data = await payosGetRequest(payment.orderCode);
        if (data.status === 'PAID' || data.amountPaid >= payment.amount) {
            p3Assert(data.amount === payment.amount, 'AMOUNT_MISMATCH', 400);
            const transaction = data.transactions?.find(row => row.reference);
            payment = await payosSettle(payment, { amount: payment.amount, reference: data.reference || transaction?.reference });
            hold = await p3Find('Hold', hold.id);
        }
    }
    res.send({ holdStatus: hold.status, paymentStatus: payment?.status || null, expiresAt: hold.expiresAt });
}));
app.post('/data/me/holds/:id/complete-payment', p3Customer, p3Gone('PAYMENT_GATEWAY_REQUIRED'));
app.post('/data/me/holds/:id/payments', p3Customer, p3Gone('PAYMENT_GATEWAY_REQUIRED'));
app.post('/data/me/holds/:id/cancel', p3Customer, p3Write('cancelHold'));
app.get('/data/holds/creditable', p3Staff, p3Route(async (req, res) => {
    // payOS holds are paid without an employee; any employee may pick them up (claimed at identity-context).
    const query = { ...(req.p2Employee ? { employeeId: { $in: [req.p2Employee.id, null] } } : {}), status: 'ACTIVE', isActive: true, creditedToDepositId: null, expiresAt: { $gt: new Date() }, ...(req.query.roomId ? { roomId: req.query.roomId } : {}) };
    const holds = await p3Collections.Hold.find(query).toArray(), result = [];
    for (const hold of holds) if (await p3Collections.Payment.findOne({ id: hold.paymentId, status: 'CONFIRMED' })) result.push(p3Clean(hold));
    res.send(result);
}));
for (const [path, action, role] of [
    ['/data/deposits', 'createDeposit', p3Employee], ['/data/deposits/:id/payments', 'depositPayment', p3Employee],
    ['/data/deposits/:id/cancel', 'cancelDeposit', p3Staff], ['/data/deposits/:id/abandonment', 'abandonDeposit', p3Staff],
    ['/data/contracts', 'createContract', p3Employee], ['/data/contracts/:id/sign', 'signContract', p3Employee],
    ['/data/contracts/:id/complete', 'completeContract', p3Employee]
]) app.post(path, role, ['depositPayment', 'cancelDeposit', 'abandonDeposit', 'completeContract'].includes(action)
    ? p3Gone('FLOW_CHANGED') : p3Write(action));
for (const action of ['confirm', 'reject']) app.post(`/data/payments/:id/${action}`, p3Employee, p3Route(async (req, res) => {
    const payment = await p3Find('Payment', req.params.id);
    p3Own(req, await p3Find(payment.purpose === 'HOLD' ? 'Hold' : 'Deposit', payment.holdId || payment.depositId));
    p3Gone(payment.purpose === 'HOLD' ? 'PAYMENT_GATEWAY_REQUIRED' : 'FLOW_CHANGED')(req, res);
}));
const p3StatusLabels = {
    Hold: { PAYMENT_PENDING: 'Chờ thanh toán', ACTIVE: 'Đang giữ chỗ', CONVERTED: 'Đã chuyển thành cọc', FORFEITED: 'Khách bỏ giữ chỗ', EXPIRED: 'Hết hạn', CANCELLED: 'Đã hủy' },
    Deposit: { PAID: 'Đã thu cọc', CONTRACTED: 'Đã ký hợp đồng', COMPLETED: 'Thành công', ABANDONED: 'Khách bỏ cọc' },
    Contract: { DRAFT: 'Nháp', SIGNED: 'Đã ký – chờ admin xác nhận', COMPLETED: 'Thành công', VOID: 'Không hiệu lực – khách bỏ cọc' }
};
function p3Labeled(type, record) {
    return record && p3StatusLabels[type]?.[record.status] ? { ...record, statusLabel: p3StatusLabels[type][record.status] } : record;
}
async function p3ContractReview(deposit) {
    const contract = await p3Collections.Contract.findOne({ depositId: deposit.id });
    const transaction = await p3Collections.BrokerageTransaction.findOne({ $or: [
        { depositId: deposit.id }, ...(contract ? [{ contractId: contract.id }] : []) ] });
    const room = await roomCollection.findOne({ id: deposit.roomId });
    const info = room ? await snapshotRoom(room) : deposit.roomSnapshot || transaction?.roomSnapshot || contract?.roomSnapshot || null;
    const customer = await customerCollection.findOne({ id: deposit.customerId });
    const account = customer?.accountId ? await accountCollection.findOne({ id: customer.accountId }) : null;
    const employee = await employeeCollection.findOne({ id: deposit.employeeId });
    const owner = await database.collection('Owner').findOne({ id: deposit.ownerId || info?.ownerId || null });
    const total = deposit.totalRequired || contract?.depositAmount || transaction?.total || 0;
    const companyShare = transaction?.companyShare ?? deposit.companyShare ?? Math.round(total / 2);
    const depositAt = deposit.createdAt || deposit.collected?.at || transaction?.recognizedAt || contract?.createdOn || null;
    const daysSinceDeposit = depositAt ? Math.max(0, Math.floor((Date.now() - new Date(depositAt).getTime()) / 86400000)) : 0;
    // Flows closed before DEP (contract CANCELLED) are not waiting for an admin decision and are not DEP outcomes.
    const outcome = deposit.status === 'ABANDONED' ? 'ABANDONED' : deposit.status === 'COMPLETED' || contract?.status === 'COMPLETED' ? 'SUCCESS'
        : contract?.status === 'CANCELLED' ? 'CANCELLED' : transaction?.outcome || deposit.outcome || 'PENDING';
    const identity = customer?.identity?.number || '';
    return { deposit: p3Labeled('Deposit', p3Clean(deposit)), contract: p3Labeled('Contract', p3Clean(contract)), room: p3Clean(info),
        customer: { name: customer?.fullName || customer?.name || account?.name || deposit.customerName || '',
            phone: customer?.phone || account?.phone || deposit.phone || '', identityMasked: identity ? `${'*'.repeat(Math.max(0, identity.length - 4))}${identity.slice(-4)}` : '' },
        employee: { id: deposit.employeeId, fullName: employee?.fullName || '', employeeCode: employee?.employeeCode || '' },
        owner: { name: owner?.fullName || owner?.name || '', phone: owner?.phone || '' },
        amounts: { total, holdCredit: deposit.holdCredit || 0, companyShare, ownerShare: transaction?.ownerShare ?? deposit.ownerShare ?? total - companyShare },
        depositAt, daysSinceDeposit, overdue: daysSinceDeposit >= 7, outcome,
        decidedAt: deposit.decidedAt || transaction?.decidedAt || contract?.approvedAt || contract?.completedAt || deposit.abandonment?.recordedAt || null,
        decidedBy: deposit.decidedBy || transaction?.decidedBy || contract?.approvedBy || deposit.abandonment?.recordedBy || null,
        note: deposit.note || deposit.collected?.note || '',
        ...(outcome !== 'PENDING' ? { note: deposit.note || transaction?.note || deposit.abandonment?.reason || '' } : {}) };
}
// Display fields are joined only after the existing ownership filter/check succeeds.
async function p3EmployeeDisplay(type, record) {
    const value = p3Labeled(type, await p3RoomDisplay(record));
    if (!['Deposit', 'Contract'].includes(type)) return value;
    const customer = await customerCollection.findOne({ id: record.customerId },
        { projection: { fullName: 1, name: 1, phone: 1, accountId: 1 } });
    const account = customer?.accountId ? await accountCollection.findOne({ id: customer.accountId },
        { projection: { fullName: 1, name: 1, phone: 1 } }) : null;
    return { ...value, customerName: customer?.fullName || customer?.name || account?.fullName || account?.name || value.customerName || '',
        phone: customer?.phone || account?.phone || value.phone || '' };
}
async function p3RoomDisplay(record, type = '') {
    const value = p3Labeled(type, p3Clean(record));
    if (value.roomSnapshot || !value.roomId) return value;
    const room = await roomCollection.findOne({ id: value.roomId });
    return room ? { ...value, roomSnapshot: await snapshotRoom(room) } : value;
}
for (const [path, type] of [['deposits', 'Deposit'], ['contracts', 'Contract'], ['payments', 'Payment']]) {
    app.get(`/data/${path}`, p3Staff, p3Route(async (req, res) => {
        const query = {};
        if (req.p2Employee && type === 'Contract') {
            const deposits = await p3Collections.Deposit.find({ employeeId: req.p2Employee.id }).toArray();
            query.depositId = { $in: deposits.map(d => d.id) };
        } else if (req.p2Employee && type === 'Deposit') query.employeeId = req.p2Employee.id;
        else if (req.p2Employee && type === 'Payment') {
            const deposits = await p3Collections.Deposit.find({ employeeId: req.p2Employee.id }).toArray();
            const holds = await p3Collections.Hold.find({ employeeId: req.p2Employee.id }).toArray();
            query.$or = [{ purpose: 'HOLD', holdId: { $in: holds.map(h => h.id) } }, { depositId: { $in: deposits.map(d => d.id) } }];
        }
        if (req.query.status) query.status = req.query.status;
        if (req.query.roomId && type !== 'Payment') query.roomId = req.query.roomId;
        const records = await p3Collections[type].find(query).toArray();
        res.send({ items: await Promise.all(records.map(record => p3EmployeeDisplay(type, record))), total: records.length });
    }));
    app.get(`/data/${path}/:id`, requireRole('CUSTOMER', 'EMPLOYEE', 'ADMIN'), p3Route(async (req, res) => {
        const record = await p3Find(type, req.params.id);
        if (type === 'Contract') p3Own(req, await p3Find('Deposit', record.depositId));
        else if (type === 'Payment') p3Own(req, await p3Find(record.purpose === 'HOLD' ? 'Hold' : 'Deposit', record.holdId || record.depositId));
        else p3Own(req, record);
        res.send(await p3EmployeeDisplay(type, record));
    }));
}
app.get('/data/payments/:id/receipt', requireRole('CUSTOMER', 'EMPLOYEE', 'ADMIN'), p3Route(async (req, res) => {
    const payment = await p3Find('Payment', req.params.id);
    const ref = await p3Find(payment.purpose === 'HOLD' ? 'Hold' : 'Deposit', payment.holdId || payment.depositId);
    p3Own(req, ref);
    p3Assert(payment.status === 'CONFIRMED' && payment.receipt, 'RECEIPT_NOT_FOUND', 404);
    res.send(payment.receipt);
}));
app.get('/data/brokerage-transactions', p3Staff, p3Route(async (req, res) => {
    const query = {};
    if (req.p2Employee) {
        const revenues = await p3Collections.EmployeeRevenue.find({ employeeId: req.p2Employee.id }).toArray();
        query.employeeRevenueId = { $in: revenues.map(r => r.id) };
    }
    if (req.query.month) query.recognitionMonth = req.query.month;
    if (req.query.status) query.status = req.query.status;
    res.send((await p3Collections.BrokerageTransaction.find(query).toArray()).map(p3Clean));
}));
module.exports = { app, p3Money, p3Month, p3Fee, p3Transition, p3AvailableFilter, p3Prepare, p3Run, p3Collections, p3ReadBarrier, initializeP3, client, database,
    payosSign, payosVerify, payosCreateLink, payosGetRequest, completeHoldPayment, p3StatusLabels };

// P4 — LearnAngular/CommonJS, standalone MongoDB, one Express process.
const p4Collections = Object.fromEntries([
    'RegistrationPeriod', 'PeriodRegistration', 'Shift', 'ShiftAssignment', 'Attendance',
    'AttendanceEvidence', 'WorkLocation', 'Task', 'TaskShift', 'TaskAssignment',
    'PayrollPeriod', 'PayrollAdjustment', 'Payslip', 'Policy', 'PolicyLevel',
    'Notification', 'AuditLog', 'Employee', 'Account', 'Viewing', 'ViewingDetail', 'Room', 'Property', 'Customer'
].map(name => [name, database.collection(name)]));
const VIEWING_WINDOWS = [['07:00', '10:30', '11:00', 'Ca sáng'], ['13:00', '16:30', '17:00', 'Ca chiều']];
function p4ViewingWindow(startAt, endAt) {
    const start = new Date(startAt), end = new Date(endAt);
    if (!Number.isFinite(+start) || end - start !== 30 * 60000) return false;
    const local = new Date(+start + 7 * 3600000).toISOString();
    const time = local.slice(11, 16);
    return local.slice(17, 23) === '00.000' && ['00', '30'].includes(time.slice(3))
        && VIEWING_WINDOWS.some(([from, to]) => from <= time && time <= to);
}
function p4Message(code) {
    return {
        WEEK_EXISTS: 'Tuần này đã có đợt đăng ký.', MONDAY_REQUIRED: 'Ngày bắt đầu đợt phải là thứ Hai.',
        NAME_REQUIRED: 'Vui lòng nhập tên.', PERIOD_IN_USE: 'Không thể xóa đợt đã có nhân viên nhận ca hoặc đã có công việc.',
        PERIOD_STATE: 'Trạng thái đợt không cho phép thao tác này.',
        PERIOD_OPEN_WINDOW: 'Chỉ được mở đợt từ 08:00 thứ Năm đến trước 20:00 Chủ nhật trước tuần đăng ký.',
        TASK_LOCKED: 'Công việc đã hoàn thành hoặc đã hủy, không thể thay đổi.',
        TASK_NOT_PENDING_CONFIRM: 'Công việc không ở trạng thái chờ xác nhận.',
        TASK_PENDING_CONFIRM: 'Công việc đang chờ xác nhận hoàn thành, hãy xác nhận hoặc trả lại trước.',
        REASON_REQUIRED: 'Vui lòng nhập lý do từ 3 đến 500 ký tự.',
        SHIFT_STARTED: 'Ca đã bắt đầu, hãy chọn ca khác.',
        OUTSIDE_CHECK_IN_WINDOW: 'Chỉ được check-in trong giờ ca làm.',
        ASSIGNEE_DONE: 'Không thể bỏ nhân viên đã hoàn thành phần việc.', ASSIGNEES_REQUIRED: 'Chọn ít nhất một nhân viên trong ca.',
        ONE_ASSIGNEE_REQUIRED: 'Việc dẫn khách xem phòng cần đúng một người phụ trách.',
        VIEWING_TITLE_LOCKED: 'Không đổi tên việc dẫn khách xem phòng.',
        VIEWING_SHIFT_LOCKED: 'Việc dẫn khách gắn với giờ xem, không đổi ca được.',
        TASK_HAS_PROGRESS: 'Không thể xóa công việc đã có phần hoàn thành.',
        VIEWING_TASK_CANCEL_VIA_VIEWING: 'Việc dẫn khách chỉ hủy khi lịch xem bị hủy.',
        VIEWING_TASK_AUTO: 'Việc dẫn khách tự hoàn thành khi ghi kết quả xem phòng.',
        INVALID_ASSIGNEE: 'Nhân viên được chọn không trực ca này.', SHIFT_CLOSED: 'Ca đã kết thúc hoặc đã đóng.',
        CHECK_IN_REQUIRED: 'Cần check-in ca trước khi ghi kết quả dẫn xem.',
        VIEWING_OUTSIDE_SHIFT_HOURS: 'Giờ xem phải bắt đầu trong 07:00–10:30 hoặc 13:00–16:30, cách nhau 30 phút.',
        SLOT_NO_STAFF: 'Hiện tại chưa có nhân viên trực cho ca này, vui lòng chọn khung giờ khác.',
        VIEWING_TIME_CONFLICT: 'Bạn đã có lịch xem khác vào giờ này, vui lòng chọn giờ khác.',
        VIEWING_LOCKED: 'Lịch xem đã qua hoặc không còn hoạt động, không thể thay đổi.',
        VIEWING_PAST: 'Vui lòng chọn thời gian xem phòng trong tương lai.',
        EMPLOYEE_BUSY: 'Nhân viên đã có lịch dẫn khách khác vào giờ này.',
        INVALID_VIEWING_DATE: 'Ngày xem phòng không hợp lệ, vui lòng nhập theo định dạng YYYY-MM-DD.',
        INVALID_VIEWING_ITEMS: 'Vui lòng chọn từ 1 đến 20 phòng khác nhau có trong giỏ đặt lịch.',
        INVALID_VIEWING_DETAILS: 'Thông tin khách xem, số điện thoại, số người hoặc ghi chú không hợp lệ.',
        VIEWING_ROOM_UNAVAILABLE: 'Phòng đã chọn không còn trống để đặt lịch xem.',
        VIEWING_NOT_FOUND: 'Không tìm thấy lịch xem phòng.',
        NOT_YOUR_VIEWING: 'Lịch xem thuộc khách hàng khác.'
    }[code] || 'Không thực hiện được thao tác. Vui lòng tải lại và thử lại.';
}
const p4Fail = (code, status = 409) => { throw Object.assign(new Error(p4Message(code)), { code, status }); };
const p4Require = (ok, code, status = 409) => { if (!ok) p4Fail(code, status); };
const p4Clean = value => value && Object.fromEntries(Object.entries(value).filter(([k]) => k !== '_id' && !k.startsWith('_p4')));
function p4ShiftLimit(count, submit = false) {
    return Number.isInteger(count) && count >= (submit ? 5 : 0) && count <= 8;
}
function p4LateMinutes(startsAt, checkInAt) {
    return Math.max(0, Math.ceil((new Date(checkInAt) - new Date(startsAt)) / 60000));
}
function p4Penalty(minutes, levels) {
    if (!minutes) return null;
    return levels.find(level => minutes >= level.from && (level.to == null || minutes < level.to)) || null;
}
function p4Distance(a, b) {
    const rad = v => v * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
function p4NextAssignment(employeeId, source, assignments, shifts) {
    return assignments.filter(a => a.employeeId === employeeId && a.status === 'REGISTERED')
        .map(a => ({ assignment: a, shift: shifts.find(s => s.id === a.shiftId) }))
        .filter(x => x.shift?.status === 'OPEN' && new Date(x.shift.startsAt) > new Date(source.startsAt))
        .sort((a, b) => new Date(a.shift.startsAt) - new Date(b.shift.startsAt))[0]?.assignment || null;
}
function p4CarryDecision(part, next) {
    if (part.personalStatus === 'DONE' || part.transferredTo || part.removed) return { type: 'SKIP' };
    return next ? { type: 'CARRY_OVER', assignmentId: next.id } : { type: 'WAITING_ADMIN' };
}
function p4Day(value, delta = 0) {
    return new Date(Date.parse(`${value}T00:00:00Z`) + delta * 86400000).toISOString().slice(0, 10);
}
const p4At = (date, time) => new Date(`${date}T${time}:00+07:00`);
const p4Get = async (type, id) => {
    const record = await p4Collections[type].findOne({ id });
    p4Require(record, `${type.toUpperCase()}_NOT_FOUND`, 404);
    return record;
};
let p4Queue = Promise.resolve();
function p4Serial(work) {
    const result = p4Queue.then(work);
    p4Queue = result.catch(() => {});
    return result;
}
// A durable intent is saved before any mutation. Replay uses per-document tokens;
// it completes missing effects/audits without applying increments twice.
function p4Plan(req) { return { effects: [], actorId: req.p2Account?.id || null, at: new Date() }; }
function p4Effect(plan, type, before, after, extra = {}) {
    plan.effects.push({ type, before: p4Clean(before), after: p4Clean(after), extra });
    return after;
}
function p4New(plan, type, fields, id) {
    return p4Effect(plan, type, null, { id: id || `p4-${new ObjectId()}`, ...fields });
}
function p4Set(plan, type, record, fields, extra) {
    record = plan.effects.filter(e => e.type === type && e.after?.id === record.id).at(-1)?.after || record;
    if (type === 'Task') fields = { ...fields, updatedAt: plan.at, updatedBy: plan.actorId };
    return p4Effect(plan, type, record, { ...p4Clean(record), ...fields }, extra);
}
function p4Remove(plan, type, record) { return p4Effect(plan, type, record, null); }
async function p4Records(type, plan) {
    const rows = new Map((await p4Collections[type].find({}).toArray()).map(r => [r.id, r]));
    for (const e of plan?.effects || []) if (e.type === type) {
        if (e.after) rows.set(e.after.id, e.after);
        else rows.delete(e.before.id);
    }
    return [...rows.values()];
}
async function p4RunFromP2(req, action, prepare) {
    const work = async () => { await p4Recover(); return p4Execute(req, action, prepare); };
    return req.p4Locked ? work() : p4Serial(work);
}
async function p4Run(op) {
    for (let i = op.cursor || 0; i < op.plan.effects.length; i++) {
        const effect = op.plan.effects[i], col = p4Collections[effect.type], token = `${op.id}:${i}`;
        const id = effect.after?.id || effect.before.id;
        let current = await col.findOne({ id });
        if (current?._p4Token !== token) {
            if (!effect.after) {
                // A replay after a successful delete (before cursor/audit persisted) is done.
                if (current) {
                    const deleted = await col.deleteOne({ id, ...effect.before });
                    p4Require(deleted.deletedCount, 'P4_RECOVERY_REQUIRED', 503);
                }
            } else if (!effect.before) {
                p4Require(!current, 'RECORD_EXISTS');
                await col.insertOne({ ...effect.after, _p4Token: token });
            } else {
                // Exact expected values + capacity predicates are checked atomically by MongoDB.
                const expected = Object.fromEntries(Object.entries(effect.before).filter(([k]) => k !== 'id'));
                const updated = await col.findOneAndUpdate({ $and: [{ id: effect.before.id, ...expected }, effect.extra] },
                    { $set: { ...effect.after, _p4Token: token } }, { returnDocument: 'after' });
                if (!updated) {
                    if (i === 0) {
                        await auditCollection.updateOne({ id: op.id }, { $set: { state: 'FAILED' } });
                        p4Fail('CONCURRENT_CHANGE');
                    }
                    p4Fail('P4_RECOVERY_REQUIRED', 503);
                }
            }
        }
        const event = { id: `${token}:audit`, entityType: effect.type, entityId: id,
            action: !effect.after ? 'DELETE' : effect.before ? 'UPDATE' : 'CREATE', before: effect.before, after: effect.after,
            actorId: op.plan.actorId, at: op.plan.at };
        await auditCollection.updateOne({ id: event.id }, { $setOnInsert: event }, { upsert: true });
        await auditCollection.updateOne({ id: op.id }, { $set: { cursor: i + 1 } });
    }
    await auditCollection.updateOne({ id: op.id }, { $set: { state: 'DONE' } });
    return op.result;
}
async function p4Recover() {
    const pending = await auditCollection.find({ entityType: 'P4Operation', state: 'PENDING' }).sort({ at: 1 }).toArray();
    for (const op of pending) await p4Run(op);
}
async function p4Execute(req, action, prepare) {
    const key = req.get?.('Idempotency-Key');
    p4Require(!key || (typeof key === 'string' && key.length <= 200), 'INVALID_IDEMPOTENCY_KEY', 400);
    const p4Key = key ? `${req.p2Account.id}:${action}:${key}` : undefined;
    const payload = JSON.stringify(req.body || {});
    if (p4Key) {
        const old = await auditCollection.findOne({ p4Key });
        if (old) {
            p4Require(old.payload === payload, 'IDEMPOTENCY_CONFLICT');
            p4Require(old.state !== 'FAILED', 'CONCURRENT_CHANGE');
            return old.state === 'DONE' ? old.result : p4Run(old);
        }
    }
    const plan = p4Plan(req), result = await prepare(plan);
    // Background checks (no Idempotency-Key) that change nothing must not add empty journal rows.
    if (!p4Key && !plan.effects.length) return result;
    const op = { id: `p4-op-${new ObjectId()}`, entityType: 'P4Operation', state: 'PENDING',
        at: plan.at, actorId: plan.actorId, plan, result, payload, ...(p4Key ? { p4Key } : {}) };
    await auditCollection.insertOne(op);
    return p4Run(op);
}
function p4Route(handler) {
    return async (req, res) => {
        try { await p4Serial(async () => { await p4Recover(); await handler(req, res); }); }
        catch (error) { res.status(error.status || (error.code === 11000 ? 409 : 500)).send({ code: error.code || 'P4_ERROR', message: p4Message(error.code) }); }
    };
}
const p4Employee = requireRole('EMPLOYEE'), p4Admin = requireRole('ADMIN'), p4Staff = requireRole('EMPLOYEE', 'ADMIN');
async function p4Owned(req, id) {
    const a = await p4Get('ShiftAssignment', id);
    p4Require(a.employeeId === req.p2Employee.id, 'NOT_YOUR_ASSIGNMENT', 403);
    return a;
}
function p4Open(period, now = new Date()) {
    p4Require(period.status === 'OPEN' && new Date(period.opensAt) <= now && now < new Date(period.closesAt), 'REGISTRATION_CLOSED');
}
async function p4Registration(plan, periodId, employeeId) {
    const planned = plan.effects.filter(e => e.type === 'PeriodRegistration'
        && e.after?.periodId === periodId && e.after?.employeeId === employeeId).at(-1)?.after;
    if (planned) return planned;
    const old = await p4Collections.PeriodRegistration.findOne({ periodId, employeeId });
    return old || p4New(plan, 'PeriodRegistration', { periodId, employeeId, shiftCount: 0, status: 'ACTIVE', submittedAt: null });
}
async function p4Register(plan, employeeId, shiftId, admin = false, movedFrom) {
    p4Require((await p4Get('Employee', employeeId)).status === 'ACTIVE', 'INACTIVE_EMPLOYEE');
    const shift = await p4Get('Shift', shiftId), period = await p4Get('RegistrationPeriod', shift.periodId), now = new Date();
    if (!admin) p4Open(period, now);
    p4Require(shift.status === 'OPEN' && new Date(admin ? shift.endsAt : shift.startsAt) > now, 'SHIFT_CLOSED');
    p4Require(shift.assignedCount < Math.min(6, shift.capacity), 'SHIFT_FULL');
    const mine = await p4Collections.ShiftAssignment.find({ employeeId, status: { $ne: 'CANCELLED' } }).toArray();
    p4Require(!mine.some(a => a.shiftId === shiftId), 'ALREADY_REGISTERED');
    const otherShifts = await p4Collections.Shift.find({ id: { $in: mine.filter(a => a.id !== movedFrom).map(a => a.shiftId) } }).toArray();
    p4Require(!otherShifts.some(s => new Date(s.startsAt) < new Date(shift.endsAt) && new Date(s.endsAt) > new Date(shift.startsAt)), 'SHIFT_OVERLAP');
    const registration = await p4Registration(plan, period.id, employeeId);
    const samePeriodMove = movedFrom && (await p4Get('Shift', (await p4Get('ShiftAssignment', movedFrom)).shiftId)).periodId === period.id;
    p4Require(p4ShiftLimit(registration.shiftCount + (samePeriodMove ? 0 : 1)), 'WEEKLY_SHIFT_LIMIT');
    // Reserve the seat first, with an atomic conditional assignedCount update.
    // If this CAS loses the race there are no effects to compensate.
    const seat = { type: 'Shift', before: p4Clean(shift), after: { ...p4Clean(shift), assignedCount: shift.assignedCount + 1 },
        extra: { assignedCount: { $lt: Math.min(6, shift.capacity) }, status: 'OPEN', startsAt: shift.startsAt } };
    plan.effects.unshift(seat);
    p4Set(plan, 'PeriodRegistration', registration, { shiftCount: registration.shiftCount + (samePeriodMove ? 0 : 1), status: 'ACTIVE', submittedAt: null });
    const assignment = p4New(plan, 'ShiftAssignment', { shiftId, employeeId, registrationId: registration.id,
        status: 'REGISTERED', isActive: true, source: admin ? 'ADMIN' : 'SELF_REGISTERED',
        ...(movedFrom ? { movedFromAssignmentId: movedFrom } : {}) });
    await p4AssignWaitingViewings(plan, shiftId);
    return assignment;
}
async function p4Cancel(plan, assignment, admin = false, samePeriodMove = false) {
    const shift = await p4Get('Shift', assignment.shiftId), period = await p4Get('RegistrationPeriod', shift.periodId);
    p4Require(assignment.status === 'REGISTERED' && new Date(shift.startsAt) > new Date(), 'CANNOT_CANCEL_ASSIGNMENT');
    if (!admin) p4Require(period.status !== 'FINALIZED', 'PERIOD_FINALIZED');
    const registration = await p4Get('PeriodRegistration', assignment.registrationId);
    p4Set(plan, 'Shift', shift, { assignedCount: Math.max(0, shift.assignedCount - 1) });
    if (!samePeriodMove) p4Set(plan, 'PeriodRegistration', registration, { shiftCount: Math.max(0, registration.shiftCount - 1), status: 'ACTIVE', submittedAt: null });
    const after = p4Set(plan, 'ShiftAssignment', assignment, { status: 'CANCELLED', isActive: false });
    await p4Redistribute(plan, [assignment]);
    return after;
}
async function p4TaskData(plan) {
    const [links, rows] = await Promise.all([p4Records('TaskShift', plan), p4Records('TaskAssignment', plan)]);
    const byTask = new Map(), linkTasks = new Map();
    const entry = id => {
        if (!byTask.has(id)) byTask.set(id, { links: [], rows: [] });
        return byTask.get(id);
    };
    for (const link of links) {
        entry(link.taskId).links.push(link);
        linkTasks.set(link.id, link.taskId);
    }
    for (const row of rows) {
        const ids = new Set([row.taskId, linkTasks.get(row.taskShiftId), linkTasks.get(row.shiftLinkId)].filter(Boolean));
        for (const id of ids) entry(id).rows.push(row);
    }
    return byTask;
}
async function p4TaskRows(taskId, plan, data) {
    const links = data ? [...(data.get(taskId)?.links || [])].sort((a, b) => new Date(a.linkedAt) - new Date(b.linkedAt) || a.id.localeCompare(b.id))
        : plan ? (await p4Records('TaskShift', plan)).filter(l => l.taskId === taskId).sort((a, b) => new Date(a.linkedAt) - new Date(b.linkedAt) || a.id.localeCompare(b.id))
        : await p4Collections.TaskShift.find({ taskId }).sort({ linkedAt: 1, id: 1 }).toArray();
    const rows = data ? data.get(taskId)?.rows || []
        : plan ? (await p4Records('TaskAssignment', plan)).filter(r => r.taskId === taskId || links.some(l => l.id === (r.taskShiftId || r.shiftLinkId)))
        : await p4Collections.TaskAssignment.find({ $or: [{ taskId }, { taskShiftId: { $in: links.map(l => l.id) } }, { shiftLinkId: { $in: links.map(l => l.id) } }] }).toArray();
    // Historical assignments with a successor are no longer current.
    const sources = new Set(rows.map(r => r.fromTaskAssignmentId).filter(Boolean));
    const latest = rows.filter(r => !sources.has(r.id) && !r.transferredTo && !r.waitingAdmin && !r.removed);
    // Seed uses links without successor metadata; last link per employee wins.
    const order = r => links.findIndex(l => l.id === (r.taskShiftId || r.shiftLinkId));
    return { links, rows, current: latest.filter(r => r.taskId || !latest.some(o => !o.taskId && o.employeeId === r.employeeId && order(o) > order(r))) };
}
async function p4TaskView(task, plan, privateViewing = false, taskRows) {
    const { links, rows, current } = taskRows || await p4TaskRows(task.id, plan);
    const viewing = task.kind === 'VIEWING' ? await p4ViewingView(task.viewingId, privateViewing, plan) : null;
    return { kind: 'GENERAL', description: '', ...p4Clean(task), shiftLinks: links.map(p4Clean), assignees: rows.map(p4Clean), currentAssignees: current.map(p4Clean), ...(viewing ? { viewing } : {}) };
}
async function p4TaskSummary(plan, task, { checkOut = false, data, assignments } = {}) {
    const latest = plan.effects.filter(e => e.type === 'Task' && e.after?.id === task.id).at(-1)?.after || task;
    if (latest.kind === 'VIEWING' || ['DONE', 'CANCELLED', 'PENDING_CONFIRM'].includes(latest.status)) return latest;
    const { current, rows } = await p4TaskRows(task.id, plan, data);
    const pending = rows.some(r => r.waitingAdmin && !r.removed && !r.transferredTo);
    let status = pending ? 'WAITING_ADMIN' : current.length ? 'IN_PROGRESS' : 'UNASSIGNED';
    // GENERAL completion needs the last assignee's check-out, then admin review.
    if (!pending && checkOut && current.length && current.every(r => r.personalStatus === 'DONE')) {
        const byAssignment = assignments || new Map((await p4Records('ShiftAssignment', plan)).map(a => [a.id, a]));
        if (current.every(r => byAssignment.get(r.assignmentId)?.status === 'COMPLETED')) status = 'PENDING_CONFIRM';
    }
    return p4Set(plan, 'Task', latest, { status, ...(status === 'PENDING_CONFIRM' ? { pendingConfirmAt: plan.at } : {}) });
}
function p4ViewingTimes() {
    return [7, 8, 9, 10, 13, 14, 15, 16].flatMap(hour => ['00', '30'].map(minute => `${String(hour).padStart(2, '0')}:${minute}`));
}
function p4ViewingSchedule(date, startTime) {
    p4Require(p3Date(date), 'INVALID_VIEWING_DATE', 400);
    p4Require(typeof startTime === 'string' && p4ViewingTimes().includes(startTime), 'VIEWING_OUTSIDE_SHIFT_HOURS', 400);
    const startAt = p4At(date, startTime), endAt = new Date(+startAt + 30 * 60000);
    return { date, startTime, endTime: new Date(+endAt + 7 * 3600000).toISOString().slice(11, 16), startAt, endAt };
}
async function p4OwnedViewing(req, id) {
    const viewing = await viewingCollection.findOne(recordFilter(id));
    p4Require(viewing, 'VIEWING_NOT_FOUND', 404);
    p4Require(String(viewing.customerId) === String(req.p2Account._id)
        && viewing.customerProfileId === req.p2Customer.id, 'NOT_YOUR_VIEWING', 403);
    return viewing;
}
async function p4ViewingConflict(plan, viewing) {
    return (await p4Records('Viewing', plan)).some(v => v.id !== viewing.id
        && ['CHO_XAC_NHAN', 'DA_XAC_NHAN'].includes(v.status)
        && String(v.customerId) === String(viewing.customerId) && +new Date(v.startAt) === +new Date(viewing.startAt));
}
async function p4ViewingOut(viewing, plan) {
    const details = (await p4Records('ViewingDetail', plan)).filter(d => d.viewingId === viewing.id).sort((a, b) => a.order - b.order);
    const rooms = await p4Records('Room', plan), properties = await p4Records('Property', plan);
    const employee = viewing.employeeId && (await p4Records('Employee', plan)).find(e => e.id === viewing.employeeId);
    const roomsInfo = (viewing.rooms?.length ? viewing.rooms : details).map(detail => {
        const room = rooms.find(r => r.id === detail.roomId);
        const snapshot = detail.roomSnapshot || details.find(d => d.roomId === detail.roomId)?.roomSnapshot || viewing.roomSnapshot || {};
        const value = room || snapshot, property = properties.find(p => p.id === value.propertyId);
        const image = value.image || value.thumbnail || value.images?.[0];
        return { roomId: detail.roomId, code: value.code || '', name: value.name || '',
            address: value.address || property?.address || '', price: value.monthlyRent ?? value.price ?? 0,
            image: typeof image === 'string' ? image : image?.url || '' };
    });
    return { ...p4Clean(publicRecord(viewing)), details: details.map(d => p4Clean(publicRecord(d))), roomsInfo,
        guide: employee ? { employeeId: employee.id, employeeCode: employee.employeeCode || '',
            fullName: employee.fullName || '', phone: employee.phone || '' } : null,
        canEdit: p4ActiveViewing(viewing, new Date()) };
}
async function p4ViewingDescription(viewing, plan) {
    const rooms = await p4ViewingView(viewing.id, false, plan);
    return `Giờ xem: ${p4ViewingTime(viewing)}. Mã phòng: ${(rooms?.rooms || []).map(r => r.code || r.roomId).join(', ')}.${viewing.note ? ` Ghi chú: ${viewing.note}` : ''}`;
}
async function p4ViewingView(id, detailed = false, plan) {
    const viewing = (await p4Records('Viewing', plan)).find(v => v.id === id);
    if (!viewing) return null;
    const details = (await p4Records('ViewingDetail', plan)).filter(d => d.viewingId === id).sort((a, b) => a.order - b.order);
    const rooms = await p4Records('Room', plan), properties = detailed ? await p4Records('Property', plan) : [];
    return { id: viewing.id, status: viewing.status, date: viewing.date, startTime: viewing.startTime, endTime: viewing.endTime,
        viewerName: viewing.viewerName || viewing.visitorName, peopleCount: viewing.peopleCount ?? viewing.visitorCount,
        ...(detailed ? { viewerPhone: viewing.viewerPhone || viewing.visitorPhone, note: viewing.note || '' } : {}),
        rooms: (details.length ? details : viewing.rooms || []).map(detail => {
            const room = rooms.find(r => r.id === detail.roomId), property = properties.find(p => p.id === room?.propertyId);
            return { roomId: detail.roomId, code: room?.code || detail.code || '', name: room?.name || detail.name || '',
                ...(detailed ? { detailId: detail.id, address: property?.address || '', viewStatus: detail.viewStatus, note: detail.note || '' } : {}) };
        }) };
}
function p4ViewingTime(viewing) {
    const local = new Date(new Date(viewing.startAt).getTime() + 7 * 3600000).toISOString();
    return `${local.slice(11, 16)} ${local.slice(8, 10)}/${local.slice(5, 7)}/${local.slice(0, 4)}`;
}
function p4ActiveViewing(viewing, now) {
    return viewing && ['CHO_XAC_NHAN', 'DA_XAC_NHAN'].includes(viewing.status) && new Date(viewing.startAt) > now;
}
async function p4Notify(plan, accountId, type, entityType, entityId, title, body, eventId) {
    if (!accountId) return;
    const dedupeKey = `${accountId}:${eventId}`;
    if (plan.effects.some(e => e.type === 'Notification' && e.after?.dedupeKey === dedupeKey)
        || await notificationCollection.findOne({ dedupeKey })) return;
    p4New(plan, 'Notification', { accountId, type, entityType, entityId, title, body, read: false, readAt: null, createdAt: plan.at, dedupeKey });
}
async function p4ViewingAssigned(plan, task, viewing, employeeId, eventId, incrementVersion = true) {
    const time = p4ViewingTime(viewing), previousId = viewing.employeeId;
    const after = p4Set(plan, 'Viewing', viewing, { taskId: task.id, employeeId: employeeId || null, updatedAt: plan.at,
        version: (viewing.version || 0) + (incrementVersion ? 1 : 0) });
    if (previousId && previousId !== employeeId) {
        const previous = await employeeCollection.findOne({ id: previousId });
        await p4Notify(plan, previous?.accountId, 'VIEWING_REASSIGNED', 'Viewing', viewing.id,
            'Lịch xem phòng đã được chuyển phân công', `Lịch xem ${time} đã được chuyển phân công.`, `${eventId}:old`);
    }
    if (employeeId && previousId !== employeeId) {
        const employee = await employeeCollection.findOne({ id: employeeId });
        await p4Notify(plan, employee?.accountId, 'VIEWING_TASK_ASSIGNED', 'Task', task.id,
            'Bạn được giao dẫn khách xem phòng', `${task.title} — ${time}.`, `${eventId}:new`);
        const customer = await customerCollection.findOne({ id: viewing.customerProfileId });
        await p4Notify(plan, customer?.accountId, 'VIEWING_ASSIGNED', 'Viewing', viewing.id,
            'Lịch xem phòng đã được phân công', `Lịch xem ${time} đã có nhân viên phụ trách.`, `${eventId}:customer`);
    }
    return after;
}
async function p4WaitingNotice(plan, task, eventId, viewing) {
    const admins = await accountCollection.find({ role: 'ADMIN', status: 'ACTIVE' }).toArray();
    const title = viewing ? 'Lịch xem chưa có nhân viên phụ trách' : 'Công việc cần sắp xếp';
    for (const admin of admins) await p4Notify(plan, admin.id, 'TASK_WAITING_ADMIN', 'Task', task.id,
        title, viewing ? `${title} — ${p4ViewingTime(viewing)}.` : `${task.title} — chưa có nhân viên phụ trách.`, eventId);
}
async function p4ViewingShift(viewing, plan) {
    if (!viewing) return null;
    return (await p4Records('Shift', plan)).filter(s => new Date(s.startsAt) <= new Date(viewing.startAt)
        && new Date(s.endsAt) >= new Date(viewing.endAt)).sort((a, b) => a.id.localeCompare(b.id))[0] || null;
}
async function p4PickLeastBusy(shiftId, excludeEmployeeIds = [], plan) {
    const employees = new Set((await p4Records('Employee', plan)).filter(e => e.status === 'ACTIVE').map(e => e.id));
    const candidates = (await p4Records('ShiftAssignment', plan)).filter(a => a.shiftId === shiftId
        && ['REGISTERED', 'IN_PROGRESS'].includes(a.status) && employees.has(a.employeeId) && !excludeEmployeeIds.includes(a.employeeId));
    if (!candidates.length) return null;
    const counts = new Map(candidates.map(a => [a.id, 0]));
    const data = await p4TaskData(plan);
    for (const task of (await p4Records('Task', plan)).filter(t => !['DONE', 'CANCELLED', 'PENDING_CONFIRM'].includes(t.status))) {
        const { current } = await p4TaskRows(task.id, plan, data);
        for (const row of current) if (row.personalStatus !== 'DONE' && counts.has(row.assignmentId)) counts.set(row.assignmentId, counts.get(row.assignmentId) + 1);
    }
    const minimum = Math.min(...counts.values()), tied = candidates.filter(a => counts.get(a.id) === minimum);
    return tied[crypto.randomInt(tied.length)];
}
async function p4EmployeeFreeAt(plan, employeeId, viewing, shift) {
    if (!employeeId || !shift || !(new Date(shift.startsAt) <= new Date(viewing.startAt)
        && new Date(shift.endsAt) >= new Date(viewing.endAt))) return null;
    const employee = (await p4Records('Employee', plan)).find(e => e.id === employeeId && e.status === 'ACTIVE');
    if (!employee) return null;
    const assignment = (await p4Records('ShiftAssignment', plan)).find(a => a.employeeId === employeeId
        && a.shiftId === shift.id && ['REGISTERED', 'IN_PROGRESS'].includes(a.status));
    if (!assignment) return null;
    const busy = (await p4Records('Viewing', plan)).some(v => v.id !== viewing.id && v.employeeId === employeeId
        && ['CHO_XAC_NHAN', 'DA_XAC_NHAN'].includes(v.status) && +new Date(v.startAt) === +new Date(viewing.startAt));
    return busy ? null : assignment;
}
async function p4PickViewingEmployee(plan, viewing, shift) {
    if (!shift) return null;
    const candidates = [];
    for (const a of (await p4Records('ShiftAssignment', plan)).filter(a => a.shiftId === shift.id
        && ['REGISTERED', 'IN_PROGRESS'].includes(a.status))) {
        if (!candidates.some(c => c.employeeId === a.employeeId) && await p4EmployeeFreeAt(plan, a.employeeId, viewing, shift)) candidates.push(a);
    }
    if (!candidates.length) return null;
    const mine = (await p4Records('Viewing', plan)).filter(v => v.id !== viewing.id
        && String(v.customerId) === String(viewing.customerId) && ['CHO_XAC_NHAN', 'DA_XAC_NHAN'].includes(v.status)
        && candidates.some(a => a.employeeId === v.employeeId)).sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
    for (const previous of mine) {
        if ((await p4ViewingShift(previous, plan))?.id === shift.id) return candidates.find(a => a.employeeId === previous.employeeId);
    }
    const counts = new Map(candidates.map(a => [a.id, 0])), data = await p4TaskData(plan);
    for (const task of (await p4Records('Task', plan)).filter(t => !['DONE', 'CANCELLED', 'PENDING_CONFIRM'].includes(t.status))) {
        const { current } = await p4TaskRows(task.id, plan, data);
        for (const row of current) if (row.personalStatus !== 'DONE' && counts.has(row.assignmentId)) counts.set(row.assignmentId, counts.get(row.assignmentId) + 1);
    }
    const minimum = Math.min(...counts.values()), tied = candidates.filter(a => counts.get(a.id) === minimum);
    return tied[crypto.randomInt(tied.length)];
}
// Guides are fixed only once the week's registration period is FINALIZED ("Đã chốt").
async function p4ViewingFinalized(plan, shift) {
    if (!shift?.periodId) return false;
    return (await p4Records('RegistrationPeriod', plan)).find(p => p.id === shift.periodId)?.status === 'FINALIZED';
}
async function p4AssignViewingTask(plan, task, viewing) {
    if (task.kind !== 'VIEWING' || task.status !== 'WAITING_ADMIN' || !p4ActiveViewing(viewing, plan.at)) return task;
    const { current, rows, links } = await p4TaskRows(task.id, plan);
    if (current.length) return task;
    const shift = await p4ViewingShift(viewing, plan);
    if (!await p4ViewingFinalized(plan, shift)) {
        // Booked far ahead: confirmed, "đang đợi người hỗ trợ" until finalize. No admin alert yet.
        if (viewing.taskId !== task.id || viewing.employeeId) await p4ViewingAssigned(plan, task, viewing, null, `p4-viewing-pending:${task.id}`);
        return task;
    }
    if (shift && task.currentShiftId !== shift.id) task = p4Set(plan, 'Task', task, { currentShiftId: shift.id });
    const link = shift && (links.find(l => l.shiftId === shift.id && !l.removed) || p4New(plan, 'TaskShift', {
        taskId: task.id, shiftId: shift.id, linkedAt: plan.at, reason: 'ORIGIN', by: plan.actorId }));
    const target = await p4PickViewingEmployee(plan, viewing, shift);
    if (!target) {
        if (viewing.taskId !== task.id || viewing.employeeId) await p4ViewingAssigned(plan, task, viewing, null, `p4-viewing-wait:${task.id}`);
        // Transfer already reports this waiting episode. Maintenance must not send
        // another notification using the initial-booking dedupe key.
        if (!rows.some(r => r.waitingAdmin && !r.removed && !r.transferredTo)) {
            await p4WaitingNotice(plan, task, `p4-viewing-wait:${task.id}`, viewing);
        }
        return task;
    }
    const waiting = rows.filter(r => r.waitingAdmin && !r.removed && !r.transferredTo);
    const next = p4New(plan, 'TaskAssignment', { taskId: task.id, taskShiftId: link.id, shiftLinkId: link.id,
        assignmentId: target.id, employeeId: target.employeeId, personalStatus: 'TODO', doneAt: null,
        ...(waiting.length ? { fromTaskAssignmentId: waiting[0].id } : {}) });
    for (const row of waiting) p4Set(plan, 'TaskAssignment', row, { removed: true, removedAt: plan.at,
        removedBy: plan.actorId, removeReason: 'REASSIGN', waitingAdmin: false, transferredTo: next.id });
    task = p4Set(plan, 'Task', task, { status: 'TODO', currentShiftId: shift.id });
    await p4ViewingAssigned(plan, task, viewing, target.employeeId, `p4-viewing-assign:${next.id}`);
    return task;
}
async function p4EnsureViewingTask(plan, viewing, assign = true) {
    let task = (await p4Records('Task', plan)).find(t => t.id === viewing.taskId || (t.kind === 'VIEWING' && t.viewingId === viewing.id));
    if (!task) {
        task = p4New(plan, 'Task', { kind: 'VIEWING', title: `Dẫn khách xem phòng – ${viewing.viewerName || viewing.visitorName || ''}`,
            description: await p4ViewingDescription(viewing, plan),
            viewingId: viewing.id, scheduledAt: viewing.startAt, scheduledEndAt: viewing.endAt,
            status: 'WAITING_ADMIN', currentShiftId: null, createdAt: plan.at, createdBy: plan.actorId, updatedAt: plan.at, updatedBy: plan.actorId }, `p4-viewing-${viewing.id}`);
        // Persist the relation with task creation even when there is no shift yet.
        p4Set(plan, 'Viewing', viewing, { taskId: task.id, employeeId: null, updatedAt: plan.at });
    }
    return assign ? p4AssignViewingTask(plan, task, viewing) : task;
}
async function p4AssignWaitingViewings(plan, shiftId) {
    const viewings = await p4Records('Viewing', plan);
    const shiftIds = shiftId instanceof Set ? shiftId : shiftId ? new Set([shiftId]) : null;
    // Earlier bookings get a guide first (matters at finalize when a slot has more viewings than staff).
    const created = task => +new Date(viewings.find(v => v.id === task.viewingId)?.createdAt || 0);
    const waiting = (await p4Records('Task', plan)).filter(t => t.kind === 'VIEWING' && t.status === 'WAITING_ADMIN')
        .sort((a, b) => created(a) - created(b));
    for (const task of waiting) {
        const viewing = viewings.find(v => v.id === task.viewingId);
        if (shiftIds && !shiftIds.has((await p4ViewingShift(viewing, plan))?.id)) continue;
        await p4AssignViewingTask(plan, task, viewing);
    }
}
async function p4RequireViewingCheckIn(viewing, employeeId, plan) {
    const task = (await p4Records('Task', plan)).find(t => t.id === viewing.taskId && t.kind === 'VIEWING');
    p4Require(task && !['DONE', 'CANCELLED'].includes(task.status), 'CHECK_IN_REQUIRED');
    const { current } = await p4TaskRows(task.id, plan);
    const part = current.find(r => r.employeeId === employeeId);
    const assignment = part && await p4Get('ShiftAssignment', part.assignmentId);
    p4Require(assignment?.status === 'IN_PROGRESS', 'CHECK_IN_REQUIRED');
    return { task, part };
}
async function p4Redistribute(plan, sources, { notifyGeneral = true } = {}) {
    const sourceIds = new Set(sources.map(a => a.id)), data = await p4TaskData(plan);
    const viewings = await p4Records('Viewing', plan);
    // One task scan for all ended/cancelled assignments. Completed parts stay intact.
    for (const task of (await p4Records('Task', plan)).filter(t => !['DONE', 'CANCELLED', 'PENDING_CONFIRM'].includes(t.status))) {
        const { current } = await p4TaskRows(task.id, plan, data);
        const parts = current.filter(r => sourceIds.has(r.assignmentId) && r.personalStatus !== 'DONE');
        if (!parts.length) continue;
        for (const row of parts) p4Set(plan, 'TaskAssignment', row, { waitingAdmin: true });
        p4Set(plan, 'Task', task, { status: 'WAITING_ADMIN' });
        const viewing = task.kind === 'VIEWING' ? viewings.find(v => v.id === task.viewingId) : null;
        if (viewing) await p4ViewingAssigned(plan, task, viewing, null, `p4-viewing-wait:${parts[0].id}`);
        if (notifyGeneral || task.kind === 'VIEWING') {
            for (const assignmentId of new Set(parts.map(r => r.assignmentId))) {
                await p4WaitingNotice(plan, task, `p4-wait:${task.id}:${assignmentId}`, viewing);
            }
        }
    }
}
async function p4EditTask(plan, task, body) {
    p4Require(task.status !== 'PENDING_CONFIRM', 'TASK_PENDING_CONFIRM');
    p4Require(!['DONE', 'CANCELLED'].includes(task.status), 'TASK_LOCKED');
    const fields = {};
    if (body.title !== undefined) {
        p4Require(task.kind !== 'VIEWING' || body.title === task.title, 'VIEWING_TITLE_LOCKED', 400);
        p4Require(typeof body.title === 'string' && body.title.trim() && body.title.trim().length <= 200, 'NAME_REQUIRED', 400);
        fields.title = body.title.trim();
    }
    if (body.description !== undefined) {
        p4Require(typeof body.description === 'string' && body.description.length <= 2000, 'INVALID_DESCRIPTION', 400);
        fields.description = body.description;
    }
    const viewing = task.kind === 'VIEWING' ? (await p4Records('Viewing', plan)).find(v => v.id === task.viewingId) : null;
    const viewingShift = task.kind === 'VIEWING' ? await p4ViewingShift(viewing, plan) : null;
    if (task.kind === 'VIEWING' && body.shiftId !== undefined) {
        p4Require(body.shiftId === viewingShift?.id, 'VIEWING_SHIFT_LOCKED', 400);
    }
    const shiftId = body.shiftId !== undefined ? body.shiftId : task.kind === 'VIEWING' ? viewingShift?.id : task.currentShiftId;
    const reassign = shiftId !== task.currentShiftId || ['UNASSIGNED', 'WAITING_ADMIN'].includes(task.status);
    const ids = body.assigneeAssignmentIds;
    if (ids !== undefined || (body.shiftId !== undefined && reassign)) {
        p4Require(task.kind !== 'VIEWING' || (Array.isArray(ids) && ids.length === 1), 'ONE_ASSIGNEE_REQUIRED', 400);
        p4Require(Array.isArray(ids) && ids.length, 'ASSIGNEES_REQUIRED', 400);
        p4Require(ids.every(id => typeof id === 'string') && new Set(ids).size === ids.length, 'INVALID_ASSIGNEE');
        p4Require(typeof shiftId === 'string' && shiftId, 'INVALID_ASSIGNEE');
        const shift = (await p4Records('Shift', plan)).find(s => s.id === shiftId);
        p4Require(shift && shift.status === 'OPEN' && new Date(shift.endsAt) > plan.at, 'SHIFT_CLOSED');
        const assignments = await p4Records('ShiftAssignment', plan), employees = await p4Records('Employee', plan);
        const targets = ids.map(id => assignments.find(a => a.id === id));
        p4Require(targets.every(a => a && a.shiftId === shiftId && ['REGISTERED', 'IN_PROGRESS'].includes(a.status)
            && employees.some(e => e.id === a.employeeId && e.status === 'ACTIVE')), 'INVALID_ASSIGNEE');
        const { current, rows, links } = await p4TaskRows(task.id, plan);
        const removed = reassign ? current : current.filter(r => !ids.includes(r.assignmentId));
        if (!reassign) p4Require(removed.every(r => r.personalStatus !== 'DONE'), 'ASSIGNEE_DONE');
        const pending = rows.filter(r => r.waitingAdmin && !r.removed && !r.transferredTo);
        const replaced = [...removed, ...pending];
        for (const row of replaced) p4Set(plan, 'TaskAssignment', row, { removed: true, removedAt: plan.at, removedBy: plan.actorId,
            removeReason: reassign ? 'REASSIGN' : 'ADMIN_EDIT', waitingAdmin: false });
        const link = (!reassign && links.filter(l => l.shiftId === shiftId).at(-1)) || p4New(plan, 'TaskShift', { taskId: task.id, shiftId,
            linkedAt: plan.at, reason: 'ADMIN_ASSIGN', ...(task.currentShiftId ? { fromShiftId: task.currentShiftId } : {}), by: plan.actorId });
        let index = 0;
        for (const target of targets.filter(a => reassign || !current.some(r => r.assignmentId === a.id))) {
            const previous = replaced[index++];
            const next = p4New(plan, 'TaskAssignment', { taskId: task.id, taskShiftId: link.id, shiftLinkId: link.id,
                assignmentId: target.id, employeeId: target.employeeId, personalStatus: 'TODO', doneAt: null,
                ...(previous ? { fromTaskAssignmentId: previous.id } : {}) });
            if (previous) p4Set(plan, 'TaskAssignment', previous, { transferredTo: next.id });
            if (viewing) await p4ViewingAssigned(plan, task, viewing, target.employeeId, `p4-viewing-edit:${next.id}`);
            else if (task.kind !== 'VIEWING') await p4Notify(plan, employees.find(e => e.id === target.employeeId)?.accountId, 'TASK_ASSIGNED', 'Task', task.id,
                'Công việc mới được giao', `Bạn được giao công việc "${fields.title || task.title}".`, `p4-task-assign:${next.id}`);
        }
        fields.currentShiftId = shiftId;
        const allDone = !reassign && targets.every(a => current.some(r => r.assignmentId === a.id && r.personalStatus === 'DONE'));
        fields.status = allDone ? (task.kind === 'VIEWING' ? 'DONE' : 'IN_PROGRESS') : 'TODO';
        task = p4Set(plan, 'Task', task, fields);
    } else task = p4Set(plan, 'Task', task, fields);
    return p4TaskView(task, plan);
}
async function p4TaskOutcomeNotice(plan, task, parts, type, body) {
    const employeeIds = new Set(parts.map(r => r.employeeId));
    for (const employee of (await p4Records('Employee', plan)).filter(e => employeeIds.has(e.id))) {
        await p4Notify(plan, employee.accountId, type, 'Task', task.id,
            type === 'TASK_CONFIRMED' ? 'Công việc đã được xác nhận' : 'Công việc chưa được xác nhận', body,
            `p4-task-outcome:${task.id}:${type}:${plan.at.toISOString()}`);
    }
}
async function p4ConfirmTask(plan, task) {
    p4Require(task.status === 'PENDING_CONFIRM', 'TASK_NOT_PENDING_CONFIRM');
    const { current } = await p4TaskRows(task.id, plan);
    const after = p4Set(plan, 'Task', task, { status: 'DONE', confirmedAt: plan.at, confirmedBy: plan.actorId });
    await p4TaskOutcomeNotice(plan, task, current, 'TASK_CONFIRMED', `Công việc "${task.title}" đã được xác nhận hoàn thành.`);
    return p4TaskView(after, plan);
}
async function p4RejectTask(plan, task, body) {
    p4Require(task.status === 'PENDING_CONFIRM', 'TASK_NOT_PENDING_CONFIRM');
    p4Require(typeof body.reason === 'string' && body.reason.trim().length >= 3 && body.reason.length <= 500, 'REASON_REQUIRED', 400);
    const reason = body.reason.trim(), reassign = body.shiftId !== undefined || body.assigneeAssignmentIds !== undefined;
    if (reassign) {
        p4Require(typeof body.shiftId === 'string' && body.shiftId && Array.isArray(body.assigneeAssignmentIds)
            && body.assigneeAssignmentIds.length > 0, 'INVALID_ASSIGNEE');
        const shift = (await p4Records('Shift', plan)).find(s => s.id === body.shiftId);
        p4Require(shift && shift.status === 'OPEN', 'INVALID_ASSIGNEE');
        p4Require(new Date(shift.startsAt) > plan.at, 'SHIFT_STARTED');
        p4Require(new Date(shift.endsAt) > plan.at, 'INVALID_ASSIGNEE');
    }
    const { current } = await p4TaskRows(task.id, plan);
    for (const row of current) p4Set(plan, 'TaskAssignment', row, { rejectedAt: plan.at, rejectedBy: plan.actorId,
        rejectReason: reason, personalStatus: 'TODO', doneAt: null, waitingAdmin: true });
    task = p4Set(plan, 'Task', task, { status: 'WAITING_ADMIN', pendingConfirmAt: null });
    await p4TaskOutcomeNotice(plan, task, current, 'TASK_REJECTED', `Công việc "${task.title}" chưa được xác nhận hoàn thành: ${reason}.`);
    return reassign ? p4EditTask(plan, task, { shiftId: body.shiftId, assigneeAssignmentIds: body.assigneeAssignmentIds }) : p4TaskView(task, plan);
}
// Explicit legacy admin carry only; ended/cancelled shifts always use waitingAdmin.
async function p4Transfer(plan, req, row, task, source, target) {
    if (p4CarryDecision(row, target).type === 'SKIP') return;
    p4Require(target, 'INVALID_ASSIGNEE');
    const link = plan.effects.find(e => e.type === 'TaskShift' && e.after?.taskId === task.id
        && e.after.fromAssignmentId === source.id && e.after.shiftId === target.shiftId)?.after
        || p4New(plan, 'TaskShift', { taskId: task.id, shiftId: target.shiftId, fromAssignmentId: source.id,
            fromShiftId: source.shiftId, transferredAt: plan.at, linkedAt: plan.at, reason: 'CARRY_OVER', by: req.p2Account.id });
    const next = p4New(plan, 'TaskAssignment', { taskId: task.id, taskShiftId: link.id, shiftLinkId: link.id,
        assignmentId: target.id, employeeId: target.employeeId, personalStatus: 'TODO', doneAt: null, fromTaskAssignmentId: row.id });
    p4Set(plan, 'TaskAssignment', row, { transferredTo: next.id, waitingAdmin: false });
    if (task.kind === 'VIEWING') {
        const viewing = (await p4Records('Viewing', plan)).find(v => v.id === task.viewingId);
        if (viewing) await p4ViewingAssigned(plan, task, viewing, target.employeeId, `p4-viewing-transfer:${next.id}`);
    }
}
async function p4Evidence(plan, attendanceId, kind, body) {
    const url = body.evidenceUrl || body.evidence?.url;
    p4Require(typeof url === 'string' && /^\/uploads\/attendance\/[a-zA-Z0-9_.-]+\.(jpe?g|png|webp)$/i.test(url), 'ATTENDANCE_PHOTO_REQUIRED', 400);
    return p4New(plan, 'AttendanceEvidence', { attendanceId, kind, url, takenAt: plan.at });
}
async function p4CheckIn(plan, req) {
    const a = await p4Owned(req, req.params.id), shift = await p4Get('Shift', a.shiftId), now = plan.at;
    p4Require(a.status === 'REGISTERED' && shift.status === 'OPEN', 'CHECK_IN_STATE');
    p4Require(new Date(shift.startsAt) <= now && now < new Date(shift.endsAt), 'OUTSIDE_CHECK_IN_WINDOW');
    const location = await p4Get('WorkLocation', shift.workLocationId);
    const geo = req.body.geo || req.body.checkInGeo;
    const lat = geo?.lat ?? geo?.coordinates?.[1], lng = geo?.lng ?? geo?.coordinates?.[0];
    p4Require(typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180, 'INVALID_COORDINATES', 400);
    p4Require(location.allowedRadiusM > 0, 'WORK_LOCATION_NOT_CONFIGURED');
    p4Require(p4Distance({ lat, lng }, { lat: location.geo.coordinates[1], lng: location.geo.coordinates[0] }) <= location.allowedRadiusM, 'OUTSIDE_WORK_LOCATION');
    const attendanceId = `p4-att-${a.id}`;
    const evidence = await p4Evidence(plan, attendanceId, 'CHECK_IN', req.body);
    let adjustmentId = null;
    const minutes = p4LateMinutes(shift.startsAt, now);
    if (minutes) {
        const policies = (await p4Collections.Policy.find({ type: 'PHAT_TRE', status: 'ACTIVE' }).toArray())
            .filter(p => new Date(p.effectiveFrom) <= now && (!p.effectiveTo || now < new Date(p.effectiveTo)))
            .sort((x, y) => new Date(y.effectiveFrom) - new Date(x.effectiveFrom));
        p4Require(policies.length, 'POLICY_NOT_CONFIGURED');
        const levels = await p4Collections.PolicyLevel.find({ policyId: policies[0].id }).toArray();
        const level = p4Penalty(minutes, levels);
        p4Require(level && Number.isSafeInteger(level.amount) && level.amount >= 0, 'POLICY_NOT_CONFIGURED');
        const month = p3Month(now);
        const period = await p4Collections.PayrollPeriod.findOne({ year: Number(month.slice(0, 4)), month: Number(month.slice(5)) });
        p4Require(period && !['CLOSED', 'PAID'].includes(period.status), 'PAYROLL_PERIOD_LOCKED_OR_MISSING');
        let slip = await p4Collections.Payslip.findOne({ periodId: period.id, employeeId: a.employeeId });
        let adjustment = slip?.adjustmentId && await p4Get('PayrollAdjustment', slip.adjustmentId);
        if (!adjustment) {
            adjustment = p4New(plan, 'PayrollAdjustment', { periodId: period.id, policyLevelId: level.id,
                totalBonus: 0, totalDeduction: 0, notes: '', status: 'DRAFT' });
            if (slip) p4Set(plan, 'Payslip', slip, { adjustmentId: adjustment.id });
            else {
                const employee = await p4Get('Employee', a.employeeId);
                slip = p4New(plan, 'Payslip', { periodId: period.id, employeeId: a.employeeId, adjustmentId: adjustment.id,
                    commissionId: null, baseSalary: employee.baseSalary || 0, totalRevenue: 0, commissionAmount: 0,
                    totalDeductions: 0, netPay: employee.baseSalary || 0, status: 'DRAFT' });
            }
        }
        p4Require(adjustment.status === 'DRAFT', 'ADJUSTMENT_LOCKED');
        adjustmentId = adjustment.id;
        p4Set(plan, 'PayrollAdjustment', adjustment, { policyLevelId: level.id,
            totalDeduction: adjustment.totalDeduction + level.amount,
            notes: `${adjustment.notes || ''}\n${shift.date}: trễ ${minutes} phút; attendance ${attendanceId}; ${level.id}: ${level.amount} VND`.trim() });
    }
    p4New(plan, 'Attendance', { assignmentId: a.id, checkInAt: now,
        checkInGeo: { type: 'Point', coordinates: [lng, lat] }, checkOutAt: null,
        workedMinutes: null, adjustmentId, evidence: [p4Clean(evidence)], note: String(req.body.note || '').slice(0, 500) }, attendanceId);
    return p4Set(plan, 'ShiftAssignment', a, { status: 'IN_PROGRESS' });
}
async function p4CheckOut(plan, req) {
    const a = await p4Owned(req, req.params.id);
    if (a.status === 'COMPLETED') return p4Clean(a);
    p4Require(a.status === 'IN_PROGRESS', 'CHECK_OUT_STATE');
    p4Require(req.body.confirmed === true, 'CHECK_OUT_CONFIRMATION_REQUIRED', 400);
    const record = await p4Collections.Attendance.findOne({ assignmentId: a.id });
    p4Require(record && !record.checkOutAt, 'ATTENDANCE_STATE');
    const evidence = await p4Evidence(plan, record.id, 'CHECK_OUT', req.body);
    p4Set(plan, 'Attendance', record, { checkOutAt: plan.at,
        workedMinutes: Math.max(0, Math.floor((plan.at - new Date(record.checkInAt)) / 60000)),
        evidence: [...(record.evidence || []), p4Clean(evidence)] });
    const after = p4Set(plan, 'ShiftAssignment', a, { status: 'COMPLETED' });
    await p4Redistribute(plan, [a], { notifyGeneral: false });
    const data = await p4TaskData(plan);
    const assignments = new Map((await p4Records('ShiftAssignment', plan)).map(row => [row.id, row]));
    let pendingConfirmCount = 0, waitingAdminCount = 0;
    for (const task of (await p4Records('Task', plan)).filter(t => t.kind !== 'VIEWING' && !['DONE', 'CANCELLED'].includes(t.status))) {
        const { current, rows } = await p4TaskRows(task.id, plan, data);
        if (!current.some(r => r.assignmentId === a.id)
            && !rows.some(r => r.assignmentId === a.id && r.waitingAdmin && !r.removed && !r.transferredTo)) continue;
        const summary = await p4TaskSummary(plan, task, { checkOut: true, data, assignments });
        if (summary.status === 'PENDING_CONFIRM') pendingConfirmCount++;
        if (summary.status === 'WAITING_ADMIN') waitingAdminCount++;
    }
    if (pendingConfirmCount + waitingAdminCount > 0) {
        const shift = await p4Get('Shift', a.shiftId), date = `${shift.date.slice(8, 10)}/${shift.date.slice(5, 7)}`;
        const body = `${req.p2Employee.fullName} đã hoàn thành ${shift.label} ${date}: ${pendingConfirmCount} việc chờ xác nhận, ${waitingAdminCount} việc chờ giao lại.`;
        for (const admin of await accountCollection.find({ role: 'ADMIN', status: 'ACTIVE' }).toArray()) {
            await p4Notify(plan, admin.id, 'TASKS_PENDING_CONFIRM', 'ShiftAssignment', a.id,
                'Kết quả hoàn thành ca làm', body, `p4-checkout:${a.id}`);
        }
    }
    return after;
}
async function p4Maintenance() {
    await p4Recover();
    const req = { body: {}, p2Account: { id: null } }, now = new Date();
    const periods = await p4Collections.RegistrationPeriod.find({ status: { $in: ['DRAFT', 'OPEN'] } }).toArray();
    for (const p of periods) {
        if (now >= new Date(p.closesAt)) await p4Execute(req, 'autoClose', async plan => p4Close(plan, p, 'CLOSED'));
    }
    const ended = await p4Collections.Shift.find({ endsAt: { $lte: now } }).toArray();
    const absent = await p4Collections.ShiftAssignment.find({ shiftId: { $in: ended.map(s => s.id) }, status: 'REGISTERED' }).toArray();
    if (absent.length) {
        const attended = new Set((await p4Collections.Attendance.find({ assignmentId: { $in: absent.map(a => a.id) } }).toArray()).map(a => a.assignmentId));
        const missing = absent.filter(a => !attended.has(a.id));
        if (missing.length) await p4Execute(req, 'absent', async plan => {
            for (const a of missing) p4Set(plan, 'ShiftAssignment', a, { status: 'ABSENT' });
            await p4Redistribute(plan, missing);
            return { assignmentIds: missing.map(a => a.id) };
        });
    }
    const viewings = await p4Collections.Viewing.find({ status: { $in: ['CHO_XAC_NHAN', 'DA_XAC_NHAN'] }, startAt: { $gt: now } }).toArray();
    for (const viewing of viewings) {
        const task = viewing.taskId && await p4Collections.Task.findOne({ id: viewing.taskId });
        if (!task || (task.kind === 'VIEWING' && task.status === 'WAITING_ADMIN')) {
            await p4Execute(req, `repairViewing:${viewing.id}`, plan => p4EnsureViewingTask(plan, viewing));
        }
    }
}
async function p4Close(plan, period, status, fillTag) {
    const employees = await employeeCollection.find({ status: 'ACTIVE' }).toArray();
    const shifts = await p4Records('Shift', plan), periodIds = new Set(shifts.filter(s => s.periodId === period.id).map(s => s.id));
    const assignments = (await p4Records('ShiftAssignment', plan)).filter(a => a.status !== 'CANCELLED');
    const shiftMap = new Map(shifts.map(s => [s.id, s]));
    const minimum = period.minShifts ?? 5, maximum = Math.min(8, period.maxShifts ?? 8);
    const changedShifts = new Set();
    // Random top-up to the minimum runs when a period closes AND again when an admin finalizes it
    // (shifts may have been removed after closing). Only future shifts with free seats are used.
    // fillTag: explicit "Xếp bù ca thiếu" action on a CLOSED/FINALIZED period (status unchanged).
    const randomize = !!fillTag || (status === 'CLOSED' && ['DRAFT', 'OPEN'].includes(period.status))
        || (status === 'FINALIZED' && period.status === 'CLOSED');
    const noticeTag = fillTag || status;
    const pending = [...employees];
    while (pending.length) {
        const employee = pending.splice(randomize ? crypto.randomInt(pending.length) : 0, 1)[0];
        const mine = assignments.filter(a => a.employeeId === employee.id);
        let count = mine.filter(a => periodIds.has(a.shiftId)).length, added = 0;
        const needsMore = count < minimum;
        if (randomize) while (count < Math.min(minimum, maximum)) {
            const candidates = [...shiftMap.values()].filter(s => periodIds.has(s.id) && s.status === 'OPEN'
                && new Date(s.startsAt) > plan.at && s.assignedCount < Math.min(6, s.capacity)
                && !mine.some(a => a.shiftId === s.id || (shiftMap.has(a.shiftId)
                    && new Date(shiftMap.get(a.shiftId).startsAt) < new Date(s.endsAt)
                    && new Date(shiftMap.get(a.shiftId).endsAt) > new Date(s.startsAt))));
            if (!candidates.length) break;
            const leastAssigned = Math.min(...candidates.map(s => s.assignedCount));
            const tied = candidates.filter(s => s.assignedCount === leastAssigned);
            const shift = tied[crypto.randomInt(tied.length)];
            const reserved = p4Set(plan, 'Shift', shift, { assignedCount: shift.assignedCount + 1 },
                { assignedCount: { $lt: Math.min(6, shift.capacity) }, status: 'OPEN' });
            shiftMap.set(shift.id, reserved);
            changedShifts.add(shift.id);
            const registration = await p4Registration(plan, period.id, employee.id);
            const assignment = p4New(plan, 'ShiftAssignment', { shiftId: shift.id, employeeId: employee.id,
                registrationId: registration.id, status: 'REGISTERED', isActive: true, source: 'AUTO_RANDOM' });
            assignments.push(assignment);
            mine.push(assignment);
            count++;
            added++;
        }
        const registration = await p4Registration(plan, period.id, employee.id);
        p4Set(plan, 'PeriodRegistration', registration, { shiftCount: count,
            status: count >= minimum && count <= maximum ? 'CONFIRMED' : 'BELOW_MINIMUM' });
        if (randomize && needsMore && added) await p4Notify(plan, employee.accountId, 'SHIFT_AUTO_ASSIGNED', 'RegistrationPeriod', period.id,
            'Hệ thống đã xếp thêm ca trực', `Hệ thống đã xếp thêm ${added} ca cho tuần ${period.weekStart}.`, `p4-random:${period.id}:${noticeTag}:${employee.id}`);
        if (randomize && count < minimum) {
            for (const admin of await accountCollection.find({ role: 'ADMIN', status: 'ACTIVE' }).toArray()) {
                await p4Notify(plan, admin.id, 'SHIFT_BELOW_MINIMUM', 'RegistrationPeriod', period.id,
                    'Chưa xếp đủ ca trực', `${employee.fullName || employee.employeeCode}: đã có ${count}/${minimum} ca cho tuần ${period.weekStart}, không còn ca phù hợp.`,
                    `p4-random-short:${period.id}:${noticeTag}:${employee.id}`);
            }
        }
    }
    // All random seats are visible in the same plan before assigning pending viewings.
    const after = p4Set(plan, 'RegistrationPeriod', period, { status });
    // FINALIZED → every pending viewing of this week now gets its guide (customer is notified).
    if (status === 'FINALIZED') await p4AssignWaitingViewings(plan, periodIds);
    else if (changedShifts.size) await p4AssignWaitingViewings(plan, changedShifts);
    return after;
}
async function p4PeriodView(period) {
    const shifts = await p4Collections.Shift.find({ periodId: period.id }).toArray(), ids = shifts.map(s => s.id);
    const assignmentCount = await p4Collections.ShiftAssignment.countDocuments({ shiftId: { $in: ids }, status: { $ne: 'CANCELLED' } });
    const links = await p4Collections.TaskShift.find({ shiftId: { $in: ids } }).toArray();
    const tasks = await p4Collections.Task.find({ currentShiftId: { $in: ids } }).toArray();
    const taskCount = new Set([...links.map(l => l.taskId), ...tasks.map(t => t.id)]).size;
    return { ...p4Clean(period), shiftCount: shifts.length, assignmentCount, taskCount, canDelete: !assignmentCount && !taskCount };
}
async function initializeP4() {
    for (const col of Object.values(p4Collections)) await col.createIndex({ id: 1 }, { unique: true });
    await p4Collections.RegistrationPeriod.createIndex({ weekStart: 1 }, { unique: true });
    await p4Collections.PeriodRegistration.createIndex({ periodId: 1, employeeId: 1 }, { unique: true });
    await p4Collections.Shift.createIndex({ periodId: 1, date: 1, startTime: 1 }, { unique: true });
    await p4Collections.ShiftAssignment.createIndex({ shiftId: 1, employeeId: 1 }, { unique: true, partialFilterExpression: { isActive: true } });
    await p4Collections.Attendance.createIndex({ assignmentId: 1 }, { unique: true });
    await p4Collections.AttendanceEvidence.createIndex({ attendanceId: 1, kind: 1 }, { unique: true });
    await p4Collections.TaskAssignment.createIndex({ fromTaskAssignmentId: 1 }, { unique: true, sparse: true });
    await auditCollection.createIndex({ p4Key: 1 }, { unique: true, sparse: true });
    await p4Serial(p4Maintenance);
    const timer = setInterval(() => p4Serial(p4Maintenance).catch(error => console.error('P4 maintenance:', error.message)), 60000);
    timer.unref();
}

app.get('/data/registration-periods/current', p4Employee, p4Route(async (req, res) => {
    const now = new Date();
    const period = await p4Collections.RegistrationPeriod.findOne({ status: 'OPEN', opensAt: { $lte: now }, closesAt: { $gt: now } });
    res.send(p4Clean(period));
}));
app.get('/data/shifts', p4Staff, p4Route(async (req, res) => {
    p4Require(typeof req.query.periodId === 'string', 'PERIOD_REQUIRED', 400);
    res.send((await p4Collections.Shift.find({ periodId: req.query.periodId }).sort({ startsAt: 1 }).toArray()).map(p4Clean));
}));
app.post('/data/me/shift-registrations', p4Employee, p4Route(async (req, res) => {
    const { periodId, shiftIds, submit } = req.body;
    p4Require(Array.isArray(shiftIds) && shiftIds.length <= 8 && shiftIds.every(id => typeof id === 'string') && new Set(shiftIds).size === shiftIds.length, 'INVALID_SHIFT_IDS', 400);
    p4Open(await p4Get('RegistrationPeriod', periodId));
    const results = [];
    for (const shiftId of shiftIds) {
        try {
            p4Require((await p4Get('Shift', shiftId)).periodId === periodId, 'SHIFT_PERIOD_MISMATCH', 400);
            const assignment = await p4Execute(req, `register:${periodId}:${shiftId}`, plan => p4Register(plan, req.p2Employee.id, shiftId));
            results.push({ shiftId, ok: true, assignment });
        } catch (error) {
            if (!error.status && error.code !== 11000) throw error;
            const code = error.code === 11000 ? 'ALREADY_REGISTERED' : error.code;
            results.push({ shiftId, ok: false, error: { code, message: p4Message(code) } });
        }
    }
    let registration = await p4Collections.PeriodRegistration.findOne({ periodId, employeeId: req.p2Employee.id });
    if (submit && results.every(r => r.ok)) {
        p4Require(p4ShiftLimit(registration?.shiftCount || 0, true), 'REQUIRE_5_TO_8_SHIFTS');
        registration = await p4Execute(req, `submit:${periodId}`, async plan => p4Set(plan, 'PeriodRegistration', registration, { submittedAt: plan.at, status: 'CONFIRMED' }));
    }
    res.status(results.some(r => !r.ok) ? 409 : 200).send({ results, shiftCount: registration?.shiftCount || 0 });
}));
app.get('/data/me/shift-assignments', p4Employee, p4Route(async (req, res) => {
    await p4Maintenance();
    const records = await p4Collections.ShiftAssignment.find({ employeeId: req.p2Employee.id }).toArray();
    // Current task rows of this employee, computed once (not once per assignment).
    const counts = new Map(), data = await p4TaskData(), now = new Date();
    for (const task of await p4Collections.Task.find({ status: { $ne: 'CANCELLED' } }).toArray()) {
        for (const row of (await p4TaskRows(task.id, undefined, data)).current.filter(r => r.employeeId === req.p2Employee.id)) {
            const count = counts.get(row.assignmentId) || { taskCount: 0, openTaskCount: 0 };
            count.taskCount++;
            if (!['DONE', 'PENDING_CONFIRM'].includes(task.status) && row.personalStatus !== 'DONE') count.openTaskCount++;
            counts.set(row.assignmentId, count);
        }
    }
    const shifts = new Map((await p4Collections.Shift.find({ id: { $in: records.map(a => a.shiftId) } }).toArray()).map(s => [s.id, s]));
    const attendanceByAssignment = new Map((await p4Collections.Attendance.find({ assignmentId: { $in: records.map(a => a.id) } }).toArray()).map(a => [a.assignmentId, a]));
    const result = [];
    for (const a of records) {
        // A deletable period can still have cancelled assignment history.
        const shift = shifts.get(a.shiftId) || a.shiftSnapshot || null;
        if (req.query.periodId && shift?.periodId !== req.query.periodId) continue;
        const attendance = attendanceByAssignment.get(a.id) || null;
        const count = counts.get(a.id) || { taskCount: 0, openTaskCount: 0 };
        const canCheckIn = a.status === 'REGISTERED' && shift?.status === 'OPEN'
            && new Date(shift.startsAt) <= now && now < new Date(shift.endsAt);
        result.push({ ...p4Clean(a), shift: p4Clean(shift), attendance: p4Clean(attendance), ...count, canCheckIn });
    }
    res.send(result);
}));
app.delete('/data/me/shift-assignments/:id', p4Employee, p4Route(async (req, res) => {
    res.send(await p4Execute(req, `cancel:${req.params.id}`, async plan => p4Cancel(plan, await p4Owned(req, req.params.id))));
}));
app.post('/data/me/shift-assignments/:id/check-in', p4Employee, p4Route(async (req, res) => {
    res.send(await p4Execute(req, `checkIn:${req.params.id}`, plan => p4CheckIn(plan, req)));
}));
app.post('/data/me/shift-assignments/:id/check-out', p4Employee, p4Route(async (req, res) => {
    res.send(await p4Execute(req, `checkOut:${req.params.id}`, plan => p4CheckOut(plan, req)));
}));
app.get('/data/me/shift-assignments/:id/tasks', p4Employee, p4Route(async (req, res) => {
    const assignment = await p4Owned(req, req.params.id);
    const tasks = await p4Collections.Task.find({ status: { $ne: 'CANCELLED' } }).toArray(), result = [];
    const data = await p4TaskData();
    for (const t of tasks) {
        const taskRows = await p4TaskRows(t.id, undefined, data), { rows, current } = taskRows;
        const parts = rows.filter(r => r.assignmentId === assignment.id && r.employeeId === req.p2Employee.id);
        const part = parts.find(r => current.some(c => c.id === r.id)) || parts.at(-1);
        if (!part) continue;
        const isCurrent = current.some(r => r.id === part.id);
        const view = await p4TaskView(t, undefined, isCurrent && t.kind === 'VIEWING', taskRows);
        result.push({ ...view, mine: { taskAssignmentId: part.id, personalStatus: part.personalStatus, current: isCurrent },
            editable: assignment.status === 'IN_PROGRESS' && isCurrent && !['DONE', 'CANCELLED', 'PENDING_CONFIRM'].includes(t.status) });
    }
    res.send(result);
}));
app.put('/data/tasks/:id/my-status', p4Employee, p4Route(async (req, res) => {
    res.send(await p4Execute(req, `taskStatus:${req.params.id}`, async plan => {
        const a = await p4Owned(req, req.body.assignmentId), task = await p4Get('Task', req.params.id);
        p4Require(task.status !== 'CANCELLED', 'TASK_NOT_EDITABLE');
        p4Require(task.kind !== 'VIEWING', 'VIEWING_TASK_AUTO');
        p4Require(a.status === 'IN_PROGRESS' && !['DONE', 'PENDING_CONFIRM'].includes(task.status), 'TASK_NOT_EDITABLE');
        p4Require(['TODO', 'DONE'].includes(req.body.personalStatus), 'INVALID_TASK_STATUS', 400);
        const { current } = await p4TaskRows(task.id), parts = current.filter(r => r.assignmentId === a.id && r.employeeId === a.employeeId);
        p4Require(parts.length, 'NOT_YOUR_TASK', 403);
        for (const row of parts) p4Set(plan, 'TaskAssignment', row, { personalStatus: req.body.personalStatus, doneAt: req.body.personalStatus === 'DONE' ? plan.at : null });
        await p4TaskSummary(plan, task);
        return { id: task.id };
    }));
}));
app.get('/data/admin/registration-periods', p4Admin, p4Route(async (req, res) => {
    await p4Maintenance();
    const result = [];
    for (const period of await p4Collections.RegistrationPeriod.find({}).sort({ weekStart: 1 }).toArray()) result.push(await p4PeriodView(period));
    res.send(result);
}));
app.post('/data/admin/registration-periods', p4Admin, p4Route(async (req, res) => {
    res.status(201).send(await p4Execute(req, 'createPeriod', async plan => {
        const { weekStart, name } = req.body || {};
        p4Require(typeof weekStart === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(weekStart) && new Date(`${weekStart}T00:00:00Z`).getUTCDay() === 1 && p4Day(weekStart) === weekStart, 'MONDAY_REQUIRED', 400);
        p4Require(typeof name === 'string' && name.trim() && name.trim().length <= 200, 'NAME_REQUIRED', 400);
        p4Require(!await p4Collections.RegistrationPeriod.findOne({ weekStart }), 'WEEK_EXISTS');
        const locations = await p4Collections.WorkLocation.find({}).toArray();
        p4Require(locations.length === 1 && locations[0].allowedRadiusM > 0, 'ONE_HEADQUARTERS_REQUIRED');
        const period = p4New(plan, 'RegistrationPeriod', { name: name.trim(), weekStart, weekEnd: p4Day(weekStart, 6),
            opensAt: p4At(p4Day(weekStart, -4), '08:00'), closesAt: p4At(p4Day(weekStart, -1), '20:00'),
            minShifts: 5, maxShifts: 8, status: 'DRAFT' });
        for (let day = 0; day < 7; day++) for (const [startTime, , endTime, label] of VIEWING_WINDOWS) {
            const date = p4Day(weekStart, day);
            p4New(plan, 'Shift', { periodId: period.id, workLocationId: locations[0].id, date, label,
                startTime, endTime, startsAt: p4At(date, startTime), endsAt: p4At(date, endTime), capacity: 6, assignedCount: 0, status: 'OPEN' });
        }
        await p4AssignWaitingViewings(plan);
        return period;
    }));
}));
app.put('/data/admin/registration-periods/:id', p4Admin, p4Route(async (req, res) => {
    res.send(await p4Execute(req, `renamePeriod:${req.params.id}`, async plan => {
        const { name } = req.body || {};
        p4Require(typeof name === 'string' && name.trim().length >= 1 && name.trim().length <= 200, 'NAME_REQUIRED', 400);
        return p4Set(plan, 'RegistrationPeriod', await p4Get('RegistrationPeriod', req.params.id), { name: name.trim() });
    }));
}));
app.delete('/data/admin/registration-periods/:id', p4Admin, p4Route(async (req, res) => {
    res.send(await p4Execute(req, `deletePeriod:${req.params.id}`, async plan => {
        const period = await p4Get('RegistrationPeriod', req.params.id), view = await p4PeriodView(period);
        p4Require(view.canDelete, 'PERIOD_IN_USE');
        for (const registration of await p4Collections.PeriodRegistration.find({ periodId: period.id }).toArray()) p4Remove(plan, 'PeriodRegistration', registration);
        for (const shift of await p4Collections.Shift.find({ periodId: period.id }).toArray()) {
            for (const assignment of await p4Collections.ShiftAssignment.find({ shiftId: shift.id, status: 'CANCELLED' }).toArray()) {
                p4Set(plan, 'ShiftAssignment', assignment, { shiftSnapshot: p4Clean(shift) });
            }
            p4Remove(plan, 'Shift', shift);
        }
        p4Remove(plan, 'RegistrationPeriod', period);
        return { id: period.id, deleted: true };
    }));
}));
for (const [action, status] of [['open', 'OPEN'], ['close', 'CLOSED'], ['finalize', 'FINALIZED']]) {
    app.post(`/data/admin/registration-periods/:id/${action}`, p4Admin, p4Route(async (req, res) => {
        res.send(await p4Execute(req, `${action}:${req.params.id}`, async plan => {
            const p = await p4Get('RegistrationPeriod', req.params.id);
            if (p.status === status) return p4Clean(p);
            if (action === 'open') {
                p4Require(p.status === 'DRAFT' && new Date(p.opensAt) <= plan.at && plan.at < new Date(p.closesAt), 'PERIOD_OPEN_WINDOW');
                return p4Set(plan, 'RegistrationPeriod', p, { status });
            }
            p4Require(action === 'close' ? ['DRAFT', 'OPEN'].includes(p.status) : p.status === 'CLOSED', 'PERIOD_STATE');
            return p4Close(plan, p, status);
        }));
    }));
}
// Admin "Xếp bù ca thiếu": top every ACTIVE employee up to the minimum on a CLOSED/FINALIZED period
// (future shifts with free seats only). The period status does not change.
app.post('/data/admin/registration-periods/:id/fill-minimum', p4Admin, p4Route(async (req, res) => {
    res.send(await p4Execute(req, `fillMinimum:${req.params.id}`, async plan => {
        const p = await p4Get('RegistrationPeriod', req.params.id);
        p4Require(['CLOSED', 'FINALIZED'].includes(p.status), 'PERIOD_STATE');
        p4Require(new Date(`${p.weekEnd}T17:00:00+07:00`) > plan.at, 'PERIOD_ENDED');
        return p4Close(plan, p, p.status, `FILL-${new Date(plan.at).getTime()}`);
    }));
}));
app.get('/data/admin/shift-state', p4Admin, p4Route(async (req, res) => {
    await p4Maintenance();
    const result = {};
    for (const type of ['Shift', 'ShiftAssignment', 'Attendance', 'WorkLocation', 'Employee', 'PeriodRegistration', 'Policy', 'PolicyLevel']) result[type] = (await p4Collections[type].find({}).toArray()).map(p4Clean);
    result.ShiftAssignment = result.ShiftAssignment.map(a => ({ source: null, ...a }));
    const data = await p4TaskData();
    result.Task = await Promise.all((await p4Collections.Task.find({}).toArray()).map(async task => p4TaskView(task, undefined, false, await p4TaskRows(task.id, undefined, data))));
    res.send(result);
}));
app.post('/data/admin/shift-registrations', p4Admin, p4Route(async (req, res) => {
    res.send(await p4Execute(req, 'adminRegister', async plan => {
        const employee = await p4Get('Employee', req.body.employeeId);
        p4Require(employee.status === 'ACTIVE', 'INACTIVE_EMPLOYEE');
        return p4Register(plan, employee.id, req.body.shiftId, true);
    }));
}));
app.delete('/data/admin/shift-assignments/:id', p4Admin, p4Route(async (req, res) => {
    res.send(await p4Execute(req, `adminCancel:${req.params.id}`, async plan => p4Cancel(plan, await p4Get('ShiftAssignment', req.params.id), true)));
}));
app.post('/data/admin/shift-assignments/:id/move', p4Admin, p4Route(async (req, res) => {
    res.send(await p4Execute(req, `move:${req.params.id}`, async plan => {
        const a = await p4Get('ShiftAssignment', req.params.id), source = await p4Get('Shift', a.shiftId), target = await p4Get('Shift', req.body.toShiftId);
        p4Require(a.shiftId !== target.id, 'SAME_SHIFT');
        const next = await p4Register(plan, a.employeeId, target.id, true, a.id);
        await p4Cancel(plan, a, true, source.periodId === target.periodId);
        return next;
    }));
}));
app.get('/data/admin/tasks', p4Admin, p4Route(async (req, res) => {
    const query = req.query.status ? { status: req.query.status } : {};
    const tasks = await p4Collections.Task.find(query).sort({ createdAt: -1, id: -1 }).toArray();
    const data = await p4TaskData(), employees = new Map((await p4Records('Employee')).map(e => [e.id, e]));
    const shifts = new Map((await p4Records('Shift')).map(s => [s.id, s])), result = [];
    const pendingAssignmentIds = new Set();
    for (const task of tasks.filter(t => t.status === 'PENDING_CONFIRM')) {
        for (const row of (await p4TaskRows(task.id, undefined, data)).current) pendingAssignmentIds.add(row.assignmentId);
    }
    const attendanceByAssignment = new Map((await p4Collections.Attendance.find({ assignmentId: { $in: [...pendingAssignmentIds] } }).toArray()).map(a => [a.assignmentId, a]));
    for (const task of tasks) {
        const taskRows = await p4TaskRows(task.id, undefined, data), view = await p4TaskView(task, undefined, false, taskRows);
        const shift = shifts.get(task.currentShiftId);
        const assignees = taskRows.current.map(row => ({ ...p4Clean(row), employeeCode: employees.get(row.employeeId)?.employeeCode || '',
            fullName: employees.get(row.employeeId)?.fullName || '' }));
        const pendingConfirm = task.status === 'PENDING_CONFIRM' ? { at: task.pendingConfirmAt,
            shift: shift ? { id: shift.id, date: shift.date, label: shift.label, startsAt: shift.startsAt } : null,
            employees: [...new Map(taskRows.current.map(row => [row.employeeId, { employeeId: row.employeeId,
                fullName: employees.get(row.employeeId)?.fullName || '', employeeCode: employees.get(row.employeeId)?.employeeCode || '',
                checkOutAt: attendanceByAssignment.get(row.assignmentId)?.checkOutAt || null }])).values()] } : null;
        result.push({ ...view, currentShift: shift ? { id: shift.id, date: shift.date, label: shift.label, startTime: shift.startTime, endTime: shift.endTime } : null,
            assignees, currentAssignees: assignees, pendingConfirm });
    }
    res.send(result);
}));
app.post('/data/admin/tasks', p4Admin, p4Route(async (req, res) => {
    res.status(201).send(await p4Execute(req, 'createTask', async plan => {
        const { title, shiftId, assigneeAssignmentIds } = req.body || {};
        p4Require(typeof title === 'string' && title.trim() && title.trim().length <= 200, 'NAME_REQUIRED', 400);
        p4Require(req.body.description === undefined || (typeof req.body.description === 'string' && req.body.description.length <= 2000), 'INVALID_DESCRIPTION', 400);
        const task = p4New(plan, 'Task', { kind: 'GENERAL', title: title.trim(), description: req.body.description || '', status: 'UNASSIGNED',
            createdAt: plan.at, createdBy: req.p2Account.id, updatedAt: plan.at, updatedBy: plan.actorId, currentShiftId: null });
        if (shiftId != null && shiftId !== '') return p4EditTask(plan, task, { shiftId, assigneeAssignmentIds });
        p4Require(assigneeAssignmentIds === undefined || (Array.isArray(assigneeAssignmentIds) && !assigneeAssignmentIds.length), 'INVALID_ASSIGNEE');
        return p4TaskView(task, plan);
    }));
}));
app.put('/data/admin/tasks/:id', p4Admin, p4Route(async (req, res) => {
    res.send(await p4Execute(req, `editTask:${req.params.id}`, async plan => p4EditTask(plan, await p4Get('Task', req.params.id), req.body || {})));
}));
app.post('/data/admin/tasks/:id/confirm', p4Admin, p4Route(async (req, res) => {
    res.send(await p4Execute(req, `confirmTask:${req.params.id}`, async plan => p4ConfirmTask(plan, await p4Get('Task', req.params.id))));
}));
app.post('/data/admin/tasks/:id/reject', p4Admin, p4Route(async (req, res) => {
    res.send(await p4Execute(req, `rejectTask:${req.params.id}`, async plan => p4RejectTask(plan, await p4Get('Task', req.params.id), req.body || {})));
}));
app.delete('/data/admin/tasks/:id', p4Admin, p4Route(async (req, res) => {
    res.send(await p4Execute(req, `deleteTask:${req.params.id}`, async plan => {
        const task = await p4Get('Task', req.params.id);
        p4Require(task.status !== 'PENDING_CONFIRM', 'TASK_PENDING_CONFIRM');
        p4Require(task.kind !== 'VIEWING', 'VIEWING_TASK_CANCEL_VIA_VIEWING');
        const { current, rows, links } = await p4TaskRows(task.id);
        p4Require(task.status !== 'DONE' && !rows.some(r => r.personalStatus === 'DONE'), 'TASK_HAS_PROGRESS');
        for (const row of current) {
            const employee = await employeeCollection.findOne({ id: row.employeeId });
            await p4Notify(plan, employee?.accountId, 'TASK_CANCELLED', 'Task', task.id,
                'Công việc đã bị xóa', task.title, `p4-delete-task:${task.id}`);
        }
        for (const row of rows) p4Remove(plan, 'TaskAssignment', row);
        for (const link of links) p4Remove(plan, 'TaskShift', link);
        p4Remove(plan, 'Task', task);
        return { id: task.id, deleted: true };
    }));
}));
app.post('/data/admin/tasks/:id/carry', p4Admin, p4Route(async (req, res) => {
    res.send(await p4Execute(req, `carry:${req.params.id}`, async plan => {
        const task = await p4Get('Task', req.params.id), target = await p4Get('Shift', req.body.toShiftId);
        p4Require(!['DONE', 'CANCELLED'].includes(task.status) && target.status === 'OPEN' && new Date(target.endsAt) > plan.at, 'CANNOT_CARRY_TASK');
        const ids = req.body.assigneeAssignmentIds;
        p4Require(Array.isArray(ids) && ids.length && ids.every(id => typeof id === 'string') && new Set(ids).size === ids.length, 'ASSIGNEES_REQUIRED', 400);
        p4Require(task.kind !== 'VIEWING' || ids.length === 1, 'ONE_ASSIGNEE_REQUIRED', 400);
        if (task.kind === 'VIEWING') {
            const viewing = await p4Get('Viewing', task.viewingId);
            p4Require((await p4ViewingShift(viewing, plan))?.id === target.id, 'VIEWING_SHIFT_LOCKED', 400);
        }
        const { current, rows } = await p4TaskRows(task.id);
        const pending = [...current.filter(r => r.personalStatus !== 'DONE'), ...rows.filter(r => r.waitingAdmin && !r.removed && !r.transferredTo)];
        const used = new Set();
        for (const id of ids) {
            const a = await p4Get('ShiftAssignment', id);
            p4Require(a.shiftId === target.id && ['REGISTERED', 'IN_PROGRESS'].includes(a.status), 'INVALID_ASSIGNEE');
            p4Require((await p4Get('Employee', a.employeeId)).status === 'ACTIVE', 'INACTIVE_EMPLOYEE');
            const row = pending.find(r => !used.has(r.id) && r.assignmentId !== a.id && r.employeeId === a.employeeId) || pending.find(r => !used.has(r.id) && r.assignmentId !== a.id);
            p4Require(row && row.assignmentId !== a.id, 'NO_PENDING_PART');
            used.add(row.id);
            await p4Transfer(plan, req, row, task, await p4Get('ShiftAssignment', row.assignmentId), a);
        }
        return p4Set(plan, 'Task', task, { currentShiftId: target.id, status: pending.some(r => r.waitingAdmin && !used.has(r.id)) ? 'WAITING_ADMIN' : 'IN_PROGRESS' });
    }));
}));
Object.assign(module.exports, { p4ShiftLimit, p4LateMinutes, p4Penalty, p4Distance, p4NextAssignment,
    p4CarryDecision, p4Collections, p4Run, p4Recover, p4Maintenance, initializeP4, p4PickLeastBusy, p4ViewingWindow,
    p4EmployeeFreeAt, p4PickViewingEmployee, p4ViewingOut });

// P5 — payroll/policy snapshots. Same single-process, standalone MongoDB style as P3/P4.
const p5Collections = Object.fromEntries([
    'PayrollPeriod', 'Payslip', 'PayrollAdjustment', 'EmployeeRevenue', 'CompanyRevenue',
    'Commission', 'BrokerageTransaction', 'Policy', 'PolicyLevel', 'Employee',
    'Attendance', 'ShiftAssignment', 'Shift', 'Contract', 'Room', 'Customer', 'Notification'
].map(name => [name, database.collection(name)]));
const p5Clean = row => row && Object.fromEntries(Object.entries(row)
    .filter(([key]) => key !== '_id' && key !== 'p3LastStep' && !key.startsWith('_p')));
const p5Get = async (type, id) => {
    const row = await p5Collections[type].findOne({ id });
    p3Assert(row, `${type.toUpperCase()}_NOT_FOUND`, 404);
    return row;
};
function p5Money(value) {
    p3Assert(Number.isSafeInteger(value) && value >= 0, 'INVALID_AMOUNT', 400);
    return value;
}
function p5Sum(values) { return p5Money(values.reduce((sum, value) => sum + p5Money(value), 0)); }
function p5Commission(revenue, levels) {
    p5Money(revenue);
    const matches = levels.filter(l => revenue >= l.from && (l.to == null || revenue < l.to));
    p3Assert(matches.length === 1 && Number.isInteger(matches[0].rateBps) && matches[0].rateBps >= 0 && matches[0].rateBps <= 10000, 'POLICY_NOT_CONFIGURED');
    return { policyLevelId: matches[0].id, rateBps: matches[0].rateBps,
        amount: p5Money(Math.round(revenue * matches[0].rateBps / 10000)) };
}
function p5Net(base, commission, bonus, deduction) {
    return Math.max(0, p5Sum([base, commission, bonus]) - p5Money(deduction));
}
function p5Mutable(period) {
    p3Assert(['OPEN', 'CALCULATED'].includes(period.status), 'PAYROLL_CLOSED');
    p3Assert(!period.p3Pending, 'REVENUE_PENDING');
}
function p5MonthBounds(code) {
    p3Assert(typeof code === 'string' && /^(20\d{2})-(0[1-9]|1[0-2])$/.test(code), 'INVALID_PERIOD', 400);
    const year = Number(code.slice(0, 4)), month = Number(code.slice(5));
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return { code, year, month, fromDate: `${code}-01`, toDate: `${code}-${last}`,
        start: new Date(`${code}-01T00:00:00+07:00`),
        end: new Date(Date.UTC(year, month, 1) - 7 * 3600000) };
}
function p5Levels(type, input) {
    p3Assert(['HOA_HONG', 'PHAT_TRE', 'GIU_CHO'].includes(type) && Array.isArray(input) && input.length > 0 &&
        input.every(l => l && typeof l === 'object'), 'INVALID_POLICY', 400);
    const levels = input.map(l => ({ from: p5Money(l.from), to: l.to == null ? null : p5Money(l.to),
        rateBps: type === 'HOA_HONG' ? p5Money(l.rateBps) : null,
        amount: type === 'HOA_HONG' ? null : p5Money(l.amount) })).sort((a, b) => a.from - b.from);
    levels.forEach((l, i) => {
        p3Assert(l.to == null || l.to > l.from, 'INVALID_POLICY_RANGE', 400);
        p3Assert(!i || (levels[i - 1].to != null && levels[i - 1].to <= l.from), 'POLICY_LEVEL_OVERLAP', 400);
        p3Assert(l.rateBps == null || l.rateBps <= 10000, 'INVALID_RATE', 400);
    });
    // Validate the agreed BR-18 schedule; calculation itself always reads stored levels.
    if (type === 'HOA_HONG') {
        const agreed = [[0, 10000000, 2000], [10000000, 15000000, 3000], [15000000, 20000000, 3500],
            [20000000, 30000000, 4000], [30000000, null, 4500]];
        p3Assert(JSON.stringify(levels.map(l => [l.from, l.to, l.rateBps])) === JSON.stringify(agreed), 'BR18_LEVELS_REQUIRED', 400);
    }
    p3Assert(type !== 'GIU_CHO' || levels.length === 1, 'HOLD_POLICY_SINGLE_LEVEL_REQUIRED', 400);
    return levels;
}
function p5Effect(plan, type, before, fields) {
    const after = { ...p5Clean(before), ...fields };
    if (!before) after.id = fields.id || `p5-${new ObjectId()}`;
    plan.effects.push({ type, before: p5Clean(before) || null, after });
    return after;
}
async function p5Run(op) {
    for (let i = op.cursor || 0; i < op.plan.effects.length; i++) {
        const e = op.plan.effects[i], col = p5Collections[e.type], token = `${op.id}:${i}`;
        const current = await col.findOne({ id: e.after.id });
        if (current?._p5Token !== token) {
            if (!e.before) {
                p3Assert(!current, 'PAYROLL_CONCURRENT_CHANGE');
                await col.insertOne({ ...e.after, _p5Token: token });
            } else {
                const expected = { ...e.before };
                const result = await col.updateOne(expected, { $set: { ...e.after, _p5Token: token } });
                if (!result.matchedCount) {
                    if (i === 0) await auditCollection.updateOne({ id: op.id }, { $set: { state: 'FAILED' } });
                    throw p3Error(i === 0 ? 409 : 503, 'PAYROLL_RECOVERY_REQUIRED');
                }
            }
        }
        const event = { id: `${token}:audit`, entityType: e.type, entityId: e.after.id,
            action: op.action, before: e.before, after: e.after, actorId: op.actorId, at: op.at };
        await auditCollection.updateOne({ id: event.id }, { $setOnInsert: event }, { upsert: true });
        await auditCollection.updateOne({ id: op.id }, { $set: { cursor: i + 1 } });
    }
    await auditCollection.updateOne({ id: op.id }, { $set: { state: 'DONE' } });
    return op.result;
}
async function p5Recover() {
    for (const op of await auditCollection.find({ entityType: 'P5Operation', state: 'PENDING' }).sort({ at: 1 }).toArray()) await p5Run(op);
}
async function p5Barrier() {
    return p3Serial(() => p4Serial(async () => { await p3Recover(); await p4Recover(); await p5Recover(); }));
}
async function p5Execute(req, action, prepare) {
    const key = req.get('Idempotency-Key');
    p3Assert(typeof key === 'string' && key.length >= 8 && key.length <= 160, 'IDEMPOTENCY_KEY_REQUIRED', 400);
    const p5Key = `${req.p2Account.id}:${key}`;
    const fingerprint = JSON.stringify(p3Stable({ action, path: req.path, body: req.body || {} }));
    const old = await auditCollection.findOne({ p5Key });
    if (old) {
        p3Assert(old.fingerprint === fingerprint, 'IDEMPOTENCY_CONFLICT');
        p3Assert(old.state !== 'FAILED', 'PAYROLL_CONCURRENT_CHANGE');
        return old.state === 'DONE' ? old.result : p5Run(old);
    }
    const plan = { effects: [], at: new Date() }, result = await prepare(plan);
    const op = { id: `p5-op-${new ObjectId()}`, entityType: 'P5Operation', action, actorId: req.p2Account.id,
        at: plan.at, p5Key, fingerprint, plan, result, state: 'PENDING', cursor: 0 };
    await auditCollection.insertOne(op);
    return p5Run(op);
}
function p5Route(handler) {
    return async (req, res) => {
        try {
            await p3Serial(() => p4Serial(async () => {
                await p3Recover(); await p4Recover(); await p5Recover(); await handler(req, res);
            }));
        } catch (error) {
            res.status(error.status || (error.code === 11000 ? 409 : 503)).send({
                code: error.code === 11000 ? 'DUPLICATE_RECORD' : error.code || 'PAYROLL_RECOVERY_REQUIRED', message: error.message
            });
        }
    };
}
async function p5Policy(at) {
    const policies = (await p5Collections.Policy.find({ type: 'HOA_HONG', status: { $in: ['ACTIVE', 'RETIRED'] } }).toArray())
        .filter(p => new Date(p.effectiveFrom) <= at && (!p.effectiveTo || at < new Date(p.effectiveTo)));
    p3Assert(policies.length === 1, 'POLICY_NOT_CONFIGURED');
    const policy = policies[0];
    const stored = await p5Collections.PolicyLevel.find({ policyId: policy.id }).toArray();
    const levels = stored.length ? stored : policy.levels || [];
    p5Levels('HOA_HONG', levels);
    return { policy, levels };
}
async function p5Transactions(code) {
    const { start, end } = p5MonthBounds(code);
    return p5Collections.BrokerageTransaction.find({ status: 'RECOGNIZED', recognizedAt: { $gte: start, $lt: end } }).toArray();
}
function p5ContractCount(rows) {
    // Legacy recognized transactions were created only on completion.
    return rows.filter(row => !row.outcome || row.outcome === 'SUCCESS').length;
}
async function p5AttendanceCounts(code) {
    const { start, end } = p5MonthBounds(code);
    const attendance = await p5Collections.Attendance.find({ checkInAt: { $gte: start, $lt: end }, checkOutAt: { $ne: null } }).toArray();
    const assignments = await p5Collections.ShiftAssignment.find({ id: { $in: attendance.map(a => a.assignmentId) } }).toArray();
    const counts = new Map();
    for (const row of attendance) {
        const employeeId = assignments.find(a => a.id === row.assignmentId)?.employeeId;
        if (employeeId) counts.set(employeeId, (counts.get(employeeId) || 0) + 1);
    }
    return counts;
}
async function p5TransactionDetails(rows) {
    const result = [];
    for (const t of rows) {
        const c = await p5Collections.Contract.findOne({ id: t.contractId });
        const roomId = c?.roomId || t.roomId, customerId = c?.customerId || t.customerId;
        const room = roomId && await p5Collections.Room.findOne({ id: roomId });
        const customer = customerId && await p5Collections.Customer.findOne({ id: customerId });
        const info = room || t.roomSnapshot || c?.roomSnapshot;
        result.push({ id: t.id, contractId: t.contractId, depositId: t.depositId, outcome: t.outcome,
            room: info ? [info.code, info.name, info.address].filter(Boolean).join(' · ') : roomId || '',
            customer: customer?.fullName || customer?.name || '', amount: t.finalFee, at: t.recognizedAt, status: t.status });
    }
    return result;
}
async function p5LateDetails(adjustment) {
    let lateness = [];
    // Seed notes are JSON; P4 appends one human-readable line per late check-in.
    try { lateness = JSON.parse((adjustment.notes || '{}').split('\n')[0]).lateness || []; } catch { /* P4 notes */ }
    const pattern = /trễ (\d+) phút; attendance ([^;\s]+); ([^:\s]+): (\d+) VND/g;
    for (const match of String(adjustment.notes || '').matchAll(pattern)) {
        if (!lateness.some(row => row.attendanceId === match[2])) lateness.push({ attendanceId: match[2],
            lateMinutes: Number(match[1]), policyLevelId: match[3], amount: Number(match[4]) });
    }
    return lateness;
}
async function p5SlipView(slip) {
    const adjustment = await p5Get('PayrollAdjustment', slip.adjustmentId);
    const commission = slip.commissionId ? await p5Get('Commission', slip.commissionId) : null;
    const period = await p5Get('PayrollPeriod', slip.periodId);
    const employee = await p5Get('Employee', slip.employeeId);
    const shiftCount = slip.shiftCount ?? (await p5AttendanceCounts(period.code)).get(slip.employeeId) ?? 0;
    const revenue = await p5Collections.EmployeeRevenue.findOne({ employeeId: slip.employeeId, periodId: period.id });
    const rows = slip.revenueDetails || await p5TransactionDetails((await p5Transactions(period.code))
        .filter(t => t.employeeRevenueId === revenue?.id || t.employeeId === slip.employeeId));
    return { ...p5Clean(slip), shiftCount, periodCode: period.code, periodStatus: period.status,
        employee: { id: employee.id, accountId: employee.accountId, fullName: employee.fullName,
            employeeCode: employee.employeeCode, position: employee.position },
        adjustment: p5Clean(adjustment), commission: p5Clean(commission), totalBonus: adjustment.totalBonus,
        lateness: slip.lateness || await p5LateDetails(adjustment), transactions: rows };
}
async function p5Calculate(plan, id) {
    const period = await p5Get('PayrollPeriod', id);
    p5Mutable(period);
    const { end } = p5MonthBounds(period.code);
    const { policy, levels } = await p5Policy(new Date(end.getTime() - 1));
    const transactions = await p5Transactions(period.code);
    const attendanceCounts = await p5AttendanceCounts(period.code);
    const existingRevenues = await p5Collections.EmployeeRevenue.find({ periodId: id }).toArray();
    const slips = await p5Collections.Payslip.find({ periodId: id }).toArray();
    const ids = new Set([...slips.map(s => s.employeeId), ...existingRevenues.map(r => r.employeeId)]);
    for (const t of transactions) {
        const linkedEmployeeId = existingRevenues.find(r => r.id === t.employeeRevenueId)?.employeeId;
        p3Assert(!t.employeeId || !linkedEmployeeId || t.employeeId === linkedEmployeeId, 'REVENUE_REFERENCE_MISMATCH');
        const employeeId = t.employeeId || linkedEmployeeId;
        p3Assert(employeeId, 'TRANSACTION_EMPLOYEE_MISSING'); ids.add(employeeId);
    }
    const employees = await p5Collections.Employee.find({ $or: [{ status: 'ACTIVE', startDate: { $lte: period.toDate } }, { id: { $in: [...ids] } }] }).toArray();
    p3Assert(employees.length && [...ids].every(id => employees.some(e => e.id === id)), 'EMPLOYEE_NOT_FOUND');
    const policyIds = new Set([policy.id]), snapshots = [];
    // First effect claims the period version. P3 and P4 use the same queues during the entire plan.
    const claimed = p5Effect(plan, 'PayrollPeriod', period, { version: (period.version || 0) + 1 });
    for (const employee of employees) {
        const er = existingRevenues.find(r => r.employeeId === employee.id);
        const rows = transactions.filter(t => t.employeeId === employee.id || t.employeeRevenueId === er?.id);
        const revenue = p5Sum(rows.map(t => t.finalFee)), commission = p5Commission(revenue, levels);
        const oldSlip = slips.find(s => s.employeeId === employee.id);
        const oldAdjustment = oldSlip?.adjustmentId ? await p5Get('PayrollAdjustment', oldSlip.adjustmentId) : null;
        p3Assert(!oldAdjustment || oldAdjustment.status === 'DRAFT' && oldAdjustment.periodId === id, 'ADJUSTMENT_LOCKED');
        const adjustment = p5Effect(plan, 'PayrollAdjustment', oldAdjustment, { periodId: id,
            policyLevelId: oldAdjustment?.policyLevelId || null, totalBonus: oldAdjustment?.totalBonus || 0,
            totalDeduction: oldAdjustment?.totalDeduction || 0, notes: oldAdjustment?.notes || 'Không điều chỉnh', status: 'DRAFT' });
        const lateness = await p5LateDetails(adjustment);
        const penaltyLevels = new Set([adjustment.policyLevelId, ...lateness.map(l => l.policyLevelId)].filter(Boolean));
        for (const levelId of penaltyLevels) {
            const level = await p5Get('PolicyLevel', levelId), penaltyPolicy = await p5Get('Policy', level.policyId);
            p3Assert(penaltyPolicy.type === 'PHAT_TRE', 'INVALID_PENALTY_POLICY'); policyIds.add(level.policyId);
        }
        const oldCommission = await p5Collections.Commission.findOne({ periodId: id, employeeId: employee.id });
        p3Assert(!oldSlip?.commissionId || oldSlip.commissionId === oldCommission?.id, 'COMMISSION_REFERENCE_MISMATCH');
        const c = p5Effect(plan, 'Commission', oldCommission, { employeeId: employee.id, periodId: id,
            ...commission, policyVersionId: policy.id, status: 'DRAFT' });
        const employeeRevenue = p5Effect(plan, 'EmployeeRevenue', er, { employeeId: employee.id, periodId: id,
            revenue, transactionCount: rows.length, commissionId: c.id });
        // Keep P3-generated transaction revenue references stable; never rewrite P3 data.
        p3Assert(rows.every(t => t.employeeRevenueId === employeeRevenue.id), 'REVENUE_REFERENCE_MISMATCH');
        const baseSalary = p5Money(employee.baseSalary);
        const snapshot = p5Effect(plan, 'Payslip', oldSlip, { periodId: id, employeeId: employee.id,
            baseSalary, totalRevenue: revenue, commissionId: c.id, commissionAmount: c.amount,
            adjustmentId: adjustment.id, totalBonus: adjustment.totalBonus, totalDeductions: adjustment.totalDeduction,
            netPay: p5Net(baseSalary, c.amount, adjustment.totalBonus, adjustment.totalDeduction),
            status: 'DRAFT', paidAt: null, revenueDetails: await p5TransactionDetails(rows), lateness,
            calculatedAt: plan.at, shiftCount: attendanceCounts.get(employee.id) || 0 });
        snapshots.push(snapshot);
    }
    const company = await p5Collections.CompanyRevenue.findOne({ periodId: id });
    p3Assert(transactions.every(t => t.companyRevenueId === company?.id), 'REVENUE_REFERENCE_MISMATCH');
    const revenue = p5Sum(transactions.map(t => t.finalFee));
    p3Assert(p5Sum(snapshots.map(s => s.totalRevenue)) === revenue, 'REVENUE_REFERENCE_MISMATCH');
    p5Effect(plan, 'CompanyRevenue', company, { periodId: id,
        revenue: p5Sum([revenue, company?.forfeitedHoldRevenue || 0]), transactionCount: transactions.length });
    return p5Effect(plan, 'PayrollPeriod', claimed, { status: 'CALCULATED', calculatedAt: plan.at,
        displayStatus: 'DA_TINH', policyVersionIds: [...policyIds],
        totals: { revenue, commission: p5Sum(snapshots.map(s => s.commissionAmount)),
            netPay: p5Sum(snapshots.map(s => s.netPay)), contractCount: p5ContractCount(transactions) } });
}
async function p5Notice(plan, slip, status) {
    const employee = await p5Get('Employee', slip.employeeId);
    p5Effect(plan, 'Notification', null, { accountId: employee.accountId, type: `PAYSLIP_${status}`,
        title: status === 'PAID' ? 'Phiếu lương đã thanh toán' : 'Phiếu lương đã được duyệt',
        body: `Phiếu ${slip.id}: ${slip.netPay.toLocaleString('vi-VN')} đ.`, entityType: 'Payslip', entityId: slip.id,
        createdAt: plan.at, read: false, readAt: null, dedupeKey: `p5:${slip.id}:${status}` });
}
const p5Admin = requireRole('ADMIN'), p5Employee = requireRole('EMPLOYEE');
app.get('/data/admin/payroll-periods', p5Admin, p5Route(async (req, res) => {
    res.send((await p5Collections.PayrollPeriod.find({}).sort({ code: 1 }).toArray()).map(p5Clean));
}));
app.post('/data/admin/payroll-periods', p5Admin, p5Route(async (req, res) => {
    res.status(201).send(await p5Execute(req, 'CREATE_PERIOD', async plan => {
        const { start, end, ...fields } = p5MonthBounds(req.body.code);
        p3Assert(!await p5Collections.PayrollPeriod.findOne({ year: fields.year, month: fields.month }), 'PERIOD_EXISTS');
        return p5Effect(plan, 'PayrollPeriod', null, { ...fields, name: `Lương tháng ${fields.month}/${fields.year}`,
            status: 'OPEN', displayStatus: 'DANG_MO', version: 0, closedAt: null, closedBy: null, policyVersionIds: [], totals: {} });
    }));
}));
app.post('/data/admin/payroll-periods/:id/calculate', p5Admin, p5Route(async (req, res) => {
    res.send(await p5Execute(req, 'CALCULATE', plan => p5Calculate(plan, req.params.id)));
}));
app.post('/data/admin/payroll-periods/:id/close', p5Admin, p5Route(async (req, res) => {
    res.send(await p5Execute(req, 'CLOSE', async plan => {
        const period = await p5Get('PayrollPeriod', req.params.id);
        p5Mutable(period); p3Assert(period.status === 'CALCULATED', 'CALCULATE_FIRST');
        // Rebuild once while both queues are held: P3/P4 changes since calculation cannot leave stale snapshots.
        const calculated = await p5Calculate(plan, period.id);
        for (const effect of plan.effects) {
            if (effect.type === 'Commission' || effect.type === 'PayrollAdjustment') effect.after.status = 'CLOSED';
        }
        return p5Effect(plan, 'PayrollPeriod', calculated, { status: 'CLOSED', displayStatus: 'DA_CHOT',
            closedAt: plan.at, closedBy: req.p2Account.id });
    }));
}));
app.get('/data/admin/payroll-periods/:id/payslips', p5Admin, p5Route(async (req, res) => {
    await p5Get('PayrollPeriod', req.params.id);
    res.send(await Promise.all((await p5Collections.Payslip.find({ periodId: req.params.id }).toArray()).map(p5SlipView)));
}));
app.post('/data/admin/payslips/:id/adjustments', p5Admin, p5Route(async (req, res) => {
    res.send(await p5Execute(req, 'ADJUST', async plan => {
        const slip = await p5Get('Payslip', req.params.id), period = await p5Get('PayrollPeriod', slip.periodId);
        p5Mutable(period); p3Assert(slip.status === 'DRAFT', 'PAYSLIP_LOCKED');
        const { kind, reason } = req.body, amount = p5Money(req.body.amount);
        p3Assert(['BONUS', 'DEDUCTION', 'LATE_PENALTY', 'ABSENCE'].includes(kind) && typeof reason === 'string' && reason.trim().length >= 3, 'INVALID_ADJUSTMENT', 400);
        const adjustment = await p5Get('PayrollAdjustment', slip.adjustmentId);
        p3Assert(adjustment.periodId === slip.periodId && adjustment.status === 'DRAFT', 'ADJUSTMENT_LOCKED');
        const bonus = p5Sum([adjustment.totalBonus, kind === 'BONUS' ? amount : 0]);
        const deduction = p5Sum([adjustment.totalDeduction, kind !== 'BONUS' ? amount : 0]);
        p5Effect(plan, 'PayrollAdjustment', adjustment, { totalBonus: bonus, totalDeduction: deduction,
            notes: `${adjustment.notes}\n${kind}: ${amount} VND; ${reason.trim()}` });
        const next = p5Effect(plan, 'Payslip', slip, { totalBonus: bonus, totalDeductions: deduction,
            netPay: p5Net(slip.baseSalary, slip.commissionAmount, bonus, deduction) });
        p5Effect(plan, 'PayrollPeriod', period, { status: 'OPEN', displayStatus: 'DANG_MO', version: (period.version || 0) + 1 });
        return next;
    }));
}));
for (const [action, from, to] of [['approve', 'DRAFT', 'APPROVED'], ['pay', 'APPROVED', 'PAID']]) {
    app.post(`/data/admin/payslips/:id/${action}`, p5Admin, p5Route(async (req, res) => {
        res.send(await p5Execute(req, action.toUpperCase(), async plan => {
            const slip = await p5Get('Payslip', req.params.id), period = await p5Get('PayrollPeriod', slip.periodId);
            p3Assert(period.status === 'CLOSED', 'CLOSE_PERIOD_FIRST');
            p3Assert(slip.status === from, 'INVALID_PAYSLIP_TRANSITION');
            const next = p5Effect(plan, 'Payslip', slip, { status: to,
                ...(to === 'PAID' ? { paidAt: plan.at } : { approvedAt: plan.at, approvedBy: req.p2Account.id }) });
            if (to === 'PAID') {
                if (slip.commissionId) p5Effect(plan, 'Commission', await p5Get('Commission', slip.commissionId), { status: 'PAID' });
                const others = await p5Collections.Payslip.find({ periodId: period.id, id: { $ne: slip.id }, status: { $ne: 'PAID' } }).toArray();
                if (!others.length) p5Effect(plan, 'PayrollPeriod', period, { status: 'PAID', displayStatus: 'DA_TRA', paidAt: plan.at });
            }
            await p5Notice(plan, next, to); return next;
        }));
    }));
}
app.get('/data/me/payroll-periods', p5Employee, p5Route(async (req, res) => {
    const slips = await p5Collections.Payslip.find({ employeeId: req.p2Employee.id }).toArray();
    res.send((await p5Collections.PayrollPeriod.find({ id: { $in: slips.map(s => s.periodId) },
        status: { $in: ['CALCULATED', 'CLOSED', 'PAID'] } }).sort({ code: 1 }).toArray()).map(p5Clean));
}));
app.get('/data/me/payslips', p5Employee, p5Route(async (req, res) => {
    p5MonthBounds(req.query.period);
    const period = await p5Collections.PayrollPeriod.findOne({ code: req.query.period, status: { $in: ['CALCULATED', 'CLOSED', 'PAID'] } });
    const slip = period && await p5Collections.Payslip.findOne({ periodId: period.id, employeeId: req.p2Employee.id });
    p3Assert(slip, 'PAYSLIP_NOT_FOUND', 404); res.send(await p5SlipView(slip));
}));
app.get('/data/admin/policies', p5Admin, p5Route(async (req, res) => {
    const rows = await p5Collections.Policy.find(req.query.type ? { type: String(req.query.type) } : {}).sort({ type: 1, version: -1 }).toArray();
    res.send(await Promise.all(rows.map(async p => ({ ...p5Clean(p),
        levels: (await p5Collections.PolicyLevel.find({ policyId: p.id }).sort({ from: 1 }).toArray()).map(p5Clean) }))));
}));
app.post('/data/admin/policies', p5Admin, p5Route(async (req, res) => {
    res.status(201).send(await p5Execute(req, 'CREATE_POLICY', async plan => {
        const { type, name } = req.body, levels = p5Levels(type, req.body.levels);
        const effectiveFrom = new Date(req.body.effectiveFrom), effectiveTo = req.body.effectiveTo ? new Date(req.body.effectiveTo) : null;
        p3Assert(typeof name === 'string' && name.trim() && Number.isFinite(+effectiveFrom) &&
            (!effectiveTo || Number.isFinite(+effectiveTo) && effectiveTo > effectiveFrom), 'INVALID_POLICY', 400);
        const previous = await p5Collections.Policy.find({ type }).sort({ version: -1 }).limit(1).toArray();
        const policy = p5Effect(plan, 'Policy', null, { type, name: name.trim(), version: (previous[0]?.version || 0) + 1,
            effectiveFrom, effectiveTo, issuedByAccountId: req.p2Account.id, status: 'DRAFT' });
        policy.levels = levels.map(level => p5Effect(plan, 'PolicyLevel', null, { policyId: policy.id, ...level }));
        return policy;
    }));
}));
app.post('/data/admin/policies/:id/activate', p5Admin, p5Route(async (req, res) => {
    res.send(await p5Execute(req, 'ACTIVATE_POLICY', async plan => {
        const policy = await p5Get('Policy', req.params.id);
        p3Assert(policy.status === 'DRAFT', 'POLICY_IMMUTABLE');
        const levels = await p5Collections.PolicyLevel.find({ policyId: policy.id }).toArray();
        p5Levels(policy.type, levels);
        p3Assert(new Date(policy.effectiveFrom) <= plan.at && (!policy.effectiveTo || plan.at < new Date(policy.effectiveTo)), 'POLICY_NOT_EFFECTIVE');
        const previous = await p5Collections.Policy.find({ type: policy.type, status: 'ACTIVE' }).toArray();
        for (const old of previous) {
            p3Assert(new Date(old.effectiveFrom) < new Date(policy.effectiveFrom), 'POLICY_EFFECTIVE_OVERLAP');
            p5Effect(plan, 'Policy', old, { status: 'RETIRED', displayStatus: 'HET_HIEU_LUC',
                effectiveTo: old.effectiveTo && new Date(old.effectiveTo) < new Date(policy.effectiveFrom) ? old.effectiveTo : policy.effectiveFrom });
        }
        return p5Effect(plan, 'Policy', policy, { status: 'ACTIVE', displayStatus: 'DANG_HIEU_LUC' });
    }));
}));
async function p5Report(code) {
    const rows = await p5Transactions(code), employees = await p5Collections.Employee.find({}).toArray();
    const revenues = await p5Collections.EmployeeRevenue.find({}).toArray();
    const ranked = employees.map(e => {
        const mine = rows.filter(t => t.employeeId === e.id || revenues.some(r => r.id === t.employeeRevenueId && r.employeeId === e.id));
        return { employeeId: e.id, name: e.fullName, revenue: p5Sum(mine.map(t => t.finalFee)), contractCount: p5ContractCount(mine) };
    }).sort((a, b) => b.revenue - a.revenue || a.employeeId.localeCompare(b.employeeId));
    const period = await p5Collections.PayrollPeriod.findOne({ code });
    const company = period ? await p5Collections.CompanyRevenue.findOne({ periodId: period.id }) : null;
    const slips = period ? await p5Collections.Payslip.find({ periodId: period.id }).toArray() : [];
    const attendanceCounts = await p5AttendanceCounts(code);
    const adjustments = period ? await p5Collections.PayrollAdjustment.find({ periodId: period.id }).toArray() : [];
    const lateDetails = await Promise.all(adjustments.map(p5LateDetails));
    return { month: code, revenue: p5Sum([...rows.map(t => t.finalFee), company?.forfeitedHoldRevenue || 0]),
        contractCount: p5ContractCount(rows), topEmployees: ranked,
        commission: p5Sum(slips.map(s => s.commissionAmount)), baseSalary: p5Sum(slips.map(s => s.baseSalary)),
        bonus: p5Sum(slips.map(s => s.totalBonus || 0)), deductions: p5Sum(slips.map(s => s.totalDeductions)),
        netPay: p5Sum(slips.map(s => s.netPay)), shiftCount: [...attendanceCounts.values()].reduce((a, b) => a + b, 0),
        lateCount: lateDetails.reduce((sum, entries) => sum + entries.length, 0) };
}
app.get('/data/admin/reports/revenue', p5Admin, p5Route(async (req, res) => {
    if (req.query.month) return res.send(await p5Report(req.query.month));
    const year = String(req.query.year || new Date().getFullYear());
    p3Assert(/^20\d{2}$/.test(year), 'INVALID_YEAR', 400);
    const months = [];
    for (let i = 1; i <= 12; i++) months.push(await p5Report(`${year}-${String(i).padStart(2, '0')}`));
    res.send(months);
}));
function adminRoomCounts(rooms) {
    const byStatus = {};
    for (const room of rooms) {
        const status = room.businessStatus || room.status;
        byStatus[status] = (byStatus[status] || 0) + 1;
    }
    return { total: rooms.length, byStatus,
        occupancy: rooms.length ? Math.round((byStatus.RENTED || 0) / rooms.length * 1000) / 10 : 0 };
}
async function adminOccupancy(now = new Date()) {
    const today = new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
    const [rooms, properties, deposits, contracts, payments] = await Promise.all([
        roomCollection.find({}).toArray(), propertyCollection.find({}).toArray(),
        p3Collections.Deposit.find({ status: { $in: ['PAYMENT_PENDING', 'PAID', 'CONTRACTED'] } }).toArray(),
        p3Collections.Contract.find({ status: { $in: ['SIGNED', 'COMPLETED'] }, startDate: { $lte: today }, endDate: { $gte: today } }).toArray(),
        p3Collections.Payment.find({ purpose: 'DEPOSIT', status: 'CONFIRMED' }).toArray()
    ]);
    const currentDeposits = deposits.filter(d => ['PAYMENT_PENDING', 'PAID'].includes(d.status)
        || contracts.some(c => c.depositId === d.id));
    const groups = new Map();
    for (const room of rooms) {
        const roomType = room.roomType || room.type || 'Chưa phân loại';
        const key = JSON.stringify([room.propertyId, roomType]);
        if (!groups.has(key)) groups.set(key, { propertyId: room.propertyId || '',
            propertyName: properties.find(p => p.id === room.propertyId)?.name || room.propertyId || 'Chưa gắn tòa', roomType, rooms: [] });
        groups.get(key).rooms.push(room);
    }
    const rows = [...groups.values()].map(group => {
        const ids = new Set(group.rooms.map(r => r.id));
        const mine = currentDeposits.filter(d => ids.has(d.roomId));
        return { propertyId: group.propertyId, propertyName: group.propertyName, roomType: group.roomType,
            ...adminRoomCounts(group.rooms), depositCount: mine.length,
            depositRequired: p5Sum(mine.map(d => d.totalRequired)),
            depositConfirmed: p5Sum(mine.map(d => (d.holdCredit || 0)
                + (d.collected ? d.collected.amount : p5Sum(payments.filter(p => p.depositId === d.id).map(p => p.amount))))),
            contractCount: contracts.filter(c => ids.has(c.roomId)).length };
    }).sort((a, b) => a.propertyName.localeCompare(b.propertyName, 'vi') || a.roomType.localeCompare(b.roomType, 'vi'));
    return { asOf: now.toISOString(), date: today, ...adminRoomCounts(rooms), rows,
        depositCount: currentDeposits.filter(d => rooms.some(r => r.id === d.roomId)).length,
        contractCount: contracts.filter(c => rooms.some(r => r.id === c.roomId)).length };
}
app.get('/data/admin/reports/occupancy', p5Admin, p5Route(async (req, res) => {
    res.send(await adminOccupancy());
}));
app.get('/data/admin/summary', p5Admin, p5Route(async (req, res) => {
    const now = new Date(), code = req.query.month || p3Month(now);
    p5MonthBounds(code);
    const today = new Date(now.getTime() + 7 * 3600000).toISOString().slice(0, 10);
    const [finance, rooms, activeStaff, deposits, shifts, assignments, attendance] = await Promise.all([
        p5Report(code), roomCollection.find({}).toArray(), employeeCollection.countDocuments({ status: 'ACTIVE' }),
        // DEP: "pending" = contracts waiting for the admin decision (same rule as /data/admin/contract-reviews).
        p3Collections.Deposit.find({ status: { $in: ['PAID', 'CONTRACTED'] } }).toArray()
            .then(async list => (await Promise.all(list.map(p3ContractReview))).filter(item => item.outcome === 'PENDING')),
        p4Collections.Shift.find({ date: today }).toArray(), p4Collections.ShiftAssignment.find({ status: { $ne: 'CANCELLED' } }).toArray(),
        p4Collections.Attendance.find({}).toArray()
    ]);
    const shiftIds = new Set(shifts.map(s => s.id));
    const assigned = assignments.filter(a => shiftIds.has(a.shiftId));
    const checked = assigned.flatMap(a => {
        const record = attendance.find(r => r.assignmentId === a.id);
        return record ? [{ ...record, shift: shifts.find(s => s.id === a.shiftId) }] : [];
    });
    res.send({ ...finance, asOf: now.toISOString(), rooms: adminRoomCounts(rooms), activeStaff,
        pendingDeposits: deposits.length, pendingDepositAmount: p5Sum(deposits.map(item => item.amounts.total)),
        today: { date: today, shifts: shifts.length, assignments: assigned.length, checkedIn: checked.length,
            checkedOut: checked.filter(r => r.checkOutAt).length,
            late: checked.filter(r => new Date(r.checkInAt) > new Date(r.shift.startsAt)).length,
            absent: assigned.filter(a => a.status === 'ABSENT').length } });
}));
async function initializeP5() {
    for (const type of Object.keys(p5Collections)) await p5Collections[type].createIndex({ id: 1 }, { unique: true });
    for (const [type, fields] of [ ['PayrollPeriod', { code: 1 }], ['PayrollPeriod', { year: 1, month: 1 }],
        ['Payslip', { employeeId: 1, periodId: 1 }], ['Payslip', { adjustmentId: 1 }],
        ['EmployeeRevenue', { employeeId: 1, periodId: 1 }], ['CompanyRevenue', { periodId: 1 }],
        ['Commission', { employeeId: 1, periodId: 1 }], ['Policy', { type: 1, version: 1 }] ]) {
        await p5Collections[type].createIndex(fields, { unique: true });
    }
    for (const type of ['Payslip', 'EmployeeRevenue']) await p5Collections[type].createIndex({ commissionId: 1 },
        { unique: true, partialFilterExpression: { commissionId: { $type: 'string' } } });
    await auditCollection.createIndex({ p5Key: 1 }, { unique: true, sparse: true });
    await p5Collections.BrokerageTransaction.createIndex({ status: 1, recognizedAt: 1 });
    await p5Barrier();
}
Object.assign(module.exports, { p5Commission, p5Net, p5Mutable, p5MonthBounds, p5Levels, p5Calculate,
    p5Execute, p5Run, p5Barrier, p5Collections, initializeP5 });

// P6 catalog administration. Keep the LearnAngular CommonJS/single-file structure.
const p6Types = ['Employee', 'Account', 'AccountRole', 'Owner', 'Property', 'School',
    'PropertySchool', 'BrokerageAgreement', 'WorkLocation', 'Room', 'RoomImage', 'RoomPriceHistory',
    'Hold', 'Deposit', 'Contract', 'BrokerageTransaction', 'ViewingDetail', 'Viewing', 'Favorite'];
const p6Collections = Object.fromEntries(p6Types.map(type => [type, database.collection(type)]));
p6Collections.Counter = database.collection('Counter');
const p6Admin = requireRole('ADMIN');
function p6Clean(value) {
    if (!value) return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => key !== '_id' && !/^(_p[456]|p3LastStep)/.test(key)));
}
function p6Safe(value) {
    if (value instanceof Date || value === null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map(p6Safe);
    return Object.fromEntries(Object.entries(value).filter(([key]) =>
        key !== 'demo' && !/^(password|passwordHash|salt|temporaryPassword|_id|_p\d|p3LastStep)/i.test(key)).map(([key, item]) => [key, key === 'locationStatus' && item === 'demo' ? 'estimated' : p6Safe(item)]));
}
function p6Text(value, field, min = 1, max = 200) {
    p3Assert(typeof value === 'string' && value.trim().length >= min && value.trim().length <= max, `INVALID_${field}`, 400);
    return value.trim();
}
function p6Day(value, field) {
    p3Assert(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
        && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value, `INVALID_${field}`, 400);
    return value;
}
function p6Geo(body, nullable = false) {
    if (nullable && body.lat === null && body.lng === null) return { lat: null, lng: null, geo: null };
    const lat = body.lat ?? body.geo?.coordinates?.[1], lng = body.lng ?? body.geo?.coordinates?.[0];
    p3Assert(typeof lat === 'number' && Number.isFinite(lat) && Math.abs(lat) <= 90
        && typeof lng === 'number' && Number.isFinite(lng) && Math.abs(lng) <= 180, 'INVALID_COORDINATES', 400);
    return { lat, lng, geo: { type: 'Point', coordinates: [lng, lat] } };
}
function p6ImageUrl(value, category) {
    p3Assert(typeof value === 'string' && value.length <= 1000 && !value.includes('..') && !/[?#\\]/.test(value)
        && new RegExp(`^/(assets|uploads)/${category}/[a-zA-Z0-9_./% -]+\\.(png|jpe?g|webp|svg)$`, 'i').test(value), 'INVALID_IMAGE_URL', 400);
    return value;
}
function p6ImageList(value, published = false) {
    p3Assert(Array.isArray(value) && value.length <= 15 && (!published || value.length > 0)
        && new Set(value).size === value.length, 'INVALID_ROOM_IMAGES', 400);
    return value.map(url => p6ImageUrl(url, 'rooms'));
}
function p6Overlap(a, b) {
    return a.effectiveFrom <= (b.effectiveTo || '9999-12-31') && b.effectiveFrom <= (a.effectiveTo || '9999-12-31');
}
function p6Effect(plan, type, before, fields, action) {
    const after = fields === null ? null : { ...p6Clean(before), ...fields };
    if (type === 'Property' && after) {
        delete after.demo;
        if (after.locationStatus === 'demo') after.locationStatus = 'estimated';
    }
    if (after && !before) after.id ||= `p6-${new ObjectId()}`;
    plan.effects.push({ type, before: p6Clean(before), after, action: action || (before ? after ? 'UPDATE' : 'DELETE' : 'CREATE') });
    return after;
}
async function p6Get(type, id) {
    p3Assert(typeof id === 'string' && id.length > 0, 'INVALID_ID', 400);
    const record = await database.collection(type).findOne({ id });
    p3Assert(record, `${type.toUpperCase()}_NOT_FOUND`, 404);
    return record;
}
async function p6Foreign(type, id, active = false) {
    p3Assert(typeof id === 'string' && id.length > 0, `INVALID_${type.toUpperCase()}_REFERENCE`, 400);
    const record = await database.collection(type).findOne({ id });
    p3Assert(record && (!active || (record.active !== false && !['INACTIVE', 'DISABLED', 'ENDED'].includes(record.status))),
        `${type.toUpperCase()}_REFERENCE_UNAVAILABLE`, 409);
    return record;
}
const p6References = {
    Employee: [['ShiftAssignment', 'employeeId'], ['PeriodRegistration', 'employeeId'], ['Payslip', 'employeeId'],
        ['Commission', 'employeeId'], ['EmployeeRevenue', 'employeeId'], ['Deposit', 'employeeId'], ['Hold', 'employeeId'],
        ['Viewing', 'employeeId'], ['ContactRequest', 'respondedBy'], ['TaskAssignment', 'employeeId'],
        ['Payment', 'confirmedByEmployeeId'], ['Payment', 'employeeId'], ['Receipt', 'employeeId'], ['BrokerageTransaction', 'employeeId']],
    Owner: [['Room', 'ownerId'], ['BrokerageAgreement', 'ownerId'], ['Deposit', 'ownerId'], ['Contract', 'ownerId']],
    Property: [['Room', 'propertyId'], ['PropertySchool', 'propertyId']],
    School: [['PropertySchool', 'schoolId'], ['Property', 'nearbySchools.schoolId']],
    WorkLocation: [['Shift', 'workLocationId']],
    BrokerageAgreement: [['BrokerageTransaction', 'agreementId'], ['Contract', 'agreementId']],
    Room: [['Hold', 'roomId'], ['Deposit', 'roomId'], ['Contract', 'roomId'], ['BrokerageAgreement', 'roomId'],
        ['Favorite', 'roomId'], ['ViewingDetail', 'roomId'], ['Viewing', 'rooms.roomId'],
        ['BrokerageTransaction', 'roomId'], ['Payment', 'roomId'], ['Receipt', 'roomId']],
};
async function p6Referenced(type, id) {
    for (const [source, field] of p6References[type] || []) {
        if (await database.collection(source).findOne({ [field]: id })) return true;
    }
    return false;
}
async function p6Unreferenced(type, id) {
    if (type === 'Room') {
        p3Assert(!await roomHasActiveFlow(id), 'ROOM_HAS_ACTIVE_FLOW');
        return;
    }
    if (!await p6Referenced(type, id)) return;
    const messages = {
        Employee: 'Nhân viên đã có ca làm, lương hoặc hồ sơ liên quan; hãy ngừng hoạt động thay vì xóa.',
        Owner: 'Chủ phòng đang được sử dụng bởi phòng hoặc hồ sơ môi giới; hãy ngưng hoạt động thay vì xóa.',
        Property: 'Tòa nhà đang có phòng hoặc liên kết trường học; hãy ngưng hoạt động thay vì xóa.',
        School: 'Trường học đang được liên kết với tòa nhà; hãy ngưng hoạt động thay vì xóa.',
        WorkLocation: 'Địa điểm đang được dùng trong lịch ca; hãy ngưng hoạt động thay vì xóa.',
        BrokerageAgreement: 'Thỏa thuận đã có hợp đồng hoặc giao dịch; hãy kết thúc hiệu lực thay vì xóa.'
    };
    throw Object.assign(p3Error(409, 'REFERENCED_RECORD'), {
        resource: type, reason: messages[type] || 'Bản ghi đang được sử dụng; hãy ngưng hoạt động thay vì xóa.'
    });
}
async function p6RoomHasHistory(room) {
    return !!(room.lock || room.hasHistory || ['HELD', 'RENTED'].includes(room.businessStatus || room.status)
        || await p6Referenced('Room', room.id));
}
async function p6DeleteRoom(plan, room) {
    await deleteRoomWithSnapshot(plan, room);
    return p6Safe(room);
}
async function roomHasActiveFlow(roomId, completingContractId) {
    for (const [type, statuses] of [['Hold', ['PAYMENT_PENDING', 'ACTIVE']],
        ['Deposit', ['PAYMENT_PENDING', 'PAID']], ['Contract', ['DRAFT', 'SIGNED']]]) {
        if (await p3Collections[type].findOne({ roomId, status: { $in: statuses },
            ...(type === 'Contract' && completingContractId ? { id: { $ne: completingContractId } } : {}) })) return true;
    }
    return false;
}
async function snapshotRoom(room) {
    const property = room.propertyId ? await propertyCollection.findOne({ id: room.propertyId }) : null;
    return { id: room.id, code: room.code || '', name: room.name || '', type: room.type || room.roomType || '',
        address: room.address || property?.address || '', propertyId: room.propertyId || '',
        propertyName: room.propertyName || property?.name || '', ownerId: room.ownerId || '',
        monthlyRent: room.monthlyRent ?? room.price ?? 0, area: room.area ?? 0, capacity: room.capacity ?? 0 };
}
async function deleteRoomWithSnapshot(plan, room, completingContractId) {
    if (await roomHasActiveFlow(room.id, completingContractId)) throw Object.assign(p3Error(409, 'ROOM_HAS_ACTIVE_FLOW'), {
        resource: 'Room', reason: 'Phòng còn giữ chỗ, cọc hoặc hợp đồng đang xử lý. Hãy kết thúc hồ sơ trước khi xóa.'
    });
    const roomSnapshot = await snapshotRoom(room);
    const p3 = !!plan.opId;
    const change = async (type, before, fields) => p3
        ? p3Change(plan, type, before, fields) : p6Effect(plan, type, before, fields);
    const contracts = await p3Collections.Contract.find({ roomId: room.id }).toArray();
    for (const type of ['Contract', 'Deposit', 'Hold', 'BrokerageTransaction', 'BrokerageAgreement', 'ViewingDetail']) {
        const filter = type === 'BrokerageTransaction' ? { $or: [{ roomId: room.id }, { contractId: { $in: contracts.map(c => c.id) } }] } : { roomId: room.id };
        for (const row of await database.collection(type).find(filter).toArray()) {
            await change(type, row, { roomSnapshot, ...(type === 'BrokerageAgreement' && row.status === 'ACTIVE'
                ? { status: 'ENDED', effectiveTo: new Date(new Date(plan.now || plan.at).getTime() + 7 * 3600000).toISOString().slice(0, 10) } : {}) });
        }
    }
    // Viewing embeds the same details for customer history and cancellation responses.
    for (const row of await viewingCollection.find({ 'rooms.roomId': room.id }).toArray()) {
        await change('Viewing', row, { rooms: row.rooms.map(detail => detail.roomId === room.id ? { ...detail, roomSnapshot } : detail) });
    }
    for (const type of ['Favorite', 'RoomImage', 'RoomPriceHistory', 'Room']) {
        const rows = type === 'Room' ? [room] : await database.collection(type).find({ roomId: room.id }).toArray();
        for (const row of rows) {
            if (p3) {
                plan.effects.push({ kind: 'delete', type, id: row.id });
                await p3Event(plan, type, row.id, 'DELETE', type === 'Room' ? { ...row, roomSnapshot } : row, null);
            } else {
                p6Effect(plan, type, row, null);
                if (type === 'Room') plan.effects[plan.effects.length - 1].roomSnapshot = roomSnapshot;
            }
        }
    }
    return roomSnapshot;
}
async function p6P2Serial(work) {
    const previous = p2WriteQueue;
    let release;
    p2WriteQueue = new Promise(resolve => { release = resolve; });
    await previous;
    try { return await work(); } finally { release(); }
}
function p6Serial(work) { return p3Serial(() => p4Serial(() => p6P2Serial(work))); }
async function p6Run(op) {
    for (let i = op.cursor || 0; i < op.plan.effects.length; i++) {
        const effect = op.plan.effects[i], col = p6Collections[effect.type], token = `${op.id}:${i}`;
        const id = effect.after?.id || effect.before.id, current = await col.findOne({ id });
        if (current?._p6Token !== token) {
            let applied = true;
            if (!effect.after) {
                if (current) applied = (await col.deleteOne({ id, ...effect.before })).deletedCount === 1;
            } else if (!effect.before) {
                if (current) applied = false;
                else await col.insertOne({ ...effect.after, _p6Token: token });
            } else {
                applied = (await col.updateOne({ id, ...effect.before }, { $set: { ...effect.after, _p6Token: token } })).matchedCount === 1;
            }
            if (!applied) {
                if (i === 0) await auditCollection.updateOne({ id: op.id }, { $set: { state: 'FAILED' } });
                throw p3Error(i === 0 ? 409 : 503, i === 0 ? 'CONCURRENT_CHANGE' : 'CATALOG_RECOVERY_REQUIRED');
            }
        }
        const event = { id: `${token}:audit`, entityType: effect.type, entityId: id, action: effect.action,
            before: p6Safe(effect.before), after: p6Safe(effect.after), actorId: op.actorId, at: op.at, reason: op.reason,
            ...(effect.roomSnapshot ? { roomSnapshot: effect.roomSnapshot } : {}) };
        await auditCollection.updateOne({ id: event.id }, { $setOnInsert: event }, { upsert: true });
        await auditCollection.updateOne({ id: op.id }, { $set: { cursor: i + 1 } });
    }
    // Intent data is private; discard credentials once recovery no longer needs them.
    await auditCollection.updateOne({ id: op.id }, { $set: { state: 'DONE' }, $unset: { plan: '' } });
    return op.result;
}
async function p6Recover() {
    for (const op of await auditCollection.find({ entityType: 'P6Operation', state: 'PENDING' }).sort({ at: 1 }).toArray()) await p6Run(op);
}
async function p6Barrier() { return p6Serial(p6Recover); }
async function p6Execute(req, prepare) {
    const key = req.get?.('Idempotency-Key');
    p3Assert(!key || (typeof key === 'string' && key.length >= 8 && key.length <= 160), 'INVALID_IDEMPOTENCY_KEY', 400);
    const p6Key = key && `${req.p2Account.id}:${key}`;
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify(p3Stable({ method: req.method, path: req.path, body: req.body || {} }))).digest('hex');
    if (p6Key) {
        const prior = await auditCollection.findOne({ p6Key });
        if (prior) {
            p3Assert(prior.fingerprint === fingerprint, 'IDEMPOTENCY_CONFLICT');
            p3Assert(prior.state !== 'FAILED', 'CONCURRENT_CHANGE');
            return prior.state === 'DONE' ? prior.result : p6Run(prior);
        }
    }
    const plan = { effects: [], at: new Date() }, result = await prepare(plan);
    const op = { id: `p6-op-${new ObjectId()}`, entityType: 'P6Operation', state: 'PENDING', cursor: 0,
        at: plan.at, actorId: req.p2Account.id, reason: typeof req.body?.reason === 'string' ? req.body.reason.slice(0, 1000) : '',
        plan, result: p6Safe(result), fingerprint, ...(p6Key ? { p6Key } : {}) };
    await auditCollection.insertOne(op);
    return p6Run(op);
}
function p6Route(handler) {
    return async (req, res) => {
        try {
            await p6Serial(async () => {
                await p3Recover(); await p4Recover(); await p5Recover(); await p6Recover();
                await handler(req, res);
            });
        } catch (error) {
            res.status(error.status || (error.code === 11000 ? 409 : 503)).send({
                code: error.code === 11000 ? 'DUPLICATE_RECORD' : error.code || 'CATALOG_RECOVERY_REQUIRED',
                message: error.reason || error.message, ...(error.reason ? { reason: error.reason } : {}),
                ...(error.resource ? { resource: error.resource } : {})
            });
        }
    };
}
async function p6Validate(type, body, before) {
    p3Assert(body && typeof body === 'object' && !Array.isArray(body), 'INVALID_BODY', 400);
    const value = { ...before, ...body }, fields = {};
    const text = (key, min = 1, max = 200) => { fields[key] = p6Text(value[key], key.toUpperCase(), min, max); };
    if (type === 'Owner' || type === 'Employee') {
        text('fullName', 2, 120); fields.phone = normalizePhone(value.phone);
        p3Assert(validPhone(fields.phone), 'INVALID_PHONE', 400);
    } else if (type !== 'BrokerageAgreement') text('name', 2);
    if (type === 'Employee') {
        for (const key of ['position', 'email']) text(key);
        p3Assert(['FULL_TIME', 'PART_TIME', 'INTERNSHIP'].includes(value.contractType), 'INVALID_CONTRACT_TYPE', 400);
        fields.contractType = value.contractType;
        fields.email = fields.email.toLowerCase();
        p3Assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email), 'INVALID_EMAIL', 400);
        fields.birthDate = p6Day(value.birthDate, 'BIRTH_DATE'); fields.startDate = p6Day(value.startDate, 'START_DATE');
        const today = new Date().toISOString().slice(0, 10);
        p3Assert(fields.birthDate < today && fields.startDate >= fields.birthDate && fields.startDate <= today, 'INVALID_EMPLOYEE_DATES', 400);
        p3Assert(['FEMALE', 'MALE', 'OTHER'].includes(value.gender), 'INVALID_GENDER', 400); fields.gender = value.gender;
        fields.status = value.status || 'ACTIVE';
        p3Assert(['ACTIVE', 'ON_LEAVE', 'INACTIVE'].includes(fields.status), 'INVALID_STATUS', 400);
        if (before && fields.status === 'INACTIVE' && before.status !== 'INACTIVE') throw p3Error(409, 'USE_DEACTIVATE');
        fields.baseSalary = value.baseSalary ?? null;
        p3Assert(fields.baseSalary === null || (Number.isSafeInteger(fields.baseSalary) && fields.baseSalary >= 0), 'INVALID_BASE_SALARY', 400);
        fields.name = fields.fullName;
        if (value.avatar) { p6ImageUrl(value.avatar, value.avatar.startsWith('/uploads/employees/') ? 'employees' : 'employee'); fields.avatar = value.avatar; fields.avatarUrl = value.avatar; }
        // WorkLocation belongs to Shift, never to Employee (D-15).
    }
    if (type === 'Owner') fields.note = typeof value.note === 'string' ? value.note.trim().slice(0, 1000) : '';
    if (['Owner', 'Property', 'School', 'WorkLocation'].includes(type)) {
        p3Assert(value.active === undefined || typeof value.active === 'boolean', 'INVALID_ACTIVE', 400);
        fields.active = value.active !== false;
    }
    if (['Property', 'School', 'WorkLocation'].includes(type)) {
        const coordinates = body.geo?.coordinates;
        Object.assign(fields, p6Geo(coordinates && body.lat === undefined && body.lng === undefined
            ? { ...value, lat: coordinates[1], lng: coordinates[0] } : value, type === 'Property'));
        if (type === 'Property') {
            for (const key of ['addressLine', 'ward', 'district', 'province']) text(key);
            fields.address = [fields.addressLine, fields.ward, fields.district, fields.province].join(', ');
            fields.locationStatus = fields.geo ? (value.locationStatus === 'demo' ? 'estimated' : value.locationStatus || 'estimated') : 'pending';
            p3Assert(['estimated', 'sourced', 'pending'].includes(fields.locationStatus), 'INVALID_LOCATION_STATUS', 400);
            fields.locationSource = typeof value.locationSource === 'string' ? value.locationSource.slice(0, 1000) : 'Admin';
            fields.images = before?.images || [];
        } else {
            text('address');
            if (type === 'School') {
                text('campus'); text('source', 1, 1000);
                fields.logoUrl = value.logoUrl || value.logo || '';
                if (fields.logoUrl) p6ImageUrl(fields.logoUrl, 'schools');
                fields.logo = fields.logoUrl;
            } else {
                p3Assert(Number.isFinite(value.allowedRadiusM) && value.allowedRadiusM > 0, 'INVALID_RADIUS', 400);
                fields.allowedRadiusM = value.allowedRadiusM;
            }
        }
    }
    if (type === 'BrokerageAgreement') {
        const room = await p6Foreign('Room', value.roomId);
        fields.roomId = room.id; fields.ownerId = value.ownerId ?? room.ownerId ?? null;
        if (fields.ownerId) {
            await p6Foreign('Owner', fields.ownerId, !before || fields.ownerId !== before.ownerId);
            p3Assert(fields.ownerId === room.ownerId, 'AGREEMENT_OWNER_MISMATCH', 409);
        }
        fields.effectiveFrom = p6Day(value.effectiveFrom, 'EFFECTIVE_FROM');
        fields.effectiveTo = value.effectiveTo ? p6Day(value.effectiveTo, 'EFFECTIVE_TO') : null;
        p3Assert(!fields.effectiveTo || fields.effectiveTo >= fields.effectiveFrom, 'INVALID_AGREEMENT_DATES', 400);
        fields.status = value.status || 'ACTIVE'; p3Assert(['ACTIVE', 'ENDED'].includes(fields.status), 'INVALID_STATUS', 400);
        // DATA-PLAN: common brokerage fee 50% of one month, no new fee policy in P6.
        p3Assert((value.feeMethod || 'PERCENT_OF_MONTHLY_RENT') === 'PERCENT_OF_MONTHLY_RENT'
            && (value.feeValue ?? 5000) === 5000, 'BROKERAGE_FEE_FIXED_BY_DATA_PLAN', 400);
        fields.feeMethod = 'PERCENT_OF_MONTHLY_RENT'; fields.feeValue = 5000;
        const others = await p6Collections.BrokerageAgreement.find({ roomId: room.id, id: { $ne: before?.id || '' } }).toArray();
        p3Assert(!others.some(other => p6Overlap(fields, other)), 'AGREEMENT_OVERLAP');
        if (before && await database.collection('BrokerageTransaction').findOne({ agreementId: before.id })) {
            p3Assert(['roomId', 'ownerId', 'effectiveFrom', 'feeMethod', 'feeValue'].every(key => fields[key] === before[key]), 'AGREEMENT_ALREADY_USED');
        }
    }
    return fields;
}
async function p6Nearby(plan, property, schools) {
    const current = await propertySchoolCollection.find({ propertyId: property.id }).toArray();
    const links = [];
    if (property.geo && property.active !== false) for (const school of schools.filter(s => s.active !== false)) {
        // A school counts as nearby within a 7 km straight-line radius (user decision 14/11/2026);
        // the stored distance/travel time stay the road estimate (haversine × 1.3).
        const straight = p4Distance(property, school);
        if (!Number.isFinite(straight) || straight > 7000) continue;
        const meters = straight * 1.3;
        const distanceM = Math.round(meters), old = current.find(link => link.schoolId === school.id);
        links.push(p6Effect(plan, 'PropertySchool', old || null, {
            id: old?.id || `${property.id}-${school.id}`, propertyId: property.id, schoolId: school.id,
            distanceM, distanceKm: distanceM / 1000, travelMinutes: Math.round(distanceM / 25000 * 60 * 10) / 10,
            source: 'haversine × 1.3; xe máy 25 km/h; ước lượng'
        }));
    }
    for (const old of current) if (!links.some(link => link.id === old.id)) p6Effect(plan, 'PropertySchool', old, null);
    return links.map(({ schoolId, distanceM, travelMinutes, source }) => ({ schoolId, distanceM, travelMinutes, source }));
}
async function p6SaveCatalog(plan, type, body, id) {
    const before = id ? await p6Get(type, id) : null;
    const fields = await p6Validate(type, body, before);
    const after = { ...p6Clean(before), ...fields, id: before?.id || `p6-${new ObjectId()}`, updatedAt: plan.at };
    if (!before) after.createdAt = plan.at;
    if (type === 'Property') {
        const result = p6Effect(plan, type, before, after);
        result.nearbySchools = await p6Nearby(plan, after, await schoolCollection.find({}).toArray());
        return p6Safe(result);
    }
    p6Effect(plan, type, before, after);
    if (type === 'School') for (const property of await propertyCollection.find({}).toArray()) {
        const schools = (await schoolCollection.find({ id: { $ne: after.id } }).toArray()).concat(after);
        const nearbySchools = await p6Nearby(plan, property, schools);
        p6Effect(plan, 'Property', property, { nearbySchools, updatedAt: plan.at });
    }
    return p6Safe(after);
}
for (const [route, type] of [['owners', 'Owner'], ['properties', 'Property'], ['schools', 'School'],
    ['brokerage-agreements', 'BrokerageAgreement'], ['work-locations', 'WorkLocation']]) {
    const base = `/data/admin/${route}`;
    app.get(base, p6Admin, p6Route(async (req, res) => res.send((await p6Collections[type].find({}).sort({ id: 1 }).toArray()).map(p6Safe))));
    app.get(base + '/:id', p6Admin, p6Route(async (req, res) => res.send(p6Safe(await p6Get(type, req.params.id)))));
    app.post(base, p6Admin, p6Route(async (req, res) => {
        res.status(201).send(await p6Execute(req, plan => p6SaveCatalog(plan, type, req.body, null)));
    }));
    app.put(base + '/:id', p6Admin, p6Route(async (req, res) => {
        res.send(await p6Execute(req, plan => p6SaveCatalog(plan, type, req.body, req.params.id)));
    }));
    app.post(base + '/:id/deactivate', p6Admin, p6Route(async (req, res) => {
        res.send(await p6Execute(req, async plan => {
            const before = await p6Get(type, req.params.id);
            const fields = type === 'BrokerageAgreement'
                ? { status: 'ENDED', effectiveTo: req.body?.effectiveTo || new Date().toISOString().slice(0, 10) } : { active: false };
            return p6SaveCatalog(plan, type, { ...p6Clean(before), ...fields }, before.id);
        }));
    }));
    app.delete(base + '/:id', p6Admin, p6Route(async (req, res) => {
        res.send(await p6Execute(req, async plan => {
            const before = await p6Get(type, req.params.id); await p6Unreferenced(type, before.id);
            p6Effect(plan, type, before, null); return { id: before.id, deleted: true };
        }));
    }));
}
function p6Password(body) {
    const value = body?.temporaryPassword === undefined ? crypto.randomBytes(12).toString('base64url') : body.temporaryPassword;
    p3Assert(typeof value === 'string' && value.length >= 8 && value.length <= 128, 'INVALID_TEMPORARY_PASSWORD', 400);
    return value;
}
function p6Credentials(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    return { salt, passwordHash: crypto.scryptSync(password, salt, 64).toString('hex'), passwordTemporary: true };
}
app.get('/data/admin/employees', p6Admin, p6Route(async (req, res) => res.send((await employeeCollection.find({}).sort({ employeeCode: 1 }).toArray()).map(p6Safe))));
app.get('/data/admin/employees/:id', p6Admin, p6Route(async (req, res) => res.send(p6Safe(await p6Get('Employee', req.params.id)))));
app.post('/data/admin/employees', p6Admin, p6Route(async (req, res) => {
    p3Assert(!req.get('Idempotency-Key') || req.body?.temporaryPassword, 'TEMPORARY_PASSWORD_REQUIRED_FOR_RETRY', 400);
    const password = p6Password(req.body);
    const result = await p6Execute(req, async plan => {
        const fields = await p6Validate('Employee', req.body, null);
        await p6Foreign('Role', 'EMPLOYEE');
        p3Assert(!await accountCollection.findOne({ phone: fields.phone }), 'PHONE_EXISTS');
        p3Assert(!await employeeCollection.findOne({ email: fields.email }) && !await accountCollection.findOne({ email: fields.email }), 'EMAIL_EXISTS');
        const counter = await p6Collections.Counter.findOne({ id: 'employee-code-p6' });
        const codes = await employeeCollection.find({}, { projection: { employeeCode: 1 } }).toArray();
        const seq = Math.max(counter?.seq || 0, ...codes.map(row => Number(/^NV(\d+)$/.exec(row.employeeCode)?.[1] || 0))) + 1;
        p6Effect(plan, 'Counter', counter, { id: 'employee-code-p6', seq });
        const account = p6Effect(plan, 'Account', null, { id: `tk-${new ObjectId()}`, phone: fields.phone, name: fields.fullName,
            email: fields.email, role: 'EMPLOYEE', status: fields.status === 'INACTIVE' ? 'DISABLED' : 'ACTIVE', ...p6Credentials(password), createdAt: plan.at });
        p6Effect(plan, 'AccountRole', null, { accountId: account.id, roleId: 'EMPLOYEE', assignedAt: plan.at });
        const employee = p6Effect(plan, 'Employee', null, { ...fields, accountId: account.id,
            employeeCode: `NV${String(seq).padStart(3, '0')}`, createdAt: plan.at, updatedAt: plan.at });
        return { employee: p6Safe(employee), phone: fields.phone };
    });
    res.status(201).send({ ...result, temporaryPassword: password });
}));
app.put('/data/admin/employees/:id', p6Admin, p6Route(async (req, res) => {
    res.send(await p6Execute(req, async plan => {
        const before = await p6Get('Employee', req.params.id), fields = await p6Validate('Employee', req.body, before);
        p3Assert(!await accountCollection.findOne({ phone: fields.phone, id: { $ne: before.accountId } }), 'PHONE_EXISTS');
        p3Assert(!await employeeCollection.findOne({ email: fields.email, id: { $ne: before.id } }), 'EMAIL_EXISTS');
        p3Assert(!await accountCollection.findOne({ email: fields.email, id: { $ne: before.accountId } }), 'EMAIL_EXISTS');
        const account = await p6Foreign('Account', before.accountId);
        p6Effect(plan, 'Account', account, { phone: fields.phone, name: fields.fullName, email: fields.email,
            status: fields.status === 'INACTIVE' ? 'DISABLED' : 'ACTIVE', updatedAt: plan.at });
        return p6Safe(p6Effect(plan, 'Employee', before, { ...fields, updatedAt: plan.at }));
    }));
}));
app.post('/data/admin/employees/:id/deactivate', p6Admin, p6Route(async (req, res) => {
    res.send(await p6Execute(req, async plan => {
        const before = await p6Get('Employee', req.params.id), account = await p6Foreign('Account', before.accountId);
        const result = p6Effect(plan, 'Employee', before, { status: 'INACTIVE', updatedAt: plan.at }, 'DEACTIVATE');
        p6Effect(plan, 'Account', account, { status: 'DISABLED', updatedAt: plan.at });
        return p6Safe(result);
    }));
}));
app.post('/data/admin/employees/:id/reset-password', p6Admin, p6Route(async (req, res) => {
    p3Assert(!req.get('Idempotency-Key') || req.body?.temporaryPassword, 'TEMPORARY_PASSWORD_REQUIRED_FOR_RETRY', 400);
    const password = p6Password(req.body);
    const result = await p6Execute(req, async plan => {
        const employee = await p6Get('Employee', req.params.id), account = await p6Foreign('Account', employee.accountId);
        p6Effect(plan, 'Account', account, { ...p6Credentials(password), updatedAt: plan.at }, 'RESET_PASSWORD');
        return { id: employee.id, phone: account.phone };
    });
    res.send({ ...result, temporaryPassword: password });
}));
app.delete('/data/admin/employees/:id', p6Admin, p6Route(async (req, res) => {
    res.send(await p6Execute(req, async plan => {
        const before = await p6Get('Employee', req.params.id); await p6Unreferenced('Employee', before.id);
        // Keep Account and AccountRole so past actorId references remain valid.
        const account = await p6Foreign('Account', before.accountId);
        p6Effect(plan, 'Employee', before, null);
        p6Effect(plan, 'Account', account, { status: 'DISABLED', updatedAt: plan.at });
        return { id: before.id, deleted: true };
    }));
}));
async function p6Images(plan, room, urls) {
    p6ImageList(urls, room.publicationStatus === 'PUBLISHED');
    const current = await p6Collections.RoomImage.find({ roomId: room.id }).toArray();
    for (const old of current) if (!urls.includes(old.url)) p6Effect(plan, 'RoomImage', old, null);
    const result = urls.map((url, index) => {
        const old = current.find(image => image.url === url);
        return p6Effect(plan, 'RoomImage', old || null, { roomId: room.id, url, order: index + 1,
            isCover: index === 0, caption: old?.caption || '', mimeType: old?.mimeType || `image/${url.split('.').pop().toLowerCase().replace('jpg', 'jpeg')}` });
    });
    return result;
}
async function p6RoomFields(body, before) {
    const value = { ...before, ...body }, fields = {};
    for (const key of ['code', 'name', 'number', 'type', 'description']) fields[key] = p6Text(value[key], key.toUpperCase(), 1, key === 'description' ? 10000 : key === 'code' ? 40 : 200);
    const roomTypes = { PHONG_TRO: 'Phòng trọ', CAN_HO_MINI: 'Căn hộ mini', STUDIO: 'Studio', DUPLEX: 'Duplex', CAN_HO: 'Căn hộ', KTX: 'Ký túc xá' };
    fields.roomType = Object.keys(roomTypes).includes(fields.type) ? fields.type
        : Object.keys(roomTypes).find(key => roomTypes[key] === fields.type) || value.roomType;
    p3Assert(Object.keys(roomTypes).includes(fields.roomType), 'INVALID_ROOM_TYPE', 400);
    fields.type = roomTypes[fields.roomType];
    fields.codeNormalized = fields.code.replace(/\s/g, '').toUpperCase(); fields.numberNormalized = fields.number.replace(/\s/g, '').toUpperCase();
    fields.propertyId = (await p6Foreign('Property', value.propertyId, !before || value.propertyId !== before.propertyId)).id;
    fields.ownerId = value.ownerId || null;
    if (fields.ownerId) await p6Foreign('Owner', fields.ownerId, !before || fields.ownerId !== before.ownerId);
    if (before && fields.ownerId !== before.ownerId) {
        p3Assert(!await p6Collections.BrokerageAgreement.findOne({ roomId: before.id, status: 'ACTIVE' }), 'ROOM_OWNER_HAS_AGREEMENT');
    }
    fields.price = body.price ?? body.monthlyRent ?? before?.price ?? before?.monthlyRent;
    p3Assert(Number.isSafeInteger(fields.price) && fields.price > 0, 'INVALID_PRICE', 400); fields.monthlyRent = fields.price;
    fields.deposit = body.deposit ?? body.standardDeposit ?? before?.deposit ?? fields.price; fields.standardDeposit = fields.deposit;
    p3Assert(Number.isSafeInteger(fields.deposit) && fields.deposit >= 0, 'INVALID_DEPOSIT', 400);
    fields.serviceFee = body.fees?.management ?? body.fees?.['Dịch vụ'] ?? body.serviceFee ?? before?.serviceFee ?? 150000;
    p3Assert(Number.isSafeInteger(fields.serviceFee) && fields.serviceFee >= 0, 'INVALID_SERVICE_FEE', 400);
    p3Assert(Number.isFinite(value.area) && value.area > 0 && Number.isSafeInteger(value.capacity) && value.capacity > 0, 'INVALID_ROOM_SIZE', 400);
    fields.area = value.area; fields.capacity = value.capacity;
    fields.publicationStatus = value.publicationStatus || 'DRAFT';
    p3Assert(['DRAFT', 'PUBLISHED', 'HIDDEN'].includes(fields.publicationStatus), 'INVALID_PUBLICATION_STATUS', 400);
    const status = body.businessStatus || body.status || before?.businessStatus || before?.status || 'AVAILABLE';
    if (!before || status !== (before.businessStatus || before.status)) {
        p3Assert(['AVAILABLE', 'MAINTENANCE'].includes(status) && (!before || (!before.lock
            && ['AVAILABLE', 'MAINTENANCE'].includes(before.businessStatus || before.status))), 'USE_MONEY_WORKFLOW');
    }
    fields.businessStatus = status; fields.status = status;
    if (fields.publicationStatus === 'PUBLISHED' && (!before || before.publicationStatus !== 'PUBLISHED')) {
        p3Assert(status === 'AVAILABLE', 'ROOM_NOT_AVAILABLE');
    }
    fields.images = p6ImageList(value.images || [], fields.publicationStatus === 'PUBLISHED');
    p3Assert(Array.isArray(value.amenities || []) && (value.amenities || []).every(a => typeof a === 'string'), 'INVALID_AMENITIES', 400);
    fields.amenities = value.amenities || [];
    for (const key of ['address', 'district', 'floor', 'propertyName', 'mediaStatus', 'roomType']) if (typeof value[key] === 'string') fields[key] = value[key].slice(0, 1000);
    value.electricityPrice = body.fees?.electricity ?? body.fees?.['Điện'] ?? value.electricityPrice;
    value.waterPrice = body.fees?.water ?? body.fees?.['Nước'] ?? value.waterPrice;
    for (const key of ['electricityPrice', 'waterPrice', 'bedrooms', 'bathrooms']) if (value[key] !== undefined) {
        p3Assert(Number.isSafeInteger(value[key]) && value[key] >= 0, `INVALID_${key.toUpperCase()}`, 400); fields[key] = value[key];
    }
    if (value.fees) {
        p3Assert(typeof value.fees === 'object' && !Array.isArray(value.fees)
            && Object.values(value.fees).every(v => Number.isSafeInteger(v) && v >= 0), 'INVALID_FEES', 400);
        fields.fees = { ...value.fees, 'Dịch vụ': fields.serviceFee,
            ...(fields.electricityPrice !== undefined ? { 'Điện': fields.electricityPrice } : {}),
            ...(fields.waterPrice !== undefined ? { 'Nước': fields.waterPrice } : {}) };
    }
    fields.featured = value.featured === true;
    const duplicate = await roomCollection.findOne({ id: { $ne: before?.id || '' }, $or: [
        { codeNormalized: fields.codeNormalized }, { code: fields.code },
        { propertyId: fields.propertyId, numberNormalized: fields.numberNormalized }
    ] });
    p3Assert(!duplicate, 'DUPLICATE_ROOM');
    fields.slug = fields.name === before?.name && before.slug ? before.slug : createSlug(fields.name);
    p3Assert(fields.slug, 'INVALID_ROOM_NAME', 400);
    if (await roomCollection.findOne({ slug: fields.slug, id: { $ne: before?.id || '' } })) fields.slug += '-' + (before?.id || new ObjectId());
    return fields;
}
async function p6SaveRoom(req, plan, before) {
    p3Assert(!before || req.body?.version === undefined || req.body.version === before.version, 'CONCURRENT_CHANGE');
    const fields = await p6RoomFields(req.body || {}, before);
    const id = before?.id || (typeof req.body.id === 'string' && /^[\w-]{1,80}$/.test(req.body.id) ? req.body.id : `phong-${new ObjectId()}`);
    p3Assert(before || !await roomCollection.findOne({ id }), 'DUPLICATE_ROOM');
    const result = p6Effect(plan, 'Room', before, { ...fields, id, version: (before?.version || 0) + 1,
        ...(!before ? { lock: null, hasHistory: false, createdAt: plan.at } : {}), updatedAt: plan.at });
    if (before && fields.price !== (before.price ?? before.monthlyRent)) {
        // Append-only events: do not rewrite the previous historical snapshot.
        p6Effect(plan, 'RoomPriceHistory', null, { roomId: id, oldPrice: before.price ?? before.monthlyRent,
            newPrice: fields.price, effectiveFrom: plan.at, effectiveTo: null, changedBy: req.p2Account.id,
            reason: typeof req.body.reason === 'string' ? req.body.reason.slice(0, 1000) : '' });
    }
    await p6Images(plan, { ...before, ...fields, id }, fields.images);
    return p6Safe(result);
}
async function p6ChangeImages(req, plan, change) {
    const room = await p6Get('Room', req.params.id);
    const urls = p6ImageList(await change(room), room.publicationStatus === 'PUBLISHED');
    p6Effect(plan, 'Room', room, { images: urls, version: (room.version || 0) + 1, updatedAt: plan.at });
    return (await p6Images(plan, room, urls)).map(p6Safe);
}
app.get('/data/rooms/:id/images', p6Admin, p6Route(async (req, res) => {
    await p6Get('Room', req.params.id);
    res.send((await p6Collections.RoomImage.find({ roomId: req.params.id }).sort({ order: 1 }).toArray()).map(p6Safe));
}));
app.put('/data/rooms/:id/images', p6Admin, p6Route(async (req, res) => {
    res.send(await p6Execute(req, plan => p6ChangeImages(req, plan, () => req.body?.images)));
}));
app.post('/data/rooms/:id/images', p6Admin, p6Route(async (req, res) => {
    res.status(201).send(await p6Execute(req, plan => p6ChangeImages(req, plan, room => {
        const added = req.body?.images || [req.body?.url];
        p3Assert(Array.isArray(added) && added.length > 0, 'INVALID_ROOM_IMAGES', 400);
        return [...(room.images || []), ...added];
    })));
}));
app.put('/data/rooms/:id/images/order', p6Admin, p6Route(async (req, res) => {
    res.send(await p6Execute(req, plan => p6ChangeImages(req, plan, async room => {
        const images = await p6Collections.RoomImage.find({ roomId: room.id }).toArray(), ids = req.body?.imageIds;
        p3Assert(Array.isArray(ids) && ids.length === images.length && new Set(ids).size === ids.length
            && ids.every(id => typeof id === 'string' && images.some(image => image.id === id)), 'INVALID_IMAGE_ORDER', 400);
        return ids.map(id => images.find(image => image.id === id).url);
    })));
}));
app.put('/data/rooms/:id/images/:imageId/cover', p6Admin, p6Route(async (req, res) => {
    res.send(await p6Execute(req, plan => p6ChangeImages(req, plan, async room => {
        const image = await p6Get('RoomImage', req.params.imageId);
        p3Assert(image.roomId === room.id && room.images.includes(image.url), 'IMAGE_NOT_IN_ROOM', 404);
        return [image.url, ...room.images.filter(url => url !== image.url)];
    })));
}));
app.delete('/data/rooms/:id/images/:imageId', p6Admin, p6Route(async (req, res) => {
    res.send(await p6Execute(req, plan => p6ChangeImages(req, plan, async room => {
        const image = await p6Get('RoomImage', req.params.imageId);
        p3Assert(image.roomId === room.id, 'IMAGE_NOT_IN_ROOM', 404);
        return room.images.filter(url => url !== image.url);
    })));
}));
app.get('/data/rooms/:id/price-history', p6Admin, p6Route(async (req, res) => {
    await p6Get('Room', req.params.id);
    res.send((await p6Collections.RoomPriceHistory.find({ roomId: req.params.id }).sort({ effectiveFrom: -1 }).toArray()).map(p6Safe));
}));
app.get('/data/admin/customers', p6Admin, p6Route(async (req, res) => {
    // The list never includes identity documents. Detail has a separate ownership check.
    res.send((await customerCollection.find({}, { projection: { identity: 0 } }).sort({ fullName: 1 }).toArray()).map(p6Safe));
}));
app.get('/data/admin/customers/:id', requireRole('ADMIN', 'EMPLOYEE'), p6Route(async (req, res) => {
    const customer = await p6Get('Customer', req.params.id);
    p3Assert(await p3IdentityAccess(req, customer), 'CUSTOMER_NOT_ASSIGNED', 403);
    const result = p6Safe(customer);
    res.send(result);
}));
app.get('/audit-logs', p6Admin, p6Route(async (req, res) => {
    const { entityType, actorId, from, to } = req.query;
    const page = Number(req.query.page || 1), limit = Number(req.query.limit || 20);
    p3Assert(Number.isSafeInteger(page) && page > 0 && Number.isSafeInteger(limit) && limit > 0 && limit <= 100, 'INVALID_PAGINATION', 400);
    const filter = { entityType: { $nin: ['P3Operation', 'P4Operation', 'P5Operation', 'P6Operation'] } };
    if (entityType) filter.entityType = p6Text(entityType, 'ENTITY_TYPE', 1, 80);
    p3Assert(!['P3Operation', 'P4Operation', 'P5Operation', 'P6Operation'].includes(entityType), 'INVALID_ENTITY_TYPE', 400);
    if (actorId) filter.actorId = p6Text(actorId, 'ACTOR_ID', 1, 100);
    if (from || to) {
        filter.at = {};
        if (from) filter.at.$gte = new Date(`${p6Day(from, 'FROM_DATE')}T00:00:00+07:00`);
        if (to) filter.at.$lt = new Date(new Date(`${p6Day(to, 'TO_DATE')}T00:00:00+07:00`).getTime() + 86400000);
        p3Assert(!from || !to || from <= to, 'INVALID_DATE_RANGE', 400);
    }
    const total = await auditCollection.countDocuments(filter);
    const items = await auditCollection.find(filter, { projection: { id: 1, entityType: 1, entityId: 1,
        action: 1, actorId: 1, at: 1, before: 1, after: 1, reason: 1 } }).sort({ at: -1, id: -1 }).skip((page - 1) * limit).limit(limit).toArray();
    res.send({ items: items.map(p6Safe), total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
}));
async function initializeP6() {
    for (const type of p6Types) await p6Collections[type].createIndex({ id: 1 }, { unique: true });
    await employeeCollection.createIndex({ accountId: 1 }, { unique: true });
    await employeeCollection.createIndex({ employeeCode: 1 }, { unique: true });
    await employeeCollection.createIndex({ email: 1 }, { unique: true, sparse: true });
    await accountCollection.createIndex({ phone: 1 }, { unique: true });
    await p6Collections.Counter.createIndex({ id: 1 }, { unique: true, sparse: true });
    await roomCollection.createIndex({ codeNormalized: 1 }, { unique: true, sparse: true });
    await roomCollection.createIndex({ propertyId: 1, numberNormalized: 1 }, { unique: true, partialFilterExpression: { numberNormalized: { $type: 'string' } } });
    await propertySchoolCollection.createIndex({ propertyId: 1, schoolId: 1 }, { unique: true });
    await p6Collections.RoomImage.createIndex({ roomId: 1, url: 1 }, { unique: true });
    await p6Collections.RoomPriceHistory.createIndex({ roomId: 1, effectiveFrom: -1 });
    await p6Collections.BrokerageAgreement.createIndex({ roomId: 1, effectiveFrom: 1, effectiveTo: 1 });
    await auditCollection.createIndex({ p6Key: 1 }, { unique: true, sparse: true });
    await auditCollection.createIndex({ entityType: 1, actorId: 1, at: -1 });
    await p6Barrier();
}
Object.assign(module.exports, { p6Overlap, p6Geo, p6Day, p6ImageList, p6Safe, p6Unreferenced,
    p6Validate, p6Execute, p6Run, p6SaveRoom, p6DeleteRoom, p6RoomHasHistory, roomHasActiveFlow,
    deleteRoomWithSnapshot, roomReadFilter, adminOccupancy, p5TransactionDetails, p6Collections, p6References, initializeP6 });

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MongoClient, ObjectId } = require('mongodb');

// Data snapshot exported from the working database on 16/11/2026 (two personal accounts anonymized).
const roomSourceSha256 = '56e37835a0bbad671b3e3adf3277b039488ffd33ae847d07173faeb95f878a4d';

// DATA-01 explicitly replaces the old seed, including all twelve legacy rooms.
// Verify every source before opening the database connection.
function readSources() {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'manifest.json'), 'utf8'));
    if (manifest.version !== 1 || manifest.collections.length !== 43) {
        throw new Error('Expected DATA-01 with 43 collections; check my-server-mongodb/data');
    }
    const names = new Set();
    return manifest.collections.map(({ name, file, count, sha256 }) => {
        if (!/^[A-Z][A-Za-z]+$/.test(name) || names.has(name) || path.basename(file) !== file) {
            throw new Error(`Invalid or duplicate collection source: ${name}/${file}`);
        }
        names.add(name);
        const raw = fs.readFileSync(path.join(__dirname, 'data', file));
        if (crypto.createHash('sha256').update(raw).digest('hex') !== (name === 'Room' ? roomSourceSha256 : sha256)) {
            throw new Error(`${file}: checksum mismatch; regenerate the complete seed first`);
        }
        const records = JSON.parse(raw.toString('utf8'));
        if (!Array.isArray(records) || records.length !== count || !count) {
            throw new Error(`${file}: expected ${count} records`);
        }
        const ids = new Set();
        const mongoIds = new Set();
        for (const record of records) {
            if (typeof record.id !== 'string' || ids.has(record.id)
                || !/^[a-f0-9]{24}$/.test(record._id) || mongoIds.has(record._id)) {
                throw new Error(`${file}: invalid or duplicate id/_id`);
            }
            ids.add(record.id);
            mongoIds.add(record._id);
        }
        if (name === 'Room') validateRoomTours(records);
        return { name, records: records.map(record => ({ ...revive(record), _id: new ObjectId(record._id) })) };
    });
}

// Verify the five room tours before the destructive replacement phase can start.
function validateRoomTours(rooms) {
    for (let number = 46; number <= 50; number++) {
        const id = `phong-${number}`;
        const tour = rooms.find(room => room.id === id)?.tour;
        const sceneIds = new Set(tour?.scenes?.map(scene => scene.id));
        if (!tour || tour.roomId !== id || tour.startScene !== 'living' || tour.pitchLimit !== 12 ||
            sceneIds.size !== 4 || !['living', 'kitchen', 'bathroom', 'bedroom'].every(scene => sceneIds.has(scene))) {
            throw new Error(`${id}: invalid tour scenes`);
        }
        for (const scene of tour.scenes) {
            if (scene.image !== `/assets/tours/PHONG_${number}/${scene.id}.webp` ||
                !Array.isArray(scene.hotspots) || !scene.hotspots.length || scene.hotspots.some(spot =>
                    !sceneIds.has(spot.target) || spot.target === scene.id || !Number.isFinite(spot.yaw) ||
                    Math.abs(spot.yaw) > 180 || !Number.isFinite(spot.pitch) || Math.abs(spot.pitch) > tour.pitchLimit)) {
                throw new Error(`${id}: invalid tour media or hotspots`);
            }
        }
    }
}

// Local dates/times stay strings; instants become BSON Date.
// Viewing.customerId follows the existing API's Account ObjectId convention;
// customerProfileId links to the separate Customer entity.
function revive(value) {
    if (Array.isArray(value)) return value.map(revive);
    if (value && typeof value === 'object') {
        if (Object.keys(value).length === 1 && typeof value.$oid === 'string') {
            if (!/^[a-f0-9]{24}$/.test(value.$oid)) throw new Error('Invalid $oid');
            return new ObjectId(value.$oid);
        }
        return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, revive(child)]));
    }
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
        const result = new Date(value);
        if (!Number.isFinite(result.getTime())) throw new Error(`Invalid instant: ${value}`);
        return result;
    }
    return value;
}

const uniqueIndexes = {
    Room: [[{ code: 1 }], [{ slug: 1 }, { sparse: true }]],
    Account: [[{ phone: 1 }]],
    AccountRole: [[{ accountId: 1, roleId: 1 }]],
    Customer: [[{ accountId: 1 }]],
    Employee: [[{ accountId: 1 }], [{ employeeCode: 1 }]],
    PropertySchool: [[{ propertyId: 1, schoolId: 1 }]],
    RoomImage: [[{ roomId: 1, order: 1 }]],
    Favorite: [[{ customerId: 1, roomId: 1 }]],
    ViewingDetail: [[{ viewingId: 1, roomId: 1 }], [{ viewingId: 1, order: 1 }]],
    Hold: [[{ roomId: 1 }, { partialFilterExpression: { isActive: true } }]],
    Deposit: [[{ number: 1 }], [{ holdId: 1 }, { sparse: true }]],
    Payment: [[{ idempotencyKey: 1 }], [{ bankTransactionRef: 1 }, { sparse: true }]],
    Receipt: [[{ number: 1 }], [{ paymentId: 1 }]],
    Contract: [[{ number: 1 }], [{ depositId: 1 }]],
    BrokerageTransaction: [[{ contractId: 1 }]],
    EmployeeRevenue: [[{ employeeId: 1, periodId: 1 }]],
    CompanyRevenue: [[{ periodId: 1 }]],
    Commission: [[{ employeeId: 1, periodId: 1 }]],
    PayrollPeriod: [[{ code: 1 }]],
    Payslip: [[{ employeeId: 1, periodId: 1 }], [{ adjustmentId: 1 }]],
    RegistrationPeriod: [[{ weekStart: 1 }]],
    PeriodRegistration: [[{ periodId: 1, employeeId: 1 }]],
    Shift: [[{ workLocationId: 1, startsAt: 1 }]],
    ShiftAssignment: [[{ shiftId: 1, employeeId: 1 }, { partialFilterExpression: { isActive: true } }]],
    Attendance: [[{ assignmentId: 1 }]],
    Notification: [[{ dedupeKey: 1 }]],
    ContactRequest: [[{ dedupeHash: 1 }]]
};

async function seed() {
    const client = new MongoClient('mongodb://127.0.0.1:27017');
    let replacementStarted = false;
    try {
        const sources = readSources();
        await client.connect();
        const database = client.db('iHouzzUniData');
        console.log('Replacing DATA-01 in iHouzzUniData (standalone; stop the API during seed).');
        for (const { name, records } of sources) {
            const collection = database.collection(name);
            replacementStarted = true;
            await collection.deleteMany({});
            await collection.insertMany(records, { ordered: true });
            await collection.createIndex({ id: 1 }, { unique: true });
            for (const [keys, options = {}] of uniqueIndexes[name] || []) {
                await collection.createIndex(keys, { unique: true, ...options });
            }
            const actual = await collection.countDocuments({});
            if (actual !== records.length) throw new Error(`${name}: expected ${records.length}, found ${actual}`);
            console.log(`${name}: ${actual} records`);
        }
        console.log(`PASS: replaced all ${sources.length} collections; legacy rooms removed.`);
    } catch (error) {
        console.error(error.message);
        if (replacementStarted) {
            console.error('Seed is incomplete. Keep the API stopped and rerun seed after fixing the error.');
        }
        process.exitCode = 1;
    } finally {
        await client.close();
    }
}

if (require.main === module) seed();
module.exports = { readSources, revive, validateRoomTours };

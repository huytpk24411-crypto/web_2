// Run with --apply to replace ONLY Room.tour for the five reconstructed HOT tours.
// No seed/reset is performed. Original tour fields are backed up before any write.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { MongoClient } = require('mongodb');

async function main() {
    const dbName = process.env.MONGODB_DB || 'iHouzzUniData';
    assert(['iHouzzUniData', 'iHouzzUniData_test'].includes(dbName), 'Unexpected database');
    const sources = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/rooms.json'), 'utf8'));
    const ids = [46, 47, 48, 49, 50].map(n => `phong-${n}`);
    const tours = sources.filter(room => ids.includes(room.id)).map(({ id, tour }) => ({ id, tour }));
    assert.equal(tours.length, 5);
    for (const { id, tour } of tours) {
        assert.equal(tour.roomId, id);
        assert.equal(tour.pitchLimit, 55);
        assert.equal(tour.scenes.length, 4);
        for (const scene of tour.scenes) {
            assert.equal(scene.image, `/assets/tours/PHONG_${id.slice(6)}/${scene.id}-v2.webp`);
            for (const app of ['my-app-customer', 'my-app-employee', 'my-app-admin']) {
                assert(fs.existsSync(path.join(__dirname, '../..', app, 'public', scene.image)));
            }
        }
    }
    const client = new MongoClient('mongodb://127.0.0.1:27017');
    await client.connect();
    try {
        const collection = client.db(dbName).collection('Room');
        const before = await collection.find({ id: { $in: ids } }).sort({ id: 1 }).toArray();
        assert.equal(before.length, 5, 'Expected exactly five existing HOT rooms');
        if (!process.argv.includes('--apply')) {
            console.log(`Validated 20 media files in each portal. Ready to update five ${dbName}.Room.tour fields.`);
            return;
        }
        const backup = path.join(os.tmpdir(), `ihouzz-tour-before-v2-${dbName}-${Date.now()}.json`);
        fs.writeFileSync(backup, JSON.stringify(before.map(({ id, tour }) => ({ id, tour })), null, 2));
        const result = await collection.bulkWrite(tours.map(({ id, tour }) => ({ updateOne: {
            // Compare the prior tour to avoid overwriting a simultaneous edit.
            filter: { id, tour: before.find(room => room.id === id).tour }, update: { $set: { tour } },
        } })));
        assert.equal(result.matchedCount, 5, 'A tour changed concurrently; inspect the backup before retrying');
        const after = await collection.find({ id: { $in: ids } }).sort({ id: 1 }).toArray();
        const withoutTour = room => { const { tour, ...rest } = room; return rest; };
        assert.deepEqual(after.map(withoutTour), before.map(withoutTour), 'Non-tour fields changed');
        for (const room of after) assert.deepEqual(room.tour, tours.find(t => t.id === room.id).tour);
        console.log(`Updated ${result.modifiedCount} tours. Non-tour Room fields unchanged. Backup: ${backup}`);
    } finally {
        await client.close();
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

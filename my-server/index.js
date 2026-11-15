const express = require('express');
const app = express();
const port = 3000;

const morgan = require('morgan');
app.use(morgan('combined'));

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const uploadFolders = ['rooms', 'cccd', 'attendance', 'schools', 'employees'];
fs.mkdirSync(path.join(__dirname, 'public', 'images'), { recursive: true });
for (const folder of uploadFolders) {
    fs.mkdirSync(path.join(__dirname, 'public', 'uploads', folder), { recursive: true });
}
app.use(express.static(path.join(__dirname, 'public')));

const cors = require('cors');
app.use(cors());
const bodyParser = require('body-parser');
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
const fileUpload = require('express-fileupload');
app.use(fileUpload({ limits: { fileSize: 5 * 1024 * 1024 }, abortOnLimit: true }));

// Keep practice data in memory
const amenities = [
    { id: 'a1', name: 'Máy lạnh', group: 'NOI_THAT' },
    { id: 'a2', name: 'Tủ lạnh', group: 'NOI_THAT' },
    { id: 'a3', name: 'Giường nệm', group: 'NOI_THAT' },
    { id: 'a4', name: 'Wifi', group: 'DICH_VU' },
    { id: 'a5', name: 'Bếp riêng', group: 'TIEN_ICH' },
    { id: 'a6', name: 'Giờ giấc tự do', group: 'TIEN_ICH' }
];
const roomTypes = ['PHONG_TRO', 'CAN_HO_MINI', 'STUDIO', 'DUPLEX', 'CAN_HO', 'KTX'];

app.get('/api/amenities', cors(), async (req, res) => {
    res.send(amenities);
});

app.get('/api/amenities/filter/group', cors(), async (req, res) => {
    if (typeof req.query.group !== 'string' || !req.query.group.trim()) {
        return res.status(400).send({ message: 'group is required' });
    }
    res.send(amenities.filter(amenity => amenity.group === req.query.group.trim()));
});

app.get('/api/amenities/:id', cors(), async (req, res) => {
    const amenity = amenities.find(item => item.id === req.params.id);
    if (!amenity) return res.status(404).send({ message: 'Amenity not found' });
    res.send(amenity);
});

app.post('/api/amenities', cors(), async (req, res) => {
    const { id = crypto.randomUUID(), name, group } = req.body || {};
    if (typeof id !== 'string' || !id.trim() || typeof name !== 'string' || !name.trim()
        || typeof group !== 'string' || !group.trim()) {
        return res.status(400).send({ message: 'id, name and group must be non-empty strings' });
    }
    if (amenities.some(item => item.id === id.trim())) {
        return res.status(409).send({ message: 'Amenity id already exists' });
    }
    const amenity = { id: id.trim(), name: name.trim(), group: group.trim() };
    amenities.push(amenity);
    res.status(201).send(amenity);
});

app.put('/api/amenities', cors(), async (req, res) => {
    const { id, name, group } = req.body || {};
    if (typeof id !== 'string' || !id.trim() || typeof name !== 'string' || !name.trim()
        || typeof group !== 'string' || !group.trim()) {
        return res.status(400).send({ message: 'id, name and group must be non-empty strings' });
    }
    const index = amenities.findIndex(item => item.id === id.trim());
    if (index === -1) return res.status(404).send({ message: 'Amenity not found' });
    amenities[index] = { id: id.trim(), name: name.trim(), group: group.trim() };
    res.send(amenities[index]);
});

app.delete('/api/amenities/:id', cors(), async (req, res) => {
    const index = amenities.findIndex(item => item.id === req.params.id);
    if (index === -1) return res.status(404).send({ message: 'Amenity not found' });
    res.send(amenities.splice(index, 1)[0]);
});

app.get('/api/room-types', cors(), async (req, res) => {
    res.send(roomTypes);
});

app.post('/api/upload/:folder', cors(), async (req, res) => {
    try {
        const folder = req.params.folder;
        if (!uploadFolders.includes(folder)) {
            return res.status(400).send({ message: 'Invalid upload folder' });
        }
        const file = req.files && req.files.file;
        if (!file || Array.isArray(file)) {
            return res.status(400).send({ message: 'Upload one file using field file' });
        }
        if (file.truncated || file.size > 5 * 1024 * 1024) {
            return res.status(413).send({ message: 'File must not exceed 5 MB' });
        }
        const extension = path.extname(file.name).toLowerCase();
        const imageTypes = {
            '.jpg': 'image/jpeg', '.png': 'image/png',
            '.webp': 'image/webp', '.svg': 'image/svg+xml'
        };
        if (!imageTypes[extension] || file.mimetype !== imageTypes[extension]) {
            return res.status(400).send({ message: 'Only jpg, png, webp and svg images are allowed' });
        }
        // Generate a safe name inside the selected folder
        const name = crypto.randomUUID() + extension;
        await file.mv(path.join(__dirname, 'public', 'uploads', folder, name));
        res.status(201).send({ url: `/uploads/${folder}/${name}` });
    } catch (error) {
        res.status(500).send({ message: error.message });
    }
});

app.listen(port, () => {
    console.log(`My Server listening on port ${port}`);
});

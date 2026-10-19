import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import mongoose, { Types } from 'mongoose';
import jwt, { JwtPayload } from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Property, Room, RoomImage, User, PublicationStatus, RoomStatus } from './models.js';

const port = Number(process.env['PORT'] || 3000);
const mongoUri = process.env['MONGODB_URI'];
const jwtSecret = process.env['JWT_SECRET'];
const uploadDirectory = path.resolve(process.env['UPLOAD_DIR'] || './uploads');
const cookieName = 'ihouzz_session';
const app = express();

if (!mongoUri) throw new Error('MONGODB_URI must be configured.');
if (!jwtSecret || jwtSecret.length < 32)
  throw new Error('JWT_SECRET must contain at least 32 characters.');

app.disable('x-powered-by');
app.use(
  cors({
    origin: process.env['FRONTEND_ORIGIN'] || 'http://127.0.0.1:4200',
    credentials: true,
    allowedHeaders: ['Content-Type', 'X-Requested-With'],
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/uploads', express.static(uploadDirectory, { fallthrough: false, index: false }));

type SessionRequest = Request & { session?: { id: string; role: string } };
type ApiError = Error & { status?: number; code?: string; fieldErrors?: Record<string, string> };
const fail = (
  status: number,
  code: string,
  message: string,
  fieldErrors?: Record<string, string>,
): ApiError => Object.assign(new Error(message), { status, code, fieldErrors });

const asyncRoute =
  (handler: (req: SessionRequest, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(handler(req as SessionRequest, res)).catch(next);

function auth(requiredRole?: string) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = (req as SessionRequest).cookies?.[cookieName] as string | undefined;
    if (!token) return next(fail(401, 'AUTH_REQUIRED', 'Vui lòng đăng nhập.'));
    try {
      const claims = jwt.verify(token, jwtSecret!) as JwtPayload;
      const sessionReq = req as SessionRequest;
      const id = String(claims['sub']);
      if (!Types.ObjectId.isValid(id)) return next(fail(401, 'SESSION_INVALID', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'));
      void User.findById(id).select('role').lean().then((user) => {
        if (!user) return next(fail(401, 'SESSION_INVALID', 'Tài khoản không còn tồn tại.'));
        sessionReq.session = { id, role: String(user['role']) };
        if (requiredRole && sessionReq.session.role !== requiredRole)
          return next(fail(403, 'FORBIDDEN', 'Chỉ Admin được thực hiện thao tác này.'));
        return next();
      }).catch(next);
    } catch {
      return next(fail(401, 'SESSION_INVALID', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.'));
    }
  };
}

const tokenFor = (user: { _id: Types.ObjectId; role: string }) =>
  jwt.sign({ role: user.role }, jwtSecret!, { subject: String(user._id), expiresIn: '8h' });
const setSessionCookie = (res: Response, user: { _id: Types.ObjectId; role: string }) =>
  res.cookie(cookieName, tokenFor(user), {
    httpOnly: true,
    secure: process.env['NODE_ENV'] === 'production',
    sameSite: 'strict',
    maxAge: 8 * 60 * 60 * 1000,
    path: '/',
  });
const userDto = (user: { _id: Types.ObjectId; username: string; name: string; role: string; phone?: string }) => ({
  id: String(user._id),
  username: user.username,
  name: user.name,
  role: user.role,
  phone: user.phone || '',
});

app.post(
  '/api/auth/login',
  asyncRoute(async (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.passwordHash)))
      throw fail(401, 'INVALID_CREDENTIALS', 'Tên đăng nhập hoặc mật khẩu không đúng.');
    setSessionCookie(res, user);
    res.json({ user: userDto(user) });
  }),
);
app.post(
  '/api/auth/register',
  asyncRoute(async (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim().toLowerCase() : '';
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const phone = typeof req.body?.phone === 'string' ? req.body.phone.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!/^[a-z][a-z0-9_-]{2,29}$/.test(username) || name.length < 2 || phone.length < 8 || password.length < 8)
      throw fail(400, 'VALIDATION_ERROR', 'Thông tin đăng ký không hợp lệ.', {
        password: password.length < 8 ? 'Mật khẩu cần ít nhất 8 ký tự.' : '',
      });
    const user = await User.create({
      username,
      name,
      phone,
      passwordHash: await bcrypt.hash(password, 12),
      role: 'CUSTOMER',
    });
    setSessionCookie(res, user);
    res.status(201).json({ user: userDto(user) });
  }),
);
app.get(
  '/api/auth/me',
  auth(),
  asyncRoute(async (req, res) => {
    const user = await User.findById(req.session!.id);
    if (!user) throw fail(401, 'SESSION_INVALID', 'Tài khoản không còn tồn tại.');
    res.json({ user: userDto(user) });
  }),
);
app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie(cookieName, { httpOnly: true, secure: process.env['NODE_ENV'] === 'production', sameSite: 'strict', path: '/' });
  res.status(204).end();
});

type RoomDocument = {
  _id: Types.ObjectId;
  code: string;
  name: string;
  propertyId: Types.ObjectId;
  number: string;
  floor: string;
  address: string;
  district: string;
  type: string;
  price: number | null;
  deposit: number | null;
  area: number | null;
  capacity: number | null;
  fees: Record<string, number | string>;
  amenities: string[];
  description: string;
  imageIds: Types.ObjectId[];
  businessStatus: RoomStatus;
  publicationStatus: PublicationStatus;
  createdAt: Date;
  updatedAt: Date;
};

async function roomDto(room: RoomDocument) {
  const property = await Property.findById(room.propertyId).lean();
  const photos = room.imageIds.length
    ? await RoomImage.find({ _id: { $in: room.imageIds } }).lean()
    : [];
  const byId = new Map(photos.map((photo) => [String(photo._id), photo]));
  const images = room.imageIds.flatMap((id) => {
    const image = byId.get(String(id));
    return image ? [`/uploads/${image['filename']}`] : [];
  });
  return {
    id: String(room._id),
    code: room.code,
    name: room.name,
    propertyId: String(room.propertyId),
    propertyName: property?.['name'] || '',
    number: room.number,
    floor: room.floor,
    address: room.address || property?.['address'] || '',
    district: room.district || property?.['district'] || '',
    price: room.price,
    deposit: room.deposit,
    area: room.area,
    capacity: room.capacity,
    type: room.type,
    fees: room.fees,
    businessStatus: room.businessStatus,
    publicationStatus: room.publicationStatus,
    status: room.businessStatus,
    images,
    amenities: room.amenities,
    description: room.description,
    featured: false,
    hasHistory: false,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
  };
}

function normalizedCode(body: Record<string, unknown>) {
  return typeof body['code'] === 'string' ? body['code'].trim().toUpperCase() : '';
}
function validateRoom(body: Record<string, unknown>, publish: boolean) {
  const errors: Record<string, string> = {};
  if (!normalizedCode(body)) errors['code'] = 'Vui lòng nhập mã phòng.';
  const requiredStrings = ['name', 'type', 'address', 'number', 'description'];
  if (publish) {
    for (const key of requiredStrings) if (typeof body[key] !== 'string' || !String(body[key]).trim()) errors[key] = 'Trường này là bắt buộc để đăng phòng.';
    for (const key of ['price', 'deposit', 'area', 'capacity']) {
      const value = Number(body[key]);
      if (!Number.isFinite(value) || value <= 0) errors[key] = 'Giá trị phải là số dương.';
    }
  } else {
    for (const key of ['price', 'deposit', 'area', 'capacity']) {
      const value = body[key];
      if (value !== null && value !== undefined && value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0))
        errors[key] = 'Giá trị phải là số không âm.';
    }
  }
  if (typeof body['propertyId'] !== 'string' || !Types.ObjectId.isValid(body['propertyId']))
    errors['propertyId'] = 'Vui lòng chọn tòa nhà hợp lệ.';
  if (body['amenities'] !== undefined && (!Array.isArray(body['amenities']) || body['amenities'].some((x) => typeof x !== 'string')))
    errors['amenities'] = 'Danh sách tiện nghi không hợp lệ.';
  if (body['fees'] !== undefined && (!body['fees'] || typeof body['fees'] !== 'object' || Array.isArray(body['fees'])))
    errors['fees'] = 'Thông tin phí không hợp lệ.';
  if (body['businessStatus'] !== undefined && !['AVAILABLE', 'HELD', 'RENTED', 'MAINTENANCE'].includes(String(body['businessStatus'])))
    errors['businessStatus'] = 'Trạng thái kinh doanh không hợp lệ.';
  if (Object.keys(errors).length) throw fail(400, 'VALIDATION_ERROR', 'Vui lòng kiểm tra lại thông tin phòng.', errors);
}
function safeRoomFields(body: Record<string, unknown>, existing?: RoomDocument) {
  const output: Record<string, unknown> = {};
  for (const key of ['name', 'number', 'floor', 'address', 'district', 'type', 'description']) {
    if (typeof body[key] === 'string') output[key] = body[key].trim();
  }
  if (body['code'] !== undefined) {
    output['code'] = normalizedCode(body);
    output['codeNormalized'] = normalizedCode(body);
  }
  if (body['propertyId'] !== undefined) output['propertyId'] = body['propertyId'];
  if (body['number'] !== undefined)
    output['numberNormalized'] = String(body['number']).trim()
      ? String(body['number']).trim().toUpperCase()
      : undefined;
  for (const key of ['price', 'deposit', 'area', 'capacity']) {
    if (body[key] !== undefined && body[key] !== '') output[key] = Number(body[key]);
    else if (body[key] === '') output[key] = null;
  }
  if (Array.isArray(body['amenities'])) output['amenities'] = body['amenities'].slice(0, 100);
  if (body['fees'] !== undefined) {
    if (!body['fees'] || typeof body['fees'] !== 'object' || Array.isArray(body['fees']))
      throw fail(400, 'VALIDATION_ERROR', 'Phí sinh hoạt không hợp lệ.', { fees: 'Nhập các khoản phí dạng số không âm.' });
    const feeFields = ['electricity', 'water', 'motorbike', 'management'];
    const fees = { ...(existing?.fees || {}) };
    for (const [key, rawValue] of Object.entries(body['fees'] as Record<string, unknown>)) {
      const value = Number(rawValue);
      if (!feeFields.includes(key) || !Number.isFinite(value) || value < 0)
        throw fail(400, 'VALIDATION_ERROR', 'Phí sinh hoạt không hợp lệ.', { fees: 'Nhập các khoản phí dạng số không âm.' });
      fees[key] = value;
    }
    output['fees'] = fees;
  }
  if (body['businessStatus'] !== undefined) {
    const requested = String(body['businessStatus']) as RoomStatus;
    if (requested !== (existing?.businessStatus || 'AVAILABLE') && ['HELD', 'RENTED'].includes(requested))
      throw fail(409, 'BUSINESS_STATUS_TRANSACTION_REQUIRED', 'Trạng thái giữ chỗ/đã thuê chỉ được thay đổi bởi API giao dịch hoặc hợp đồng.');
    if (existing && existing.businessStatus !== requested && ['HELD', 'RENTED'].includes(existing.businessStatus))
      throw fail(409, 'BUSINESS_STATUS_LOCKED', 'Phòng đang giữ chỗ/đã thuê; trạng thái này chỉ được thay đổi sau khi xử lý hợp đồng hoặc giao dịch liên quan.');
    if (existing && existing.businessStatus !== requested && requested !== 'AVAILABLE' && !['AVAILABLE', 'MAINTENANCE'].includes(existing.businessStatus))
      throw fail(409, 'BUSINESS_STATUS_TRANSITION_INVALID', 'Không thể chuyển trạng thái kinh doanh theo yêu cầu.');
    output['businessStatus'] = requested;
  }
  return output;
}

async function codeConflict(code: string, propertyId: string, number: string, exceptId?: string) {
  const clauses: Record<string, unknown>[] = [{ codeNormalized: code }];
  if (number.trim()) clauses.push({ propertyId, numberNormalized: number.trim().toUpperCase() });
  const match = await Room.findOne({ $or: clauses, ...(exceptId ? { _id: { $ne: exceptId } } : {}) }).lean();
  return match ? 'Mã phòng hoặc số phòng trong tòa nhà đã tồn tại.' : '';
}

const roomQuery = (req: Request, admin: boolean) => {
  const q = typeof req.query['q'] === 'string' ? req.query['q'].trim() : '';
  const filter: Record<string, unknown> = {};
  if (!admin) {
    filter['publicationStatus'] = 'PUBLISHED';
    filter['businessStatus'] = 'AVAILABLE';
  }
  if (req.query['type']) filter['type'] = req.query['type'];
  if (req.query['propertyId'] && Types.ObjectId.isValid(String(req.query['propertyId'])))
    filter['propertyId'] = req.query['propertyId'];
  if (admin && req.query['businessStatus']) filter['businessStatus'] = req.query['businessStatus'];
  if (req.query['publicationStatus'] && admin) filter['publicationStatus'] = req.query['publicationStatus'];
  const minPrice = Number(req.query['minPrice']);
  const maxPrice = Number(req.query['maxPrice']);
  if (Number.isFinite(minPrice) || Number.isFinite(maxPrice)) {
    filter['price'] = {
      ...(Number.isFinite(minPrice) ? { $gte: minPrice } : {}),
      ...(Number.isFinite(maxPrice) ? { $lte: maxPrice } : {}),
    };
  }
  const page = Math.max(1, Number(req.query['page']) || 1);
  const maxLimit = req.path.endsWith('/export.csv') ? 100000 : 100;
  const limit = Math.min(maxLimit, Math.max(1, Number(req.query['limit']) || 100));
  const sortKey = String(req.query['sort'] || 'updatedAt');
  const sortField: Record<string, 1 | -1> =
    sortKey === 'price-asc' ? { price: 1 } : sortKey === 'price-desc' ? { price: -1 } : { updatedAt: -1 };
  return { q, filter, page, limit, sortField };
};

async function matchingRooms(req: Request, admin: boolean) {
  const { q, filter, page, limit, sortField } = roomQuery(req, admin);
  if (q) {
    const properties = await Property.find({ name: { $regex: escapeRegex(q), $options: 'i' } }).select('_id').lean();
    const ids = properties.map((property) => property['_id']);
    filter['$or'] = [
      { code: { $regex: escapeRegex(q), $options: 'i' } },
      { name: { $regex: escapeRegex(q), $options: 'i' } },
      { address: { $regex: escapeRegex(q), $options: 'i' } },
      { propertyId: { $in: ids } },
    ];
  }
  const total = await Room.countDocuments(filter);
  const documents = (await Room.find(filter)
    .sort(sortField)
    .skip((page - 1) * limit)
    .limit(limit)
    .lean()) as unknown as RoomDocument[];
  const roomDtos = await Promise.all(documents.map(roomDto));
  return { rooms: roomDtos, page, limit, total, pages: Math.ceil(total / limit) };
}
function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

app.get(
  '/api/rooms',
  asyncRoute(async (req, res) => {
    const result = await matchingRooms(req, false);
    res.json(result);
  }),
);
app.get(
  '/api/rooms/:id',
  asyncRoute(async (req, res) => {
    const id = String(req.params['id']);
    if (!Types.ObjectId.isValid(id)) throw fail(404, 'ROOM_NOT_FOUND', 'Không tìm thấy phòng.');
    const room = (await Room.findOne({
      _id: id,
      publicationStatus: 'PUBLISHED',
      businessStatus: 'AVAILABLE',
    }).lean()) as unknown as RoomDocument | null;
    if (!room) throw fail(404, 'ROOM_NOT_FOUND', 'Không tìm thấy phòng đang được đăng.');
    res.json({ room: await roomDto(room) });
  }),
);
app.get('/api/properties', asyncRoute(async (_req, res) => {
  const properties = await Property.find({ active: true }).sort({ name: 1 }).lean();
  res.json({ properties: properties.map((property) => ({ id: String(property['_id']), name: property['name'], address: property['address'], district: property['district'], lat: property['lat'] ?? null, lng: property['lng'] ?? null })) });
}));

app.get('/api/admin/rooms', auth('ADMIN'), asyncRoute(async (req, res) => {
  const result = await matchingRooms(req, true);
  const stats = await Room.aggregate([
    { $group: { _id: { publicationStatus: '$publicationStatus', businessStatus: '$businessStatus' }, count: { $sum: 1 } } },
  ]);
  const rooms = await Promise.all(result.rooms.map(async (room) => ({
    ...room,
    hasHistory: await roomHasHistory(room['id'], room['code']),
  })));
  res.json({ ...result, rooms, stats });
}));
app.get('/api/admin/rooms/export.csv', auth('ADMIN'), asyncRoute(async (req, res) => {
  const params = { ...req.query, page: '1', limit: '100000' } as Request['query'];
  const exportReq = { ...req, query: params } as Request;
  const { rooms } = await matchingRooms(exportReq, true);
  const cells = [['Mã phòng', 'Tên phòng', 'Tòa nhà', 'Địa chỉ', 'Loại phòng', 'Giá thuê/tháng (VND)', 'Diện tích (m²)', 'Trạng thái kinh doanh', 'Trạng thái đăng']];
  for (const room of rooms) cells.push([room['code'], room['name'], room['propertyName'], room['address'], room['type'], room['price'], room['area'], room['businessStatus'], room['publicationStatus']].map(String));
  const csv = '\ufeff' + cells.map((row) => row.map((cell) => {
    const safeCell = /^[=+\-@]/.test(cell) ? `'${cell}` : cell;
    return `"${safeCell.replace(/"/g, '""')}"`;
  }).join(',')).join('\r\n');
  res.type('text/csv; charset=utf-8').attachment('ihouzz-rooms.csv').send(csv);
}));
app.get('/api/admin/properties', auth('ADMIN'), asyncRoute(async (_req, res) => {
  const properties = await Property.find({ active: true }).sort({ name: 1 }).lean();
  res.json({ properties: properties.map((property) => ({ id: String(property['_id']), name: property['name'], address: property['address'], district: property['district'], lat: property['lat'] ?? null, lng: property['lng'] ?? null })) });
}));
app.post('/api/admin/properties', auth('ADMIN'), asyncRoute(async (req, res) => {
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const address = typeof req.body?.address === 'string' ? req.body.address.trim() : '';
  const district = typeof req.body?.district === 'string' ? req.body.district.trim() : '';
  if (!name || !address || !district) throw fail(400, 'VALIDATION_ERROR', 'Tên tòa nhà, địa chỉ và khu vực là bắt buộc.');
  const lat = req.body?.lat === '' || req.body?.lat === undefined ? null : Number(req.body.lat);
  const lng = req.body?.lng === '' || req.body?.lng === undefined ? null : Number(req.body.lng);
  if ((lat !== null && (!Number.isFinite(lat) || Math.abs(lat) > 90)) || (lng !== null && (!Number.isFinite(lng) || Math.abs(lng) > 180)) || ((lat === null) !== (lng === null)))
    throw fail(400, 'VALIDATION_ERROR', 'Tọa độ cần có cả vĩ độ và kinh độ hợp lệ.');
  const property = await Property.create({ name, address, district, lat, lng, description: req.body?.description || '' });
  res.status(201).json({ property: { id: String(property._id), name, address, district } });
}));
app.post('/api/admin/rooms', auth('ADMIN'), asyncRoute(async (req, res) => {
  validateRoom(req.body || {}, false);
  const property = await Property.findOne({ _id: req.body['propertyId'], active: true }).lean();
  if (!property) throw fail(400, 'PROPERTY_NOT_FOUND', 'Tòa nhà không tồn tại hoặc đã ngừng hoạt động.');
  const conflict = await codeConflict(normalizedCode(req.body), String(property['_id']), String(req.body['number'] || ''));
  if (conflict) throw fail(409, 'DUPLICATE_ROOM', conflict, { code: 'Mã phòng đã tồn tại.', number: 'Số phòng trong tòa nhà đã tồn tại.' });
  const values = safeRoomFields(req.body);
  const room = await Room.create({ ...values, createdBy: req.session!.id, updatedBy: req.session!.id, publicationStatus: 'DRAFT' });
  res.status(201).json({ room: await roomDto(room as unknown as RoomDocument) });
}));
app.get('/api/admin/rooms/check-code', auth('ADMIN'), asyncRoute(async (req, res) => {
  const code = typeof req.query['code'] === 'string' ? req.query['code'].trim().toUpperCase() : '';
  const propertyId = typeof req.query['propertyId'] === 'string' ? req.query['propertyId'] : '';
  const number = typeof req.query['number'] === 'string' ? req.query['number'] : '';
  const exceptId = typeof req.query['exceptId'] === 'string' ? req.query['exceptId'] : undefined;
  if (!code || !Types.ObjectId.isValid(propertyId))
    throw fail(400, 'VALIDATION_ERROR', 'Mã phòng và tòa nhà hợp lệ là bắt buộc.');
  res.json({ duplicate: Boolean(await codeConflict(code, propertyId, number, exceptId)) });
}));
app.get('/api/admin/rooms/:id', auth('ADMIN'), asyncRoute(async (req, res) => {
  const id = String(req.params['id']);
  if (!Types.ObjectId.isValid(id)) throw fail(404, 'ROOM_NOT_FOUND', 'Không tìm thấy phòng.');
  const room = (await Room.findById(id).lean()) as unknown as RoomDocument | null;
  if (!room) throw fail(404, 'ROOM_NOT_FOUND', 'Không tìm thấy phòng.');
  res.json({ room: { ...(await roomDto(room)), hasHistory: await roomHasHistory(String(room._id), room.code) } });
}));
app.patch('/api/admin/rooms/:id', auth('ADMIN'), asyncRoute(async (req, res) => {
  const id = String(req.params['id']);
  if (!Types.ObjectId.isValid(id)) throw fail(404, 'ROOM_NOT_FOUND', 'Không tìm thấy phòng.');
  const existing = await Room.findById(id);
  if (!existing) throw fail(404, 'ROOM_NOT_FOUND', 'Không tìm thấy phòng.');
  const body = req.body || {};
  validateRoom({ ...existing.toObject(), ...body }, false);
  const propertyId = String(body['propertyId'] || existing.propertyId);
  if (!await Property.exists({ _id: propertyId, active: true })) throw fail(400, 'PROPERTY_NOT_FOUND', 'Tòa nhà không tồn tại hoặc đã ngừng hoạt động.');
  const code = body['code'] === undefined ? existing.code : normalizedCode(body);
  const number = body['number'] === undefined ? existing.number : String(body['number']);
  const conflict = await codeConflict(code, propertyId, number, String(existing._id));
  if (conflict) throw fail(409, 'DUPLICATE_ROOM', conflict, { code: 'Mã phòng đã tồn tại.', number: 'Số phòng trong tòa nhà đã tồn tại.' });
  Object.assign(existing, safeRoomFields(body, existing), { updatedBy: req.session!.id });
  await existing.save();
  res.json({ room: await roomDto(existing as unknown as RoomDocument) });
}));
app.post('/api/admin/rooms/:id/publish', auth('ADMIN'), asyncRoute(async (req, res) => {
  const id = String(req.params['id']);
  if (!Types.ObjectId.isValid(id)) throw fail(404, 'ROOM_NOT_FOUND', 'Không tìm thấy phòng.');
  const room = await Room.findById(id);
  if (!room) throw fail(404, 'ROOM_NOT_FOUND', 'Không tìm thấy phòng.');
  validateRoom(room.toObject(), true);
  if (room.imageIds.length < 3) throw fail(400, 'PUBLICATION_REQUIREMENTS_NOT_MET', 'Cần tải lên tối thiểu 3 ảnh phòng trước khi đăng.', { images: 'Tối thiểu 3 ảnh JPG, PNG hoặc WebP.' });
  if (room.businessStatus !== 'AVAILABLE') throw fail(409, 'ROOM_NOT_AVAILABLE', 'Chỉ phòng đang trống mới được đăng cho khách.');
  room.publicationStatus = 'PUBLISHED';
  room.updatedBy = new Types.ObjectId(req.session!.id);
  await room.save();
  res.json({ room: await roomDto(room) });
}));
app.post('/api/admin/rooms/:id/hide', auth('ADMIN'), asyncRoute(async (req, res) => {
  const id = String(req.params['id']);
  if (!Types.ObjectId.isValid(id)) throw fail(404, 'ROOM_NOT_FOUND', 'Không tìm thấy phòng.');
  const room = await Room.findByIdAndUpdate(id, { publicationStatus: 'HIDDEN', updatedBy: req.session!.id }, { new: true });
  if (!room) throw fail(404, 'ROOM_NOT_FOUND', 'Không tìm thấy phòng.');
  res.json({ room: await roomDto(room as unknown as RoomDocument) });
}));
app.post('/api/admin/rooms/:id/republish', auth('ADMIN'), asyncRoute(async (req, res) => {
  const id = String(req.params['id']);
  if (!Types.ObjectId.isValid(id)) throw fail(404, 'ROOM_NOT_FOUND', 'Không tìm thấy phòng.');
  const room = await Room.findById(id);
  if (!room) throw fail(404, 'ROOM_NOT_FOUND', 'Không tìm thấy phòng.');
  validateRoom(room.toObject(), true);
  if (room.imageIds.length < 3 || room.businessStatus !== 'AVAILABLE')
    throw fail(409, 'PUBLICATION_REQUIREMENTS_NOT_MET', 'Phòng phải đủ thông tin, có tối thiểu 3 ảnh và đang trống để đăng lại.');
  room.publicationStatus = 'PUBLISHED';
  room.updatedBy = new Types.ObjectId(req.session!.id);
  await room.save();
  res.json({ room: await roomDto(room) });
}));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 15 },
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype))
      return cb(fail(415, 'UNSUPPORTED_IMAGE_TYPE', 'Chỉ chấp nhận ảnh JPG, PNG hoặc WebP.'));
    cb(null, true);
  },
});
app.post('/api/admin/rooms/:id/images', auth('ADMIN'), upload.array('images', 15), asyncRoute(async (req, res) => {
  const id = String(req.params['id']);
  if (!Types.ObjectId.isValid(id)) throw fail(404, 'ROOM_NOT_FOUND', 'Không tìm thấy phòng.');
  const room = await Room.findById(id);
  if (!room) throw fail(404, 'ROOM_NOT_FOUND', 'Không tìm thấy phòng.');
  const files = (req.files || []) as Express.Multer.File[];
  if (room.imageIds.length + files.length > 15) throw fail(400, 'IMAGE_LIMIT_EXCEEDED', 'Mỗi phòng được lưu tối đa 15 ảnh.');
  if (!files.length) throw fail(400, 'NO_IMAGES', 'Chọn ít nhất một ảnh để tải lên.');
  await mkdir(uploadDirectory, { recursive: true });
  const staged: { filename: string; file: Express.Multer.File; id: Types.ObjectId }[] = [];
  try {
    for (const file of files) {
      const detected = file.buffer.subarray(0, 12);
      const isJpeg = detected[0] === 0xff && detected[1] === 0xd8 && detected[2] === 0xff;
      const isPng = detected.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const isWebp = detected.toString('ascii', 0, 4) === 'RIFF' && detected.toString('ascii', 8, 12) === 'WEBP';
      if ((file.mimetype === 'image/jpeg' && !isJpeg) || (file.mimetype === 'image/png' && !isPng) || (file.mimetype === 'image/webp' && !isWebp))
        throw fail(415, 'INVALID_IMAGE_CONTENT', 'Nội dung tệp không khớp với định dạng ảnh được khai báo.');
      const extension = file.mimetype === 'image/jpeg' ? '.jpg' : file.mimetype === 'image/png' ? '.png' : '.webp';
      const filename = `${String(room._id)}-${randomUUID()}${extension}`;
      await writeFile(path.join(uploadDirectory, filename), file.buffer, { flag: 'wx' });
      staged.push({ filename, file, id: new Types.ObjectId() });
    }
    const documents = await RoomImage.insertMany(staged.map(({ filename, file, id }) => ({
      _id: id,
      roomId: room._id,
      filename,
      originalName: path.basename(file.originalname).slice(0, 255),
      mimeType: file.mimetype,
      size: file.size,
    })));
    room.imageIds.push(...documents.map((image) => image._id));
    room.updatedBy = new Types.ObjectId(req.session!.id);
    await room.save();
  } catch (error) {
    await RoomImage.deleteMany({ _id: { $in: staged.map((item) => item.id) } });
    for (const item of staged) await unlink(path.join(uploadDirectory, item.filename)).catch(() => undefined);
    throw error;
  }
  res.status(201).json({ images: await imagesForRoom(room._id) });
}));
async function imagesForRoom(roomId: Types.ObjectId) {
  const room = await Room.findById(roomId).select('imageIds').lean();
  if (!room) return [];
  const ids = room['imageIds'] as Types.ObjectId[];
  const images = await RoomImage.find({ _id: { $in: ids } }).lean();
  const map = new Map(images.map((image) => [String(image['_id']), image]));
  return ids.flatMap((id, order) => {
    const image = map.get(String(id));
    return image ? [{ id: String(id), url: `/uploads/${image['filename']}`, order, cover: order === 0, size: image['size'], mimeType: image['mimeType'] }] : [];
  });
}
app.get('/api/admin/rooms/:id/images', auth('ADMIN'), asyncRoute(async (req, res) => {
  const id = String(req.params['id']);
  if (!Types.ObjectId.isValid(id) || !await Room.exists({ _id: id }))
    throw fail(404, 'ROOM_NOT_FOUND', 'Không tìm thấy phòng.');
  res.json({ images: await imagesForRoom(new Types.ObjectId(id)) });
}));
app.put('/api/admin/rooms/:id/images/order', auth('ADMIN'), asyncRoute(async (req, res) => {
  const id = String(req.params['id']);
  if (!Types.ObjectId.isValid(id)) throw fail(404, 'ROOM_NOT_FOUND', 'Không tìm thấy phòng.');
  const room = await Room.findById(id);
  const order = req.body?.imageIds;
  if (!room) throw fail(404, 'ROOM_NOT_FOUND', 'Không tìm thấy phòng.');
  if (!Array.isArray(order) || order.length !== room.imageIds.length || order.some((id: unknown) => !Types.ObjectId.isValid(String(id))) || new Set(order.map(String)).size !== order.length)
    throw fail(400, 'INVALID_IMAGE_ORDER', 'Thứ tự ảnh không khớp thư viện hiện có.');
  const currentIds = new Set(room.imageIds.map(String));
  if (order.some((id: string) => !currentIds.has(id))) throw fail(400, 'INVALID_IMAGE_ORDER', 'Thứ tự ảnh chứa ảnh không thuộc phòng.');
  room.imageIds = order.map((id: string) => new Types.ObjectId(id));
  room.updatedBy = new Types.ObjectId(req.session!.id);
  await room.save();
  res.json({ images: await imagesForRoom(room._id) });
}));
app.delete('/api/admin/rooms/:id/images/:imageId', auth('ADMIN'), asyncRoute(async (req, res) => {
  const id = String(req.params['id']);
  const imageId = String(req.params['imageId']);
  if (!Types.ObjectId.isValid(id) || !Types.ObjectId.isValid(imageId))
    throw fail(404, 'IMAGE_NOT_FOUND', 'Không tìm thấy ảnh phòng.');
  const room = await Room.findById(id);
  if (!room || !room.imageIds.some((roomImageId: Types.ObjectId) => String(roomImageId) === imageId))
    throw fail(404, 'IMAGE_NOT_FOUND', 'Không tìm thấy ảnh trong thư viện phòng.');
  const image = await RoomImage.findOne({ _id: imageId, roomId: room._id });
  if (!image) throw fail(404, 'IMAGE_NOT_FOUND', 'Metadata ảnh không còn tồn tại.');
  room.imageIds = room.imageIds.filter((roomImageId: Types.ObjectId) => String(roomImageId) !== imageId);
  room.updatedBy = new Types.ObjectId(req.session!.id);
  await room.save();
  await image.deleteOne();
  try {
    await unlink(path.join(uploadDirectory, image.filename));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  res.json({ images: await imagesForRoom(room._id) });
}));

const dependencyCollections = [
  'viewings', 'lich_xem_phong', 'LICH_XEM_PHONG',
  'favorites', 'yeu_thich', 'YEU_THICH',
  'bookings', 'dat_giu_cho', 'DAT_GIU_CHO',
  'deposits', 'ho_so_coc', 'HO_SO_COC',
  'contracts', 'hop_dong', 'HOP_DONG',
  'payments', 'thanh_toan', 'THANH_TOAN',
];
async function roomHasHistory(roomId: string, code: string): Promise<boolean> {
  const objectId = new Types.ObjectId(roomId);
  const results = await Promise.all(dependencyCollections.map((name) => mongoose.connection.db!.collection(name)
    .findOne({
      $or: [
        { roomId: objectId }, { room: objectId }, { ma_phong: code },
        { ma_phong: objectId }, { roomIds: objectId }, { ma_phong: { $in: [code, objectId] } },
      ],
    }, { projection: { _id: 1 } })));
  return results.some(Boolean);
}
app.delete('/api/admin/rooms/:id', auth('ADMIN'), asyncRoute(async (req, res) => {
  const id = String(req.params['id']);
  if (!Types.ObjectId.isValid(id)) throw fail(404, 'ROOM_NOT_FOUND', 'Không tìm thấy phòng.');
  const room = (await Room.findById(id).lean()) as unknown as RoomDocument | null;
  if (!room) throw fail(404, 'ROOM_NOT_FOUND', 'Không tìm thấy phòng.');
  const hasReferences = await Promise.all(dependencyCollections.map((name) => mongoose.connection.db!.collection(name)
    .findOne({
      $or: [
        { roomId: room._id }, { room: room._id }, { ma_phong: String(room.code) },
        { ma_phong: room._id }, { roomIds: room._id }, { ma_phong: { $in: [room.code, room._id] } },
      ],
    }, { projection: { _id: 1 } })));
  if (hasReferences.some(Boolean))
    throw fail(409, 'ROOM_HAS_HISTORY', 'Phòng có lịch sử xem, yêu thích, giữ chỗ, cọc, hợp đồng hoặc thanh toán; hãy ẩn tin để bảo toàn dữ liệu.');
  const images = await RoomImage.find({ roomId: room._id }).lean();
  await Room.deleteOne({ _id: room._id });
  await RoomImage.deleteMany({ roomId: room._id });
  for (const image of images) {
    try {
      await unlink(path.join(uploadDirectory, image['filename']));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  res.status(204).end();
}));

app.use((error: ApiError, _req: Request, res: Response, _next: NextFunction) => {
  if (error.name === 'ValidationError')
    return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Dữ liệu phòng không hợp lệ.', fieldErrors: (error as mongoose.Error.ValidationError).errors });
  if (error.name === 'CastError')
    return res.status(400).json({ code: 'INVALID_ID', message: 'Định danh không hợp lệ.' });
  if ((error as { code?: number }).code === 11000) {
    const keyPattern = (error as { keyPattern?: Record<string, unknown> }).keyPattern || {};
    if ('username' in keyPattern)
      return res.status(409).json({ code: 'DUPLICATE_USERNAME', message: 'Tên đăng nhập đã được sử dụng.', fieldErrors: { username: 'Tên đăng nhập đã tồn tại.' } });
    return res.status(409).json({ code: 'DUPLICATE_ROOM', message: 'Mã phòng hoặc số phòng trong tòa nhà đã tồn tại.', fieldErrors: { code: 'Giá trị phải là duy nhất.' } });
  }
  if (error instanceof multer.MulterError)
    return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ code: error.code, message: error.code === 'LIMIT_FILE_SIZE' ? 'Mỗi ảnh không được vượt quá 10 MB.' : 'Không thể tiếp nhận ảnh.' });
  const status = error.status || 500;
  if (status >= 500) console.error(error);
  return res.status(status).json({
    code: error.code || 'INTERNAL_ERROR',
    message: status >= 500 ? 'Đã xảy ra lỗi máy chủ.' : error.message,
    ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
  });
});

await mkdir(uploadDirectory, { recursive: true });
await mongoose.connect(mongoUri);
await Promise.all([Property.init(), Room.init(), RoomImage.init(), User.init()]);
app.listen(port, () => console.log(`iHOUZZ API listening on port ${port}`));

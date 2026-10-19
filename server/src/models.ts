import mongoose, { Schema, Types } from 'mongoose';

const PropertySchema = new Schema(
  {
    name: { type: String, trim: true, required: true, maxlength: 160 },
    address: { type: String, trim: true, required: true, maxlength: 300 },
    district: { type: String, trim: true, required: true, maxlength: 120 },
    description: { type: String, trim: true, default: '', maxlength: 3000 },
    lat: { type: Number, default: null, min: -90, max: 90 },
    lng: { type: Number, default: null, min: -180, max: 180 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

const RoomSchema = new Schema(
  {
    code: { type: String, trim: true, required: true, maxlength: 40 },
    codeNormalized: { type: String, required: true },
    name: { type: String, trim: true, default: '', maxlength: 180 },
    propertyId: { type: Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
    number: { type: String, trim: true, default: '', maxlength: 40 },
    numberNormalized: { type: String, default: undefined },
    floor: { type: String, trim: true, default: '', maxlength: 30 },
    address: { type: String, trim: true, default: '', maxlength: 300 },
    district: { type: String, trim: true, default: '', maxlength: 120 },
    type: { type: String, trim: true, default: '', maxlength: 80 },
    price: { type: Number, default: null, min: 0 },
    deposit: { type: Number, default: null, min: 0 },
    area: { type: Number, default: null, min: 0 },
    capacity: { type: Number, default: null, min: 0 },
    fees: { type: Schema.Types.Mixed, default: {} },
    amenities: { type: [String], default: [] },
    description: { type: String, trim: true, default: '', maxlength: 10000 },
    imageIds: { type: [Schema.Types.ObjectId], default: [] },
    businessStatus: {
      type: String,
      enum: ['AVAILABLE', 'HELD', 'RENTED', 'MAINTENANCE'],
      default: 'AVAILABLE',
      index: true,
    },
    publicationStatus: {
      type: String,
      enum: ['DRAFT', 'PUBLISHED', 'HIDDEN'],
      default: 'DRAFT',
      index: true,
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, optimisticConcurrency: true },
);
RoomSchema.index({ codeNormalized: 1 }, { unique: true, name: 'unique_room_code' });
RoomSchema.index(
  { propertyId: 1, numberNormalized: 1 },
  {
    unique: true,
    name: 'unique_room_number_per_property',
    partialFilterExpression: { numberNormalized: { $type: 'string' } },
  },
);

const RoomImageSchema = new Schema(
  {
    roomId: { type: Schema.Types.ObjectId, ref: 'Room', required: true, index: true },
    filename: { type: String, required: true },
    originalName: { type: String, required: true, maxlength: 255 },
    mimeType: { type: String, enum: ['image/jpeg', 'image/png', 'image/webp'], required: true },
    size: { type: Number, required: true, min: 1, max: 10 * 1024 * 1024 },
  },
  { timestamps: true },
);

const UserSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, default: '', trim: true, maxlength: 30 },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['CUSTOMER', 'EMPLOYEE', 'ADMIN'], required: true },
  },
  { timestamps: true },
);

export const Property = mongoose.models['Property'] || mongoose.model('Property', PropertySchema);
export const Room = mongoose.models['Room'] || mongoose.model('Room', RoomSchema);
export const RoomImage = mongoose.models['RoomImage'] || mongoose.model('RoomImage', RoomImageSchema);
export const User = mongoose.models['User'] || mongoose.model('User', UserSchema);
export type RoomStatus = 'AVAILABLE' | 'HELD' | 'RENTED' | 'MAINTENANCE';
export type PublicationStatus = 'DRAFT' | 'PUBLISHED' | 'HIDDEN';
export const idOf = (value: unknown) => new Types.ObjectId(String(value));

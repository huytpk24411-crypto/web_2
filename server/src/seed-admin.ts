import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User } from './models.js';

const { MONGODB_URI: uri, ADMIN_USERNAME: username, ADMIN_PASSWORD: password, ADMIN_NAME: name } = process.env;
if (!uri || !username || !password || !name)
  throw new Error('Set MONGODB_URI, ADMIN_USERNAME, ADMIN_PASSWORD and ADMIN_NAME in .env before seeding.');
if (password.length < 12) throw new Error('ADMIN_PASSWORD must contain at least 12 characters.');
if (!/^[a-z][a-z0-9_-]{2,29}$/i.test(username)) throw new Error('ADMIN_USERNAME format is invalid.');
await mongoose.connect(uri);
const normalized = username.toLowerCase();
const existing = await User.findOne({ username: normalized });
if (existing) throw new Error('That username already exists. No account was modified.');
await User.create({
  username: normalized,
  name: name.trim(),
  passwordHash: await bcrypt.hash(password, 12),
  role: 'ADMIN',
});
console.log(`Created Admin account "${normalized}". Credentials were not printed.`);
await mongoose.disconnect();

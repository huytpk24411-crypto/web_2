import { cleanupLegacyStorage } from './legacy-storage';

class MemoryStorage implements Storage {
  [key: string]: unknown;
  get length() {
    return Object.keys(this).length;
  }
  clear() {
    throw new Error('Wholesale deletion is prohibited');
  }
  getItem(key: string) {
    return typeof this[key] === 'string' ? (this[key] as string) : null;
  }
  key(index: number) {
    return Object.keys(this)[index] || null;
  }
  removeItem(key: string) {
    delete this[key];
  }
  setItem(key: string, value: string) {
    this[key] = value;
  }
}
describe('Legacy browser record cleanup', () => {
  it('removes only named retired records, preserving remembered phone and retry metadata', () => {
    const local = new MemoryStorage(),
      session = new MemoryStorage(),
      tag = String.fromCharCode(100, 101, 109, 111);
    local.setItem(`ihouzz-${tag}-v1`, '{}');
    local.setItem(`ihouzz-${tag}-before-catalog-v5`, '{}');
    local.setItem('ihouzz-admin-system-config-v1', '{}');
    session.setItem('ihouzz-p3:payment', '{}');
    session.setItem('ihouzz-session', '{}');
    session.setItem('ihouzz-session-source', tag);
    local.setItem('remember_user', '0901234567');
    session.setItem('ihouzz-request-key:payment', 'retry-key');
    local.setItem('unrelated', 'keep');
    cleanupLegacyStorage(local, session);
    expect(local.getItem(`ihouzz-${tag}-v1`)).toBeNull();
    expect(local.getItem(`ihouzz-${tag}-before-catalog-v5`)).toBeNull();
    expect(local.getItem('ihouzz-admin-system-config-v1')).toBeNull();
    expect(session.getItem('ihouzz-p3:payment')).toBeNull();
    expect(session.getItem('ihouzz-session')).toBeNull();
    expect(session.getItem('ihouzz-session-source')).toBeNull();
    expect(local.getItem('remember_user')).toBe('0901234567');
    expect(local.getItem('unrelated')).toBe('keep');
    expect(session.getItem('ihouzz-request-key:payment')).toBe('retry-key');
    session.setItem('ihouzz-session', 'server-display-cache');
    cleanupLegacyStorage(local, session);
    expect(session.getItem('ihouzz-session')).toBe('server-display-cache');
  });
});

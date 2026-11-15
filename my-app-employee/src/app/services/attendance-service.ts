import { Injectable, inject } from '@angular/core';
import { ShiftService } from './shift-service';
@Injectable({ providedIn: 'root' })
export class AttendanceService {
  private shifts = inject(ShiftService);
  private checkInDrafts = new Map<
    string,
    { geo: { lat: number; lng: number }; evidenceUrl: string; note: string }
  >();
  get(id: string) {
    const record = this.shifts.api.state().assignments.find((a) => a.id === id)?.attendance;
    return record
      ? {
          ...record,
          employeeShiftId: id,
          note: record.note || '',
          evidence: record.evidence?.find((e) => e.kind === 'CHECK_IN')?.url || '',
          checkOutEvidence: record.evidence?.find((e) => e.kind === 'CHECK_OUT')?.url,
        }
      : undefined;
  }

  async checkInRequest(id: string, evidence: string, note: string, file?: File) {
    if (!file) throw new Error('Vui lòng chọn ảnh minh chứng.');
    const key = `${this.shifts.get(id)?.employeeId}:${id}`;
    let body = this.checkInDrafts.get(key);
    if (!body) {
      const geo = await this.shifts.api.locate();
      const evidenceUrl = await this.shifts.api.upload(file);
      body = { geo, evidenceUrl, note };
      this.checkInDrafts.set(key, body);
    }
    try {
      await this.shifts.api.write(`me/shift-assignments/${id}/check-in`, body);
      this.checkInDrafts.delete(key);
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status && status >= 400 && status < 500) this.checkInDrafts.delete(key);
      throw error;
    }
  }
  async checkOutRequest(id: string, evidence: string, confirmed: boolean, file?: File) {
    if (!confirmed || !file) throw new Error('Cần xác nhận kết thúc ca và chọn ảnh minh chứng.');
    const evidenceUrl = await this.shifts.api.upload(file);
    await this.shifts.api.write(`me/shift-assignments/${id}/check-out`, { confirmed, evidenceUrl });
    await this.shifts.api.loadTasks(id);
  }
}

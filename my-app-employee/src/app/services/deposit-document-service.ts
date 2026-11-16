import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DepositDraft, DepositDraftData, DepositSheet } from '../classes/DepositSheet';
import { apiMessage } from './api-message';
import { AuthService } from './auth-service';

@Injectable({ providedIn: 'root' })
export class DepositDocumentService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private options = { withCredentials: true, timeout: 10000 };

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const actor = this.auth.account()?.id;
    if (!actor || !this.auth.serverAuthenticated()) throw new Error('Cần phiên đăng nhập máy chủ.');
    try {
      const value = await firstValueFrom(
        this.http.request<T>(method, '/data/' + path, {
          ...this.options,
          body,
          // P3 writes require an Idempotency-Key (same rule as MoneyService.write).
          ...(method === 'GET' ? {} : { headers: { 'Idempotency-Key': crypto.randomUUID() } }),
        }),
      );
      if (actor !== this.auth.account()?.id || !this.auth.serverAuthenticated())
        throw new Error('Phiên đăng nhập đã thay đổi. Vui lòng tải lại hồ sơ.');
      return value;
    } catch (error) {
      const message = apiMessage(
        error,
        'Không tải hoặc lưu được hồ sơ. Vui lòng thử lại.',
        path.startsWith('me/deposit-drafts') ? 'deposit-draft' : undefined,
      );
      // NOT_FOUND is draft-specific. Other endpoints keep the generic API wording.
      if (
        path.startsWith('me/deposit-drafts/') &&
        error instanceof HttpErrorResponse &&
        error.status === 404
      )
        throw new Error('Không tìm thấy nháp. Vui lòng tải lại.');
      throw new Error(message);
    }
  }
  listDrafts() {
    return this.request<{ items: DepositDraft[] }>('GET', 'me/deposit-drafts');
  }
  saveDraft(data: Partial<DepositDraftData>, id?: string) {
    return this.request<DepositDraft>(
      id ? 'PUT' : 'POST',
      'me/deposit-drafts' + (id ? '/' + encodeURIComponent(id) : ''),
      { data },
    );
  }
  deleteDraft(id: string) {
    return this.request<{ ok: boolean }>('DELETE', 'me/deposit-drafts/' + encodeURIComponent(id));
  }
  employee() {
    return this.request<{ fullName: string; employeeCode: string }>('GET', 'me/employee');
  }
  company() {
    return this.request<NonNullable<DepositSheet['company']>>('GET', 'company');
  }
  sheet(id: string) {
    return this.request<DepositSheet>('GET', 'deposits/' + encodeURIComponent(id) + '/sheet');
  }
}

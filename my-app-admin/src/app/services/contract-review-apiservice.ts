import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ContractReview, ContractReviewState } from '../classes/ContractReview';

@Injectable({ providedIn: 'root' })
export class ContractReviewAPIService {
  private readonly http = inject(HttpClient);
  private readonly options = { withCredentials: true, timeout: 15000 };
  private readonly pending = new Map<string, string>();

  async list(state: ContractReviewState): Promise<ContractReview[]> {
    const response = await firstValueFrom(
      this.http.get<ContractReview[] | { items: ContractReview[] }>(
        '/data/admin/contract-reviews',
        { ...this.options, params: { state } },
      ),
    );
    return Array.isArray(response) ? response : response.items;
  }

  approve(id: string) {
    return this.write(id, 'approve-contract', {});
  }

  abandon(id: string, note = '') {
    if (note.length > 500) return Promise.reject(new Error('Ghi chú tối đa 500 ký tự.'));
    return this.write(id, 'abandon', note.trim() ? { note: note.trim() } : {});
  }

  private async write(id: string, action: string, body: { note?: string }): Promise<void> {
    const path = `/data/admin/deposits/${encodeURIComponent(id)}/${action}`;
    const signature = `${path}:${JSON.stringify(body)}`;
    const key = this.pending.get(signature) || crypto.randomUUID();
    this.pending.set(signature, key);
    try {
      await firstValueFrom(
        this.http.post<unknown>(path, body, {
          ...this.options,
          headers: { 'Idempotency-Key': key },
        }),
      );
      this.pending.delete(signature);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status >= 400 && error.status < 500)
        this.pending.delete(signature);
      throw error;
    }
  }
}

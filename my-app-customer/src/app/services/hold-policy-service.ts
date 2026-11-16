import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth-service';

@Injectable({ providedIn: 'root' })
export class HoldPolicyService {
  private auth = inject(AuthService);
  private accepted: { accountId: string; roomId: string } | null = null;

  accept(roomId: string) {
    this.accepted = { accountId: this.auth.account()!.id, roomId };
  }

  consume(roomId: string) {
    const accepted = this.accepted;
    this.accepted = null;
    return accepted?.accountId === this.auth.account()?.id && accepted?.roomId === roomId;
  }
}

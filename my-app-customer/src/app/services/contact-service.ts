import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ContactRequest } from '../classes/ContactRequest';
import { CustomerAPIService } from './customer-apiservice';
@Injectable({ providedIn: 'root' })
export class ContactService {
  private api = inject(CustomerAPIService);
  send(data: Omit<ContactRequest, 'id' | 'status' | 'createdAt'>): Promise<ContactRequest> {
    return firstValueFrom(this.api.contact(data));
  }
}

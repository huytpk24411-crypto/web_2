import { Injectable, inject } from '@angular/core';
import { ContactRequest } from '../models/domain';
import { DemoStore, uid } from './demo-store.service';
import { PHONE_PATTERN } from '../shared/validators';

@Injectable({ providedIn: 'root' })
export class ContactService {
  private store = inject(DemoStore);

  list() {
    return this.store.state().contactMessages;
  }

  create(data: Omit<ContactRequest, 'id' | 'status' | 'createdAt'>): ContactRequest {
    const name = data.name.trim();
    const phone = data.phone.trim();
    const email = data.email.trim();
    const message = data.message.trim();

    if (!name || !phone || !email || !message) {
      throw new Error('Vui lòng điền đầy đủ thông tin bắt buộc.');
    }

    if (!PHONE_PATTERN.test(phone)) {
      throw new Error('Số điện thoại không hợp lệ.');
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error('Địa chỉ email không hợp lệ.');
    }

    if (message.length < 10) {
      throw new Error('Lời nhắn phải có ít nhất 10 ký tự.');
    }

    const duplicate = this.store
      .state()
      .contactMessages.some(
        (item) =>
          item.name.toLowerCase() === name.toLowerCase() &&
          item.phone === phone &&
          item.email.toLowerCase() === email.toLowerCase() &&
          item.message.toLowerCase() === message.toLowerCase(),
      );

    if (duplicate) {
      throw new Error('Yêu cầu tư vấn này đã được gửi trước đó. Chúng tôi sẽ liên hệ lại sớm.');
    }

    const request: ContactRequest = {
      id: uid('contact'),
      name,
      phone,
      email,
      message,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
    };

    this.store.update((state) => state.contactMessages.push(request));
    return request;
  }
}

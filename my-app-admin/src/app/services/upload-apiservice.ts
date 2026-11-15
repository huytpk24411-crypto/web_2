import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { catchError, map, throwError } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class UploadAPIService {
  constructor(private http: HttpClient) {}

  uploadRoom(file: File) {
    return this.upload(file, 'rooms');
  }
  uploadSchool(file: File) {
    return this.upload(file, 'schools');
  }
  uploadEmployee(file: File) {
    return this.upload(file, 'employees');
  }
  private upload(file: File, category: 'rooms' | 'schools' | 'employees') {
    const data = new FormData();
    data.append('file', file);
    return this.http
      .post('/api/upload/' + category, data, {
        responseType: 'text',
        withCredentials: true,
        timeout: 5000,
      })
      .pipe(
        map((res) => {
          const result = JSON.parse(res) as { url: string };
          if (
            typeof result.url !== 'string' ||
            !result.url.startsWith('/uploads/' + category + '/')
          )
            throw new Error('Máy chủ chưa trả URL ảnh hợp lệ.');
          return result;
        }),
        catchError(this.handleError),
      );
  }
  handleError(error: unknown) {
    return throwError(() => error);
  }
}

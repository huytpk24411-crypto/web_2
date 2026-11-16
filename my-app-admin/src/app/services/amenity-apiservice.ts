import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { Amenity } from '../classes/Amenity';
@Injectable({ providedIn: 'root' })
export class AmenityAPIService {
 constructor(private readonly http: HttpClient) {}
 getAmenities(): Observable<Amenity[]> { return this.http.get<Amenity[]>('/api/amenities'); }
}

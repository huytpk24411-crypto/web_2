export interface Property {
  id: string;
  name: string;
  address: string;
  lat: number | null;
  lng: number | null;
  images: string[];
  locationSource?: string;
  locationStatus: 'sourced' | 'estimated' | 'pending';
}

export interface PropertySchool {
  propertyId: string;
  schoolId: string;
  source: string;
}

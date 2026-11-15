export type Role = 'CUSTOMER' | 'EMPLOYEE' | 'ADMIN';

export interface Account {
  id: string;
  username: string;
  name: string;
  role: Role;
  phone?: string;
}

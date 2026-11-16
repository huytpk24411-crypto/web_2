export interface PasswordResetRequest { requestId: string; expiresIn: number; resendAfter: number; message: string; }
export interface PasswordResetVerification { token: string; expiresIn: number; }
export interface PasswordResetCompletion { requestId: string; token: string; password: string; }

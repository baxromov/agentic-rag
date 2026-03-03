export type UserRole = "admin" | "user";

export interface User {
  id: string;
  username: string;
  role: UserRole;
  full_name: string;
  department: string;
  is_active: boolean;
  created_at: string;
  last_login: string | null;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface UserCreate {
  username: string;
  password: string;
  role: UserRole;
  full_name: string;
  department: string;
}

export interface UserUpdate {
  password?: string;
  role?: UserRole;
  full_name?: string;
  department?: string;
  is_active?: boolean;
}

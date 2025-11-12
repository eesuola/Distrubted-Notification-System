// API Response Format
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message: string;
  meta?: PaginationMeta;
}

// Pagination Metadata
export interface PaginationMeta {
  total: number;
  limit: number;
  page: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
}

// Notification Types
export enum NotificationType {
  EMAIL = "email",
  PUSH = "push",
}

// Notification Status
export enum NotificationStatus {
  DELIVERED = "delivered",
  PENDING = "pending",
  FAILED = "failed",
}

// User Preference
export interface UserPreference {
  email: boolean;
  push: boolean;
}

// Notification Request (API Gateway)
export interface NotificationRequest {
  notification_type: NotificationType;
  user_id: string; // UUID
  template_code: string;
  variables: {
    name: string;
    link: string; // HttpUrl
    meta?: Record<string, any>;
  };
  request_id: string;
  priority: number;
  metadata?: Record<string, any>;
}

// User Data (User Service)
export interface UserData {
  name: string;
  email: string;
  push_token?: string;
  preferences: UserPreference;
  password: string;
}

// Notification Status Update
export interface NotificationStatusUpdate {
  notification_id: string;
  status: NotificationStatus;
  timestamp?: string; // ISO datetime
  error?: string;
}

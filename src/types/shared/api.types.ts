// Common API request/response patterns and HTTP types

// HTTP Method types
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

// Request configuration interface
export interface RequestConfig {
  method: HttpMethod;
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  retries?: number;
}

// API utility options interface
export interface ApiOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: unknown;
  skipAuth?: boolean;
}

// State management types for async operations
export type LoadingStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

export interface AsyncState<T> {
  data: T | null;
  status: LoadingStatus;
  error: string | null;
}

// Generic API response patterns
// Note: ApiResponse is also defined in common.types.ts with more comprehensive structure
// This simpler version is kept for backward compatibility with basic API calls
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// API error types
export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

// Request/response metadata
export interface RequestMetadata {
  timestamp: string;
  requestId?: string;
  version?: string;
}
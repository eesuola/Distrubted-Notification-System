interface PaginationMeta {
  total: number;
  limit: number;
  page: number;
  total_pages: number;
  has_next: boolean;
  has_previous: boolean;
}

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message: string;
  meta?: PaginationMeta;
}

export const createResponse = <T>(
  success: boolean,
  message: string,
  data?: T,
  error?: string,
  meta?: PaginationMeta
): ApiResponse<T> => {
  const response: ApiResponse<T> = { success, message };
  if (data !== undefined) response.data = data;
  if (error !== undefined) response.error = error;
  if (meta !== undefined) response.meta = meta;
  return response;
};

export type { PaginationMeta, ApiResponse };
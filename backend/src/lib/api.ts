import type { Response } from 'express';

export type SortOrder = 'asc' | 'desc';

export function buildPaginationMeta(
  total: number,
  page: number,
  pageSize: number,
  sortBy: string,
  sortOrder: SortOrder,
) {
  const totalPages = total === 0 ? 0 : Math.ceil(total / pageSize);

  return {
    page,
    pageSize,
    total,
    totalPages,
    sortBy,
    sortOrder,
  };
}

export function sendApiError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details: unknown = [],
) {
  res.status(status).json({
    success: false,
    error: {
      code,
      message,
      details,
    },
  });
}

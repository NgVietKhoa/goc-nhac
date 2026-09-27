export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'WRONG_PASSWORD'
  | 'RATE_LIMITED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'TRACK_NOT_FOUND'
  | 'REGION_BLOCKED'
  | 'LOGIN_REQUIRED'
  | 'BOT_CHECK'
  | 'UNPLAYABLE'
  | 'NO_AUDIO'
  | 'UPSTREAM'
  | 'INTERNAL';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: 400 | 401 | 403 | 404 | 409 | 410 | 429 | 451 | 500 | 502 = 500,
  ) {
    super(message);
  }
}

export const badRequest = (message: string) => new AppError('BAD_REQUEST', message, 400);
export const notFound = (message = 'Không tìm thấy nội dung.') => new AppError('NOT_FOUND', message, 404);

/**
 * Chuyển trạng thái playability của YouTube thành lỗi tiếng Việt.
 * `status` là playability_status.status, `reason` là lý do YouTube trả về (có thể là tiếng Việt vì lang=vi).
 */
export function playabilityError(status: string | undefined, reason: string | undefined): AppError {
  const r = (reason ?? '').toLowerCase();
  if (r.includes('bot') || r.includes('robot')) {
    return new AppError(
      'BOT_CHECK',
      'YouTube đang chặn máy chủ vì nghi là bot. Hãy đặt YT_PO_TOKEN và YT_VISITOR_DATA (xem README).',
      403,
    );
  }
  if (r.includes('country') || r.includes('quốc gia') || r.includes('khu vực') || r.includes('region')) {
    return new AppError('REGION_BLOCKED', 'Bài này bị giới hạn ở khu vực của bạn.', 451);
  }
  if (status === 'LOGIN_REQUIRED' || status === 'AGE_CHECK_REQUIRED' || status === 'CONTENT_CHECK_REQUIRED') {
    return new AppError('LOGIN_REQUIRED', 'Bài này yêu cầu đăng nhập hoặc xác minh độ tuổi.', 403);
  }
  if (status === 'ERROR' || r.includes('unavailable') || r.includes('không có sẵn') || r.includes('removed') || r.includes('đã bị xóa')) {
    return new AppError('TRACK_NOT_FOUND', 'Bài hát không tồn tại hoặc đã bị xóa.', 410);
  }
  return new AppError('UNPLAYABLE', reason ? `Không phát được bài này: ${reason}` : 'Không phát được bài này.', 403);
}

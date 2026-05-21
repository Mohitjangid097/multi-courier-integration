export class ErrorDetail {
  field?: string;
  message: string;
}

export class ErrorResponseDto {
  success: boolean = false;
  error: {
    code: string;
    message: string;
    details?: ErrorDetail[];
  };
  request_id: string;
  timestamp: string;
}

export class SuccessResponseDto<T> {
  success: boolean = true;
  data: T;
  request_id: string;
  timestamp: string;
}

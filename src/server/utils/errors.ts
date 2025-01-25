// src/server/utils/errors.ts
export class CustomError extends Error {
    constructor(
      public message: string,
      public statusCode: number,
      public code: string
    ) {
      super(message);
      Object.setPrototypeOf(this, CustomError.prototype);
    }
  }
  
  export class ValidationError extends CustomError {
    constructor(message: string) {
      super(message, 400, 'VALIDATION_ERROR');
    }
  }
  
  export class AuthenticationError extends CustomError {
    constructor(message: string) {
      super(message, 401, 'AUTHENTICATION_ERROR');
    }
  }
  
  export class NotFoundError extends CustomError {
    constructor(message: string) {
      super(message, 404, 'NOT_FOUND_ERROR');
    }
  }
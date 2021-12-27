export enum BusinessErrorCode {
  INSUFFICIENT_BALANCE,
  NO_DECIMAL_PLACES,
}

export class BusinessError extends Error {
  readonly code: BusinessErrorCode;

  constructor(code: BusinessErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export const BusinessErrors = {
  INSUFFICIENT_BALANCE: new BusinessError(
    BusinessErrorCode.INSUFFICIENT_BALANCE,
    "Insufficient balance"
  ),
  NO_DECIMAL_PLACES: new BusinessError(
    BusinessErrorCode.NO_DECIMAL_PLACES,
    "Only whole numbers are allowed",
  )
};


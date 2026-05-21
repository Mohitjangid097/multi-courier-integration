export enum CourierPartner {
  URBANEBOLT = 'urbanebolt',
  MOCK = 'mock',
}

export enum ShipmentStatus {
  CREATED = 'CREATED',
  PICKED_UP = 'PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
  RTO = 'RTO',
}

export enum PaymentMode {
  COD = 'COD',
  PREPAID = 'PREPAID',
}

export enum ServiceType {
  SDD = 'SDD',
  NDD = 'NDD',
}

export const SUPPORTED_COURIERS = Object.values(CourierPartner);

export const RETRY_CONFIG = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
};

export const BULK_ORDER_LIMIT = 100;

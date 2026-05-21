import { ShipmentStatus } from '../libs/constants';
import { CreateOrderDto } from '../dto/create-order.dto';

export interface CourierOrderResult {
  courier_order_id: string;
  awb_number: string;
  status: ShipmentStatus;
  raw_response: object;
}

export interface TrackingEvent {
  status: string;
  timestamp: Date;
  location?: string;
  description?: string;
}

export interface CourierTrackResult {
  status: ShipmentStatus;
  awb_number?: string;
  tracking_events: TrackingEvent[];
  raw_response: object;
}

export interface CourierCancelResult {
  success: boolean;
  raw_response: object;
}

export interface ICourierAdapter {
  readonly courierPartner: string;
  createOrder(dto: CreateOrderDto): Promise<CourierOrderResult>;
  trackOrder(courierOrderId: string, awbNumber?: string): Promise<CourierTrackResult>;
  cancelOrder(courierOrderId: string): Promise<CourierCancelResult>;
}

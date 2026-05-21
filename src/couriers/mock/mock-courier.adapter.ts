import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  ICourierAdapter,
  CourierOrderResult,
  CourierTrackResult,
  CourierCancelResult,
} from '../courier.interface';
import { CreateOrderDto } from '../../dto/create-order.dto';
import { CourierPartner, ShipmentStatus } from '../../libs/constants';

/**
 * Mock courier adapter demonstrating the plug-in architecture.
 * Simulates a real courier without making HTTP calls.
 */
@Injectable()
export class MockCourierAdapter implements ICourierAdapter {
  readonly courierPartner = CourierPartner.MOCK;

  async createOrder(dto: CreateOrderDto): Promise<CourierOrderResult> {
    const mockResponse = {
      success: true,
      order_id: `MOCK-${randomUUID().substring(0, 8).toUpperCase()}`,
      awb_number: `AWB${Date.now()}`,
      message: 'Order created successfully (mock)',
    };

    return {
      courier_order_id: mockResponse.order_id,
      awb_number: mockResponse.awb_number,
      status: ShipmentStatus.CREATED,
      raw_response: mockResponse,
    };
  }

  async trackOrder(courierOrderId: string, awbNumber?: string): Promise<CourierTrackResult> {
    const mockResponse = {
      order_id: courierOrderId,
      current_status: 'IN_TRANSIT',
      tracking_events: [
        {
          status: 'IN_TRANSIT',
          timestamp: new Date().toISOString(),
          location: 'Mumbai Hub',
          description: 'Package in transit to destination',
        },
        {
          status: 'PICKED_UP',
          timestamp: new Date(Date.now() - 86400000).toISOString(),
          location: 'Delhi Pickup',
          description: 'Package picked up from sender',
        },
      ],
    };

    return {
      status: ShipmentStatus.IN_TRANSIT,
      awb_number: awbNumber,
      tracking_events: mockResponse.tracking_events.map((e) => ({
        status: e.status,
        timestamp: new Date(e.timestamp),
        location: e.location,
        description: e.description,
      })),
      raw_response: mockResponse,
    };
  }

  async cancelOrder(courierOrderId: string): Promise<CourierCancelResult> {
    const mockResponse = {
      success: true,
      order_id: courierOrderId,
      message: 'Order cancelled successfully (mock)',
    };

    return {
      success: true,
      raw_response: mockResponse,
    };
  }
}

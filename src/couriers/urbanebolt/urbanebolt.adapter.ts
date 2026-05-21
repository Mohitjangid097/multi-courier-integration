import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  ICourierAdapter,
  CourierOrderResult,
  CourierTrackResult,
  CourierCancelResult,
  TrackingEvent,
} from '../courier.interface';
import { CreateOrderDto } from '../../dto/create-order.dto';
import { CourierPartner, ShipmentStatus, PaymentMode } from '../../libs/constants';
import { withRetry } from '../../common/utils/retry.util';

@Injectable()
export class UrbaneBoltAdapter implements ICourierAdapter {
  readonly courierPartner = CourierPartner.URBANEBOLT;
  private readonly logger = new Logger(UrbaneBoltAdapter.name);

  private readonly http: AxiosInstance;
  private authToken: string | null = null;
  private tokenExpiresAt: Date | null = null;

  constructor(private readonly config: ConfigService) {
    this.http = axios.create({
      baseURL: this.config.get<string>('URBANEBOLT_BASE_URL'),
      timeout: this.config.get<number>('HTTP_TIMEOUT', 10000),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private async authenticate(): Promise<string> {
    if (this.authToken && this.tokenExpiresAt && new Date() < this.tokenExpiresAt) {
      return this.authToken;
    }

    this.logger.log('Authenticating with UrbaneBolt...');
    const response = await this.http.post('/api/authenticate', {
      username: this.config.get<string>('URBANEBOLT_USERNAME'),
      password: this.config.get<string>('URBANEBOLT_PASSWORD'),
    });

    this.authToken = response.data?.token || response.data?.data?.token;
    // Expire 5 minutes before actual expiry to avoid edge cases
    this.tokenExpiresAt = new Date(Date.now() + 55 * 60 * 1000);

    this.logger.log('UrbaneBolt authentication successful');
    return this.authToken!;
  }

  private async getAuthHeader(): Promise<Record<string, string>> {
    const token = await this.authenticate();
    return { Authorization: `Bearer ${token}` };
  }

  private async executeWithAuth<T>(
    fn: (headers: Record<string, string>) => Promise<T>,
  ): Promise<T> {
    const maxAttempts = this.config.get<number>('RETRY_MAX_ATTEMPTS', 3);
    const initialDelay = this.config.get<number>('RETRY_INITIAL_DELAY_MS', 1000);

    return withRetry(
      async () => {
        try {
          const headers = await this.getAuthHeader();
          return await fn(headers);
        } catch (error: any) {
          if (error?.response?.status === 401) {
            // Force re-authentication on token expiry
            this.authToken = null;
            this.tokenExpiresAt = null;
            const headers = await this.getAuthHeader();
            return await fn(headers);
          }
          throw error;
        }
      },
      maxAttempts,
      initialDelay,
    );
  }

  async createOrder(dto: CreateOrderDto): Promise<CourierOrderResult> {
    const payload = this.mapToUrbaneBoltPayload(dto);

    this.logger.log(`Creating UrbaneBolt order for order_id: ${dto.order_id}`);

    const response = await this.executeWithAuth(async (headers) => {
      const res = await this.http.post('/api/orders', payload, { headers });
      return res.data;
    });

    return {
      courier_order_id: String(response?.data?.order_id || response?.order_id || ''),
      awb_number: String(response?.data?.awb_number || response?.awb_number || ''),
      status: ShipmentStatus.CREATED,
      raw_response: response,
    };
  }

  async trackOrder(courierOrderId: string, awbNumber?: string): Promise<CourierTrackResult> {
    this.logger.log(`Tracking UrbaneBolt order: ${courierOrderId}`);

    const response = await this.executeWithAuth(async (headers) => {
      const identifier = awbNumber || courierOrderId;
      const res = await this.http.get(`/api/orders/${identifier}/track`, { headers });
      return res.data;
    });

    const events = this.mapTrackingEvents(response);
    const latestStatus = this.mapStatus(
      events[0]?.status || response?.data?.current_status || 'CREATED',
    );

    return {
      status: latestStatus,
      awb_number: awbNumber,
      tracking_events: events,
      raw_response: response,
    };
  }

  async cancelOrder(courierOrderId: string): Promise<CourierCancelResult> {
    this.logger.log(`Cancelling UrbaneBolt order: ${courierOrderId}`);

    const response = await this.executeWithAuth(async (headers) => {
      const res = await this.http.post(
        `/api/orders/${courierOrderId}/cancel`,
        {},
        { headers },
      );
      return res.data;
    });

    return {
      success: response?.success !== false,
      raw_response: response,
    };
  }

  private mapToUrbaneBoltPayload(dto: CreateOrderDto): object {
    return {
      order_number: dto.order_id,
      pickup: {
        name: dto.sender_name,
        contact: dto.sender_phone,
        address: dto.sender_address,
        city: dto.sender_city,
        pincode: dto.sender_pincode,
      },
      delivery: {
        name: dto.receiver_name,
        contact: dto.receiver_phone,
        address: dto.receiver_address,
        city: dto.receiver_city,
        pincode: dto.receiver_pincode,
      },
      package: {
        weight: dto.weight,
        description: dto.item_description || 'General Goods',
        value: dto.item_value || 0,
      },
      payment: {
        mode: dto.payment_mode === PaymentMode.COD ? 'cod' : 'prepaid',
        cod_amount: dto.cod_amount || 0,
      },
    };
  }

  private mapTrackingEvents(response: any): TrackingEvent[] {
    const events: any[] = response?.data?.tracking_events || response?.tracking_events || [];
    return events.map((e: any) => ({
      status: e.status || e.event_type || '',
      timestamp: new Date(e.timestamp || e.event_time || Date.now()),
      location: e.location || e.city || undefined,
      description: e.description || e.remarks || undefined,
    }));
  }

  private mapStatus(courierStatus: string): ShipmentStatus {
    const statusMap: Record<string, ShipmentStatus> = {
      created: ShipmentStatus.CREATED,
      booked: ShipmentStatus.CREATED,
      picked: ShipmentStatus.PICKED_UP,
      picked_up: ShipmentStatus.PICKED_UP,
      in_transit: ShipmentStatus.IN_TRANSIT,
      intransit: ShipmentStatus.IN_TRANSIT,
      out_for_delivery: ShipmentStatus.OUT_FOR_DELIVERY,
      delivered: ShipmentStatus.DELIVERED,
      cancelled: ShipmentStatus.CANCELLED,
      rto: ShipmentStatus.RTO,
      failed: ShipmentStatus.FAILED,
    };
    return statusMap[courierStatus?.toLowerCase()] || ShipmentStatus.IN_TRANSIT;
  }
}

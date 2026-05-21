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
import { CourierPartner, ShipmentStatus, PaymentMode, ServiceType } from '../../libs/constants';
import { withRetry } from '../../common/utils/retry.util';

/**
 * UrbaneBolt UAT adapter
 *
 * Auth:   POST /api/v1/auth/getToken/
 * Create: POST /api/v1/services/manifest/      (array payload)
 * Track:  GET  /api/v1/services/tracking-pub/?awb=<awb>
 * Cancel: POST /api/v1/services/cancel/        { awbs: "<awb>" }
 */
@Injectable()
export class UrbaneBoltAdapter implements ICourierAdapter {
  readonly courierPartner = CourierPartner.URBANEBOLT;
  private readonly logger = new Logger(UrbaneBoltAdapter.name);

  private readonly http: AxiosInstance;
  private authToken: string | null = null;
  private tokenExpiresAt: Date | null = null;

  constructor(private readonly config: ConfigService) {
    this.http = axios.create({
      baseURL: this.config.get<string>('URBANEBOLT_BASE_URL', 'https://uat.urbanebolt.in'),
      timeout: this.config.get<number>('HTTP_TIMEOUT', 10000),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── Authentication ────────────────────────────────────────────────────────

  private async authenticate(): Promise<string> {
    if (this.authToken && this.tokenExpiresAt && new Date() < this.tokenExpiresAt) {
      return this.authToken;
    }

    this.logger.log('Authenticating with UrbaneBolt...');

    const response = await this.http.post('/api/v1/auth/getToken/', {
      username: this.config.get<string>('URBANEBOLT_USERNAME'),
      password: this.config.get<string>('URBANEBOLT_PASSWORD'),
    });

    // Token is returned at response.data.token or response.data.data.token
    const token = response.data?.token ?? response.data?.data?.token;
    if (!token) {
      throw new Error('UrbaneBolt auth response did not contain a token');
    }

    this.authToken = token;
    // Cache for 55 minutes (tokens typically valid 1 hour)
    this.tokenExpiresAt = new Date(Date.now() + 55 * 60 * 1000);

    this.logger.log('UrbaneBolt authentication successful');
    return token;
  }

  private async getHeaders(): Promise<Record<string, string>> {
    const token = await this.authenticate();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }

  /**
   * Executes an API call with:
   *  1. Automatic token injection
   *  2. One re-auth retry on 401
   *  3. Exponential backoff on 5xx / network errors
   */
  private async execute<T>(fn: (headers: Record<string, string>) => Promise<T>): Promise<T> {
    const maxAttempts = this.config.get<number>('RETRY_MAX_ATTEMPTS', 3);
    const initialDelay = this.config.get<number>('RETRY_INITIAL_DELAY_MS', 1000);

    return withRetry(
      async () => {
        try {
          return await fn(await this.getHeaders());
        } catch (error: any) {
          // Force re-auth on expired token, then retry once
          if (error?.response?.status === 401) {
            this.authToken = null;
            this.tokenExpiresAt = null;
            return await fn(await this.getHeaders());
          }
          throw error;
        }
      },
      maxAttempts,
      initialDelay,
    );
  }

  // ── Create Order ──────────────────────────────────────────────────────────

  async createOrder(dto: CreateOrderDto): Promise<CourierOrderResult> {
    const payload = this.buildManifestPayload(dto);
    this.logger.log(`Creating UrbaneBolt shipment for order_id: ${dto.order_id}`);

    const response = await this.execute(async (headers) => {
      // Manifest API expects an array
      const res = await this.http.post('/api/v1/services/manifest/', [payload], { headers });
      return res.data;
    });

    /*
     * Manifest response is an array of results, one per shipment.
     * Each item typically: { awb: "200000001170", orderNumber: "...", status: "...", ... }
     */
    const result = Array.isArray(response) ? response[0] : response;
    const awb = String(result?.awb ?? result?.awbNumber ?? result?.data?.awb ?? '');

    return {
      courier_order_id: awb,   // AWB is the primary identifier for all subsequent calls
      awb_number: awb,
      status: ShipmentStatus.CREATED,
      raw_response: response,
    };
  }

  // ── Track Order ───────────────────────────────────────────────────────────

  async trackOrder(courierOrderId: string, awbNumber?: string): Promise<CourierTrackResult> {
    const awb = awbNumber || courierOrderId;
    this.logger.log(`Tracking UrbaneBolt shipment AWB: ${awb}`);

    const response = await this.execute(async (headers) => {
      const res = await this.http.get('/api/v1/services/tracking-pub/', {
        headers,
        params: { awb },
      });
      return res.data;
    });

    /*
     * Tracking response shape (approximate):
     * {
     *   awb: "200000001170",
     *   currentStatus: "IN_TRANSIT",
     *   shipmentHistory: [
     *     { status: "...", statusDateTime: "...", location: "...", remarks: "..." }
     *   ]
     * }
     */
    const history: any[] = response?.shipmentHistory ?? response?.data?.shipmentHistory ?? [];
    const currentStatus = response?.currentStatus ?? response?.data?.currentStatus ?? '';

    const events: TrackingEvent[] = history.map((e: any) => ({
      status: e.status ?? e.eventType ?? '',
      timestamp: new Date(e.statusDateTime ?? e.eventTime ?? Date.now()),
      location: e.location ?? e.city ?? undefined,
      description: e.remarks ?? e.description ?? undefined,
    }));

    return {
      status: this.mapStatus(currentStatus),
      awb_number: awb,
      tracking_events: events,
      raw_response: response,
    };
  }

  // ── Cancel Order ──────────────────────────────────────────────────────────

  async cancelOrder(courierOrderId: string): Promise<CourierCancelResult> {
    // UrbaneBolt cancel uses AWB number
    const awb = courierOrderId;
    this.logger.log(`Cancelling UrbaneBolt shipment AWB: ${awb}`);

    const response = await this.execute(async (headers) => {
      const res = await this.http.post(
        '/api/v1/services/cancel/',
        { awbs: awb },
        { headers },
      );
      return res.data;
    });

    return {
      success: response?.success !== false,
      raw_response: response,
    };
  }

  // ── Payload Mapping ───────────────────────────────────────────────────────

  private buildManifestPayload(dto: CreateOrderDto): object {
    const customerCode = this.config.get<string>('URBANEBOLT_CUSTOMER_CODE', '');
    const invoiceDate =
      dto.invoice_date ?? new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    return {
      customerCode,
      orderNumber: dto.order_id,

      // Package details
      weight: dto.weight,
      pieces: dto.pieces ?? 1,
      length: dto.length ?? 10,
      breadth: dto.breadth ?? 10,
      height: dto.height ?? 10,
      itemDescription: dto.item_description ?? 'General Goods',
      declaredValue: dto.item_value ?? 0,
      itemQuantity: dto.item_quantity ?? 1,

      // Service & payment
      serviceType: dto.service_type ?? ServiceType.NDD,
      payMode: dto.payment_mode === PaymentMode.COD ? 'COD' : 'PPD',
      collectableValue: dto.cod_amount ?? 0,

      // Invoice
      invoiceNumber: dto.invoice_number ?? dto.order_id,
      invoiceDate,
      invoiceValue: dto.invoice_value ?? dto.item_value ?? 0,

      // Shipper (sender)
      shprName: dto.sender_name,
      shprMobile: Number(dto.sender_phone),
      shprEmail: dto.sender_email ?? '',
      shprAddress: dto.sender_address,
      shprAddressType: 'Seller',
      shprCity: dto.sender_city,
      shprState: dto.sender_state,
      shprCountry: 'INDIA',
      shprPincode: Number(dto.sender_pincode),

      // Consignee (receiver)
      consName: dto.receiver_name,
      consMobile: Number(dto.receiver_phone),
      consEmail: dto.receiver_email ?? '',
      consAddress: dto.receiver_address,
      consAddressType: 'Home',
      consCity: dto.receiver_city,
      consState: dto.receiver_state,
      consCountry: 'INDIA',
      consPincode: Number(dto.receiver_pincode),

      // Return (defaults to sender)
      rtnName: dto.sender_name,
      rtnMobile: Number(dto.sender_phone),
      rtnEmail: dto.sender_email ?? '',
      rtnAddress: dto.sender_address,
      rtnAddressType: 'Seller',
      rtnCity: dto.sender_city,
      rtnState: dto.sender_state,
      rtnCountry: 'INDIA',
      rtnPincode: Number(dto.sender_pincode),
    };
  }

  // ── Status Mapping ────────────────────────────────────────────────────────

  private mapStatus(courierStatus: string): ShipmentStatus {
    const map: Record<string, ShipmentStatus> = {
      created: ShipmentStatus.CREATED,
      booked: ShipmentStatus.CREATED,
      manifested: ShipmentStatus.CREATED,
      picked: ShipmentStatus.PICKED_UP,
      picked_up: ShipmentStatus.PICKED_UP,
      in_transit: ShipmentStatus.IN_TRANSIT,
      intransit: ShipmentStatus.IN_TRANSIT,
      out_for_delivery: ShipmentStatus.OUT_FOR_DELIVERY,
      ofd: ShipmentStatus.OUT_FOR_DELIVERY,
      delivered: ShipmentStatus.DELIVERED,
      cancelled: ShipmentStatus.CANCELLED,
      rto: ShipmentStatus.RTO,
      rto_initiated: ShipmentStatus.RTO,
      failed: ShipmentStatus.FAILED,
      undelivered: ShipmentStatus.FAILED,
    };
    return map[courierStatus?.toLowerCase().replace(/\s+/g, '_')] ?? ShipmentStatus.IN_TRANSIT;
  }
}

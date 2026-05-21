import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  BadGatewayException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { Order } from '../entities/order.entity';
import { TrackingHistory } from '../entities/tracking-history.entity';
import { CourierFactoryService } from '../couriers/courier-factory.service';
import { CreateOrderDto } from '../dto/create-order.dto';
import { BulkOrderDto } from '../dto/bulk-order.dto';
import { ShipmentStatus } from '../libs/constants';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,

    @InjectRepository(TrackingHistory)
    private readonly trackingRepo: Repository<TrackingHistory>,

    private readonly courierFactory: CourierFactoryService,
  ) {}

  async createOrder(dto: CreateOrderDto, requestId: string = randomUUID()): Promise<Order> {
    // Idempotency check
    const existing = await this.orderRepo.findOne({ where: { order_id: dto.order_id } });
    if (existing) {
      throw new ConflictException({
        error: 'DUPLICATE_ORDER',
        message: `Order with order_id '${dto.order_id}' already exists`,
      });
    }

    const adapter = this.courierFactory.getAdapter(dto.courier_partner);

    // Persist request immediately
    const order = this.orderRepo.create({
      order_id: dto.order_id,
      courier_partner: dto.courier_partner,
      status: ShipmentStatus.CREATED,
      request_payload: dto as unknown as object,
    });
    await this.orderRepo.save(order);

    try {
      const result = await adapter.createOrder(dto);

      order.courier_order_id = result.courier_order_id;
      order.awb_number = result.awb_number;
      order.status = result.status;
      order.response_payload = result.raw_response;
      await this.orderRepo.save(order);

      await this.appendTrackingHistory(order.order_id, dto.courier_partner, result.status, {
        event: 'ORDER_CREATED',
        courier_order_id: result.courier_order_id,
        awb_number: result.awb_number,
      });

      this.logger.log(
        `[${requestId}] Order created: order_id=${dto.order_id} awb=${result.awb_number} courier=${dto.courier_partner}`,
      );

      return order;
    } catch (error: any) {
      order.status = ShipmentStatus.FAILED;
      order.response_payload = { error: error.message, response: error?.response?.data };
      await this.orderRepo.save(order);

      this.logger.error(
        `[${requestId}] Failed to create order: order_id=${dto.order_id} courier=${dto.courier_partner}`,
        error.stack,
      );

      throw new BadGatewayException({
        error: 'COURIER_API_ERROR',
        message: 'Courier service returned an error while creating the order',
        details: [{ message: error.message }],
      });
    }
  }

  async trackOrder(orderId: string, requestId: string = randomUUID()) {
    const order = await this.findOrderOrFail(orderId);
    const adapter = this.courierFactory.getAdapter(order.courier_partner);

    try {
      const result = await adapter.trackOrder(order.courier_order_id, order.awb_number);

      if (result.status !== order.status) {
        order.status = result.status;
        await this.orderRepo.save(order);

        await this.appendTrackingHistory(
          order.order_id,
          order.courier_partner,
          result.status,
          result.raw_response,
        );
      }

      this.logger.log(
        `[${requestId}] Tracked order: order_id=${orderId} status=${result.status}`,
      );

      return {
        order_id: order.order_id,
        courier_partner: order.courier_partner,
        awb_number: order.awb_number,
        status: result.status,
        tracking_events: result.tracking_events,
      };
    } catch (error: any) {
      this.logger.error(
        `[${requestId}] Failed to track order: order_id=${orderId}`,
        error.stack,
      );
      throw new BadGatewayException({
        error: 'COURIER_API_ERROR',
        message: 'Courier service returned an error while tracking the order',
      });
    }
  }

  async cancelOrder(orderId: string, requestId: string = randomUUID()): Promise<Order> {
    const order = await this.findOrderOrFail(orderId);

    if (order.status === ShipmentStatus.DELIVERED) {
      throw new BadGatewayException({
        error: 'CANNOT_CANCEL',
        message: 'A delivered order cannot be cancelled',
      });
    }

    if (order.status === ShipmentStatus.CANCELLED) {
      return order;
    }

    const adapter = this.courierFactory.getAdapter(order.courier_partner);

    try {
      const result = await adapter.cancelOrder(order.courier_order_id);

      if (result.success) {
        order.status = ShipmentStatus.CANCELLED;
        await this.orderRepo.save(order);

        await this.appendTrackingHistory(
          order.order_id,
          order.courier_partner,
          ShipmentStatus.CANCELLED,
          result.raw_response,
        );
      }

      this.logger.log(`[${requestId}] Order cancelled: order_id=${orderId}`);
      return order;
    } catch (error: any) {
      this.logger.error(
        `[${requestId}] Failed to cancel order: order_id=${orderId}`,
        error.stack,
      );
      throw new BadGatewayException({
        error: 'COURIER_API_ERROR',
        message: 'Courier service returned an error while cancelling the order',
      });
    }
  }

  async bulkCreateOrders(dto: BulkOrderDto, requestId: string = randomUUID()) {
    this.logger.log(`[${requestId}] Bulk create: ${dto.orders.length} orders`);

    const results = await Promise.allSettled(
      dto.orders.map((orderDto) => this.createOrder(orderDto, requestId)),
    );

    const response = dto.orders.map((orderDto, index) => {
      const result = results[index];
      if (result.status === 'fulfilled') {
        return {
          order_id: orderDto.order_id,
          success: true,
          data: {
            internal_id: result.value.id,
            courier_order_id: result.value.courier_order_id,
            awb_number: result.value.awb_number,
            status: result.value.status,
          },
        };
      } else {
        const err = result.reason as any;
        const errBody = err?.response ?? err;
        return {
          order_id: orderDto.order_id,
          success: false,
          error: {
            code: errBody?.error || 'ORDER_FAILED',
            message: errBody?.message || err?.message || 'Order processing failed',
          },
        };
      }
    });

    const succeeded = response.filter((r) => r.success).length;
    const failed = response.filter((r) => !r.success).length;

    return { total: dto.orders.length, succeeded, failed, results: response };
  }

  async getTrackingHistory(orderId: string) {
    await this.findOrderOrFail(orderId);
    return this.trackingRepo.find({
      where: { order_id: orderId },
      order: { created_at: 'DESC' },
    });
  }

  private async findOrderOrFail(orderId: string): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { order_id: orderId } });
    if (!order) {
      throw new NotFoundException({
        error: 'ORDER_NOT_FOUND',
        message: `Order with order_id '${orderId}' not found`,
      });
    }
    return order;
  }

  private async appendTrackingHistory(
    orderId: string,
    courierPartner: string,
    status: string,
    rawPayload: object,
  ) {
    const history = this.trackingRepo.create({
      order_id: orderId,
      courier_partner: courierPartner,
      status,
      raw_payload: rawPayload,
    });
    await this.trackingRepo.save(history);
  }
}

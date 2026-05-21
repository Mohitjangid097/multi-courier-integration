import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from '../dto/create-order.dto';
import { BulkOrderDto } from '../dto/bulk-order.dto';

@Controller('api/v1/orders')
@UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true }))
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createOrder(@Body() dto: CreateOrderDto) {
    const order = await this.ordersService.createOrder(dto);
    return {
      success: true,
      data: {
        internal_id: order.id,
        order_id: order.order_id,
        courier_partner: order.courier_partner,
        courier_order_id: order.courier_order_id,
        awb_number: order.awb_number,
        status: order.status,
        created_at: order.created_at,
      },
    };
  }

  @Post('bulk')
  @HttpCode(HttpStatus.OK)
  async bulkCreateOrders(@Body() dto: BulkOrderDto) {
    const result = await this.ordersService.bulkCreateOrders(dto);
    return { success: true, data: result };
  }

  @Get(':order_id/track')
  async trackOrder(@Param('order_id') orderId: string) {
    const tracking = await this.ordersService.trackOrder(orderId);
    return { success: true, data: tracking };
  }

  @Post(':order_id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelOrder(@Param('order_id') orderId: string) {
    const order = await this.ordersService.cancelOrder(orderId);
    return {
      success: true,
      data: {
        order_id: order.order_id,
        status: order.status,
        updated_at: order.updated_at,
      },
    };
  }

  @Get(':order_id/history')
  async getTrackingHistory(@Param('order_id') orderId: string) {
    const history = await this.ordersService.getTrackingHistory(orderId);
    return { success: true, data: history };
  }
}

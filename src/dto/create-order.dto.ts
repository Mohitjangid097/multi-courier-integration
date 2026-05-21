import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsIn,
  Min,
} from 'class-validator';
import { CourierPartner, PaymentMode, ServiceType, SUPPORTED_COURIERS } from '../libs/constants';

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  order_id: string;

  @IsString()
  @IsIn(SUPPORTED_COURIERS, {
    message: `courier_partner must be one of: ${SUPPORTED_COURIERS.join(', ')}`,
  })
  courier_partner: CourierPartner;

  // ── Sender (Shipper) ──────────────────────────────────────────────────────

  @IsString()
  @IsNotEmpty()
  sender_name: string;

  @IsString()
  @IsNotEmpty()
  sender_phone: string;

  @IsString()
  @IsNotEmpty()
  sender_address: string;

  @IsString()
  @IsNotEmpty()
  sender_city: string;

  @IsString()
  @IsNotEmpty()
  sender_state: string;

  @IsString()
  @IsNotEmpty()
  sender_pincode: string;

  @IsOptional()
  @IsString()
  sender_email?: string;

  // ── Receiver (Consignee) ──────────────────────────────────────────────────

  @IsString()
  @IsNotEmpty()
  receiver_name: string;

  @IsString()
  @IsNotEmpty()
  receiver_phone: string;

  @IsString()
  @IsNotEmpty()
  receiver_address: string;

  @IsString()
  @IsNotEmpty()
  receiver_city: string;

  @IsString()
  @IsNotEmpty()
  receiver_state: string;

  @IsString()
  @IsNotEmpty()
  receiver_pincode: string;

  @IsOptional()
  @IsString()
  receiver_email?: string;

  // ── Package ───────────────────────────────────────────────────────────────

  @IsNumber()
  @Min(0.01)
  weight: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  length?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  breadth?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  height?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  pieces?: number;

  @IsOptional()
  @IsString()
  item_description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  item_value?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  item_quantity?: number;

  // ── Payment ───────────────────────────────────────────────────────────────

  @IsString()
  @IsIn(Object.values(PaymentMode))
  payment_mode: PaymentMode;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cod_amount?: number;

  // ── Shipment Options ──────────────────────────────────────────────────────

  @IsOptional()
  @IsString()
  @IsIn(Object.values(ServiceType))
  service_type?: ServiceType;

  @IsOptional()
  @IsString()
  invoice_number?: string;

  @IsOptional()
  @IsString()
  invoice_date?: string;

  @IsOptional()
  @IsNumber()
  invoice_value?: number;
}

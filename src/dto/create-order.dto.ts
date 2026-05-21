import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsIn,
  Min,
} from 'class-validator';
import { CourierPartner, PaymentMode, SUPPORTED_COURIERS } from '../libs/constants';

export class CreateOrderDto {
  @IsString()
  @IsNotEmpty()
  order_id: string;

  @IsString()
  @IsIn(SUPPORTED_COURIERS, {
    message: `courier_partner must be one of: ${SUPPORTED_COURIERS.join(', ')}`,
  })
  courier_partner: CourierPartner;

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
  sender_pincode: string;

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
  receiver_pincode: string;

  @IsNumber()
  @Min(0.01)
  weight: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  cod_amount?: number;

  @IsString()
  @IsIn(Object.values(PaymentMode))
  payment_mode: PaymentMode;

  @IsOptional()
  @IsString()
  item_description?: string;

  @IsOptional()
  @IsNumber()
  item_value?: number;
}

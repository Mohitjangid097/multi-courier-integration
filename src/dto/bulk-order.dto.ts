import { IsArray, ValidateNested, ArrayMaxSize, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOrderDto } from './create-order.dto';
import { BULK_ORDER_LIMIT } from '../libs/constants';

export class BulkOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(BULK_ORDER_LIMIT, {
    message: `Bulk orders cannot exceed ${BULK_ORDER_LIMIT} per request`,
  })
  @ValidateNested({ each: true })
  @Type(() => CreateOrderDto)
  orders: CreateOrderDto[];
}

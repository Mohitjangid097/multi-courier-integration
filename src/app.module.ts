import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './entities/order.entity';
import { TrackingHistory } from './entities/tracking-history.entity';
import { OrdersModule } from './orders/orders.module';
import { CouriersModule } from './couriers/couriers.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'better-sqlite3',
        database: config.get<string>('DB_PATH', 'courier_integration.db'),
        entities: [Order, TrackingHistory],
        synchronize: config.get<string>('NODE_ENV') !== 'production',
        logging: config.get<string>('DB_LOGGING', 'false') === 'true',
      }),
    }),

    OrdersModule,
    CouriersModule,
  ],
})
export class AppModule {}

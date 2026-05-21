import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CourierFactoryService } from './courier-factory.service';
import { UrbaneBoltAdapter } from './urbanebolt/urbanebolt.adapter';
import { MockCourierAdapter } from './mock/mock-courier.adapter';

@Module({
  imports: [ConfigModule],
  providers: [CourierFactoryService, UrbaneBoltAdapter, MockCourierAdapter],
  exports: [CourierFactoryService],
})
export class CouriersModule {}

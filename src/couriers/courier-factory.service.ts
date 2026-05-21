import { BadRequestException, Injectable } from '@nestjs/common';
import { ICourierAdapter } from './courier.interface';
import { UrbaneBoltAdapter } from './urbanebolt/urbanebolt.adapter';
import { MockCourierAdapter } from './mock/mock-courier.adapter';
import { SUPPORTED_COURIERS } from '../libs/constants';

@Injectable()
export class CourierFactoryService {
  private readonly adapters: Map<string, ICourierAdapter>;

  constructor(
    private readonly urbaneBoltAdapter: UrbaneBoltAdapter,
    private readonly mockCourierAdapter: MockCourierAdapter,
  ) {
    this.adapters = new Map<string, ICourierAdapter>([
      [urbaneBoltAdapter.courierPartner, urbaneBoltAdapter],
      [mockCourierAdapter.courierPartner, mockCourierAdapter],
    ]);
  }

  getAdapter(courierPartner: string): ICourierAdapter {
    const adapter = this.adapters.get(courierPartner);
    if (!adapter) {
      throw new BadRequestException({
        error: 'UNKNOWN_COURIER_PARTNER',
        message: `Courier partner '${courierPartner}' is not supported`,
        details: [{ message: `Supported couriers: ${SUPPORTED_COURIERS.join(', ')}` }],
      });
    }
    return adapter;
  }

  getSupportedCouriers(): string[] {
    return [...this.adapters.keys()];
  }
}

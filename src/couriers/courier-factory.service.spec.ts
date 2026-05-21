import { BadRequestException } from '@nestjs/common';
import { CourierFactoryService } from './courier-factory.service';
import { CourierPartner } from '../libs/constants';

const makeAdapter = (partner: string) => ({ courierPartner: partner });

describe('CourierFactoryService', () => {
  let factory: CourierFactoryService;

  beforeEach(() => {
    factory = new CourierFactoryService(
      makeAdapter(CourierPartner.URBANEBOLT) as any,
      makeAdapter(CourierPartner.MOCK) as any,
    );
  });

  it('returns the urbanebolt adapter', () => {
    const adapter = factory.getAdapter(CourierPartner.URBANEBOLT);
    expect(adapter.courierPartner).toBe(CourierPartner.URBANEBOLT);
  });

  it('returns the mock adapter', () => {
    const adapter = factory.getAdapter(CourierPartner.MOCK);
    expect(adapter.courierPartner).toBe(CourierPartner.MOCK);
  });

  it('throws BadRequestException for unknown courier partner', () => {
    expect(() => factory.getAdapter('delhivery')).toThrow(BadRequestException);
  });

  it('lists all supported couriers', () => {
    const supported = factory.getSupportedCouriers();
    expect(supported).toContain(CourierPartner.URBANEBOLT);
    expect(supported).toContain(CourierPartner.MOCK);
  });
});

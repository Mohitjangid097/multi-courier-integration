import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, NotFoundException, BadGatewayException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { Order } from '../entities/order.entity';
import { TrackingHistory } from '../entities/tracking-history.entity';
import { CourierFactoryService } from '../couriers/courier-factory.service';
import { ShipmentStatus } from '../libs/constants';
import { CreateOrderDto } from '../dto/create-order.dto';

const mockOrder = (): Order => ({
  id: 'uuid-123',
  order_id: 'ORD-001',
  courier_partner: 'mock',
  courier_order_id: 'MOCK-ABC',
  awb_number: 'AWB999',
  status: ShipmentStatus.CREATED,
  request_payload: {},
  response_payload: {},
  created_at: new Date(),
  updated_at: new Date(),
});

const mockDto = (): CreateOrderDto => ({
  order_id: 'ORD-001',
  courier_partner: 'mock' as any,
  sender_name: 'Amit',
  sender_phone: '9876543210',
  sender_address: '123 MG Road',
  sender_city: 'Delhi',
  sender_pincode: '110001',
  receiver_name: 'Priya',
  receiver_phone: '9123456780',
  receiver_address: '456 Park St',
  receiver_city: 'Mumbai',
  receiver_pincode: '400001',
  weight: 1.5,
  payment_mode: 'PREPAID' as any,
});

describe('OrdersService', () => {
  let service: OrdersService;

  const orderRepo = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const trackingRepo = {
    create: jest.fn(),
    save: jest.fn(),
    find: jest.fn(),
  };

  const mockAdapter = {
    courierPartner: 'mock',
    createOrder: jest.fn(),
    trackOrder: jest.fn(),
    cancelOrder: jest.fn(),
  };

  const courierFactory = {
    getAdapter: jest.fn().mockReturnValue(mockAdapter),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
        { provide: getRepositoryToken(Order), useValue: orderRepo },
        { provide: getRepositoryToken(TrackingHistory), useValue: trackingRepo },
        { provide: CourierFactoryService, useValue: courierFactory },
      ],
    }).compile();

    service = module.get<OrdersService>(OrdersService);
    jest.clearAllMocks();
  });

  describe('createOrder', () => {
    it('creates an order and returns it', async () => {
      const order = mockOrder();
      orderRepo.findOne.mockResolvedValue(null);
      orderRepo.create.mockReturnValue(order);
      orderRepo.save.mockResolvedValue(order);
      trackingRepo.create.mockReturnValue({});
      trackingRepo.save.mockResolvedValue({});
      mockAdapter.createOrder.mockResolvedValue({
        courier_order_id: 'MOCK-ABC',
        awb_number: 'AWB999',
        status: ShipmentStatus.CREATED,
        raw_response: {},
      });

      const result = await service.createOrder(mockDto());

      expect(orderRepo.findOne).toHaveBeenCalledWith({ where: { order_id: 'ORD-001' } });
      expect(mockAdapter.createOrder).toHaveBeenCalledTimes(1);
      expect(result.order_id).toBe('ORD-001');
    });

    it('throws ConflictException if order_id already exists', async () => {
      orderRepo.findOne.mockResolvedValue(mockOrder());

      await expect(service.createOrder(mockDto())).rejects.toThrow(ConflictException);
    });

    it('persists FAILED status and throws BadGatewayException when courier fails', async () => {
      const order = mockOrder();
      orderRepo.findOne.mockResolvedValue(null);
      orderRepo.create.mockReturnValue(order);
      orderRepo.save.mockResolvedValue(order);
      mockAdapter.createOrder.mockRejectedValue(new Error('Courier timeout'));

      await expect(service.createOrder(mockDto())).rejects.toThrow(BadGatewayException);
      expect(orderRepo.save).toHaveBeenCalledTimes(2); // once before, once after failure
    });
  });

  describe('trackOrder', () => {
    it('returns tracking info for a known order', async () => {
      orderRepo.findOne.mockResolvedValue(mockOrder());
      trackingRepo.create.mockReturnValue({});
      trackingRepo.save.mockResolvedValue({});
      mockAdapter.trackOrder.mockResolvedValue({
        status: ShipmentStatus.IN_TRANSIT,
        tracking_events: [{ status: 'IN_TRANSIT', timestamp: new Date() }],
        raw_response: {},
      });

      const result = await service.trackOrder('ORD-001');

      expect(result.order_id).toBe('ORD-001');
      expect(result.status).toBe(ShipmentStatus.IN_TRANSIT);
    });

    it('throws NotFoundException for unknown order_id', async () => {
      orderRepo.findOne.mockResolvedValue(null);

      await expect(service.trackOrder('NONEXISTENT')).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancelOrder', () => {
    it('cancels an order and updates status', async () => {
      const order = { ...mockOrder(), status: ShipmentStatus.CREATED };
      orderRepo.findOne.mockResolvedValue(order);
      orderRepo.save.mockResolvedValue({ ...order, status: ShipmentStatus.CANCELLED });
      trackingRepo.create.mockReturnValue({});
      trackingRepo.save.mockResolvedValue({});
      mockAdapter.cancelOrder.mockResolvedValue({ success: true, raw_response: {} });

      const result = await service.cancelOrder('ORD-001');

      expect(result.status).toBe(ShipmentStatus.CANCELLED);
    });

    it('returns order as-is if already CANCELLED (idempotent)', async () => {
      const order = { ...mockOrder(), status: ShipmentStatus.CANCELLED };
      orderRepo.findOne.mockResolvedValue(order);

      const result = await service.cancelOrder('ORD-001');

      expect(mockAdapter.cancelOrder).not.toHaveBeenCalled();
      expect(result.status).toBe(ShipmentStatus.CANCELLED);
    });

    it('throws BadGatewayException if trying to cancel a DELIVERED order', async () => {
      const order = { ...mockOrder(), status: ShipmentStatus.DELIVERED };
      orderRepo.findOne.mockResolvedValue(order);

      await expect(service.cancelOrder('ORD-001')).rejects.toThrow(BadGatewayException);
    });
  });

  describe('bulkCreateOrders', () => {
    it('returns per-order success/failure results', async () => {
      // First order succeeds
      const order = mockOrder();
      orderRepo.findOne
        .mockResolvedValueOnce(null)     // ORD-001 not a duplicate
        .mockResolvedValueOnce(order);   // ORD-002 IS a duplicate

      orderRepo.create.mockReturnValue(order);
      orderRepo.save.mockResolvedValue(order);
      trackingRepo.create.mockReturnValue({});
      trackingRepo.save.mockResolvedValue({});
      mockAdapter.createOrder.mockResolvedValue({
        courier_order_id: 'MOCK-ABC',
        awb_number: 'AWB999',
        status: ShipmentStatus.CREATED,
        raw_response: {},
      });

      const result = await service.bulkCreateOrders({
        orders: [
          { ...mockDto(), order_id: 'ORD-001' },
          { ...mockDto(), order_id: 'ORD-002' },
        ],
      });

      expect(result.total).toBe(2);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
    });
  });
});

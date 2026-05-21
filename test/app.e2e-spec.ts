import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { GlobalExceptionFilter } from './../src/common/filters/http-exception.filter';

describe('Orders API (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    process.env.DB_PATH = ':memory:';
    process.env.URBANEBOLT_BASE_URL = 'http://localhost:9999';
    process.env.URBANEBOLT_USERNAME = 'test';
    process.env.URBANEBOLT_PASSWORD = 'test';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true, stopAtFirstError: false }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const validOrder = (orderId = 'E2E-001') => ({
    order_id: orderId,
    courier_partner: 'mock',
    sender_name: 'Amit Sharma',
    sender_phone: '9876543210',
    sender_address: '123 MG Road',
    sender_city: 'Delhi',
    sender_pincode: '110001',
    receiver_name: 'Priya Singh',
    receiver_phone: '9123456780',
    receiver_address: '456 Park Street',
    receiver_city: 'Mumbai',
    receiver_pincode: '400001',
    weight: 1.5,
    payment_mode: 'PREPAID',
  });

  // ── Create Order ────────────────────────────────────────────────────────────

  describe('POST /api/orders', () => {
    it('201 — creates a mock order successfully', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .send(validOrder('E2E-001'))
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.data.order_id).toBe('E2E-001');
      expect(res.body.data.awb_number).toBeDefined();
      expect(res.body.data.status).toBe('CREATED');
    });

    it('409 — duplicate order_id is rejected', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .send(validOrder('E2E-001'))
        .expect(409);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('DUPLICATE_ORDER');
    });

    it('400 — missing required fields returns field-level errors', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .send({ courier_partner: 'mock' })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.details.length).toBeGreaterThan(0);
    });

    it('400 — unknown courier_partner is rejected', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/orders')
        .send({ ...validOrder('E2E-UNK'), courier_partner: 'delhivery' })
        .expect(400);

      expect(res.body.success).toBe(false);
      expect(res.body.error.details[0].message).toMatch(/urbanebolt, mock/);
    });
  });

  // ── Track Order ─────────────────────────────────────────────────────────────

  describe('GET /api/orders/:id/track', () => {
    beforeAll(async () => {
      await request(app.getHttpServer())
        .post('/api/orders')
        .send(validOrder('E2E-TRACK'));
    });

    it('200 — returns tracking events for existing order', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/orders/E2E-TRACK/track')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.order_id).toBe('E2E-TRACK');
      expect(Array.isArray(res.body.data.tracking_events)).toBe(true);
    });

    it('404 — non-existent order returns ORDER_NOT_FOUND', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/orders/NONEXISTENT/track')
        .expect(404);

      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe('ORDER_NOT_FOUND');
      expect(res.body.request_id).toBeDefined();
      expect(res.body.timestamp).toBeDefined();
    });
  });

  // ── Cancel Order ─────────────────────────────────────────────────────────────

  describe('POST /api/orders/:id/cancel', () => {
    beforeAll(async () => {
      await request(app.getHttpServer())
        .post('/api/orders')
        .send(validOrder('E2E-CANCEL'));
    });

    it('200 — cancels an existing order', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/orders/E2E-CANCEL/cancel')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('CANCELLED');
    });

    it('200 — cancelling already-cancelled order is idempotent', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/orders/E2E-CANCEL/cancel')
        .expect(200);

      expect(res.body.data.status).toBe('CANCELLED');
    });

    it('404 — cancelling non-existent order returns 404', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/orders/GHOST/cancel')
        .expect(404);

      expect(res.body.error.code).toBe('ORDER_NOT_FOUND');
    });
  });

  // ── Tracking History ─────────────────────────────────────────────────────────

  describe('GET /api/orders/:id/history', () => {
    it('200 — returns append-only tracking history', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/orders/E2E-001/history')
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].status).toBeDefined();
    });
  });

  // ── Bulk Orders ──────────────────────────────────────────────────────────────

  describe('POST /api/orders/bulk', () => {
    it('200 — processes multiple orders concurrently', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/orders/bulk')
        .send({
          orders: [
            validOrder('BULK-001'),
            validOrder('BULK-002'),
            validOrder('BULK-003'),
          ],
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data.total).toBe(3);
      expect(res.body.data.succeeded).toBe(3);
      expect(res.body.data.failed).toBe(0);
    });

    it('200 — partial success: duplicate order_id shows per-order failure', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/orders/bulk')
        .send({
          orders: [
            validOrder('BULK-NEW-001'),
            validOrder('BULK-001'), // already exists → DUPLICATE
          ],
        })
        .expect(200);

      expect(res.body.data.total).toBe(2);
      expect(res.body.data.succeeded).toBe(1);
      expect(res.body.data.failed).toBe(1);
      expect(res.body.data.results[1].error.code).toBe('DUPLICATE_ORDER');
    });

    it('400 — exceeding 100 orders is rejected', async () => {
      const orders = Array.from({ length: 101 }, (_, i) => validOrder(`OVER-${i}`));
      const res = await request(app.getHttpServer())
        .post('/api/orders/bulk')
        .send({ orders })
        .expect(400);

      expect(res.body.success).toBe(false);
    });

    it('400 — empty orders array is rejected', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/orders/bulk')
        .send({ orders: [] })
        .expect(400);

      expect(res.body.success).toBe(false);
    });
  });
});

# Multi-Courier Integration Platform

A production-quality NestJS backend that provides a unified API for multiple courier partners. UrbaneBolt is the first integration; adding a new courier requires only a new adapter class — no controller, service, or DTO changes.

---

## Setup

### Prerequisites
- Node.js >= 18
- npm

### Install & Run

```bash
# 1. Install dependencies
npm install

# 2. Copy env file and fill in credentials
cp .env.example .env

# 3. Start in development mode (auto-creates SQLite DB)
npm run start:dev

# 4. Production
npm run build && npm run start:prod
```

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `NODE_ENV` | `development` | Set to `production` to disable DB auto-sync |
| `DB_PATH` | `courier_integration.db` | SQLite file path |
| `DB_LOGGING` | `false` | Set `true` to log SQL queries |
| `URBANEBOLT_BASE_URL` | — | UrbaneBolt UAT/prod base URL |
| `URBANEBOLT_USERNAME` | — | UrbaneBolt API username |
| `URBANEBOLT_PASSWORD` | — | UrbaneBolt API password |
| `HTTP_TIMEOUT` | `10000` | Courier HTTP timeout (ms) |
| `RETRY_MAX_ATTEMPTS` | `3` | Max retry attempts on courier failure |
| `RETRY_INITIAL_DELAY_MS` | `1000` | Initial backoff delay (ms), doubles each retry |

---

## API Endpoints

All responses follow a normalized shape:

```json
{ "success": true, "data": { ... } }
{ "success": false, "error": { "code": "...", "message": "...", "details": [...] }, "request_id": "...", "timestamp": "..." }
```

### Create Order
```
POST /api/v1/orders
```
```json
{
  "order_id": "ORD-001",
  "courier_partner": "urbanebolt",
  "sender_name": "Amit Sharma",
  "sender_phone": "9876543210",
  "sender_address": "123 MG Road",
  "sender_city": "Delhi",
  "sender_pincode": "110001",
  "receiver_name": "Priya Singh",
  "receiver_phone": "9123456780",
  "receiver_address": "456 Park Street",
  "receiver_city": "Mumbai",
  "receiver_pincode": "400001",
  "weight": 1.5,
  "payment_mode": "PREPAID",
  "item_description": "Electronics",
  "item_value": 2500
}
```

### Track Order
```
GET /api/v1/orders/{order_id}/track
```

### Cancel Order
```
POST /api/v1/orders/{order_id}/cancel
```

### Bulk Create (up to 100 orders)
```
POST /api/v1/orders/bulk
```
```json
{
  "orders": [
    { "order_id": "ORD-001", "courier_partner": "urbanebolt", ... },
    { "order_id": "ORD-002", "courier_partner": "mock", ... }
  ]
}
```
Processes all orders concurrently. Returns per-order success/failure. Idempotent on `order_id`.

### Tracking History
```
GET /api/v1/orders/{order_id}/history
```

---

## Supported Courier Partners

| Value | Description |
|---|---|
| `urbanebolt` | UrbaneBolt UAT/Production |
| `mock` | Mock courier (for testing) |

---

## How to Add a New Courier

1. **Create the adapter** in `src/couriers/<name>/<name>.adapter.ts`:
```typescript
@Injectable()
export class DelhiveryAdapter implements ICourierAdapter {
  readonly courierPartner = 'delhivery';

  async createOrder(dto: CreateOrderDto): Promise<CourierOrderResult> { ... }
  async trackOrder(courierOrderId: string): Promise<CourierTrackResult> { ... }
  async cancelOrder(courierOrderId: string): Promise<CourierCancelResult> { ... }
}
```

2. **Register in `CouriersModule`** (`src/couriers/couriers.module.ts`):
```typescript
providers: [CourierFactoryService, UrbaneBoltAdapter, MockCourierAdapter, DelhiveryAdapter],
```

3. **Register in `CourierFactoryService`** (`src/couriers/courier-factory.service.ts`):
```typescript
constructor(
  private readonly urbaneBoltAdapter: UrbaneBoltAdapter,
  private readonly mockCourierAdapter: MockCourierAdapter,
  private readonly delhiveryAdapter: DelhiveryAdapter,
) {
  this.adapters = new Map([
    [urbaneBoltAdapter.courierPartner, urbaneBoltAdapter],
    [mockCourierAdapter.courierPartner, mockCourierAdapter],
    [delhiveryAdapter.courierPartner, delhiveryAdapter],
  ]);
}
```

4. **Add the constant** in `src/libs/constants.ts`:
```typescript
export enum CourierPartner {
  URBANEBOLT = 'urbanebolt',
  MOCK = 'mock',
  DELHIVERY = 'delhivery',
}
```

**No changes needed** to controllers, services, DTOs, or business logic.

---

## Running Tests

```bash
npm run test       # unit tests
npm run test:e2e   # e2e tests
npm run test:cov   # coverage
```

---

## Assumptions

- SQLite is used for zero-config local development. Switch to PostgreSQL by changing `type: 'better-sqlite3'` to `type: 'postgres'` in `app.module.ts` and adding the `pg` package.
- Bulk orders are processed concurrently via `Promise.allSettled` and results are returned synchronously. For very high volumes, a job-queue approach (BullMQ + Redis) would be preferred.
- UrbaneBolt token is cached in-memory and automatically refreshed on 401 responses.
- The `order_id` field is the caller-provided idempotency key — submitting the same `order_id` twice returns `409 CONFLICT`.

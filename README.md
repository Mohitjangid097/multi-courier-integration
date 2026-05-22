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

Server starts at `http://localhost:8080` by default.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `8080` | HTTP port |
| `NODE_ENV` | `development` | Set to `production` to disable DB auto-sync |
| `DB_PATH` | `courier_integration.db` | SQLite file path |
| `DB_LOGGING` | `false` | Set `true` to log SQL queries |
| `URBANEBOLT_BASE_URL` | `URBANEBOLT_UAT_URL` | UrbaneBolt base URL |
| `URBANEBOLT_USERNAME` | — | UrbaneBolt API username |
| `URBANEBOLT_PASSWORD` | — | UrbaneBolt API password |
| `URBANEBOLT_CUSTOMER_CODE` | — | UrbaneBolt customer code (e.g. `UEBCUS0008`) |
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

---

### Create Order

```
POST /api/v1/orders
```

#### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `order_id` | string | Yes | Your unique order ID — used as idempotency key |
| `courier_partner` | string | Yes | `urbanebolt` or `mock` |
| `sender_name` | string | Yes | Sender / shipper name |
| `sender_phone` | string | Yes | Sender phone number |
| `sender_address` | string | Yes | Sender full address |
| `sender_city` | string | Yes | Sender city |
| `sender_state` | string | Yes | Sender state |
| `sender_pincode` | string | Yes | Sender pincode |
| `sender_email` | string | No | Sender email |
| `receiver_name` | string | Yes | Receiver / consignee name |
| `receiver_phone` | string | Yes | Receiver phone number |
| `receiver_address` | string | Yes | Receiver full address |
| `receiver_city` | string | Yes | Receiver city |
| `receiver_state` | string | Yes | Receiver state |
| `receiver_pincode` | string | Yes | Receiver pincode |
| `receiver_email` | string | No | Receiver email |
| `weight` | number | Yes | Package weight in kg (min 0.01) |
| `length` | number | No | Package length in cm |
| `breadth` | number | No | Package breadth in cm |
| `height` | number | No | Package height in cm |
| `pieces` | number | No | Number of pieces (default: 1) |
| `payment_mode` | string | Yes | `COD` or `PREPAID` |
| `cod_amount` | number | No | Amount to collect — required if `payment_mode` is `COD` |
| `service_type` | string | No | `SDD` (Same Day) or `NDD` (Next Day). Default: `NDD` |
| `item_description` | string | No | Description of goods |
| `item_value` | number | No | Declared value of goods |
| `item_quantity` | number | No | Number of items (default: 1) |
| `invoice_number` | string | No | Invoice number |
| `invoice_date` | string | No | Invoice date `YYYY-MM-DD`. Defaults to today |
| `invoice_value` | number | No | Invoice value |

#### Example — UrbaneBolt (real API)

```bash
curl -X POST http://localhost:8080/api/v1/orders \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "ORD-001",
    "courier_partner": "urbanebolt",
    "sender_name": "Amit Sharma",
    "sender_phone": "9876543210",
    "sender_address": "123 MG Road, Govindpura Industrial Area",
    "sender_city": "Bhopal",
    "sender_state": "MADHYA PRADESH",
    "sender_pincode": "462023",
    "sender_email": "amit@example.com",
    "receiver_name": "Priya Singh",
    "receiver_phone": "9123456780",
    "receiver_address": "456 Park Street, Om Nagar Society",
    "receiver_city": "Surat",
    "receiver_state": "GUJARAT",
    "receiver_pincode": "395007",
    "receiver_email": "priya@example.com",
    "weight": 1.1,
    "length": 12,
    "breadth": 10,
    "height": 10,
    "pieces": 1,
    "payment_mode": "PREPAID",
    "service_type": "NDD",
    "item_description": "Electronics",
    "item_value": 2500,
    "item_quantity": 1,
    "invoice_number": "INV-001",
    "invoice_date": "2026-05-22",
    "invoice_value": 2500
  }'
```

#### Example — Mock courier (no credentials needed)

```bash
curl -X POST http://localhost:8080/api/v1/orders \
  -H "Content-Type: application/json" \
  -d '{
    "order_id": "ORD-002",
    "courier_partner": "mock",
    "sender_name": "Amit Sharma",
    "sender_phone": "9876543210",
    "sender_address": "123 MG Road",
    "sender_city": "Delhi",
    "sender_state": "DELHI",
    "sender_pincode": "110001",
    "receiver_name": "Priya Singh",
    "receiver_phone": "9123456780",
    "receiver_address": "456 Park Street",
    "receiver_city": "Mumbai",
    "receiver_state": "MAHARASHTRA",
    "receiver_pincode": "400001",
    "weight": 1.5,
    "payment_mode": "PREPAID"
  }'
```

#### Success Response `201`

```json
{
  "success": true,
  "data": {
    "internal_id": "uuid...",
    "order_id": "ORD-001",
    "courier_partner": "urbanebolt",
    "courier_order_id": "200000001170",
    "awb_number": "200000001170",
    "status": "CREATED",
    "created_at": "2026-05-22T10:00:00.000Z"
  }
}
```

---

### Track Order

```
GET /api/v1/orders/{order_id}/track
```

```bash
curl http://localhost:8080/api/v1/orders/ORD-001/track
```

#### Success Response `200`

```json
{
  "success": true,
  "data": {
    "order_id": "ORD-001",
    "courier_partner": "urbanebolt",
    "awb_number": "200000001170",
    "status": "IN_TRANSIT",
    "tracking_events": [
      {
        "status": "IN_TRANSIT",
        "timestamp": "2026-05-22T10:00:00.000Z",
        "location": "Mumbai Hub",
        "description": "Package in transit to destination"
      }
    ]
  }
}
```

---

### Cancel Order

```
POST /api/v1/orders/{order_id}/cancel
```

```bash
curl -X POST http://localhost:8080/api/v1/orders/ORD-001/cancel
```

#### Success Response `200`

```json
{
  "success": true,
  "data": {
    "order_id": "ORD-001",
    "status": "CANCELLED",
    "updated_at": "2026-05-22T10:05:00.000Z"
  }
}
```

---

### Bulk Create (up to 100 orders)

```
POST /api/v1/orders/bulk
```

Each order in the array is the same shape as the single create body. Each may use a different `courier_partner`. Processed concurrently — partial success is supported.

```bash
curl -X POST http://localhost:8080/api/v1/orders/bulk \
  -H "Content-Type: application/json" \
  -d '{
    "orders": [
      {
        "order_id": "BULK-001",
        "courier_partner": "mock",
        "sender_name": "Amit Sharma",
        "sender_phone": "9876543210",
        "sender_address": "123 MG Road",
        "sender_city": "Delhi",
        "sender_state": "DELHI",
        "sender_pincode": "110001",
        "receiver_name": "Priya Singh",
        "receiver_phone": "9123456780",
        "receiver_address": "456 Park Street",
        "receiver_city": "Mumbai",
        "receiver_state": "MAHARASHTRA",
        "receiver_pincode": "400001",
        "weight": 1.5,
        "payment_mode": "PREPAID"
      },
      {
        "order_id": "BULK-002",
        "courier_partner": "mock",
        "sender_name": "Ravi Kumar",
        "sender_phone": "9001122334",
        "sender_address": "789 Lake View",
        "sender_city": "Bangalore",
        "sender_state": "KARNATAKA",
        "sender_pincode": "560001",
        "receiver_name": "Sunita Rao",
        "receiver_phone": "9112233445",
        "receiver_address": "321 Hill Road",
        "receiver_city": "Chennai",
        "receiver_state": "TAMIL NADU",
        "receiver_pincode": "600001",
        "weight": 0.5,
        "payment_mode": "COD",
        "cod_amount": 750
      }
    ]
  }'
```

#### Success Response `200`

```json
{
  "success": true,
  "data": {
    "total": 2,
    "succeeded": 2,
    "failed": 0,
    "results": [
      {
        "order_id": "BULK-001",
        "success": true,
        "data": { "internal_id": "...", "courier_order_id": "...", "awb_number": "...", "status": "CREATED" }
      },
      {
        "order_id": "BULK-002",
        "success": true,
        "data": { "internal_id": "...", "courier_order_id": "...", "awb_number": "...", "status": "CREATED" }
      }
    ]
  }
}
```

---

### Tracking History

```
GET /api/v1/orders/{order_id}/history
```

Returns every status event ever recorded — append-only audit log.

```bash
curl http://localhost:8080/api/v1/orders/ORD-001/history
```

---

## Shipment Statuses

| Status | Meaning |
|---|---|
| `CREATED` | Order placed with courier |
| `PICKED_UP` | Package collected from sender |
| `IN_TRANSIT` | Package moving between hubs |
| `OUT_FOR_DELIVERY` | With delivery agent |
| `DELIVERED` | Delivered to receiver |
| `CANCELLED` | Order cancelled |
| `RTO` | Return to origin initiated |
| `FAILED` | Courier API failed |

---

## Error Responses

All errors use the same shape:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": [{ "message": "field-level detail" }]
  },
  "request_id": "uuid",
  "timestamp": "2026-05-22T10:00:00.000Z"
}
```

| Scenario | HTTP | Code |
|---|---|---|
| Missing / invalid fields | 400 | `BAD_REQUEST` |
| Unknown `courier_partner` | 400 | `BAD_REQUEST` |
| Duplicate `order_id` | 409 | `DUPLICATE_ORDER` |
| Order not found | 404 | `ORDER_NOT_FOUND` |
| Courier API error | 502 | `COURIER_API_ERROR` |
| Cannot cancel delivered order | 502 | `CANNOT_CANCEL` |

---

## Supported Courier Partners

| Value | Description |
|---|---|
| `urbanebolt` | UrbaneBolt UAT/Production |
| `mock` | Mock courier (no credentials needed, for testing) |

---

## How to Add a New Courier

Only 4 changes needed — no controller, service, or DTO modifications required.

**1.** Add constant in [src/libs/constants.ts](src/libs/constants.ts):
```typescript
export enum CourierPartner {
  URBANEBOLT = 'urbanebolt',
  MOCK = 'mock',
  DTDC = 'dtdc',   // ← add
}
```

**2.** Create adapter `src/couriers/dtdc/dtdc.adapter.ts`:
```typescript
@Injectable()
export class DtdcAdapter implements ICourierAdapter {
  readonly courierPartner = CourierPartner.DTDC;

  async createOrder(dto: CreateOrderDto): Promise<CourierOrderResult> { ... }
  async trackOrder(courierOrderId: string): Promise<CourierTrackResult> { ... }
  async cancelOrder(courierOrderId: string): Promise<CourierCancelResult> { ... }
}
```

**3.** Register provider in [src/couriers/couriers.module.ts](src/couriers/couriers.module.ts):
```typescript
providers: [CourierFactoryService, UrbaneBoltAdapter, MockCourierAdapter, DtdcAdapter],
```

**4.** Add to Map in [src/couriers/courier-factory.service.ts](src/couriers/courier-factory.service.ts):
```typescript
constructor(
  private readonly urbaneBoltAdapter: UrbaneBoltAdapter,
  private readonly mockCourierAdapter: MockCourierAdapter,
  private readonly dtdcAdapter: DtdcAdapter,
) {
  this.adapters = new Map([
    [urbaneBoltAdapter.courierPartner, urbaneBoltAdapter],
    [mockCourierAdapter.courierPartner, mockCourierAdapter],
    [dtdcAdapter.courierPartner, dtdcAdapter],
  ]);
}
```

---

## Running Tests

```bash
npm run test        # unit tests
npm run test:e2e    # e2e tests (uses in-memory SQLite)
npm run test:cov    # coverage report
```

---

## Assumptions

- SQLite is used for zero-config local development. Switch to PostgreSQL by changing `type: 'better-sqlite3'` to `type: 'postgres'` in `src/app.module.ts` and installing the `pg` package.
- Bulk orders are processed concurrently via `Promise.allSettled` and results returned synchronously. For very high volumes, a job-queue (BullMQ + Redis) would be preferred.
- UrbaneBolt token is cached in-memory for 55 minutes and automatically refreshed on 401 responses.
- The `order_id` field is the caller-provided idempotency key — submitting the same `order_id` twice returns `409 CONFLICT`.
- Return address for UrbaneBolt defaults to the sender address if not explicitly provided.

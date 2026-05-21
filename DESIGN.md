# Design Document — Multi-Courier Integration Platform

## Architecture Overview

```
HTTP Client
    │
    ▼
OrdersController  (src/orders/orders.controller.ts)
    │   Validates input, maps to normalized DTOs
    ▼
OrdersService     (src/orders/orders.service.ts)
    │   Persists order, delegates to courier adapter
    ▼
CourierFactoryService  (src/couriers/courier-factory.service.ts)
    │   Resolves the right adapter by courier_partner key
    ▼
ICourierAdapter   (src/couriers/courier.interface.ts)
    ├── UrbaneBoltAdapter  → UrbaneBolt UAT API
    └── MockCourierAdapter → In-memory stub
```

---

## Design Pattern: Adapter + Factory

**Why Adapter?**  
Each courier has a different API contract (auth flow, payload shape, status codes). The Adapter pattern wraps each courier behind a single `ICourierAdapter` interface, so the rest of the system never sees courier-specific details.

**Why Factory?**  
The caller sends a `courier_partner` string. The `CourierFactoryService` maps that string to the correct adapter using a `Map<string, ICourierAdapter>`. Adding a new courier = new adapter class + one line in the Map. Zero other changes.

---

## Folder Structure

```
src/
├── libs/             constants, enums (CourierPartner, ShipmentStatus, PaymentMode)
├── entities/         TypeORM DB entities (Order, TrackingHistory)
├── dto/              Normalized request/response DTOs (CreateOrderDto, BulkOrderDto, ...)
├── couriers/
│   ├── courier.interface.ts        ICourierAdapter contract
│   ├── courier-factory.service.ts  Resolves adapter from courier_partner
│   ├── urbanebolt/                 UrbaneBolt implementation
│   └── mock/                       Mock courier (plugin demo)
├── orders/           OrdersController + OrdersService
└── common/
    ├── filters/      GlobalExceptionFilter (normalized error shape)
    └── utils/        withRetry (exponential backoff)
```

---

## Database Schema

### `orders` table

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | Internal ID |
| `order_id` | VARCHAR UNIQUE | Caller-provided, idempotency key |
| `courier_partner` | VARCHAR | e.g. `urbanebolt` |
| `courier_order_id` | VARCHAR | ID returned by courier |
| `awb_number` | VARCHAR | Tracking/waybill number |
| `status` | VARCHAR | CREATED / IN_TRANSIT / DELIVERED / ... |
| `request_payload` | JSON | Full request sent to courier |
| `response_payload` | JSON | Full response from courier |
| `created_at` | DATETIME | Auto-set |
| `updated_at` | DATETIME | Auto-updated |

### `tracking_history` table (append-only)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `order_id` | VARCHAR | FK reference (soft) |
| `courier_partner` | VARCHAR | |
| `status` | VARCHAR | Status at this event |
| `location` | VARCHAR | nullable |
| `description` | VARCHAR | nullable |
| `raw_payload` | JSON | Raw courier response |
| `created_at` | DATETIME | Auto-set, never updated |

---

## Bulk Order Processing

**Approach:** `Promise.allSettled` — all orders are fired concurrently in a single HTTP request, and results (success + failure) are returned synchronously.

**Trade-offs:**

| Approach | Pros | Cons |
|---|---|---|
| Promise.allSettled (chosen) | Simple, immediate response, no infrastructure | Ties up the HTTP connection; if courier is slow, request is slow |
| Background job queue (BullMQ) | Non-blocking, retryable, scalable | Needs Redis, polling/webhook for status |

For ≤100 orders with reasonable courier latency, `Promise.allSettled` is acceptable. The endpoint is idempotent (duplicate `order_id` returns `CONFLICT` per order, not a crash).

---

## Error Handling

All errors return a single normalized shape:
```json
{
  "success": false,
  "error": {
    "code": "COURIER_API_ERROR",
    "message": "Human-readable message",
    "details": [{ "message": "..." }]
  },
  "request_id": "uuid-v4",
  "timestamp": "ISO8601"
}
```

| Scenario | HTTP | Code |
|---|---|---|
| Validation failure | 400 | `BAD_REQUEST` |
| Unknown courier_partner | 400 | `UNKNOWN_COURIER_PARTNER` |
| Duplicate order_id | 409 | `DUPLICATE_ORDER` |
| Order not found | 404 | `ORDER_NOT_FOUND` |
| Courier API error (4xx/5xx) | 502 | `COURIER_API_ERROR` |
| Cannot cancel delivered order | 502 | `CANNOT_CANCEL` |

Courier 401 → automatic re-auth + one retry. Courier 5xx / timeout → exponential backoff (configurable via `RETRY_MAX_ATTEMPTS` and `RETRY_INITIAL_DELAY_MS`). Raw courier errors are **never** leaked to the client.

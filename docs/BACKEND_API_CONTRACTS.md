# Backend API contracts

These contracts describe the backend inventory endpoints owned by the API and
inventory operations workstream. All protected endpoints require a bearer JWT.

| Endpoint | Allowed roles | Success | Common errors | Write boundary/audit |
| --- | --- | --- | --- | --- |
| `GET /api/v1/suppliers` | Any authenticated role | `200`, paginated `data` | `400 VALIDATION_ERROR`, `500 FETCH_SUPPLIERS_FAILED` | Read-only |
| `POST /api/v1/suppliers` | Admin, Inventory Manager | `201` | `400 VALIDATION_ERROR`, `401 AUTHENTICATION_REQUIRED` | Supplier and audit event in one transaction |
| `POST /api/v1/purchases` | Admin, Pharmacist, Inventory Manager | `201` | `400 VALIDATION_ERROR` | Purchase, items, and creation audit in one transaction |
| `POST /api/v1/purchases/:id/receive` | Admin, Pharmacist, Inventory Manager | `200` | `404 PURCHASE_NOT_FOUND`, `409 PURCHASE_ALREADY_RECEIVED`, `409 DUPLICATE_BATCH` | Batch, stock-IN ledger, purchase status, and audit are atomic |
| `POST /api/v1/batches` | Admin, Pharmacist, Inventory Manager | `201` | `400 VALIDATION_ERROR`, `409 DUPLICATE_BATCH` | Batch, stock-IN ledger, and audit are atomic |
| `POST /api/v1/inventory/transactions` | Admin, Pharmacist, Inventory Manager, Staff | `201` | `400 VALIDATION_ERROR`, `404 BATCH_NOT_FOUND`, `409 INSUFFICIENT_STOCK`, `409 EXPIRED_BATCH` | Quantity update, ledger row, and audit are atomic |
| `PATCH /api/v1/alerts/:id/acknowledge` | Any authenticated role | `200` | `400 INVALID_ALERT_ID`, `404 ALERT_NOT_FOUND` | Alert acknowledgement and audit are atomic |

Errors use the following shape:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": []
  }
}
```

Unauthenticated requests return `401`; authenticated users without the
endpoint role return `403`. Invalid request data is rejected before a
transaction starts.

## Session invalidation

Logout persists a SHA-256 fingerprint of the access token in
`RevokedAccessToken`, so revocation survives API restarts and replicas.
Password resets and account deactivation increment `User.sessionVersion`, and
new login tokens carry that version. Requests using a token with an obsolete
version are rejected with `401`. Existing tokens issued before the session
version claim was introduced remain governed by the database-backed revocation
list until their normal two-hour expiry; users should sign in again after a
deployment that introduces this behavior.

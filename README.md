# Omnixys Gateway Service

The Gateway is the Omnixys edge service. It composes the Apollo Federation graph, forwards verified transport credentials and canonical request metadata to subgraphs, bridges Kafka events to GraphQL subscriptions, and retains compatibility cookie behavior for existing clients.

## Edge responsibilities

- Compose authentication, user, event, invitation, ticket, seat, and notification subgraphs.
- Forward `authorization`, cookies, `x-request-id`, `x-correlation-id`, `traceparent`, and trusted client metadata.
- Preserve structured subgraph GraphQL error extensions.
- Set and clear legacy authentication cookies from compatible GraphQL payloads while token issuance and cookie policy migrate fully to `authentication-service` and `@omnixys/security`.
- Publish guarded signup and WhatsApp subscriptions without logging credentials or message bodies.

`@omnixys/context` is the canonical source for request/correlation IDs and trace metadata. Logger and observability use the same scope. The gateway does not issue tokens or make business authorization decisions for subgraphs.

## Configuration

Copy `.env.example` to `.env` and configure every enabled subgraph URI. Production requires Keycloak, Valkey, Kafka, tracing, and a strong cookie secret.

## Health and lifecycle

- `GET /health/liveness` reports process liveness.
- `GET /health/readiness` checks Valkey, Kafka lifecycle state, and configured external endpoints.
- Nest shutdown hooks drain federation, Kafka, Valkey, logger batches, and observability exporters.

## Development

```bash
pnpm install
pnpm run build
pnpm run lint
pnpm run test:unit
pnpm run test:integration
pnpm run test:e2e
```

Tests verify metadata isolation and propagation, bearer/cookie compatibility, introspection handling, and login/logout cookie behavior at the federation edge.

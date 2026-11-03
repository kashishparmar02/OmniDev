# Microservice review checklist

Use when reviewing Clean Architecture microservices (Node/Express, Python/FastAPI, Rust/Axum, etc.).

## Domain

- Entities immutable (`readonly` / frozen); no infra/app/presentation imports
- No DB/HTTP/logging libs in domain
- Branded IDs where the codebase uses them
- Repository **interfaces** live in domain; return domain types

## Application

- Services depend on repository interfaces, not concrete infra
- One use case per method; multi-write → transaction
- Return response DTOs (not raw entities); no sensitive fields on DTOs
- Request validation schemas (Zod/Pydantic) with strict/unknown rejection at boundary

## Infrastructure

- Parameterized SQL only (never string-concat queries)
- `mapToEntity` (or equivalent) before leaving repo
- Wrap DB errors; accept transaction context on writes
- External adapters: timeouts/retries; no raw HTTP leakage

## Presentation

- Thin controllers: extract → delegate → respond
- Versioned routes; auth + validation middleware on protected/mutating routes
- CORS not `*` in prod configs; rate limits on public endpoints

## Stack nits (raise only when high-signal)

**TS:** no `any`, no `var`, async/await, `??`, explicit public returns, void fire-and-forget  
**Python:** typed signatures, no mutable defaults, async I/O, frozen models where expected  
**Rust:** no production `.unwrap()`, `thiserror`, minimal unjustified `clone()`

## Architecture blockers (usually critical/high)

- Domain importing infrastructure
- Controller business logic / service talking to DB driver directly
- SQL injection / hardcoded secrets / stack traces in responses

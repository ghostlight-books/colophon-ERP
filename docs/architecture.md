# Colophon Architecture

## Overview

Colophon follows a modular monorepo architecture with clear boundaries between:

- Domain contracts (`packages/shared`)
- Data layer (`packages/database`)
- API layer (`server`)
- UI layer (`client`)

## Module Boundaries

Backend modules are organized by bookstore domain concerns:

- Inventory
- POS
- Network
- Purchasing
- Consignors
- Finance
- Events
- Tasks

Each module is expected to evolve toward a vertical slice containing route handlers, services, and data access logic.

## Data Flow

1. Client uses API services to request data.
2. Server controllers validate input with shared Zod schemas.
3. Server uses Prisma client from `packages/database`.
4. Shared types define DTO contracts across server/client.

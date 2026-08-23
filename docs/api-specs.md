# API Specs (Draft)

## Base URL

- Development: `http://localhost:4000/api`

## Initial Endpoints

- `GET /health` - Service health check
- `GET /books` - List books
- `POST /books` - Create a book
- `GET /inventory` - List inventory items
- `POST /pos/transactions` - Create POS transaction
- `GET /network/peers` - List network peers

## Notes

- Request/response schemas should be sourced from `packages/shared/src/validation`.
- DTOs should be sourced from `packages/shared/src/types`.

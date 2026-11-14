# ---------- Conecta API (NestJS + TypeORM) ----------
FROM node:22-alpine AS build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci
COPY backend/ ./
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/backend
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/backend/package.json ./
COPY frontend/ /app/frontend/
ENV FRONTEND_PATH=/app/frontend
USER node
EXPOSE 3000
# Aplica as migrations, executa o seed idempotente (papéis, permissões, administrador inicial) e inicia a API.
CMD ["sh", "-c", "npm run migration:run:prod && npm run seed:prod && node dist/main.js"]

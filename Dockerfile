# Image de production de l'API Objectiva (utilisée par Render, voir render.yaml et docs/deploiement.md).
# Le contexte de construction est la racine du dépôt : l'API compile aussi `shared/`.
FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

COPY shared/package.json shared/package-lock.json ./shared/
RUN npm ci --prefix shared
COPY backend/package.json backend/package-lock.json ./backend/
# Le client Prisma est généré ici (postinstall) puis compilé avec le reste.
COPY backend/prisma ./backend/prisma
COPY backend/prisma.config.ts ./backend/
RUN npm ci --prefix backend

COPY shared ./shared
COPY backend/tsconfig.json ./backend/
COPY backend/src ./backend/src
RUN npm run build --prefix backend

# ---- Image finale : dépendances complètes conservées (la CLI Prisma applique les migrations au démarrage).
FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app/backend
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/backend/node_modules ./node_modules
COPY --from=build /app/backend/package.json ./
COPY --from=build /app/backend/prisma ./prisma
COPY --from=build /app/backend/prisma.config.ts ./
COPY --from=build /app/backend/dist ./dist
USER node
EXPOSE 3100
# Les migrations sont idempotentes : on les applique avant chaque démarrage (réveil compris).
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/backend/src/server.js"]

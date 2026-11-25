FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund
COPY src ./src
COPY public ./public
COPY tsconfig.json next.config.ts ./
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000 DATABASE_SSL_CA=/app/certs/rds-global-bundle.pem
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
COPY --chown=node:node deploy/start.mjs deploy/migrate-lib.mjs ./
COPY --chown=node:node deploy/migrations ./migrations
COPY --chown=node:node deploy/certs/rds-global-bundle.pem ./certs/rds-global-bundle.pem
USER node
EXPOSE 3000
CMD ["node", "start.mjs"]

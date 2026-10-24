# Preview image (Render, Docker runtime). Includes Chromium so the server can render PDFs.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The build only imports the DB module (no queries), so a placeholder URL is enough; the real one is set at run time.
RUN DATABASE_URL=postgres://build:build@127.0.0.1:1/build npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=/ms-playwright NEXT_TELEMETRY_DISABLED=1
# Dev dependencies stay: migrations and the fictional seed run with tsx on start.
COPY --from=build /app ./
RUN npx playwright install --with-deps chromium && rm -rf /var/lib/apt/lists/* \
  && node -e "require('playwright').chromium.launch().then((b) => b.close()).then(() => console.log('Chromium launches'))"
EXPOSE 3000
CMD ["sh", "-c", "npm run db:migrate && npm run db:seed && npx next start -p ${PORT:-3000}"]

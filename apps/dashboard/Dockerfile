FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY apps/dashboard/package.json ./
RUN npm install --no-audit --no-fund
COPY apps/dashboard/ ./
RUN mkdir -p public && npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
RUN addgroup -S -g 1001 nodejs \
    && adduser -S -u 1001 -G nodejs nextjs \
    && mkdir -p /app/.next/cache \
    && chown -R nextjs:nodejs /app
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]

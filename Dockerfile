# ---- build stage: compile the Vite client ----
FROM node:26-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---- runtime stage: Express API + static client ----
FROM node:26-alpine AS runtime
RUN apk upgrade --no-cache \
  && apk add --no-cache tini
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund \
  && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY server ./server
RUN mkdir -p /app/data \
  && chown -R node:node /app
USER node
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/index.js"]

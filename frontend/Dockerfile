# ---- Build stage ----
FROM node:20-alpine AS builder
WORKDIR /app

RUN npm install -g pnpm

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Build with empty backend URLs so the frontend uses relative paths,
# which Nginx then proxies to the backend container.
ARG VITE_HTTP_BACKEND_URL=""
ARG VITE_WS_BACKEND_URL=""
ENV VITE_HTTP_BACKEND_URL=${VITE_HTTP_BACKEND_URL}
ENV VITE_WS_BACKEND_URL=${VITE_WS_BACKEND_URL}
RUN pnpm build

# ---- Serve stage ----
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]

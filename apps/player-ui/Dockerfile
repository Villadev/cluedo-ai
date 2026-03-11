# ---------- BUILD STAGE ----------
FROM node:20-alpine AS builder

WORKDIR /app

COPY . .

RUN corepack enable && corepack prepare pnpm@9.15.2 --activate

RUN pnpm install --no-frozen-lockfile
RUN pnpm --dir apps/player-ui run build --configuration production

# ---------- NGINX STAGE ----------
FROM nginx:alpine

COPY apps/player-ui/nginx.conf /etc/nginx/conf.d/default.conf

RUN rm -rf /usr/share/nginx/html/*

COPY --from=builder /app/apps/player-ui/dist/player-ui /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

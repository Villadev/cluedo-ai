# ---------- BUILD STAGE ----------
FROM node:20-alpine AS builder

WORKDIR /app

COPY . .
RUN npm install -g pnpm
RUN pnpm install
RUN pnpm --dir apps/player-ui exec ng build player-ui --configuration production

# ---------- NGINX STAGE ----------
FROM nginx:alpine

COPY apps/player-ui/nginx.conf /etc/nginx/conf.d/default.conf

RUN rm -rf /usr/share/nginx/html/*

# IMPORTANT: comprovar que el build genera apps/player-ui/dist/player-ui
COPY --from=builder /app/apps/player-ui/dist/player-ui /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

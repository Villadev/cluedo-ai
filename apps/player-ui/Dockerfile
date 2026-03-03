# ---------- BUILD STAGE ----------
FROM node:20-alpine AS builder

WORKDIR /app

COPY . .
RUN npm install -g pnpm
RUN pnpm install
RUN pnpm exec ng build --configuration production

# ---------- NGINX STAGE ----------
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf

RUN rm -rf /usr/share/nginx/html/*

# IMPORTANT: comprovar que el build genera dist/player-ui/browser
COPY --from=builder /app/dist/player-ui/browser /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

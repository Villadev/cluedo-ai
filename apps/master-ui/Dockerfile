# ---------- BUILD STAGE ----------
FROM node:20-alpine AS builder

WORKDIR /app

COPY . .
RUN npm install -g pnpm
RUN pnpm install
RUN pnpm --dir apps/master-ui exec ng build master-ui --configuration production

# ---------- NGINX STAGE ----------
FROM nginx:alpine

COPY apps/master-ui/nginx.conf /etc/nginx/conf.d/default.conf

RUN rm -rf /usr/share/nginx/html/*

# IMPORTANT: comprovar que el build genera apps/master-ui/dist/master-ui
COPY --from=builder /app/apps/master-ui/dist/master-ui /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

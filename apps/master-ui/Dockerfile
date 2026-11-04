# ---------- BUILD STAGE ----------
FROM node:24.22.1-alpine AS builder

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY . .

# Habilitar corepack per utilitzar pnpm sense necessitat d'instal·lació global externa
RUN corepack enable && corepack prepare pnpm@9.15.2 --activate

RUN pnpm install --no-frozen-lockfile
RUN pnpm --dir apps/master-ui run build --configuration production

# ---------- NGINX STAGE ----------
FROM nginx:alpine

COPY apps/master-ui/nginx.conf /etc/nginx/conf.d/default.conf

RUN rm -rf /usr/share/nginx/html/*

# En Angular 17+ el path sol ser dist/project-name/browser
# pero per la configuracio d'aquest projecte es dist/master-ui
COPY --from=builder /app/apps/master-ui/dist/master-ui /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

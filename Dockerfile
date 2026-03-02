FROM node:20-alpine AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.2 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY tsconfig.base.json ./
COPY apps ./apps
COPY libs ./libs

RUN pnpm install --no-frozen-lockfile
RUN pnpm exec ng build master-ui --configuration production
RUN pnpm exec ng build player-ui --configuration production

FROM nginx:alpine AS production

COPY --from=build /app/apps/master-ui/dist/master-ui/browser /usr/share/nginx/html/master-ui
COPY --from=build /app/apps/player-ui/dist/player-ui/browser /usr/share/nginx/html/player-ui

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

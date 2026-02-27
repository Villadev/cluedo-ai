FROM node:20-alpine AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY . .

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @cluedo/player-ui build

FROM nginx:alpine

COPY --from=build /app/apps/player-ui/dist/player-ui/browser /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

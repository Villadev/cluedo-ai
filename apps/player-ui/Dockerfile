FROM node:20-alpine AS build

WORKDIR /app

RUN apk add --no-cache python3 make g++

RUN corepack enable
RUN corepack prepare pnpm@latest --activate

COPY . .

RUN pnpm install --no-frozen-lockfile
RUN pnpm exec ng build player-ui --configuration production

FROM nginx:alpine

COPY --from=build /app/apps/player-ui/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

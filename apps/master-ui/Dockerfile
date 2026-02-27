FROM node:20-alpine AS build

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY . .

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @cluedo/master-ui build

FROM nginx:alpine

COPY --from=build /app/apps/master-ui/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

FROM node:20-alpine AS build

WORKDIR /app

RUN apk add --no-cache python3 make g++

RUN corepack enable
RUN corepack prepare pnpm@latest --activate

COPY . .

RUN pnpm install --no-frozen-lockfile
WORKDIR /app/apps/master-ui
RUN pnpm exec ng build --configuration production

FROM nginx:alpine

COPY --from=build /app/apps/master-ui/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

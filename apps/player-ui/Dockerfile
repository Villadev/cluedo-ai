FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/player-ui/package.json ./apps/player-ui/package.json
COPY libs/types/package.json ./libs/types/package.json
RUN pnpm install --frozen-lockfile=false
COPY . .
RUN pnpm --filter @cluedo/player-ui build

FROM nginx:1.27-alpine
COPY --from=build /app/apps/player-ui/dist/player-ui/browser /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

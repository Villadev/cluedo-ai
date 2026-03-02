FROM node:20-alpine AS build

WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@9.15.2 --activate

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY tsconfig.base.json ./
COPY apps ./apps
COPY libs ./libs

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @cluedo/master-ui build
RUN pnpm --filter @cluedo/player-ui build

FROM nginx:alpine AS production

COPY --from=build /workspace/apps/master-ui/dist/master-ui/browser /usr/share/nginx/html/master-ui
COPY --from=build /workspace/apps/player-ui/dist/player-ui/browser /usr/share/nginx/html/player-ui

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

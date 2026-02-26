FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/master-ui/package.json ./apps/master-ui/package.json
COPY libs/types/package.json ./libs/types/package.json
RUN pnpm install --frozen-lockfile=false
COPY . .
RUN pnpm --filter @cluedo/master-ui build

FROM nginx:1.27-alpine
COPY --from=build /app/apps/master-ui/dist/master-ui/browser /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

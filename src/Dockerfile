# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base

WORKDIR /app

ENV EXPO_DEVTOOLS_LISTEN_ADDRESS=0.0.0.0

COPY package.json package-lock.json ./
RUN npm ci


FROM base AS dev

ENV CI=0

COPY . .

EXPOSE 8081 19000 19001 19002 19006

CMD ["npm", "run", "start:lan"]


FROM base AS web-build

COPY . .

RUN npm run export:web


FROM nginx:1.27-alpine AS web

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
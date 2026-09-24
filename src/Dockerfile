FROM node:22-bookworm-slim AS base

WORKDIR /app

ENV EXPO_DEVTOOLS_LISTEN_ADDRESS=0.0.0.0

COPY package.json package-lock.json ./
COPY scripts ./scripts
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


FROM node:22-bookworm-slim AS build-notify

# git is required by eas build for versioning/fingerprinting
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Built with context set to the repo root (mobile/), not mobile/src,
# so eas build can see the real .git directory for fingerprinting.
COPY src/package.json src/package-lock.json ./
COPY src/scripts ./scripts
RUN npm ci
RUN npm install -g eas-cli
RUN npm install nodemailer

COPY src ./
COPY .git ./.git

CMD ["node", "scripts/build-and-notify.mjs"]
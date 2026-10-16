# syntax=docker/dockerfile:1
# Nebula web (Vite build served by nginx). Build context: ./frontend

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# The API is reached through the same origin; nginx proxies /api to the api container.
ENV VITE_API_URL=/api \
    VITE_USE_MOCK=false
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

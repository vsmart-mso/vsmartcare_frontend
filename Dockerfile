# Build stage
FROM node:20-alpine AS build
WORKDIR /app

ARG VITE_API_URL
ARG VITE_BFF_API_KEY
ARG VITE_OCR_API_URL
ARG VITE_LOGIN_BETA_NOTICE
ARG VITE_ENABLE_THAID_DEV_MOCK

ENV VITE_API_URL=$VITE_API_URL \
    VITE_BFF_API_KEY=$VITE_BFF_API_KEY \
    VITE_OCR_API_URL=$VITE_OCR_API_URL \
    VITE_LOGIN_BETA_NOTICE=$VITE_LOGIN_BETA_NOTICE \
    VITE_ENABLE_THAID_DEV_MOCK=$VITE_ENABLE_THAID_DEV_MOCK

COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Serve stage
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

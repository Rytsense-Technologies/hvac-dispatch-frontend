# Build Stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production Stage
FROM nginx:1.27-alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Adjust internal API proxy target to match Docker Compose service name and port
RUN sed -i 's/api:8010/api:8000/g' /etc/nginx/conf.d/default.conf

EXPOSE 5500

CMD ["nginx", "-g", "daemon off;"]

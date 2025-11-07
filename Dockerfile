# Stage 1: Build dependencies và build production
FROM node:20-alpine AS builder

WORKDIR /app

# Copy toàn bộ source code (cần thiết vì đây là monorepo)
COPY . .

# Install dependencies
RUN npm ci

# Build toàn bộ monorepo trước (cần thiết cho lexical-playground)
RUN npm run build

# Build lexical-playground với mode production
WORKDIR /app/packages/lexical-playground
RUN npm run build-prod

# Stage 2: Serve static files với nginx
FROM nginx:alpine

# Copy nginx config
COPY <<EOF /etc/nginx/conf.d/default.conf
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA fallback
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Health check endpoint
    location /health {
        access_log off;
        return 200 "healthy\n";
        add_header Content-Type text/plain;
    }
}
EOF

# Copy built files từ builder stage
COPY --from=builder /app/packages/lexical-playground/build /usr/share/nginx/html

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]


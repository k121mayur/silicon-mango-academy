# Stage 1: Build React/Vite application
FROM node:20-alpine AS build

WORKDIR /app

# Copy package management files
COPY package*.json ./

# Clean installation of dependencies
RUN npm ci

# Copy the frontend application files
COPY . .

# Declare environment variables as build arguments so Vite can bake them into compile output
ARG VITE_API_BASE_URL=/
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

# Compile production bundle
RUN npm run build

# Stage 2: Lightweight production Nginx image
FROM nginx:alpine

# Copy compiled static assets from build step
COPY --from=build /app/dist /usr/share/nginx/html

# Explicitly ensure Nginx worker processes have read access to the compiled files.
# This prevents cross-platform file permission errors (e.g. building from Windows hosts).
RUN chmod -R 755 /usr/share/nginx/html

# Replace standard Nginx configurations with custom routes
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose Nginx internal port
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]

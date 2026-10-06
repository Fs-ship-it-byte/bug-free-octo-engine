# syntax=docker/dockerfile:1
FROM node:20-slim

ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PORT=7000

# WITH_BROWSER=0 (por defecto): imagen mínima, build en ~1 min, sin Chromium.
# WITH_BROWSER=1: instala Chromium del sistema (una sola línea de apt, en vez
# de ~30 libs + 200 MB de descarga de Puppeteer). En Render, crea una
# variable de entorno WITH_BROWSER=1 y se pasa sola como build arg.
ARG WITH_BROWSER=0
RUN if [ "$WITH_BROWSER" = "1" ]; then \
      apt-get update && apt-get install -y --no-install-recommends chromium fonts-liberation \
      && rm -rf /var/lib/apt/lists/*; \
    fi
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Capa de dependencias: solo se rehace si cambia package.json / lock.
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --no-audit --no-fund || npm install --omit=dev --no-audit --no-fund

COPY src ./src

EXPOSE 7000
USER node
CMD ["node", "src/server.js"]

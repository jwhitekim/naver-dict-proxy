FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server/ ./server/

EXPOSE 8002
CMD ["node", "server/server.js"]

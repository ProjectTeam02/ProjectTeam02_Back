FROM node:20-alpine

WORKDIR /app

# 워크스페이스(database/) 포함 의존성 설치
COPY package*.json ./
COPY database/package.json database/
RUN npm ci

COPY . .
RUN npm run db:build

EXPOSE 3000
CMD ["node", "src/server.js"]

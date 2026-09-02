# node:sqlite (встроенный SQLite) требует Node >= 22.5 — используем LTS-образ.
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY public ./public

RUN mkdir -p data

EXPOSE 3000

CMD ["node", "src/server.js"]

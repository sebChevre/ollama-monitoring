FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY server.js .
COPY public ./public

ENV PORT=3333
ENV DB_HOST=postgres
ENV DB_PORT=5432
ENV DB_USER=ollama_user
ENV DB_PASSWORD=ollama_password
ENV DB_NAME=ollama_monitoring

EXPOSE 3333

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3333/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["npm", "start"]

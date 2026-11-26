FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json ./
RUN npm install --no-audit --no-fund

COPY . .
RUN npm run build

ENV PORT=8080
ENV HOSTNAME=0.0.0.0

EXPOSE 8080

CMD ["sh", "-c", "npx next start -p ${PORT:-8080} -H 0.0.0.0"]

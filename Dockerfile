FROM node:20-alpine
WORKDIR /app
RUN echo "legacy-peer-deps=true" > .npmrc
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN mkdir -p /app/data
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV NODE_ENV=production
CMD ["npm", "run", "start"]

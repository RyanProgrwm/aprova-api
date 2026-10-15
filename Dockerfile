FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

# instala só as dependências de produção, aproveitando o cache de camadas
COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY scripts ./scripts

# roda sem root; a pasta data guarda o arquivo do sqlite
RUN mkdir -p data && chown node:node data
USER node

EXPOSE 3000
CMD ["node", "src/server.js"]

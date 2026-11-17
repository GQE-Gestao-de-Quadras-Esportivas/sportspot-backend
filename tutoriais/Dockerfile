# Imagem única usada pelo perfil "completo" do compose.yaml
# (cada serviço troca só o comando).
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
CMD ["node", "gateway/server.js"]

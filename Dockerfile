FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY server ./server
ENV HOST=0.0.0.0 PORT=8790 DATA_DIR=/data TZ=Asia/Seoul
VOLUME /data
EXPOSE 8790
CMD ["node", "--experimental-strip-types", "--disable-warning=ExperimentalWarning", "server/main.ts"]

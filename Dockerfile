FROM node:lts-alpine AS builder

COPY package.json package-lock.json /opt/app/
WORKDIR /opt/app
RUN npm ci

COPY . /opt/app
RUN npm run build && npm prune --production
RUN touch /opt/app/.env


FROM node:lts-alpine

RUN apk add bash curl cronie s6
COPY etc /etc

COPY --from=builder /opt/app /opt/app
WORKDIR /opt/app

ENV FA_DOWNLOAD_PATH=/data
VOLUME /data

ENV PUID=1000
ENV PGID=1000

ENTRYPOINT ["s6-svscan", "/etc/s6"]

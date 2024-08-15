FROM node:lts-alpine

RUN apk add bash curl cronie s6

COPY etc /etc
COPY . /opt/app

WORKDIR /opt/app
RUN npm ci && npm run build
RUN touch /opt/app/.env

ENV FA_DOWNLOAD_PATH=/data
VOLUME /data

ENV PUID=1000
ENV PGID=1000

ENTRYPOINT ["s6-svscan", "/etc/s6"]

FROM public.ecr.aws/docker/library/alpine:3.21

RUN sed -i 's|dl-cdn.alpinelinux.org|mirrors.aliyun.com|g' /etc/apk/repositories \
    && apk add --no-cache coreutils jq postgresql16-client restic tzdata util-linux
COPY scripts/backup.sh /usr/local/bin/backup.sh
COPY scripts/backup-loop.sh /usr/local/bin/backup-loop.sh
COPY scripts/backup-healthcheck.sh /usr/local/bin/backup-healthcheck.sh
COPY scripts/verify-backup.sh /usr/local/bin/verify-backup.sh
RUN chmod +x /usr/local/bin/backup.sh \
    /usr/local/bin/backup-loop.sh \
    /usr/local/bin/backup-healthcheck.sh \
    /usr/local/bin/verify-backup.sh

CMD ["/usr/local/bin/backup-loop.sh"]

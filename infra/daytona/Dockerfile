# Build-time downloads only. No API keys or farm data enter this image.
FROM python:3.12-slim-bookworm

RUN apt-get update \
    && apt-get install -y --no-install-recommends bash ca-certificates curl git \
    && rm -rf /var/lib/apt/lists/*

# Official installer pinned to an upstream commit; this origin also works with
# Daytona's account-default firewall, which may block agentfield.ai.
ARG CODEAF_VERSION=v0.8.2
RUN curl --fail --silent --show-error --location \
        https://raw.githubusercontent.com/Agent-Field/CodeAF/ffeeb7868ecfca8067d266d7b6a010c4ea8b4605/scripts/install.sh --output /tmp/install-codeaf.sh \
    && if [ -n "$CODEAF_VERSION" ]; then \
         VERSION="$CODEAF_VERSION" bash /tmp/install-codeaf.sh; \
       else bash /tmp/install-codeaf.sh; fi \
    && mkdir -p /opt/codeaf \
    && cp -a /root/.codeaf/bin /opt/codeaf/bin \
    && chmod -R a+rX /opt/codeaf \
    && rm /tmp/install-codeaf.sh

ENV PATH="/opt/codeaf/bin:${PATH}" \
    CODEAF_NO_UPDATE_CHECK=1 \
    CODEAF_TELEMETRY=off \
    DO_NOT_TRACK=1

RUN python3 --version && git --version && codeaf --help >/dev/null
WORKDIR /workspace
CMD ["sleep", "infinity"]

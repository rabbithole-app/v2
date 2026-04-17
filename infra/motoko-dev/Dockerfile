FROM rust:1.94-slim-bookworm

ARG POCKET_IC_ARCH=arm64
ARG INSTALL_ICX_ASSET=false

ENV NVM_DIR=/root/.nvm
ENV NVM_VERSION=v0.40.4
ENV NODE_VERSION=22.22.2
ENV IC_MOPS_VERSION=2.9.0
ENV DFX_VERSION=0.31.0
ENV POCKETIC_VERSION=13.0.0

RUN apt -yq update && \
    apt -yqq install --no-install-recommends \
      curl ca-certificates libunwind-dev git python3 python3-pip patch ssh xz-utils

# Install Node.js using nvm
ENV PATH="/root/.nvm/versions/node/v${NODE_VERSION}/bin:${PATH}"
RUN curl --fail -sSf https://raw.githubusercontent.com/creationix/nvm/${NVM_VERSION}/install.sh | bash && \
    . "${NVM_DIR}/nvm.sh" && nvm install ${NODE_VERSION} && \
    nvm use v${NODE_VERSION} && nvm alias default v${NODE_VERSION}

# Install ic-mops
RUN npm install -g ic-mops@${IC_MOPS_VERSION}

# Install dfx
RUN DFX_VERSION=${DFX_VERSION} DFXVM_INIT_YES=true sh -ci "$(curl -fsSL https://internetcomputer.org/install.sh)"
ENV PATH="/root/.local/share/dfx/bin:$PATH"

# Optionally install icx-asset + wasm32 target (backend only)
RUN if [ "$INSTALL_ICX_ASSET" = "true" ]; then \
      cargo install icx-asset && \
      rustup target add wasm32-unknown-unknown; \
    fi

# Install PocketIC server binary
RUN curl -fLsS "https://github.com/dfinity/pocketic/releases/download/${POCKETIC_VERSION}/pocket-ic-${POCKET_IC_ARCH}-linux.gz" \
      -o pocket-ic.gz && \
    gzip -d pocket-ic.gz && \
    chmod +x pocket-ic && \
    mv pocket-ic /usr/local/bin/pocket-ic
ENV POCKET_IC_BIN=/usr/local/bin/pocket-ic

# Install PocketIC Python
RUN pip3 install pocket-ic --break-system-packages || true

# Copy shared entrypoint base script
COPY entrypoint-base.sh /infra/entrypoint-base.sh
RUN chmod +x /infra/entrypoint-base.sh

# Clean apt
RUN apt-get autoremove && apt-get clean

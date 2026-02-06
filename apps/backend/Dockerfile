FROM rust:1.92-slim-bookworm

ENV NVM_DIR=/root/.nvm
ENV NVM_VERSION=v0.40.3
ENV NODE_VERSION=22.22.0
ENV POCKET_IC_PYTHON_VERSION=3.1.1
ENV IC_MOPS_VERSION=1.12.0
ENV DFX_VERSION=0.31.0-beta.0
ENV POCKETIC_VERSION=11.0.0

RUN apt -yq update
RUN apt -yqq install --no-install-recommends curl ca-certificates libunwind-dev git python3 python3-pip ssh xz-utils patch

# Install Node.js using nvm
ENV PATH="/root/.nvm/versions/node/v${NODE_VERSION}/bin:${PATH}"
RUN curl --fail -sSf https://raw.githubusercontent.com/creationix/nvm/${NVM_VERSION}/install.sh | bash
RUN . "${NVM_DIR}/nvm.sh" && nvm install ${NODE_VERSION}
RUN . "${NVM_DIR}/nvm.sh" && nvm use v${NODE_VERSION}
RUN . "${NVM_DIR}/nvm.sh" && nvm alias default v${NODE_VERSION}

# Install ic-mops (provides `mops`)
RUN npm install -g ic-mops@${IC_MOPS_VERSION}

# Install dfx
RUN DFX_VERSION=${DFX_VERSION} DFXVM_INIT_YES=true sh -ci "$(curl -fsSL https://internetcomputer.org/install.sh)"
ENV PATH="/root/.local/share/dfx/bin:$PATH"

# Install icx-asset
RUN cargo install icx-asset

# Add wasm32-unknown-unknown target
RUN rustup target add wasm32-unknown-unknown

# Install PocketIC Python
RUN pip3 install pocket-ic==${POCKET_IC_PYTHON_VERSION} --break-system-packages

# Install PocketIC server binary (for @dfinity/pic / PocketIcServer)
# Using x86_64 version for linux/amd64 container
RUN curl -fLsS "https://github.com/dfinity/pocketic/releases/download/${POCKETIC_VERSION}/pocket-ic-arm64-linux.gz" -o pocket-ic.gz && \
    gzip -d pocket-ic.gz && \
    chmod +x pocket-ic && \
    mv pocket-ic /usr/local/bin/pocket-ic

# Set PocketIC binary path environment variable
ENV POCKET_IC_BIN=/usr/local/bin/pocket-ic

# Clean apt
RUN apt-get autoremove && apt-get clean

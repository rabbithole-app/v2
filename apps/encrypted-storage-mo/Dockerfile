FROM rust:1.89-slim-bookworm

ENV NVM_DIR=/root/.nvm
ENV NVM_VERSION=v0.40.1
ENV NODE_VERSION=22.12.0
ENV IC_MOPS_VERSION=1.12.0
ENV DFX_VERSION=0.30.1-beta.1
ENV POCKETIC_VERSION=11.0.0

RUN apt -yq update
RUN apt -yqq install --no-install-recommends curl ca-certificates libunwind-dev git python3

# Install Node.js using nvm
ENV PATH="/root/.nvm/versions/node/v${NODE_VERSION}/bin:${PATH}"
RUN curl --fail -sSf https://raw.githubusercontent.com/creationix/nvm/${NVM_VERSION}/install.sh | bash
RUN . "${NVM_DIR}/nvm.sh" && nvm install ${NODE_VERSION}
RUN . "${NVM_DIR}/nvm.sh" && nvm use v${NODE_VERSION}
RUN . "${NVM_DIR}/nvm.sh" && nvm alias default v${NODE_VERSION}

# Install ic-mops (provides `mops`)
RUN npm install -g ic-mops@${IC_MOPS_VERSION}
RUN mops --version

# Install dfx
RUN DFX_VERSION=${DFX_VERSION} DFXVM_INIT_YES=true sh -ci "$(curl -fsSL https://internetcomputer.org/install.sh)"
ENV PATH="/root/.local/share/dfx/bin:$PATH"

# Install PocketIC server binary (for @dfinity/pic / PocketIcServer)
RUN curl -fLsS "https://github.com/dfinity/pocketic/releases/download/${POCKETIC_VERSION}/pocket-ic-x86_64-linux.gz" -o pocket-ic-x86_64-linux.gz && \
    gzip -d pocket-ic-x86_64-linux.gz && \
    chmod +x pocket-ic-x86_64-linux && \
    mv pocket-ic-x86_64-linux /usr/local/bin/pocket-ic

WORKDIR /app

# Clean apt
RUN apt-get autoremove && apt-get clean


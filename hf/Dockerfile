FROM node:22-slim
RUN apt-get update && apt-get install -y git ca-certificates && rm -rf /var/lib/apt/lists/*
USER node
ENV HOME=/home/node PORT=7860
WORKDIR /home/node
RUN git clone --depth 1 https://github.com/monledxd-cyber/ia-antagonista-bot app
WORKDIR /home/node/app
RUN npm install --omit=dev
CMD ["node", "index.js"]

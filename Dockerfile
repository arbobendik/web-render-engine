FROM node:bullseye
LABEL maintainer="bendik@arbogast.dev"

RUN apt update
RUN apt install dos2unix

WORKDIR /app
# Copy package.json and package-lock.json.
COPY package* ./
# Copy the rest of the application code.
COPY . .
# Web server.
EXPOSE 3000
# Install dependencies.
RUN npm install
# Install dependencies for subproject.
WORKDIR /app/src/loader
RUN npm install
# Go back to main directory.
WORKDIR /app
# Install sqlite3.
RUN npm install -g esbuild
# Install pm2 globally.
RUN npm install -g typescript
# RUN echo < $(ls)
RUN dos2unix ./build-script
# Build the project.
RUN bash ./build-script
# Start the app.
CMD [ "node", "index.js" ]

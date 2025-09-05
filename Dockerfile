# Use official Node.js image as the base
FROM node:18

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json for npm install
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the app files
COPY . .

# Set environment variable for port (can also be in .env file)
ENV PORT=6970

# Expose the port the app will run on
EXPOSE 6970

# Start the Node.js app (update entry file if different)
CMD ["node", "index.js"]

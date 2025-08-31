# Deployment Overview

## Deployment Overview

This guide covers the complete deployment process for Smart Duck, from development setup to production deployment on the DuckChain.

## Development Setup

### Prerequisites

Before setting up Smart Duck, ensure you have the following installed:

- **Bun.js** (v1.0+): High-performance JavaScript runtime
- **Node.js** (v18+): For compatibility with some packages
- **Git**: Version control
- **VSCode**: Recommended IDE with TypeScript support

```bash
# Install Bun
curl -fsSL https://bun.sh/install | bash

# Verify installation
bun --version
```

### 1. Clone Repository

```bash
# Clone the repository
git clone https://github.com/h-sameri/smart-duck.git
cd smart-duck

# Install dependencies
bun install

# Install EVM dependencies
cd evm && bun install && cd ..
```

### 2. Environment Setup

Create environment configuration files:

```bash
# Copy environment template
cp .env.template .env
```

#### Required Environment Variables

```bash
# .env file configuration

# AI API Key
AI_API_KEY=your_ai_api_key_here

# Telegram Bot Token
TG_BOT_TOKEN=your_telegram_bot_token

# Private key for blockchain interactions (without 0x prefix)
PVT_KEY=your_private_key_here

# Server configuration
PORT=3000
NODE_ENV=development

# Database configuration
DATABASE_URL=./data/database.sqlite

# API configurations
COINGECKO_API_KEY=your_coingecko_api_key (optional)
```

#### Getting API Keys

##### AI API Key
1. Visit your preferred AI provider's platform
2. Create or select a project
3. Generate an API key for the AI model
4. Add billing information (required for production usage)

##### Telegram Bot Token
1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Send `/newbot` command
3. Follow instructions to create your bot
4. Copy the provided token

##### Private Key Setup
```bash
# Generate a new wallet (for development)
bun run scripts/generate-wallet.ts

# Or use an existing wallet
# Make sure it has $DUCK for gas fees
```

### 3. Database Setup

```bash
# Create database directory
mkdir -p data

# Run database migrations
bun run db:migrate

# Verify database setup
bun run db:status
```

## Production Deployment

### Environment Configuration

#### Production Environment Variables
```bash
# Production environment
NODE_ENV=production
TG_BOT_TOKEN=prod_bot_token
AI_API_KEY=prod_ai_key
PVT_KEY=0x_prod_private_key
PORT=8080
DATABASE_URL=production_db_url
```

### Deployment Platforms

#### Cloudflare Workers
```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Deploy to Cloudflare Workers
wrangler deploy
```

#### Vercel
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy to Vercel
vercel --prod
```

#### Docker Deployment
```dockerfile
# Dockerfile
FROM oven/bun:1

WORKDIR /app
COPY package.json .
COPY bun.lockb .

RUN bun install --frozen-lockfile

COPY . .

EXPOSE 3000

CMD ["bun", "run", "start"]
```

```bash
# Build and run Docker container
docker build -t smart-duck .
docker run -p 3000:3000 --env-file .env smart-duck
```

## Smart Contract Deployment

### Contract Compilation
```bash
# Navigate to EVM directory
cd evm

# Install dependencies
bun install

# Compile contracts
bun run compile

# Verify compilation
bun run verify
```

### Contract Deployment
```bash
# Deploy to DuckChain Testnet (deprecated)
# bun run deploy:testnet

# Deploy to DuckChain Mainnet
bun run deploy:mainnet

# Verify contracts on block explorer
bun run verify:contracts
```

### Contract Configuration
```typescript
// Contract addresses configuration
export const CONTRACT_ADDRESSES = {
  testnet: {
    orchestrator: "0x...",
    usdt: "0x...",
    ton: "0x..."
  },
  mainnet: {
    orchestrator: "0x...", // Future deployment
    usdt: "0x...", // Future deployment
    ton: "0x..." // Future deployment
  }
};
```

## Monitoring & Maintenance

### Health Checks
```typescript
// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version,
    uptime: process.uptime()
  });
});
```

### Logging Configuration
```typescript
// Logging setup
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});
```

### Performance Monitoring
- **Response Times**: Monitor API response times
- **Error Rates**: Track error percentages
- **Resource Usage**: Monitor CPU, memory, and I/O
- **Database Performance**: Track query performance

## Security Considerations

### Environment Security
- **Secret Management**: Use secure secret management services
- **Access Control**: Implement proper access controls
- **Network Security**: Use HTTPS and secure connections
- **Regular Updates**: Keep dependencies updated

### Production Hardening
- **Rate Limiting**: Implement API rate limiting
- **Input Validation**: Validate all user inputs
- **Error Handling**: Secure error message handling
- **Monitoring**: Implement security monitoring

## Scaling Considerations

### Horizontal Scaling
- **Load Balancing**: Use load balancers for multiple instances
- **Database Sharding**: Partition data for better performance
- **Cache Distribution**: Use distributed caching
- **CDN Integration**: Use CDN for static assets

### Vertical Scaling
- **Resource Optimization**: Optimize memory and CPU usage
- **Database Optimization**: Optimize database queries
- **Caching Strategy**: Implement effective caching
- **Code Optimization**: Profile and optimize critical paths
